"use server";
import type { Priority } from "@prisma/client";
import { db } from "@/lib/db";
import { actor, fullName } from "@/lib/auth";
import { audit, emit } from "@/lib/events";
import { assertBrand, assertTask, loadTask, moveTask } from "@/lib/tasks";
import { teamScope } from "@/lib/queries";
import { cleanUrl, filesFrom, saveImages } from "@/lib/storage";
import { all, bool, fail, guard, ok, opt, str, type Result } from "@/lib/result";
import { dateOnly, fmtDue, fromIst } from "@/lib/time";
import { PRIORITIES } from "@/lib/status";

const pri = (v: string) => (PRIORITIES.includes(v as Priority) ? (v as Priority) : "normal");

/** Create or edit a task (§6.3 required fields). Admin, or CS on own brands. */
export async function saveTask(fd: FormData): Promise<Result> {
  return guard(async () => {
    const u = await actor(["admin", "group_admin", "cs"]);
    const id = opt(fd, "id");
    const brandId = str(fd, "brandId");
    await assertBrand(u, brandId);
    const name = str(fd, "name");
    const assigneeIds = all(fd, "assignees");
    const csUserId = str(fd, "csUserId");
    const deadlineDate = str(fd, "deadlineDate"), deadlineTime = str(fd, "deadlineTime") || "18:00";
    if (!name) return fail("Give the task a name");
    if (!assigneeIds.length) return fail("Assign at least one person");
    if (!csUserId) return fail("Pick a CS");
    if (!deadlineDate) return fail("Set a deadline date and time");
    const titleId = str(fd, "titleId");
    if (!titleId) return fail("Pick a task title");
    if (u.role === "group_admin") {
      const team = (await teamScope(u)) ?? [];
      if (![...assigneeIds, csUserId].every((x) => team.includes(x))) return fail("Assign people from your own group");
    }

    let projectId = str(fd, "projectId");
    const newProject = str(fd, "newProject");
    const statuses = await db.taskStatus.findMany();
    const start = statuses.find((s) => s.isStart)!;
    if (projectId === "__new" || (!projectId && newProject)) {
      if (!newProject) return fail("Name the new project");
      const p = await db.project.create({ data: { brandId, name: newProject, statusId: start.id, createdBy: u.id } });
      await audit(db, u, "project.created", "project", p.id, undefined, { name: newProject, inline: true });
      projectId = p.id;
    }
    if (!projectId) return fail("Pick a project");
    const project = await db.project.findUniqueOrThrow({ where: { id: projectId } });
    if (project.brandId !== brandId) return fail("That project belongs to another brand");

    const deadlineAt = fromIst(deadlineDate, deadlineTime);
    const startDate = opt(fd, "startDate") ? dateOnly(str(fd, "startDate")) : null;
    if (startDate && deadlineAt < startDate) return fail("Deadline is before the start date");

    const people = await db.user.findMany({ where: { id: { in: assigneeIds } } });
    const data = {
      brandId, projectId, titleId, name, description: opt(fd, "description"), servicingTypeId: opt(fd, "servicingTypeId"),
      priority: pri(str(fd, "priority")), startDate, deadlineAt, csUserId,
      shareWithClient: bool(fd, "shareWithClient"), sarthiNudge: bool(fd, "sarthiNudge"),
    };
    const files = await saveImages(filesFrom(fd, "files"), "task", u.id);
    const links = ["link", "link2"].map((k) => cleanUrl(fd.get(k))).filter(Boolean) as string[];

    if (id) {
      const before = await loadTask(id);
      await assertTask(u, before);
      await db.$transaction(async (tx) => {
        await tx.task.update({ where: { id }, data });
        const keep = new Set(assigneeIds);
        await tx.taskAssignee.deleteMany({ where: { taskId: id, userId: { notIn: assigneeIds } } });
        for (const p of people) {
          if (before.assignees.some((a) => a.userId === p.id)) continue;
          await tx.taskAssignee.create({ data: { taskId: id, userId: p.id, departmentId: p.departmentId, isLead: keep.size === 1 } });
        }
        for (const f of files) await tx.taskAttachment.create({ data: { taskId: id, kind: "upload", fileId: f.id, label: f.originalName, uploadedBy: u.id } });
        for (const url of links) await tx.taskAttachment.create({ data: { taskId: id, kind: "link", url, label: "Brief / reference", uploadedBy: u.id } });
        await audit(tx, u, "task.updated", "task", id, { name: before.name, deadlineAt: before.deadlineAt, statusId: before.statusId }, data);
        const statusId = opt(fd, "statusId");
        if (statusId && statusId !== before.statusId) {
          const to = statuses.find((s) => s.id === statusId)!;
          await tx.task.update({ where: { id }, data: { statusId, ...(to.isDone ? { completedAt: new Date() } : {}) } });
          await tx.taskStatusHistory.create({ data: { taskId: id, fromStatusId: before.statusId, toStatusId: statusId, byUserId: u.id, note: "Edited" } });
        }
        await emit(tx, "task.updated", { task: { id, name, deadline_label: fmtDue(deadlineAt) }, by: fullName(u) },
          assigneeIds.filter((x) => x !== u.id).map((userId) => ({ userId, module: "task" as const, title: `${fullName(u)} updated ${name}`, link: `/team/tasks?task=${id}` })));
      });
      return ok("Saved");
    }

    const statusId = opt(fd, "statusId") ?? start.id;
    const t = await db.$transaction(async (tx) => {
      const t = await tx.task.create({
        data: {
          ...data, statusId, createdById: u.id, sourceRequestId: opt(fd, "requestId"),
          assignees: { create: people.map((p, i) => ({ userId: p.id, departmentId: p.departmentId, isLead: i === 0 })) },
        },
      });
      await tx.taskStatusHistory.create({ data: { taskId: t.id, fromStatusId: null, toStatusId: statusId, byUserId: u.id, note: opt(fd, "requestId") ? "From client request" : null } });
      for (const f of files) await tx.taskAttachment.create({ data: { taskId: t.id, kind: "upload", fileId: f.id, label: f.originalName, uploadedBy: u.id } });
      for (const url of links) await tx.taskAttachment.create({ data: { taskId: t.id, kind: "link", url, label: "Brief / reference", uploadedBy: u.id } });
      const reqId = opt(fd, "requestId");
      if (reqId) {
        const r = await tx.workRequest.update({ where: { id: reqId }, data: { status: "converted", convertedTaskId: t.id, firstReplyAt: undefined } });
        if (r.referenceLink) await tx.taskAttachment.create({ data: { taskId: t.id, kind: "link", url: r.referenceLink, label: "Client reference", uploadedBy: u.id } });
        const reqFiles = await tx.workRequestAttachment.findMany({ where: { workRequestId: reqId } });
        for (const a of reqFiles) await tx.taskAttachment.create({ data: { taskId: t.id, kind: a.kind, fileId: a.fileId, url: a.url, label: a.label ?? "Client reference", uploadedBy: u.id } });
        await tx.workRequestReply.create({ data: { workRequestId: reqId, userId: u.id, body: "On it — this is now a task on your board, you can follow it under Work." } });
        if (!r.firstReplyAt) await tx.workRequest.update({ where: { id: reqId }, data: { firstReplyAt: new Date() } });
        await audit(tx, u, "request.converted", "work_request", reqId, undefined, { taskId: t.id });
      }
      await audit(tx, u, "task.created", "task", t.id, undefined, { ...data, assigneeIds });
      const brand = await tx.brand.findUniqueOrThrow({ where: { id: brandId } });
      await emit(tx, "task.assigned", {
        task: { id: t.id, code: `T-${t.code}`, name, deadline: deadlineAt, deadline_label: fmtDue(deadlineAt) }, brand: { id: brandId, name: brand.name },
        assignees: people.map((p) => ({ name: fullName(p), whatsapp: p.whatsappNo })), by: fullName(u), link: `${process.env.APP_URL}/admin/tasks?task=${t.id}`,
      }, [...assigneeIds, csUserId].filter((x) => x !== u.id).map((userId) => ({ userId, module: "task" as const, title: `New task: ${brand.name} · ${name}`, body: `Due ${fmtDue(deadlineAt)}`, link: `/team/tasks?task=${t.id}` })));
      return t;
    });
    return ok("Task created", { id: t.id });
  });
}

