// Job bodies shared by the BullMQ worker and the one-shot nightly runner.
// Run with `tsx --conditions=react-server` so `server-only` resolves to its empty module.
import { db } from "../lib/db";
import { emit } from "../lib/events";
import { closeDay } from "../lib/attendance";
import { computeScores } from "../lib/scoring";
import { invNo, markOverdue } from "../lib/invoices";
import { processOutbox } from "../lib/outbox";
import { inr } from "../lib/money";
import { DAY_MS, dateOnly, fmtDate, fmtDue, istDateKey, istParts, lateness } from "../lib/time";
import { fullName } from "../lib/auth";

async function isStudioDay(key: string) {
  const company = await db.company.findFirst();
  const dow = istParts(new Date(`${key}T12:00:00+05:30`)).dow || 7;
  if (!(company?.workingDays ?? [1, 2, 3, 4, 5, 6]).includes(dow)) return false;
  return !(await db.announcement.findFirst({ where: { type: "holiday", date: dateOnly(key), archivedAt: null } }));
}

export const drainOutbox = () => processOutbox();

/** 00:05 IST — close yesterday's open sessions (auto-logout 23:59:59) and materialise attendance. */
export const closeYesterday = () => closeDay(istDateKey(new Date(Date.now() - DAY_MS)));

/** 00:30 IST — performance scores for the current IST month (§6.7). */
export const nightlyScores = () => computeScores(new Date());

/** 00:40 IST — overdue flip + scheduled reminders (§6.11). */
export async function invoicesNightly() {
  const today = istDateKey();
  const overdue = await markOverdue(today);
  const reminders = await invoiceReminders(today);
  return { overdue, reminders };
}

export async function invoiceReminders(todayKey = istDateKey()) {
  const sched = ((await db.setting.findUnique({ where: { key: "reminder_schedule" } }))?.value ?? {}) as { before_days?: number; on_due?: boolean; every_days?: number };
  const before = sched.before_days ?? 3, onDue = sched.on_due ?? true, every = sched.every_days ?? 5;
  const today = dateOnly(todayKey);
  const dayStart = new Date(`${todayKey}T00:00:00+05:30`);
  const rows = await db.invoice.findMany({
    where: { status: { in: ["sent", "viewed", "overdue"] }, remindersEnabled: true, dueDate: { not: null } },
    include: { brand: { include: { clientUsers: { where: { status: "active" } } } }, events: { where: { kind: "reminder" } } },
  });
  let sent = 0;
  for (const inv of rows) {
    const diff = Math.round((today.getTime() - inv.dueDate!.getTime()) / DAY_MS); // + = days past due
    const due = diff === -before || (onDue && diff === 0) || (diff > 0 && diff % every === 0);
    if (!due || inv.events.some((e) => e.at >= dayStart)) continue;
    const n = inv.events.length + 1;
    await db.invoiceEvent.create({ data: { invoiceId: inv.id, kind: "reminder", meta: { n, via: "sarthi", days_from_due: diff } } });
    await emit(db, "invoice.reminder", {
      invoice: { id: inv.id, number: invNo(inv.number), total: inr(inv.totalPaise), due: fmtDate(inv.dueDate, true), pay_url: inv.razorpayShortUrl, days_from_due: diff },
      brand: inv.brand.name, n, clients: inv.brand.clientUsers.map((c) => ({ name: fullName(c), whatsapp: c.whatsappNo, email: c.email })),
    });
    sent++;
  }
  return sent;
}

/** 19:30 IST — assignees with an active task and no EOD today (§6.4). Sarthi chases on WhatsApp. */
export async function eodChaser(todayKey = istDateKey()) {
  if (!(await isStudioDay(todayKey))) return 0;
  const active = await db.task.findMany({
    where: { status: { isDone: false }, startedAt: { not: null } },
    include: { brand: true, assignees: { include: { user: true } } },
  });
  const logged = new Set((await db.eodLog.findMany({ where: { date: dateOnly(todayKey) }, select: { userId: true } })).map((e) => e.userId));
  const byUser = new Map<string, { user: (typeof active)[number]["assignees"][number]["user"]; tasks: string[] }>();
  for (const t of active) for (const a of t.assignees) {
    if (a.user.status !== "active" || logged.has(a.userId)) continue;
    const e = byUser.get(a.userId) ?? { user: a.user, tasks: [] };
    e.tasks.push(`${t.brand.name} · ${t.name}`);
    byUser.set(a.userId, e);
  }
  for (const { user, tasks } of byUser.values()) {
    await emit(db, "eod.missing", { date: todayKey, user: { id: user.id, name: fullName(user), whatsapp: user.whatsappNo }, tasks });
  }
  return byUser.size;
}

/** Hourly — late tasks with Sarthi nudges on (§6.13: Sarthi only, no in-app spam). */
export async function lateTaskEvents(now = new Date()) {
  if (!(await isStudioDay(istDateKey(now)))) return 0;
  const late = await db.task.findMany({
    where: { sarthiNudge: true, deadlineAt: { lt: now }, status: { isDone: false, isClientGate: false, isReview: false } },
    include: { brand: true, cs: true, assignees: { include: { user: true } } },
  });
  for (const t of late) {
    await emit(db, "task.late", {
      task: { id: t.id, code: `T-${t.code}`, name: t.name, deadline_label: fmtDue(t.deadlineAt, now), late: lateness(t.deadlineAt, now) },
      brand: t.brand.name, assignees: t.assignees.map((a) => ({ name: fullName(a.user), whatsapp: a.user.whatsappNo })),
      cs: { name: fullName(t.cs), whatsapp: t.cs.whatsappNo }, link: `${process.env.APP_URL}/admin/tasks?task=${t.id}`,
    });
  }
  return late.length;
}
