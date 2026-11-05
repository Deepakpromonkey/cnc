import "server-only";
import type { Prisma, User } from "@prisma/client";
import { db } from "./db";
import { fileUrl } from "./storage";
import { name } from "./queries";
import { DAY_MS, fmtDate, fmtDue, fmtTime, fmtWhen, istParts, istStartOfDay, istStartOfMonth } from "./time";
import { inr } from "./money";
import { clientLabel, clientStep, clientToneClass, priorityLabel, REQUEST_CLASS, REQUEST_LABEL } from "./status";

// Client-portal view-models (spec §9). Only shared work, only client-visible files and notes,
// CS names only — never assignees, EOD, internal comments or internal rejection notes.

export type FileVM = { id: string; kind: "upload" | "link"; url: string; label: string; thumb: string | null };
export type PieceVM = {
  id: string; name: string; title: string; project: string; projectId: string; label: string; step: number; cls: string;
  due: string; dueDay: string; done: boolean; doneThisMonth: boolean; gate: boolean; doneOn: string; sharedOn: string; cs: string; desc: string;
  files: FileVM[]; story: { text: string; when: string }[]; rating: { stars: number; review: string; on: string } | null;
  comments: { who: string; when: string; body: string }[];
};

export async function clientContext(u: User) {
  if (!u.brandId) throw new Error("Client login without a brand");
  const [brand, company] = await Promise.all([
    db.brand.findUniqueOrThrow({
      where: { id: u.brandId },
      include: { cs: { include: { user: true }, orderBy: { isPrimary: "desc" } }, scope: { include: { scope: true } } },
    }),
    db.company.findFirst(),
  ]);
  return { brand, company };
}

const pieceInclude = {
  status: true, project: true, title: true, cs: true,
  attachments: { where: { visibleToClient: true }, orderBy: { createdAt: "asc" } },
  history: { include: { to: true, by: true }, orderBy: { at: "asc" } },
  comments: { where: { visibleToClient: true }, include: { user: true }, orderBy: { createdAt: "asc" } },
  ratings: { where: { raterKind: "client" } },
} satisfies Prisma.TaskInclude;
type PieceRow = Prisma.TaskGetPayload<{ include: typeof pieceInclude }>;

const files = (list: PieceRow["attachments"]): FileVM[] => list.map((a) => ({
  id: a.id, kind: a.kind, label: a.label ?? (a.kind === "link" ? "Link" : "Image"),
  url: a.kind === "link" ? a.url! : fileUrl(a.fileId, "o")!, thumb: a.kind === "upload" ? fileUrl(a.fileId, "320") : null,
}));

function story(t: PieceRow, me: string, now: Date) {
  const out: { text: string; when: string }[] = [];
  let prev = "";
  for (const h of t.history) {
    let text: string;
    if (h.to.isRejected) {
      // Only the client's own send-backs are theirs to see; internal review rounds stay internal.
      if (h.by?.role !== "client") { prev = "internal"; continue; }
      text = `Sent back by ${h.byUserId === me ? "you" : h.by.firstName}${h.note ? ` · “${h.note}”` : ""}`;
    } else {
      const l = clientLabel(h.to);
      text = l === "Queued" ? "Queued" : l === "In the works" ? (prev && prev !== "Queued" ? "Back in the works" : "In the works")
        : l === "Internal review" ? "Internal review" : l === "Your approval" ? "Shared for your approval"
          : h.by?.role === "client" ? `Done · approved by ${h.byUserId === me ? "you" : h.by.firstName}` : "Done · delivered";
      if (text === out[out.length - 1]?.text) continue;
      prev = l;
    }
    out.push({ text, when: fmtWhen(h.at, now) });
  }
  return out;
}