export async function moveTaskAction(fd: FormData): Promise<Result> {
  return guard(async () => {
    const u = await actor(["admin", "group_admin", "cs", "employee"]);
    const { to } = await moveTask(u, str(fd, "id"), str(fd, "statusId"), opt(fd, "note"));
    return ok(`Moved to ${to.name}`);
  });
}

export async function addDeliverables(fd: FormData): Promise<Result> {
  return guard(async () => {
    const u = await actor(["admin", "group_admin", "cs", "employee"]);
    const t = await loadTask(str(fd, "id"));
    if (u.role === "employee" && !t.assignees.some((a) => a.userId === u.id)) return fail("That task isn't on your desk");
    if (u.role !== "employee") await assertTask(u, t);
    const files = await saveImages(filesFrom(fd, "files"), "task", u.id);
    const link = cleanUrl(fd.get("link"));
    if (fd.get("link") && !link) return fail("That link doesn't look like a web address");
    if (!files.length && !link) return fail("Add an image or paste a link");
    await db.$transaction(async (tx) => {
      for (const f of files) await tx.taskAttachment.create({ data: { taskId: t.id, kind: "upload", fileId: f.id, label: f.originalName, uploadedBy: u.id } });
      if (link) await tx.taskAttachment.create({ data: { taskId: t.id, kind: "link", url: link, label: opt(fd, "label") ?? "Deliverable", uploadedBy: u.id } });
      await audit(tx, u, "task.attachment.added", "task", t.id, undefined, { files: files.length, link });
    });
    return ok(`${files.length + (link ? 1 : 0)} added`);
  });
}

