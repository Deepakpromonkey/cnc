import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { name } from "@/lib/queries";
import { inr, lakh, rupees } from "@/lib/money";
import { DAY_MS, fmtDate, fmtWhen, istDateOnly, istParts, istStartOfMonth, monthName } from "@/lib/time";
import { razorpayLive } from "@/lib/razorpay";
import { MoneyView, type InvVM } from "@/components/admin/ops-views";

export const metadata = { title: "Invoices" };

const EVENT: Record<string, string> = { created: "Created", sent: "Sent to client portal + email + WhatsApp", viewed: "Opened by client", reminder: "Reminder sent by Sarthi", paid: "Paid", voided: "Voided" };

export default async function MoneyPage({ searchParams }: { searchParams: Promise<{ inv?: string; new?: string }> }) {
  await requireUser(["admin"]);
  const sp = await searchParams;
  const now = new Date();
  const rows = await db.invoice.findMany({ include: { brand: true, items: true, payments: true, events: { orderBy: { at: "desc" } } }, orderBy: { number: "desc" } });
  const users = new Map((await db.user.findMany({ where: { role: "admin" } })).map((u) => [u.id, name(u)]));
  const today = istDateOnly(now);
  const vms: InvVM[] = rows.map((i) => {
    const paid = i.payments.reduce((s, p) => s + p.amountPaise, BigInt(0));
    const late = i.status === "overdue" && i.dueDate ? Math.round((today.getTime() - i.dueDate.getTime()) / DAY_MS) : 0;
    return {
      id: i.id, no: `INV-${i.number}`, brand: i.brand.name, brandId: i.brandId, total: inr(i.totalPaise), totalNum: rupees(i.totalPaise), sub: inr(i.subtotalPaise), gst: `${Number(i.gstRate)}% · ${inr(i.gstPaise)}`,
      issued: i.issueDate ? fmtDate(i.issueDate) : "—", due: i.dueDate ? fmtDate(i.dueDate) : "—", status: i.status, late, note: i.notes ?? i.items[0]?.description ?? "",
      link: i.razorpayShortUrl, paidOn: i.paidAt ? fmtWhen(i.paidAt, now) : "", balance: rupees(i.totalPaise - paid), paidSoFar: inr(paid), terms: i.brand.paymentTerms ?? "",
      items: i.items.map((x) => ({ d: x.description, q: Number(x.qty), r: inr(x.unitPaise), a: inr(x.amountPaise) })),
      trail: i.events.map((e) => {
        const m = e.meta as Record<string, string | number | boolean>;
        const extra = e.kind === "paid" ? ` · ${String(m.method ?? "").toUpperCase()}${m.partial ? " · part payment" : ""}${m.reference ? ` · ${m.reference}` : ""}` : e.kind === "reminder" ? ` ${m.n ?? ""}` : e.kind === "viewed" && m.opens ? ` · ${m.opens}×` : "";
        return { text: (EVENT[e.kind] ?? e.kind) + extra, when: fmtWhen(e.at, now), by: e.byUserId ? users.get(e.byUserId) ?? "" : e.kind === "reminder" ? "Sarthi" : "", red: e.kind === "reminder" || e.kind === "voided" };
      }),
      reminders: i.remindersEnabled,
    };
  });
  const m0 = istStartOfMonth(now);
  const monthFirst = new Date(Date.UTC(istParts(now).y, istParts(now).m, 1));
  const book = rows.filter((i) => i.status !== "draft" && i.status !== "void" && ((i.issueDate && i.issueDate >= monthFirst) || ["sent", "viewed", "overdue"].includes(i.status) || (i.paidAt && i.paidAt >= m0)));
  const sum = (xs: typeof rows) => xs.reduce((s, i) => s + i.totalPaise, BigInt(0));
  const stats = {
    billed: lakh(sum(book)), collected: lakh(sum(book.filter((i) => i.status === "paid"))), due: lakh(sum(book.filter((i) => i.status === "sent" || i.status === "viewed"))),
    overdue: lakh(sum(book.filter((i) => i.status === "overdue"))), month: monthName(now, true), live: razorpayLive(),
  };
  // Aging: how long the unpaid money has been outstanding, in the buckets accountants use.
  const unpaid = rows.filter((i) => ["sent", "viewed", "overdue"].includes(i.status));
  const balance = (i: typeof rows[number]) => i.totalPaise - i.payments.reduce((s, p) => s + p.amountPaise, BigInt(0));
  const lateDays = (i: typeof rows[number]) => (i.dueDate ? Math.round((today.getTime() - i.dueDate.getTime()) / DAY_MS) : 0);
  const bucket = (test: (d: number) => boolean) => { const xs = unpaid.filter((i) => test(lateDays(i))); return { count: xs.length, amount: lakh(xs.reduce((s, i) => s + balance(i), BigInt(0))) }; };
  const aging = {
    buckets: [
      { label: "Due in 7 days", ...bucket((d) => d <= 0 && d >= -7), hot: false },
      { label: "1–30 days late", ...bucket((d) => d >= 1 && d <= 30), hot: true },
      { label: "31–60 days late", ...bucket((d) => d >= 31 && d <= 60), hot: true },
      { label: "60+ days late", ...bucket((d) => d > 60), hot: true },
    ],
    overdue: unpaid.filter((i) => i.status === "overdue").length,
  };
  return <MoneyView rows={vms} stats={stats} aging={aging} initial={sp.inv ?? null} openNew={sp.new === "1"} />;
}