export async function pieces(u: User): Promise<PieceVM[]> {
  const now = new Date();
  const rows = await db.task.findMany({ where: { brandId: u.brandId!, shareWithClient: true }, include: pieceInclude, orderBy: { deadlineAt: "asc" } });
  return rows.map((t) => {
    const label = clientLabel(t.status);
    const gate = [...t.history].reverse().find((h) => h.to.isClientGate);
    const done = [...t.history].reverse().find((h) => h.to.isDone);
    const r = t.ratings[0];
    const due = fmtDue(t.deadlineAt, now);
    return {
      id: t.id, name: t.name, title: t.title.name, project: t.project.name, projectId: t.projectId, label, step: clientStep(t.status), cls: clientToneClass(label),
      due, dueDay: due.split(",")[0], done: t.status.isDone, doneThisMonth: t.status.isDone && !!t.completedAt && t.completedAt >= istStartOfMonth(now), gate: t.status.isClientGate, doneOn: done ? fmtDate(done.at) : t.completedAt ? fmtDate(t.completedAt) : "",
      sharedOn: gate ? fmtWhen(gate.at, now) : "", cs: name(t.cs), desc: t.description ?? "", files: files(t.attachments), story: story(t, u.id, now),
      rating: r ? { stars: r.stars, review: r.review ?? "", on: fmtDate(r.at) } : null,
      comments: t.comments.map((c) => ({ who: c.user.role === "employee" ? "Coffee & Creative" : c.user.role === "client" ? name(c.user) : c.user.firstName, when: fmtWhen(c.createdAt, now), body: c.body })),
    };
  });
}