export async function commentTask(fd: FormData): Promise<Result> {
  return guard(async () => {
    const u = await actor(["admin", "group_admin", "cs", "employee"]);
    const t = await loadTask(str(fd, "id"));
    if (u.role === "employee" && !t.assignees.some((a) => a.userId === u.id)) return fail("That task isn't on your desk");
    if (u.role !== "employee") await assertTask(u, t);
    const body = str(fd, "body");
    if (!body) return fail("Write something first");
    // @First mentions → user ids among people on the task or staff.
    const staff = await db.user.findMany({ where: { role: { in: ["admin", "group_admin", "cs", "employee"] }, status: "active" } });
    const mentions = staff.filter((s) => new RegExp(`@${s.firstName}\\b`, "i").test(body)).map((s) => s.id);
    await db.$transaction(async (tx) => {
      const c = await tx.taskComment.create({ data: { taskId: t.id, userId: u.id, body, mentions, visibleToClient: bool(fd, "visibleToClient") } });
      await audit(tx, u, "task.comment.added", "task", t.id, undefined, { commentId: c.id });
      const receivers = new Set([...t.assignees.map((a) => a.userId), t.csUserId, ...mentions]);
      receivers.delete(u.id);
      await emit(tx, "task.comment", { task: { id: t.id, name: t.name }, by: fullName(u), body },
        [...receivers].map((userId) => ({ userId, module: "task" as const, title: `${fullName(u)} commented on ${t.name}`, body: body.slice(0, 140), link: `/team/tasks?task=${t.id}` })));
    });
    return ok("Posted");
  });
}

export async function rateTaskCs(fd: FormData): Promise<Result> {
  return guard(async () => {
    const u = await actor(["admin", "group_admin", "cs"]);
    const t = await loadTask(str(fd, "id"));
    await assertTask(u, t);
    const stars = Number(str(fd, "stars"));
    if (!(stars >= 1 && stars <= 5)) return fail("Pick 1 to 5 stars");
    await db.taskRating.upsert({
      where: { taskId_raterKind: { taskId: t.id, raterKind: "cs" } },
      create: { taskId: t.id, raterKind: "cs", ratedByUserId: u.id, stars, review: opt(fd, "review") },
      update: { stars, ratedByUserId: u.id, review: opt(fd, "review"), at: new Date() },
    });
    await audit(db, u, "task.rated.cs", "task", t.id, undefined, { stars });
    return ok("Rating saved · feeds tonight's score");
  });
}

