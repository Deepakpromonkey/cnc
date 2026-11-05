"use server";
import type { AttendanceState, ConcernCategory, Priority } from "@prisma/client";
import { db } from "@/lib/db";
import { actor, fullName } from "@/lib/auth";
import { audit, emit } from "@/lib/events";
import { assertBrand, assertPerson } from "@/lib/tasks";
import { cleanUrl, filesFrom, saveImage, saveImages } from "@/lib/storage";
import { bool, fail, guard, ok, opt, str, type Result } from "@/lib/result";
import { dateOnly, istDateKey, istMonthDate } from "@/lib/time";
import { praisePoints } from "@/lib/scoring";
import { materialiseDay } from "@/lib/attendance";
import { brandScope, settingValue, teamScope } from "@/lib/queries";
import { CONCERN_CATEGORIES, PRIORITIES } from "@/lib/status";

// ---------- concerns (§6.8) ----------
export async function logConcern(fd: FormData): Promise<Result> {
  return guard(async () => {
    const u = await actor(["admin", "cs", "employee"]);
    const subject = str(fd, "subject"), details = str(fd, "details");
    if (!subject || !details) return fail("Subject and details are required");
    const cat = str(fd, "category");
    if (!(cat in CONCERN_CATEGORIES)) return fail("Pick a category");
    const raisedBy = u.role === "admin" ? str(fd, "raisedBy") || u.id : u.id;
    const owner = (u.role === "admin" && opt(fd, "ownerUserId")) || (await settingValue<string>("hr_user_id", "")) || u.id;
    const shot = filesFrom(fd, "file")[0];
    const file = shot ? await saveImage(shot, "concern", u.id) : null;
    const c = await db.$transaction(async (tx) => {
      const c = await tx.concern.create({
        data: {
          raisedByUserId: raisedBy, category: cat as ConcernCategory, subject, details, confidential: str(fd, "confidential") === "on",
          ownerUserId: owner, slaHours: Number(str(fd, "slaHours")) || 24, fileId: file?.id, loggedOnBehalfBy: raisedBy !== u.id ? u.id : null,
        },
      });
      await audit(tx, u, "concern.created", "concern", c.id, undefined, { subject, confidential: c.confidential });
      const raiser = await tx.user.findUniqueOrThrow({ where: { id: raisedBy } });
      await emit(tx, "concern.created", { concern: { id: c.id, subject, category: cat, confidential: c.confidential }, raised_by: fullName(raiser) },
        owner !== u.id ? [{ userId: owner, module: "concern", title: `${fullName(raiser)} raised a concern${c.confidential ? " (confidential)" : ""}`, body: subject, link: "/admin/concerns" }] : []);
      return c;
    });
    return ok("Concern logged", { id: c.id });
  });
}

export async function replyConcern(fd: FormData): Promise<Result> {
  return guard(async () => {
    const u = await actor(["admin", "cs", "employee"]);
    const c = await db.concern.findUniqueOrThrow({ where: { id: str(fd, "id") } });
    if (u.role !== "admin" && c.raisedByUserId !== u.id) return fail("Not your concern");
    const body = str(fd, "body");
    if (!body) return fail("Write a reply first");
    await db.$transaction(async (tx) => {
      await tx.concernReply.create({ data: { concernId: c.id, userId: u.id, body } });
      if (c.status === "open" && u.role === "admin") await tx.concern.update({ where: { id: c.id }, data: { status: "in_discussion" } });
      await audit(tx, u, "concern.replied", "concern", c.id);
      const other = u.id === c.raisedByUserId ? c.ownerUserId : c.raisedByUserId;
      const raiser = await tx.user.findUniqueOrThrow({ where: { id: c.raisedByUserId } });
      await emit(tx, "concern.replied", { concern: { id: c.id, subject: c.subject }, by: fullName(u), to: { name: fullName(raiser), whatsapp: other === raiser.id ? raiser.whatsappNo : null }, body },
        [{ userId: other, module: "concern", title: `${fullName(u)} replied on “${c.subject}”`, body: body.slice(0, 140), link: other === c.raisedByUserId ? "/team/concerns" : "/admin/concerns" }]);
    });
    return ok("Reply sent · they see it in their portal and on WhatsApp");
  });
}

