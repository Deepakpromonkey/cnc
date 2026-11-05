import "server-only";
import { db } from "./db";
import { healthScore, name } from "./queries";
import { DAY_MS, fmtAgo, fmtDate, daysBetween, istDateOnly } from "./time";
import { lakh } from "./money";
import { FREQUENCY_LABEL, isLateStatus } from "./status";

/** Per-brand counters (computed, never stored — spec §4.2) + health score (§7). */
export async function brandStats(brandIds?: string[]) {
  const now = new Date();
  const brands = await db.brand.findMany({
    where: brandIds ? { id: { in: brandIds } } : {},
    include: {
      cs: { include: { user: true }, orderBy: { isPrimary: "desc" } },
      tasks: { where: { status: { isDone: false } }, include: { status: true, history: { orderBy: { at: "desc" }, take: 1 } } },
      invoices: { where: { status: { not: "void" } }, orderBy: { issueDate: "desc" } },
    },
    orderBy: { name: "asc" },
  });
  const lastTouch = await db.taskStatusHistory.groupBy({ by: ["taskId"], _max: { at: true } });
  const taskBrand = new Map((await db.task.findMany({ select: { id: true, brandId: true } })).map((t) => [t.id, t.brandId]));
  const lastByBrand = new Map<string, Date>();
  lastTouch.forEach((r) => {
    const b = taskBrand.get(r.taskId);
    if (b && r._max.at && (!lastByBrand.get(b) || r._max.at > lastByBrand.get(b)!)) lastByBrand.set(b, r._max.at);
  });
  const today = istDateOnly(now);

  return brands.map((b) => {
    const open = b.tasks.length;
    const late = b.tasks.filter((t) => isLateStatus(t.status) && t.deadlineAt < now).length;
    const waiting = b.tasks.filter((t) => t.status.isClientGate);
    const stale = waiting.filter((t) => t.history[0] && now.getTime() - t.history[0].at.getTime() > 3 * DAY_MS).length;
    const rejected = b.tasks.some((t) => t.status.isRejected);
    const overdue = b.invoices.filter((i) => i.status === "overdue");
    const due = b.invoices.filter((i) => i.status === "sent" || i.status === "viewed");
    const latestPaid = b.invoices.find((i) => i.status === "paid");
    const draft = b.invoices.find((i) => i.status === "draft");
    let inv = "—", invHot = false;
    if (overdue.length) { const o = overdue[0]; inv = `${lakh(o.totalPaise)} overdue ${o.dueDate ? daysBetween(o.dueDate, today) : 0}d`; invHot = true; }
    else if (due.find((i) => i.status === "viewed")) { inv = "Viewed, unpaid"; invHot = true; }
    else if (due.length) inv = `Due ${fmtDate(due[0].dueDate)}`;
    else if (draft) inv = "Draft";
    else if (latestPaid) inv = latestPaid.paidAt && now.getTime() - latestPaid.paidAt.getTime() < 10 * DAY_MS ? `Paid ${fmtDate(latestPaid.paidAt)}` : "Paid";
    return {
      id: b.id, name: b.name, company: b.companyName ?? b.name, status: b.status, frequency: b.frequency, type: FREQUENCY_LABEL[b.frequency],
      cs: b.cs.map((c) => ({ id: c.userId, name: name(c.user) })), open, waiting: waiting.length, late, rejected,
      health: healthScore({ late, staleClient: stale, overdueInvoice: overdue.length > 0, openRejected: rejected }),
      inv, invHot, last: fmtAgo(lastByBrand.get(b.id) ?? b.updatedAt, now), lastAt: (lastByBrand.get(b.id) ?? b.updatedAt).getTime(),
    };
  });
}
export type BrandStat = Awaited<ReturnType<typeof brandStats>>[number];