export async function nudgeAssignee(fd: FormData): Promise<Result> {
  return guard(async () => {
    const u = await actor(["admin", "group_admin", "cs"]);
    const t = await loadTask(str(fd, "id"));
    await assertTask(u, t);
    await emit(db, "task.nudge", {
      task: { id: t.id, name: t.name, deadline_label: fmtDue(t.deadlineAt) }, brand: t.brand.name, requested_by: fullName(u),
      assignees: t.assignees.map((a) => ({ name: fullName(a.user), whatsapp: a.user.whatsappNo })), cs: { name: fullName(t.cs), whatsapp: t.cs.whatsappNo },
    });
    await audit(db, u, "task.nudge.requested", "task", t.id);
    return ok(`Sarthi will nudge ${t.assignees.map((a) => a.user.firstName).join(" & ")} on WhatsApp`);
  });
}

export async function remindClient(fd: FormData): Promise<Result> {
  return guard(async () => {
    const u = await actor(["admin", "group_admin", "cs"]);
    const t = await loadTask(str(fd, "id"));
    await assertTask(u, t);
    await emit(db, "approval.reminder", { task: { id: t.id, name: t.name }, brand: t.brand.name, clients: t.brand.clientUsers.map((c) => ({ name: fullName(c), whatsapp: c.whatsappNo })) },
      t.brand.clientUsers.map((c) => ({ userId: c.id, module: "approval" as const, title: `Reminder: ${t.name} is waiting for your approval`, link: "/client/approvals" })));
    await audit(db, u, "task.client.reminded", "task", t.id);
    return ok("Reminder sent to the client");
  });
}

// ---------- projects ----------
export async function saveProject(fd: FormData): Promise<Result> {
  return guard(async () => {
    const u = await actor(["admin", "group_admin", "cs"]);
    const id = opt(fd, "id");
    const brandId = str(fd, "brandId");
    await assertBrand(u, brandId);
    const name = str(fd, "name");
    if (!name) return fail("Name the project");
    const start = await db.taskStatus.findFirstOrThrow({ where: { isStart: true } });
    const refs = ["ref1", "ref2", "ref3"].map((k) => (str(fd, k) ? cleanUrl(fd.get(k)) : null));
    if (["ref1", "ref2", "ref3"].some((k, i) => str(fd, k) && !refs[i])) return fail("One of the reference links isn't a web address");
    const data = {
      brandId, name, brandPoc: opt(fd, "brandPoc"), pocPhone: opt(fd, "pocPhone"), type: opt(fd, "type"), subType: opt(fd, "subType"),
      description: opt(fd, "description"), startDate: opt(fd, "startDate") ? dateOnly(str(fd, "startDate")) : null,
      deadline: opt(fd, "deadline") ? dateOnly(str(fd, "deadline")) : null,
      referenceLink1: refs[0], referenceLink2: refs[1], referenceLink3: refs[2], paymentTerms: opt(fd, "paymentTerms"),
      priority: pri(str(fd, "priority")), statusId: opt(fd, "statusId") ?? start.id,
    };
    const scope = all(fd, "scope");
    const files = await saveImages(filesFrom(fd, "files"), "project", u.id);
    const heavy = cleanUrl(fd.get("link"));
    const p = await db.$transaction(async (tx) => {
      const p = id ? await tx.project.update({ where: { id }, data }) : await tx.project.create({ data: { ...data, createdBy: u.id } });
      await tx.projectScope.deleteMany({ where: { projectId: p.id } });
      if (scope.length) await tx.projectScope.createMany({ data: scope.map((s) => ({ projectId: p.id, scopeOfWorkId: s })) });
      for (const f of files) await tx.projectComment.create({ data: { projectId: p.id, userId: u.id, body: `Reference image · ${f.originalName}`, fileId: f.id } });
      if (heavy) await tx.projectComment.create({ data: { projectId: p.id, userId: u.id, body: `Reference link: ${heavy}` } });
      await audit(tx, u, id ? "project.updated" : "project.created", "project", p.id, undefined, data);
      return p;
    });
    return ok(id ? "Saved" : "Project created", { id: p.id });
  });
}