export async function setConcernStatus(fd: FormData): Promise<Result> {
  return guard(async () => {
    const u = await actor(["admin"]);
    const id = str(fd, "id");
    const resolve = str(fd, "status") === "resolved";
    await db.concern.update({ where: { id }, data: resolve ? { status: "resolved", resolvedAt: new Date() } : { status: "in_discussion", resolvedAt: null } });
    await audit(db, u, resolve ? "concern.resolved" : "concern.reopened", "concern", id);
    return ok(resolve ? "Marked resolved" : "Reopened");
  });
}

export async function reassignConcern(fd: FormData): Promise<Result> {
  return guard(async () => {
    const u = await actor(["admin"]);
    const id = str(fd, "id"), owner = str(fd, "ownerUserId");
    await db.concern.update({ where: { id }, data: { ownerUserId: owner } });
    await audit(db, u, "concern.reassigned", "concern", id, undefined, { owner });
    await emit(db, "concern.reassigned", { concern: { id } }, owner !== u.id ? [{ userId: owner, module: "concern", title: "A concern was assigned to you", link: "/admin/concerns" }] : []);
    return ok("Reassigned");
  });
}

// ---------- announcements & holidays (§6.12) ----------
export async function saveAnnouncement(fd: FormData): Promise<Result> {
  return guard(async () => {
    const u = await actor(["admin"]);
    const id = opt(fd, "id");
    const type = str(fd, "type") === "holiday" ? "holiday" : "announcement";
    const subject = str(fd, "subject"), date = str(fd, "date");
    if (!subject || !date) return fail("Subject and date are required");
    const img = filesFrom(fd, "image")[0];
    const file = img ? await saveImage(img, "announcement", u.id) : null;
    const data = { type, subject, date: dateOnly(date), message: opt(fd, "message"), showToClients: str(fd, "showToClients") === "on", broadcast: str(fd, "broadcast") === "on", ...(file ? { imageFileId: file.id } : {}) } as const;
    const a = await db.$transaction(async (tx) => {
      const a = id ? await tx.announcement.update({ where: { id }, data }) : await tx.announcement.create({ data: { ...data, postedById: u.id } });
      await audit(tx, u, id ? "announcement.updated" : "announcement.posted", "announcement", a.id, undefined, data);
      if (!id) {
        const staff = await tx.user.findMany({ where: { role: { in: ["admin", "group_admin", "cs", "employee"] }, status: "active", id: { not: u.id } }, select: { id: true } });
        const clients = data.showToClients ? await tx.user.findMany({ where: { role: "client", status: "active" }, select: { id: true } }) : [];
        await emit(tx, type === "holiday" ? "holiday.added" : "announcement.posted", { announcement: { id: a.id, type, subject, date, message: data.message, show_to_clients: data.showToClients, broadcast: data.broadcast } },
          [...staff, ...clients].map((s) => ({ userId: s.id, module: "announcement" as const, title: type === "holiday" ? `Holiday: ${subject}` : subject, link: undefined })));
      }
      return a;
    });
    // Holidays change attendance state for that day.
    if (type === "holiday" && dateOnly(date) <= new Date()) {
      const staff = await db.user.findMany({ where: { role: { in: ["admin", "group_admin", "cs", "employee"] }, status: "active" }, select: { id: true } });
      for (const s of staff) await materialiseDay(s.id, date);
    }
    return ok(id ? "Saved" : type === "holiday" ? "Holiday added" : "Posted", { id: a.id });
  });
}

export async function archiveAnnouncement(fd: FormData): Promise<Result> {
  return guard(async () => {
    const u = await actor(["admin"]);
    const id = str(fd, "id");
    await db.announcement.update({ where: { id }, data: { archivedAt: new Date() } });
    await audit(db, u, "announcement.archived", "announcement", id);
    return ok("Archived");
  });
}

