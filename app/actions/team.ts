"use server";
import type { LeaveType, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { actor, fullName } from "@/lib/auth";
import { audit, emit } from "@/lib/events";
import { assertBrand, assertTask, loadTask, moveTask } from "@/lib/tasks";
import { fail, guard, ok, opt, str, type Result } from "@/lib/result";
import { dateOnly, fmtDue, istDateKey, istDateOnly, isIstToday, istStartOfDay, lateness } from "@/lib/time";

// Team portal actions (spec §8). Everything else the portal does reuses the admin actions,
// which already enforce CS-brand and employee-assignment rules on the server.

/** EOD: one line per active task per day (§6.4). Status changes go through the task engine. */
export async function saveEod(fd: FormData): Promise<Result> {
  return guard(async () => {
    const u = await actor(["cs", "employee", "admin"]);
    const date = istDateOnly();
    const ids = fd.getAll("taskId").map(String);
    let saved = 0;
    const problems: string[] = [];
    for (const id of ids) {
      const remark = str(fd, `remark_${id}`);
      const statusId = opt(fd, `status_${id}`);
      const t = await loadTask(id);
      if (!t.assignees.some((a) => a.userId === u.id)) { problems.push(`${t.name}: not on your desk`); continue; }
      if (statusId && statusId !== t.statusId) {
        try { await moveTask(u, id, statusId, remark || null); } catch (e) { problems.push(`${t.name}: ${(e as Error).message}`); }
      }
      if (!remark) continue;
      const fresh = await db.task.findUniqueOrThrow({ where: { id }, include: { status: true } });
      await db.eodLog.upsert({
        where: { userId_taskId_date: { userId: u.id, taskId: id, date } },
        create: { userId: u.id, taskId: id, date, remark, statusAtTime: fresh.status.name },
        update: { remark, statusAtTime: fresh.status.name },
      });
      saved++;
    }
    if (saved) await audit(db, u, "eod.saved", "eod_log", null, undefined, { date: istDateKey(), lines: saved });
    if (problems.length) return fail(`${saved} saved · ${problems.join(" · ")}`);
    return ok(saved ? `EOD saved · ${saved} line${saved === 1 ? "" : "s"}` : "Nothing to save — add a line per task");
  });
}

/** "Pause" is a comment of kind pause, not a status (§6.3). */
export async function pauseTask(fd: FormData): Promise<Result> {
  return guard(async () => {
    const u = await actor(["employee", "cs"]);
    const t = await loadTask(str(fd, "id"));
    if (!t.assignees.some((a) => a.userId === u.id)) return fail("That task isn't on your desk");
    const why = str(fd, "note") || "Paused";
    await db.$transaction(async (tx) => {
      await tx.taskComment.create({ data: { taskId: t.id, userId: u.id, body: `Paused: ${why}`, kind: "pause" } });
      await audit(tx, u, "task.paused", "task", t.id, undefined, { why });
      await emit(tx, "task.paused", { task: { id: t.id, name: t.name }, by: fullName(u), why },
        [{ userId: t.csUserId, module: "task", title: `${fullName(u)} paused ${t.name}`, body: why, link: `/team/tasks?task=${t.id}` }]);
    });
    return ok("Paused · your CS has been told");
  });
}

/** CS review queue: approve → client gate (or done if not shared), reject needs one consolidated note. */
export async function reviewTask(fd: FormData): Promise<Result> {
  return guard(async () => {
    const u = await actor(["cs", "group_admin", "admin"]);
    const t = await loadTask(str(fd, "id"));
    await assertTask(u, t);
    if (!t.status.isReview) return fail("It's no longer in review");
    const statuses = await db.taskStatus.findMany();
    const note = opt(fd, "note");
    const approve = str(fd, "decision") === "approve";
    if (!approve && !note) return fail("Add one consolidated note so the team knows what to change");
    const to = approve ? statuses.find((s) => (t.shareWithClient ? s.isClientGate : s.isDone))! : statuses.find((s) => s.isRejected)!;
    await moveTask(u, t.id, to.id, note);
    const stars = Number(str(fd, "stars"));
    if (stars >= 1 && stars <= 5) {
      await db.taskRating.upsert({
        where: { taskId_raterKind: { taskId: t.id, raterKind: "cs" } },
        create: { taskId: t.id, raterKind: "cs", ratedByUserId: u.id, stars },
        update: { stars, ratedByUserId: u.id, at: new Date() },
      });
    }
    return ok(approve ? (t.shareWithClient ? "Sent to the client portal" : "Marked completed") : "Sent back with your note");
  });
}

/** Leave goes to admin (§6.5). */
export async function applyLeave(fd: FormData): Promise<Result> {
  return guard(async () => {
    const u = await actor(["cs", "employee"]);
    const from = str(fd, "fromDate"), to = str(fd, "toDate") || from;
    const type = str(fd, "type") as LeaveType;
    if (!from) return fail("Pick the dates");
    if (to < from) return fail("End date is before the start");
    if (!["casual", "sick", "half_day", "wfh"].includes(type)) return fail("Pick a leave type");
    const l = await db.leaveRequest.create({ data: { userId: u.id, fromDate: dateOnly(from), toDate: dateOnly(to), type, reason: opt(fd, "reason") } });
    await audit(db, u, "leave.requested", "leave_request", l.id, undefined, { from, to, type });
    // Leave goes to the super admin, the person's group admin and the CS they report to.
    const admins = await db.user.findMany({ where: { status: "active", OR: [{ role: "admin" }, ...(u.groupId ? [{ role: "group_admin" as const, groupId: u.groupId }] : []), ...(u.reportsToId ? [{ id: u.reportsToId }] : [])] }, select: { id: true, role: true } });
    await emit(db, "leave.requested", { leave: { id: l.id, from, to, type }, by: fullName(u) },
      admins.map((a) => ({ userId: a.id, module: "attendance" as const, title: `${fullName(u)} applied for ${type.replace("_", " ")} leave`, body: `${from}${to !== from ? ` → ${to}` : ""}`, link: a.role === "cs" ? "/team/people" : "/admin/attendance" })));
    return ok("Leave request sent");
  });
}

/** Client digest overrides (§8 Client digest): hold a day, or add a line. Sarthi reads these. */
export async function setDigest(fd: FormData): Promise<Result> {
  return guard(async () => {
    const u = await actor(["cs", "admin"]);
    const brandId = str(fd, "brandId");
    await assertBrand(u, brandId);
    const day = str(fd, "date") || istDateKey();
    const key = "digest_overrides";
    const cur = ((await db.setting.findUnique({ where: { key } }))?.value ?? {}) as Record<string, Record<string, { hold?: boolean; line?: string }>>;
    const forBrand = { ...(cur[brandId] ?? {}) };
    const entry = { ...(forBrand[day] ?? {}) };
    if (fd.has("hold")) entry.hold = str(fd, "hold") === "1";
    if (fd.has("line")) entry.line = str(fd, "line") || undefined;
    forBrand[day] = entry;
    // Keep only today onwards.
    for (const d of Object.keys(forBrand)) if (d < istDateKey()) delete forBrand[d];
    const next = { ...cur, [brandId]: forBrand };
    await db.setting.upsert({ where: { key }, create: { key, value: next as Prisma.InputJsonValue }, update: { value: next as Prisma.InputJsonValue } });
    await audit(db, u, "digest.override", "brand", brandId, undefined, { day, ...entry });
    await emit(db, "digest.override", { brand_id: brandId, date: day, ...entry, by: fullName(u) });
    const api = process.env.SARTHI_API_URL;
    if (api) {
      await fetch(`${api.replace(/\/$/, "")}/customers/cnc/digest/${brandId}/${day}`, {
        method: "PUT", headers: { "content-type": "application/json", authorization: `Bearer ${process.env.SARTHI_WEBHOOK_SECRET}` },
        body: JSON.stringify(entry), signal: AbortSignal.timeout(8000),
      }).catch(() => null);
    }
    return ok(entry.hold ? `Held for ${day}` : fd.has("line") ? "Line added" : "Digest back on");
  });
}

// ---------- logout check ----------
export type PendingTask = { id: string; name: string; brand: string; status: string; due: string; late: string; dueToday: boolean; reason: string };

/**
 * Tasks still in the person's hands (not with CS for review, not with the client, not done).
 * Logging out with any of these asks for a reason per task; today's EOD line pre-fills it.
 */
export async function pendingForLogout(): Promise<PendingTask[]> {
  const u = await actor();
  if (u.role !== "employee" && u.role !== "cs") return [];
  if (u.impersonatorId) return [];
  const now = new Date();
  const [tasks, eod] = await Promise.all([
    db.task.findMany({
      where: { assignees: { some: { userId: u.id } }, status: { isDone: false, isReview: false, isClientGate: false } },
      include: { status: true, brand: true }, orderBy: { deadlineAt: "asc" },
    }),
    db.eodLog.findMany({ where: { userId: u.id, date: istDateOnly(now) } }),
  ]);
  return tasks.map((t) => ({
    id: t.id, name: t.name, brand: t.brand.name, status: t.status.name, due: fmtDue(t.deadlineAt, now), late: lateness(t.deadlineAt, now),
    dueToday: isIstToday(t.deadlineAt, now), reason: eod.find((e) => e.taskId === t.id)?.remark ?? "",
  }));
}

/** Saves one reason per unfinished task: today's EOD line + a note on the task's timeline. */
export async function saveLogoutReasons(fd: FormData): Promise<Result> {
  return guard(async () => {
    const u = await actor(["employee", "cs"]);
    const ids = fd.getAll("taskId").map(String);
    const missing = ids.filter((id) => !str(fd, `reason_${id}`));
    if (missing.length) return fail(`Add a reason for ${missing.length === 1 ? "the task" : `all ${ids.length} tasks`} before you go`);
    const date = istDateOnly();
    const dayStart = istStartOfDay();
    for (const id of ids) {
      const t = await loadTask(id);
      if (!t.assignees.some((a) => a.userId === u.id)) continue;
      const reason = str(fd, `reason_${id}`).slice(0, 1000);
      await db.eodLog.upsert({
        where: { userId_taskId_date: { userId: u.id, taskId: id, date } },
        create: { userId: u.id, taskId: id, date, remark: reason, statusAtTime: t.status.name },
        update: { remark: reason, statusAtTime: t.status.name },
      });
      // One logout note per task per day: update it if they log out again.
      const body = `Logged out before finishing: ${reason}`;
      const existing = await db.taskComment.findFirst({ where: { taskId: id, userId: u.id, kind: "logout", createdAt: { gte: dayStart } } });
      if (existing) await db.taskComment.update({ where: { id: existing.id }, data: { body } });
      else await db.taskComment.create({ data: { taskId: id, userId: u.id, kind: "logout", body } });
    }
    await audit(db, u, "logout.reasons", "user", u.id, undefined, { tasks: ids.length, date: istDateKey() });
    return ok();
  });
}
