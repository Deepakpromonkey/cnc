import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { fileUrl } from "./storage";
import { brandScope, name, settingValue, statuses, teamScope, type Viewer } from "./queries";
import { dateKey, fmtDate, fmtDue, fmtWhen, isIstToday, istDateKey, istTimeKey, lateness } from "./time";
import { clientLabel, FREQUENCY_LABEL, isLateStatus, priorityLabel, toneClass } from "./status";
import { istStartOfMonth } from "./time";
import type { ReqVM } from "@/components/admin/ops-views";

// Serializable view-models for client components. All IST formatting happens here.

export type Opt = { id: string; name: string };
export type StatusVM = { id: string; name: string; cls: string; tone: string; isStart: boolean; isDone: boolean; isClientGate: boolean; isReview: boolean; isRejected: boolean; order: number };
export type AttachVM = { id: string; kind: "upload" | "link"; url: string; label: string; thumb: string | null; client: boolean };
export type TaskVM = {
  id: string; code: string; name: string; desc: string; brand: string; brandId: string; project: string; projectId: string;
  status: StatusVM; priority: string; priorityLabel: string; title: string; titleId: string; serv: string; servId: string;
  start: string; startKey: string; due: string; dueKey: string; dueTime: string; late: string; isLate: boolean; dueToday: boolean;
  assignees: { id: string; name: string; dept: string }[]; cs: Opt; by: string; share: boolean; nudge: boolean;
  attachments: AttachVM[]; history: { text: string; when: string; by: string; red: boolean }[]; eod: { text: string; when: string; by: string }[];
  comments: { who: string; when: string; body: string; client: boolean }[]; clientRating: { stars: number; review: string; on: string } | null;
  csRating: number | null; gateSince: string; doneOn: string; clientLabel: string; requestCode: string | null;
  /** Whole days the task has sat in its current status (0 = moved today). */
  inStatusDays: number;
};

export async function statusVMs(): Promise<StatusVM[]> {
  return (await statuses()).map((s) => ({ ...s, cls: toneClass(s.tone) }));
}

export const taskInclude = {
  status: true, brand: true, project: true, title: true, servicing: true, cs: true, createdBy: true,
  assignees: { include: { user: true, department: true }, orderBy: { isLead: "desc" } },
  attachments: { orderBy: { createdAt: "asc" } },
  history: { include: { to: true, by: true }, orderBy: { at: "asc" } },
  eodLogs: { include: { user: true }, orderBy: { date: "asc" } },
  comments: { include: { user: true }, orderBy: { createdAt: "asc" } },
  ratings: true,
  convertedFrom: { select: { code: true } },
} satisfies Prisma.TaskInclude;
type TaskRow = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

export function taskVM(t: TaskRow, now = new Date()): TaskVM {
  const st = { ...t.status, cls: toneClass(t.status.tone) };
  const late = isLateStatus(t.status) ? lateness(t.deadlineAt, now) : "";
  const gate = [...t.history].reverse().find((h) => h.to.isClientGate);
  const done = [...t.history].reverse().find((h) => h.to.isDone);
  const cr = t.ratings.find((r) => r.raterKind === "client");
  return {
    id: t.id, code: `T-${t.code}`, name: t.name, desc: t.description ?? "", brand: t.brand.name, brandId: t.brandId, project: t.project.name, projectId: t.projectId,
    status: st, priority: t.priority, priorityLabel: priorityLabel(t.priority), title: t.title.name, titleId: t.titleId, serv: t.servicing?.name ?? "", servId: t.servicingTypeId ?? "",
    start: fmtDate(t.startDate), startKey: dateKey(t.startDate), due: fmtDue(t.deadlineAt, now), dueKey: istDateKey(t.deadlineAt), dueTime: istTimeKey(t.deadlineAt),
    late, isLate: !!late, dueToday: isIstToday(t.deadlineAt, now),
    assignees: t.assignees.map((a) => ({ id: a.userId, name: name(a.user), dept: a.department?.name ?? "" })),
    cs: { id: t.csUserId, name: name(t.cs) }, by: name(t.createdBy), share: t.shareWithClient, nudge: t.sarthiNudge,
    attachments: t.attachments.map((a) => ({
      id: a.id, kind: a.kind, label: a.label ?? (a.kind === "link" ? "Link" : "Image"), client: a.visibleToClient,
      url: a.kind === "link" ? a.url! : fileUrl(a.fileId, "o")!, thumb: a.kind === "upload" ? fileUrl(a.fileId, "320") : null,
    })),
    history: t.history.map((h) => ({ text: h.to.name + (h.note ? ` · “${h.note}”` : ""), when: fmtWhen(h.at, now), by: name(h.by), red: h.to.isRejected })),
    eod: t.eodLogs.map((e) => ({ text: e.remark, when: fmtDate(e.date), by: name(e.user) })),
    comments: t.comments.map((c) => ({ who: name(c.user), when: fmtWhen(c.createdAt, now), body: c.body, client: c.visibleToClient })),
    clientRating: cr ? { stars: cr.stars, review: cr.review ?? "", on: fmtDate(cr.at) } : null,
    csRating: t.ratings.find((r) => r.raterKind === "cs")?.stars ?? null,
    gateSince: gate ? fmtWhen(gate.at, now) : "", doneOn: done ? fmtDate(done.at) : "",
    clientLabel: clientLabel(t.status), requestCode: t.convertedFrom[0] ? `WR-${t.convertedFrom[0].code}` : null,
    inStatusDays: Math.max(0, Math.floor((now.getTime() - (t.history[t.history.length - 1]?.at ?? t.createdAt).getTime()) / 864e5)),
  };
}