// ---------- work requests (§6.10) ----------
export async function answerRequest(fd: FormData): Promise<Result> {
  return guard(async () => {
    const u = await actor(["admin", "group_admin", "cs", "client"]);
    const r = await db.workRequest.findUniqueOrThrow({ where: { id: str(fd, "id") }, include: { brand: { include: { clientUsers: { where: { status: "active" } } } } } });
    await assertBrand(u, r.brandId);
    const body = str(fd, "body");
    const hold = str(fd, "hold") === "1";
    if (!body && !hold) return fail("Write a reply first");
    await db.$transaction(async (tx) => {
      if (body) await tx.workRequestReply.create({ data: { workRequestId: r.id, userId: u.id, body } });
      if (u.role !== "client") {
        await tx.workRequest.update({ where: { id: r.id }, data: { status: hold ? "on_hold" : "answered", firstReplyAt: r.firstReplyAt ?? (body ? new Date() : null) } });
        await emit(tx, "request.replied", { request: { id: r.id, code: `WR-${r.code}`, subject: r.subject }, brand: r.brand.name, by: fullName(u), body, status: hold ? "on_hold" : "answered", clients: r.brand.clientUsers.map((c) => ({ name: fullName(c), whatsapp: c.whatsappNo })) },
          r.brand.clientUsers.map((c) => ({ userId: c.id, module: "request" as const, title: `${u.firstName} replied on “${r.subject}”`, body: body.slice(0, 140), link: `/client/requests?r=${r.id}` })));
      } else {
        await emit(tx, "request.replied", { request: { id: r.id, subject: r.subject }, brand: r.brand.name, by: fullName(u), body },
          r.ownerUserId ? [{ userId: r.ownerUserId, module: "request", title: `${r.brand.name} added to “${r.subject}”`, body: body.slice(0, 140), link: "/admin/requests" }] : []);
      }
      await audit(tx, u, hold ? "request.held" : "request.replied", "work_request", r.id);
    });
    return ok(u.role === "client" ? "Sent" : hold ? "Put on hold" : "Answered · client sees it on the portal and WhatsApp");
  });
}

/** Client raises from the portal, or CS/admin logs one on behalf (WhatsApp / phone). */
export async function raiseRequest(fd: FormData): Promise<Result> {
  return guard(async () => {
    const u = await actor(["admin", "group_admin", "cs", "client"]);
    const brandId = u.role === "client" ? u.brandId! : str(fd, "brandId");
    await assertBrand(u, brandId);
    const subject = str(fd, "subject");
    if (!subject) return fail("Tell us what you need");
    const ref = opt(fd, "referenceLink");
    const refUrl = ref ? cleanUrl(ref) : null;
    if (ref && !refUrl) return fail("Reference link isn't a web address");
    const heavy = cleanUrl(fd.get("link"));
    const files = await saveImages(filesFrom(fd, "files"), "request", u.id);
    const primaryCs = await db.brandCs.findFirst({ where: { brandId }, orderBy: { isPrimary: "desc" } });
    const pr = str(fd, "priority").toLowerCase();
    const projectId = opt(fd, "projectId");
    if (projectId && projectId !== "__none") {
      const p = await db.project.findUnique({ where: { id: projectId } });
      if (!p || p.brandId !== brandId) return fail("That project belongs to another brand");
    }
    const r = await db.$transaction(async (tx) => {
      const r = await tx.workRequest.create({
        data: {
          brandId, projectId: projectId && projectId !== "__none" ? projectId : null, subject, description: opt(fd, "description"),
          neededBy: opt(fd, "neededBy") ? dateOnly(str(fd, "neededBy")) : null, pocName: opt(fd, "pocName"), pocContact: opt(fd, "pocContact"),
          priority: (PRIORITIES.includes(pr as Priority) ? pr : "normal") as Priority, referenceLink: refUrl,
          ownerUserId: primaryCs?.userId ?? null, raisedByUserId: u.id, channel: u.role === "client" ? "portal" : str(fd, "channel") || "whatsapp",
          attachments: { create: [...files.map((f) => ({ kind: "upload" as const, fileId: f.id, label: f.originalName })), ...(heavy ? [{ kind: "link" as const, url: heavy, label: "Brief / heavy files" }] : [])] },
        },
        include: { brand: true },
      });
      await audit(tx, u, "request.created", "work_request", r.id, undefined, { subject });
      const cs = await tx.brandCs.findMany({ where: { brandId }, include: { user: { select: { groupId: true } } } });
      const groups = cs.map((c) => c.user.groupId).filter(Boolean) as string[];
      const admins = await tx.user.findMany({ where: { status: "active", OR: [{ role: "admin" }, { role: "group_admin", groupId: { in: groups } }] }, select: { id: true } });
      const receivers = [...new Set([...cs.map((c) => c.userId), ...admins.map((a) => a.id)])].filter((x) => x !== u.id);
      await emit(tx, "request.created", { request: { id: r.id, code: `WR-${r.code}`, subject, priority: r.priority, needed_by: r.neededBy }, brand: r.brand.name, by: fullName(u) },
        receivers.map((userId) => ({ userId, module: "request" as const, title: `${r.brand.name} raised a work request: ${subject}`, link: "/admin/requests" })));
      return r;
    });
    return ok(u.role === "client" ? "Sent to your CS · reply within a few hours" : "Request logged", { id: r.id });
  });
}