export async function projectsFor(u: User, list: PieceVM[]) {
  const rows = await db.project.findMany({
    where: { brandId: u.brandId!, archivedAt: null },
    include: { status: true, comments: { where: { visibleToClient: true }, include: { user: true }, orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy: [{ deadline: "desc" }],
  });
  return rows.map((p) => {
    const ps = list.filter((t) => t.projectId === p.id);
    const done = ps.filter((t) => t.done).length;
    const label = clientLabel(p.status);
    const c = p.comments[0];
    return {
      id: p.id, name: p.name, eyebrow: [p.type, p.subType].filter(Boolean).join(" · "), desc: p.description ?? "", label, cls: clientToneClass(label),
      dates: `${fmtDate(p.startDate)} → ${fmtDate(p.deadline)}`, pieces: ps, done, pct: ps.length ? Math.round((done / ps.length) * 100) : 0, finished: p.status.isDone,
      comment: c ? { who: `${c.user.role === "employee" ? "Coffee & Creative" : name(c.user)} · ${fmtDate(c.createdAt)}`, body: c.body } : null,
    };
  }).filter((p) => p.pieces.length || !p.finished);
}
export type ProjectCVM = Awaited<ReturnType<typeof projectsFor>>[number];

export async function requestsFor(u: User) {
  const now = new Date();
  const rows = await db.workRequest.findMany({
    where: { brandId: u.brandId! },
    include: { project: true, owner: true, attachments: true, replies: { where: { visibleToClient: true }, include: { user: true }, orderBy: { at: "asc" } } },
    orderBy: { date: "desc" },
  });
  return rows.map((r) => ({
    id: r.id, code: `WR-${r.code}`, subject: r.subject, body: r.description ?? "", when: fmtWhen(r.date, now), neededBy: r.neededBy ? fmtDate(r.neededBy) : "—",
    status: r.status, statusLabel: REQUEST_LABEL[r.status], cls: REQUEST_CLASS[r.status], project: r.project?.name ?? "—", priority: priorityLabel(r.priority),
    owner: r.owner ? name(r.owner) : "Your CS", ref: r.referenceLink,
    files: r.attachments.map((a) => ({ id: a.id, kind: a.kind, label: a.label ?? "Reference", url: a.kind === "link" ? a.url! : fileUrl(a.fileId, "o")!, thumb: a.kind === "upload" ? fileUrl(a.fileId, "320") : null })),
    replies: r.replies.map((x) => ({ who: x.userId === u.id ? "You" : x.user.role === "client" ? name(x.user) : name(x.user), mine: x.user.role === "client", when: fmtWhen(x.at, now), body: x.body })),
    converted: r.status === "converted",
  }));
}
export type RequestCVM = Awaited<ReturnType<typeof requestsFor>>[number];

export async function invoicesFor(u: User) {
  const rows = await db.invoice.findMany({
    where: { brandId: u.brandId!, status: { not: "draft" } },
    include: { items: true, payments: true },
    orderBy: [{ issueDate: "desc" }, { number: "desc" }],
  });
  const now = new Date();
  return rows.map((i) => {
    const paid = i.payments.reduce((s, p) => s + p.amountPaise, BigInt(0));
    const open = ["sent", "viewed", "overdue"].includes(i.status);
    const late = i.status === "overdue" && i.dueDate ? Math.round((now.getTime() - i.dueDate.getTime()) / DAY_MS) : 0;
    return {
      id: i.id, no: `INV-${i.number}`, amount: inr(i.totalPaise), totalPaise: i.totalPaise.toString(), subtotal: inr(i.subtotalPaise), gst: inr(i.gstPaise), gstRate: Number(i.gstRate),
      issued: fmtDate(i.issueDate), due: fmtDate(i.dueDate), status: i.status, open,
      statusLabel: i.status === "overdue" ? `Overdue ${late}d` : i.status === "paid" ? "Paid" : i.status === "void" ? "Void" : "Due",
      cls: i.status === "overdue" ? "brand" : i.status === "paid" ? "gold" : "dim",
      note: i.notes ?? i.items[0]?.description ?? "", items: i.items.map((x) => ({ d: x.description, a: inr(x.amountPaise) })),
      paidOn: i.paidAt ? `${fmtDate(i.paidAt)}, ${fmtTime(i.paidAt)}` : "", method: i.payments.map((p) => p.method.toUpperCase()).join(", "),
      partPaid: paid > BigInt(0) && open ? inr(paid) : "", balance: open ? inr(i.totalPaise - paid) : "", payUrl: i.razorpayShortUrl, paidThisYear: !!i.paidAt && istParts(i.paidAt).y === istParts(now).y,
    };
  });
}
export type InvoiceCVM = Awaited<ReturnType<typeof invoicesFor>>[number];

export async function noticesFor() {
  const rows = await db.announcement.findMany({ where: { showToClients: true, archivedAt: null }, orderBy: { date: "desc" } });
  const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return rows.map((a) => ({ id: a.id, holiday: a.type === "holiday", subject: a.subject, msg: a.message ?? "", day: String(a.date.getUTCDate()), mon: M[a.date.getUTCMonth()], date: fmtDate(a.date, true), image: fileUrl(a.imageFileId, "1280") }));
}
export type NoticeVM = Awaited<ReturnType<typeof noticesFor>>[number];

/** The CS team card: who to call, and whether the primary CS is in today. */
export async function teamFor(brand: Awaited<ReturnType<typeof clientContext>>["brand"]) {
  const now = new Date();
  const ids = brand.cs.map((c) => c.userId);
  const sessions = await db.attendanceSession.findMany({ where: { userId: { in: ids }, loginAt: { gte: istStartOfDay(now) } }, orderBy: { loginAt: "asc" } });
  return brand.cs.map((c) => {
    const s = sessions.find((x) => x.userId === c.userId);
    return { id: c.userId, name: name(c.user), desig: c.user.designation ?? "Client servicing", phone: c.user.mobile ?? "", email: c.user.email, inSince: s ? fmtTime(s.loginAt) : "" };
  });
}

export function studioHours(company: { studioHoursStart: string; studioHoursEnd: string; workingDays: number[] } | null) {
  const t = (s: string) => { const [h, m] = s.split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`; };
  const D = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const wd = [...(company?.workingDays ?? [1, 2, 3, 4, 5, 6])].sort();
  const days = wd.length > 1 && wd[wd.length - 1] - wd[0] === wd.length - 1 ? `${D[wd[0]]} – ${D[wd[wd.length - 1]]}` : wd.map((d) => D[d]).join(", ");
  return `Studio hours ${t(company?.studioHoursStart ?? "09:30")} – ${t(company?.studioHoursEnd ?? "19:30")} IST · ${days}`;
}

export const monthStart = () => istStartOfMonth(new Date());