export async function loadTasks(where: Prisma.TaskWhereInput, take?: number) {
  const rows = await db.task.findMany({ where, include: taskInclude, orderBy: { deadlineAt: "asc" }, take });
  const now = new Date();
  return rows.map((t) => taskVM(t, now));
}

/** Everything the admin forms need for their selects. A group admin only gets their group's brands and people. */
export async function adminLookups(u?: Viewer) {
  const [bScope, team] = u ? await Promise.all([brandScope(u), teamScope(u)]) : [null, null];
  const [brands, projects, st, titles, servicing, staff, depts, scope, flagTypes, terms, groups] = await Promise.all([
    db.brand.findMany({ where: { status: "active", ...(bScope ? { id: { in: bScope } } : {}) }, orderBy: { name: "asc" }, include: { cs: { orderBy: { isPrimary: "desc" } } } }),
    db.project.findMany({ where: { archivedAt: null, ...(bScope ? { brandId: { in: bScope } } : {}) }, orderBy: { createdAt: "desc" }, select: { id: true, name: true, brandId: true } }),
    statusVMs(),
    db.taskTitle.findMany({ where: { status: "active" }, orderBy: { name: "asc" } }),
    db.servicingType.findMany({ where: { status: "active" }, orderBy: { name: "asc" } }),
    db.user.findMany({ where: { role: { in: ["admin", "group_admin", "cs", "employee"] }, status: "active", ...(u?.role === "group_admin" && team ? { id: { in: team } } : {}) }, include: { department: true }, orderBy: { firstName: "asc" } }),
    db.department.findMany({ where: { status: "active" }, orderBy: { order: "asc" } }),
    db.scopeOfWork.findMany({ where: { status: "active" }, orderBy: { name: "asc" } }),
    db.flagType.findMany({ where: { status: "active" }, orderBy: { points: "desc" } }),
    settingValue<string[]>("payment_terms_options", ["7th of every month", "30 days", "50% advance, 50% on delivery", "Quarterly in advance", "On receipt"]),
    db.teamGroup.findMany({ where: { status: "active", ...(u?.role === "group_admin" ? { id: u.groupId ?? "" } : {}) }, orderBy: { name: "asc" } }),
  ]);
  const person = (p: (typeof staff)[number]) => ({ id: p.id, name: name(p), dept: p.department?.name ?? "", role: p.role, groupId: p.groupId, reportsToId: p.reportsToId });
  return {
    me: { id: u?.id ?? "", role: u?.role ?? "admin", groupId: u?.groupId ?? null },
    groups: groups.map((g) => ({ id: g.id, name: g.name })),
    brands: brands.map((b) => ({ id: b.id, name: b.name, cs: b.cs.map((c) => c.userId), terms: b.paymentTerms ?? "" })),
    projects, statuses: st,
    titles: titles.map((t) => ({ id: t.id, name: t.name })), servicing: servicing.map((s) => ({ id: s.id, name: s.name })),
    employees: staff.filter((p) => p.role === "employee").map(person), cs: staff.filter((p) => p.role === "cs").map(person),
    admins: staff.filter((p) => p.role === "admin" || p.role === "group_admin").map(person), staff: staff.map(person),
    depts: depts.map((d) => ({ id: d.id, name: d.name })), scope: scope.map((s) => ({ id: s.id, name: s.name })),
    flagTypes: flagTypes.map((f) => ({ id: f.id, name: f.name, colour: f.colour, points: f.points, note: f.note ?? "" })),
    terms, frequencies: Object.entries(FREQUENCY_LABEL).map(([id, n]) => ({ id, name: n })),
  };
}
export type Lookups = Awaited<ReturnType<typeof adminLookups>>;