// ---------- flags (§6.6) ----------
export async function raiseFlag(fd: FormData): Promise<Result> {
  return guard(async () => {
    const u = await actor(["admin", "group_admin", "cs"]);
    const target = await db.user.findUniqueOrThrow({ where: { id: str(fd, "targetUserId") } });
    if (target.role !== "employee" && target.role !== "cs") return fail("Flags go to employees or CS");
    if (u.role === "group_admin") await assertPerson(u, target.id);
    if (u.role === "cs") {
      if (target.role !== "employee") return fail("CS can flag employees only");
      const reportsToMe = target.reportsToId === u.id;
      const mine = reportsToMe || (await db.task.count({ where: { cs: { id: u.id }, assignees: { some: { userId: target.id } } } }));
      if (!mine) return fail("They don't report to you or work on your brands");
    }
    const type = await db.flagType.findUniqueOrThrow({ where: { id: str(fd, "flagTypeId") } });
    const subject = str(fd, "subject"), feedback = str(fd, "feedback");
    if (!feedback) return fail("Feedback is required — it shows on their profile with your name");
    const points = await praisePoints(u.role, type.points, type.name);
    await db.$transaction(async (tx) => {
      const f = await tx.flag.create({
        data: {
          flagTypeId: type.id, targetUserId: target.id, targetRole: target.role === "cs" ? "cs" : "employee", givenByUserId: u.id,
          brandId: opt(fd, "brandId"), projectId: opt(fd, "projectId"), taskId: opt(fd, "taskId"), subject: subject || type.name, feedback, pointsApplied: points, month: istMonthDate(),
        },
      });
      await audit(tx, u, "flag.given", "flag", f.id, undefined, { target: target.id, type: type.name, points });
      await emit(tx, "flag.given", { flag: { type: type.name, points, subject, feedback }, to: { name: fullName(target), whatsapp: target.whatsappNo }, by: fullName(u) },
        [{ userId: target.id, module: "flag", title: `${fullName(u)} gave you a ${type.name.toLowerCase()}`, body: subject || feedback.slice(0, 120), link: "/team/score" }]);
    });
    return ok(`${type.name} saved · moves tonight's score ${points > 0 ? "+" : ""}${points}`);
  });
}

