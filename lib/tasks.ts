import "server-only";
import type { Prisma, TaskStatus, User } from "@prisma/client";
import { db } from "./db";
import { audit, emit, type Notify } from "./events";
import { Forbidden, fullName } from "./auth";
import { brandScope, canSeeTask, settingValue, teamScope, type Viewer } from "./queries";
import { fmtDue } from "./time";

type Tx = Prisma.TransactionClient;

export async function assertBrand(u: Viewer, brandId: string) {
  const scope = await brandScope(u);
  if (scope && !scope.includes(brandId)) throw new Forbidden("That brand isn't yours");
}

/** People check: the user is in the viewer's team (group admin → group, CS → their reports). */
export async function assertPerson(u: Viewer, userId: string) {
  const team = await teamScope(u);
  if (team && !team.includes(userId)) throw new Forbidden("They're not in your team");
}

/** Task-level check: brand in scope, or someone on the task is in the user's team (hierarchy). */
export async function assertTask(u: Viewer, t: { brandId: string; csUserId: string; assignees: { userId: string }[] }) {
  if (!(await canSeeTask(u, t))) throw new Forbidden("That task isn't in your team");
}

const taskInclude = { status: true, brand: { include: { clientUsers: { where: { status: "active" as const } } } }, assignees: { include: { user: true } }, cs: true } satisfies Prisma.TaskInclude;
export type TaskFull = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

export function loadTask(id: string, tx: Tx | typeof db = db) {
  return tx.task.findUniqueOrThrow({ where: { id }, include: taskInclude });
}

/**
 * Who may move a task where (§6.3). Returns an error string, or null when allowed.
 */
export async function checkMove(u: User, t: TaskFull, to: TaskStatus, note: string | null) {
  const from = t.status;
  if (from.id === to.id) return "It's already there";
  if (u.role === "admin") {
    if (to.isRejected && from.isReview && !note) return "Add one consolidated note so the team knows what to change";
    return null;
  }
  if (u.role === "cs" || u.role === "group_admin") {
    if (!(await canSeeTask(u, t))) return "That task isn't in your team";
    if (to.isRejected && !note) return "Add one consolidated note so the team knows what to change";
    return null;
  }
  if (u.role === "employee") {
    if (!t.assignees.some((a) => a.userId === u.id)) return "That task isn't on your desk";
    if (from.isStart && !to.isStart && !to.isReview && !to.isClientGate && !to.isDone && !to.isRejected) return null; // start → progressing
    if (to.isReview && from.isStart) return "Start it first, then submit";
    if (to.isReview && !from.isClientGate && !from.isDone && !from.isReview) {
      if (await settingValue("submit_requires_attachment", true)) {
        const n = await db.taskAttachment.count({ where: { taskId: t.id } });
        if (!n) return "Share at least one file or link before submitting";
      }
      return null;
    }
    return "Only CS or admin can move it there";
  }
  if (u.role === "client") {
    if (u.brandId !== t.brandId || !t.shareWithClient) return "Not your piece";
    if (!from.isClientGate) return "This piece isn't waiting on you";
    if (to.isRejected && !note) return "Add a note so the designer knows what to change";
    if (!to.isDone && !to.isRejected) return "Approve or send it back";
    return null;
  }
  return "Not allowed";
}

/** Applies a status change: history row, timestamps, audit, notifications + outbox (§6.13). */
export async function applyMove(tx: Tx, u: User & { impersonatorId?: string | null }, t: TaskFull, to: TaskStatus, note: string | null) {
  const now = new Date();
  const data: Prisma.TaskUpdateInput = { status: { connect: { id: to.id } } };
  if (!t.startedAt && !to.isStart) data.startedAt = now;
  if (to.isReview) data.submittedAt = now;
  if (to.isDone) data.completedAt = now;
  else if (t.completedAt) data.completedAt = null;
  await tx.task.update({ where: { id: t.id }, data });
  await tx.taskStatusHistory.create({ data: { taskId: t.id, fromStatusId: t.statusId, toStatusId: to.id, byUserId: u.id, note } });
  await audit(tx, u, "task.status.changed", "task", t.id, { status: t.status.name }, { status: to.name, note });

  const who = fullName(u);
  const link = (base: string) => `${base}?task=${t.id}`;
  const staff: Notify[] = [...t.assignees.map((a) => a.userId), t.csUserId]
    .filter((id) => id !== u.id)
    .map((userId) => ({ userId, module: "task", title: `${who} moved ${t.brand.name} · ${t.name} to ${to.name}`, body: note ?? undefined, link: userId === t.csUserId && to.isReview ? "/team/review" : link("/team/tasks") }));
  const notify: Notify[] = [...staff];
  if (to.isReview || to.isRejected || to.isClientGate || to.isDone) {
    const groups = [...new Set(t.assignees.map((a) => a.user.groupId).concat(t.cs.groupId).filter(Boolean))] as string[];
    const admins = await tx.user.findMany({ where: { status: "active", id: { not: u.id }, OR: [{ role: "admin" }, { role: "group_admin", groupId: { in: groups } }] }, select: { id: true } });
    admins.forEach((a) => notify.push({ userId: a.id, module: to.isDone && u.role === "client" ? "approval" : "task", title: u.role === "client" ? `${t.brand.name} ${to.isDone ? "approved" : "sent back"} ${t.name}` : `${who} moved ${t.brand.name} · ${t.name} to ${to.name}`, body: note ?? undefined, link: link("/admin/tasks") }));
  }
  if (t.shareWithClient && (to.isClientGate || to.isDone) && u.role !== "client") {
    t.brand.clientUsers.forEach((c) => notify.push({ userId: c.id, module: "approval", title: to.isClientGate ? `${t.name} is ready for your approval` : `${t.name} delivered`, link: to.isClientGate ? "/client/approvals" : `/client/work?piece=${t.id}` }));
  }
  const event = to.isRejected ? "task.rejected" : "task.status.changed";
  await emit(tx, event, {
    task: { id: t.id, code: `T-${t.code}`, name: t.name, deadline: t.deadlineAt, deadline_label: fmtDue(t.deadlineAt) },
    brand: { id: t.brandId, name: t.brand.name },
    from: t.status.name, to: to.name, semantic: { review: to.isReview, rejected: to.isRejected, client_gate: to.isClientGate, done: to.isDone },
    note, by: { id: u.id, name: who, role: u.role },
    assignees: t.assignees.map((a) => ({ name: fullName(a.user), whatsapp: a.user.whatsappNo })),
    cs: { name: fullName(t.cs), whatsapp: t.cs.whatsappNo },
    link: `${process.env.APP_URL}/admin/tasks?task=${t.id}`,
  }, notify);
}

export async function moveTask(u: User, taskId: string, statusId: string, note: string | null) {
  const [t, to] = await Promise.all([loadTask(taskId), db.taskStatus.findUniqueOrThrow({ where: { id: statusId } })]);
  const err = await checkMove(u, t, to, note);
  if (err) throw new Forbidden(err);
  await db.$transaction((tx) => applyMove(tx, u, t, to, note));
  return { t, to };
}