// ---------- projects ----------
export async function loadProjects(where: Prisma.ProjectWhereInput, tasks?: TaskVM[]) {
  const rows = await db.project.findMany({
    where: { archivedAt: null, ...where },
    include: { brand: true, status: true, scope: { include: { scope: true } }, comments: { include: { user: true }, orderBy: { createdAt: "asc" } } },
    orderBy: [{ deadline: "asc" }],
  });
  const all = tasks ?? (await loadTasks({ projectId: { in: rows.map((r) => r.id) } }));
  const now = new Date();
  return rows.map((p) => {
    const ts = all.filter((t) => t.projectId === p.id);
    return {
      id: p.id, code: `P-${p.code}`, brand: p.brand.name, brandId: p.brandId, name: p.name, brandPoc: p.brandPoc ?? "", pocPhone: p.pocPhone ?? "",
      type: p.type ?? "", subType: p.subType ?? "", description: p.description ?? "", startKey: dateKey(p.startDate), deadlineKey: dateKey(p.deadline),
      start: fmtDate(p.startDate), deadline: fmtDate(p.deadline), refs: [p.referenceLink1 ?? "", p.referenceLink2 ?? "", p.referenceLink3 ?? ""],
      refLinks: [p.referenceLink1, p.referenceLink2, p.referenceLink3].filter(Boolean) as string[], terms: p.paymentTerms ?? "",
      priority: p.priority, priorityLabel: priorityLabel(p.priority), statusId: p.statusId, status: { name: p.status.name, cls: toneClass(p.status.tone) },
      scopeIds: p.scope.map((s) => s.scopeOfWorkId), scopeNames: p.scope.map((s) => s.scope.name),
      tasks: ts, done: ts.filter((t) => t.status.isDone).length,
      comments: p.comments.map((c) => ({ who: name(c.user), when: fmtWhen(c.createdAt, now), body: c.body, client: c.visibleToClient, image: c.fileId ? fileUrl(c.fileId, "320") : null })),
    };
  });
}
export type ProjectRowVM = Awaited<ReturnType<typeof loadProjects>>[number];

// ---------------- work requests ----------------
const CHANNEL: Record<string, string> = { portal: "client portal", whatsapp: "WhatsApp", email: "email", phone: "phone" };
export async function loadRequestVMs(where: Prisma.WorkRequestWhereInput): Promise<ReqVM[]> {
  const now = new Date();
  const rows = await db.workRequest.findMany({
    include: { brand: true, project: true, owner: true, raisedBy: true, convertedTask: true, attachments: true, replies: { include: { user: true }, orderBy: { at: "asc" } } },
    where, orderBy: { date: "desc" },
  });
  return rows.map((x) => ({
    id: x.id, code: `WR-${x.code}`, subject: x.subject, body: x.description ?? "", brand: x.brand.name, brandId: x.brandId, project: x.project?.name ?? "—", projectId: x.projectId,
    when: fmtWhen(x.date, now), neededBy: x.neededBy ? fmtDate(x.neededBy) : "Flexible", poc: x.pocName ?? "", pocContact: x.pocContact ?? "", priority: x.priority, priorityLabel: priorityLabel(x.priority),
    status: x.status, owner: name(x.owner), from: `${x.raisedBy?.role === "client" ? x.brand.name : name(x.raisedBy)} · ${CHANNEL[x.channel] ?? x.channel}`,
    ref: x.referenceLink, task: x.convertedTask ? { id: x.convertedTask.id, code: `T-${x.convertedTask.code}` } : null,
    files: x.attachments.map((a) => ({ id: a.id, kind: a.kind, url: a.kind === "link" ? a.url! : fileUrl(a.fileId, "o")!, thumb: a.kind === "upload" ? fileUrl(a.fileId, "320") : null, label: a.label ?? "" })),
    thread: x.replies.map((p) => ({ who: name(p.user), when: fmtWhen(p.at, now), body: p.body, client: p.user.role === "client" })),
    replyMins: x.firstReplyAt ? (x.firstReplyAt.getTime() - x.date.getTime()) / 60_000 : null, monthly: x.date >= istStartOfMonth(now),
  }));
}