// ---------- attendance (§6.5) ----------
export async function attendanceRemark(fd: FormData): Promise<Result> {
  return guard(async () => {
    const u = await actor(["admin", "group_admin", "cs"]);
    const userId = str(fd, "userId"), date = str(fd, "date") || istDateKey();
    const remark = opt(fd, "remark");
    const state = opt(fd, "state") as AttendanceState | null;
    if (state && u.role === "cs") return fail("Only admin can override the day");
    if (u.role === "group_admin") await assertPerson(u, userId);
    if (u.role === "cs" && !((await teamScope(u)) ?? []).includes(userId)) {
      // §3: CS may also remark on people working on their brands.
      const onMine = await db.taskAssignee.count({ where: { userId, task: { brandId: { in: (await brandScope(u)) ?? [] } } } });
      if (!onMine) return fail("They're not in your team");
    }
    await materialiseDay(userId, date);
    const day = await db.attendanceDay.findUniqueOrThrow({ where: { userId_date: { userId, date: dateOnly(date) } } });
    await db.attendanceDay.update({ where: { id: day.id }, data: { remark: state ? `[override] ${remark ?? ""}`.trim() : remark, remarkBy: u.id, ...(state ? { state } : {}) } });
    await audit(db, u, state ? "attendance.overridden" : "attendance.remark", "attendance_day", day.id, { state: day.state, remark: day.remark }, { state, remark });
    return ok(state ? `Marked ${state}` : "Remark saved");
  });
}

export async function decideLeave(fd: FormData): Promise<Result> {
  return guard(async () => {
    const u = await actor(["admin", "group_admin"]);
    const l = await db.leaveRequest.findUniqueOrThrow({ where: { id: str(fd, "id") } });
    await assertPerson(u, l.userId);
    const approve = str(fd, "decision") === "approved";
    await db.leaveRequest.update({ where: { id: l.id }, data: { status: approve ? "approved" : "rejected", decidedBy: u.id, decidedAt: new Date() } });
    if (approve) for (let t = l.fromDate.getTime(); t <= l.toDate.getTime() && t <= Date.now(); t += 86_400_000) await materialiseDay(l.userId, new Date(t).toISOString().slice(0, 10));
    await audit(db, u, `leave.${approve ? "approved" : "rejected"}`, "leave_request", l.id);
    await emit(db, "leave.decided", { leave: { id: l.id, status: approve ? "approved" : "rejected" } }, [{ userId: l.userId, module: "attendance", title: `Your leave was ${approve ? "approved" : "declined"}`, link: "/team/attendance" }]);
    return ok(approve ? "Leave approved" : "Leave declined");
  });
}

export async function markLeaveToday(fd: FormData): Promise<Result> {
  return guard(async () => {
    const u = await actor(["admin", "group_admin"]);
    const userId = str(fd, "userId"), date = str(fd, "date") || istDateKey();
    await assertPerson(u, userId);
    await db.leaveRequest.create({ data: { userId, fromDate: dateOnly(date), toDate: dateOnly(date), type: "casual", reason: opt(fd, "remark") ?? "Marked by admin", status: "approved", decidedBy: u.id, decidedAt: new Date() } });
    await materialiseDay(userId, date);
    await audit(db, u, "leave.marked", "user", userId, undefined, { date });
    return ok("Marked on leave");
  });
}

export async function toggleBool(fd: FormData): Promise<Result> {
  // Used by switches inside forms that save instantly (e.g. share_with_client).
  return guard(async () => {
    const u = await actor(["admin", "group_admin", "cs"]);
    const id = str(fd, "id");
    const field = str(fd, "field");
    if (!["shareWithClient", "sarthiNudge"].includes(field)) return fail("Unknown setting");
    const t = await db.task.findUniqueOrThrow({ where: { id } });
    await assertBrand(u, t.brandId);
    await db.task.update({ where: { id }, data: { [field]: bool(fd, "value") } });
    await audit(db, u, `task.${field}`, "task", id, undefined, { value: bool(fd, "value") });
    return ok("Saved");
  });
}