export async function commentProject(fd: FormData): Promise<Result> {
  return guard(async () => {
    const u = await actor(["admin", "group_admin", "cs"]);
    const p = await db.project.findUniqueOrThrow({ where: { id: str(fd, "id") }, include: { tasks: { include: { assignees: true } } } });
    await assertBrand(u, p.brandId);
    const body = str(fd, "body");
    if (!body) return fail("Write something first");
    await db.$transaction(async (tx) => {
      await tx.projectComment.create({ data: { projectId: p.id, userId: u.id, body, visibleToClient: bool(fd, "visibleToClient") } });
      await audit(tx, u, "project.comment.added", "project", p.id);
      const people = new Set(p.tasks.flatMap((t) => [t.csUserId, ...t.assignees.map((a) => a.userId)]));
      people.delete(u.id);
      await emit(tx, "project.comment", { project: { id: p.id, name: p.name }, by: fullName(u), body },
        [...people].map((userId) => ({ userId, module: "task" as const, title: `${fullName(u)} commented on ${p.name}`, body: body.slice(0, 140) })));
    });
    return ok("Posted");
  });
}

export async function completeProject(fd: FormData): Promise<Result> {
  return guard(async () => {
    const u = await actor(["admin", "group_admin", "cs"]);
    const p = await db.project.findUniqueOrThrow({ where: { id: str(fd, "id") } });
    await assertBrand(u, p.brandId);
    const done = await db.taskStatus.findFirstOrThrow({ where: { isDone: true } });
    await db.project.update({ where: { id: p.id }, data: { statusId: done.id } });
    await audit(db, u, "project.completed", "project", p.id);
    return ok("Project marked completed");
  });
}

// ---------- bulk actions (task list) ----------
/** ids come either as repeated "ids" fields or as ids_0, ids_1… from a flat button payload. */
const idsFrom = (fd: FormData) => [...new Set([...all(fd, "ids"), ...[...fd.keys()].filter((k) => /^ids_\d+$/.test(k)).map((k) => String(fd.get(k)))])].filter(Boolean);
/** Move several tasks at once; each one goes through the same rules as a single move, so some may be skipped. */
export async function bulkMoveTasks(fd: FormData): Promise<Result> {
  return guard(async () => {
    const u = await actor(["admin", "group_admin", "cs"]);
    const ids = idsFrom(fd), statusId = str(fd, "statusId"), note = opt(fd, "note");
    if (!ids.length) return fail("Select at least one task");
    if (!statusId) return fail("Pick a status");
    let moved = 0; const skipped: string[] = [];
    for (const id of ids) {
      try { await moveTask(u, id, statusId, note); moved++; }
      catch (e) { skipped.push(e instanceof Error ? e.message : "not allowed"); }
    }
    const to = await db.taskStatus.findUnique({ where: { id: statusId } });
    return ok(`Moved ${moved} to ${to?.name ?? "status"}${skipped.length ? ` · ${skipped.length} skipped (${skipped[0]})` : ""}`);
  });
}

/** Ask Sarthi to nudge the assignees of several tasks (same as the per-task button). */
export async function bulkNudge(fd: FormData): Promise<Result> {
  return guard(async () => {
    const u = await actor(["admin", "group_admin", "cs"]);
    const ids = idsFrom(fd);
    if (!ids.length) return fail("Select at least one task");
    let n = 0;
    for (const id of ids) {
      const t = await loadTask(id);
      try { await assertTask(u, t); } catch { continue; }
      if (t.status.isDone) continue;
      await emit(db, "task.nudge", {
        task: { id: t.id, name: t.name, deadline_label: fmtDue(t.deadlineAt) }, brand: t.brand.name, requested_by: fullName(u),
        assignees: t.assignees.map((a) => ({ name: fullName(a.user), whatsapp: a.user.whatsappNo })), cs: { name: fullName(t.cs), whatsapp: t.cs.whatsappNo },
      });
      await audit(db, u, "task.nudge.requested", "task", t.id);
      n++;
    }
    return ok(n ? `Sarthi will nudge people on ${n} task${n === 1 ? "" : "s"}` : "Nothing to nudge");
  });
}
