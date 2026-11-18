"use server";
import type { PaymentMethod } from "@prisma/client";
import { db } from "@/lib/db";
import { actor } from "@/lib/auth";
import { audit, emit } from "@/lib/events";
import { gstSplit, inr, toPaise } from "@/lib/money";
import { invNo, recordPayment, sendInvoice } from "@/lib/invoices";
import { fail, guard, ok, opt, str, type Result } from "@/lib/result";
import { DAY_MS, dateOnly, fmtDate, istDateKey } from "@/lib/time";

/** Due rule from terms options → date. */
function dueFrom(rule: string, issue: Date) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(rule)) return dateOnly(rule);
  if (rule === "7th of next month") return new Date(Date.UTC(issue.getUTCFullYear(), issue.getUTCMonth() + 1, 7));
  if (rule === "30 days") return new Date(issue.getTime() + 30 * DAY_MS);
  if (rule === "15 days") return new Date(issue.getTime() + 15 * DAY_MS);
  return issue; // on receipt
}

export async function saveInvoice(fd: FormData): Promise<Result> {
  return guard(async () => {
    const u = await actor(["admin"]);
    const brandId = str(fd, "brandId");
    const descs = fd.getAll("itemDesc").map(String), qtys = fd.getAll("itemQty").map(String), rates = fd.getAll("itemRate").map(String);
    const items = descs.map((d, i) => ({ description: d.trim(), qty: Number(qtys[i]) || 1, unitPaise: toPaise(rates[i] || "0") }))
      .filter((it) => it.description && it.unitPaise > BigInt(0))
      .map((it) => ({ ...it, amountPaise: BigInt(Math.round(Number(it.unitPaise) * it.qty)) }));
    if (!brandId) return fail("Pick a brand");
    if (!items.length) return fail("Add at least one line item with an amount");
    const gstRate = Number(str(fd, "gstRate") || 18);
    const subtotal = items.reduce((s, i) => s + i.amountPaise, BigInt(0));
    const { gst, total } = gstSplit(subtotal, gstRate);
    const issue = dateOnly(str(fd, "issueDate") || istDateKey());
    const due = dueFrom(str(fd, "dueRule") || "7th of next month", issue);
    const inv = await db.$transaction(async (tx) => {
      const inv = await tx.invoice.create({
        data: {
          brandId, issueDate: issue, dueDate: due, subtotalPaise: subtotal, gstRate, gstPaise: gst, totalPaise: total, notes: opt(fd, "notes"),
          remindersEnabled: str(fd, "reminders") === "on", createdById: u.id, items: { create: items.map((i) => ({ ...i, qty: i.qty })) },
        },
      });
      await tx.invoiceEvent.create({ data: { invoiceId: inv.id, kind: "created", byUserId: u.id } });
      await audit(tx, u, "invoice.created", "invoice", inv.id, undefined, { total: total.toString(), items: items.length });
      return inv;
    });
    if (str(fd, "send") === "1") {
      await sendInvoice(inv.id, u);
      return ok(`${invNo(inv.number)} sent · ${inr(total)}`, { id: inv.id });
    }
    return ok(`${invNo(inv.number)} saved as draft`, { id: inv.id });
  });
}

export async function sendInvoiceAction(fd: FormData): Promise<Result> {
  return guard(async () => {
    const u = await actor(["admin"]);
    await sendInvoice(str(fd, "id"), u);
    return ok("Sent to the client portal, email and WhatsApp");
  });
}

export async function remindInvoice(fd: FormData): Promise<Result> {
  return guard(async () => {
    const u = await actor(["admin"]);
    const inv = await db.invoice.findUniqueOrThrow({ where: { id: str(fd, "id") }, include: { brand: { include: { clientUsers: true } } } });
    if (!["sent", "viewed", "overdue"].includes(inv.status)) return fail("Only unpaid invoices can be chased");
    const n = (await db.invoiceEvent.count({ where: { invoiceId: inv.id, kind: "reminder" } })) + 1;
    await db.invoiceEvent.create({ data: { invoiceId: inv.id, kind: "reminder", byUserId: u.id, meta: { n, via: "sarthi", manual: true } } });
    await audit(db, u, "invoice.reminded", "invoice", inv.id);
    await emit(db, "invoice.reminder", { invoice: { id: inv.id, number: invNo(inv.number), total: inr(inv.totalPaise), due: fmtDate(inv.dueDate, true), pay_url: inv.razorpayShortUrl }, brand: inv.brand.name, n, clients: inv.brand.clientUsers.map((c) => ({ whatsapp: c.whatsappNo, email: c.email })) },
      inv.brand.clientUsers.map((c) => ({ userId: c.id, module: "invoice" as const, title: `Reminder: ${invNo(inv.number)} · ${inr(inv.totalPaise)}`, link: `/client/money?inv=${inv.id}` })));
    return ok(`Reminder ${n} sent by Sarthi`);
  });
}

export async function recordOffline(fd: FormData): Promise<Result> {
  return guard(async () => {
    const u = await actor(["admin"]);
    const amt = toPaise(str(fd, "amount"));
    if (amt <= BigInt(0)) return fail("Enter the amount received");
    const method = (["upi", "card", "netbanking", "wallet", "offline"].includes(str(fd, "method")) ? str(fd, "method") : "offline") as PaymentMethod;
    await recordPayment({ invoiceId: str(fd, "id"), amountPaise: amt, method, reference: opt(fd, "reference") ?? undefined, recordedBy: u.id });
    return ok(`${inr(amt)} recorded`);
  });
}

export async function voidInvoice(fd: FormData): Promise<Result> {
  return guard(async () => {
    const u = await actor(["admin"]);
    const id = str(fd, "id");
    const inv = await db.invoice.findUniqueOrThrow({ where: { id } });
    if (inv.status === "paid") return fail("Paid invoices can't be voided");
    await db.$transaction([
      db.invoice.update({ where: { id }, data: { status: "void" } }),
      db.invoiceEvent.create({ data: { invoiceId: id, kind: "voided", byUserId: u.id, meta: { reason: opt(fd, "reason") } } }),
    ]);
    await audit(db, u, "invoice.voided", "invoice", id);
    return ok("Voided · stays on the books as void");
  });
}

/** "Remind all overdue": one Sarthi reminder per overdue invoice, same as the per-invoice button. */
export async function remindAllOverdue(): Promise<Result> {
  return guard(async () => {
    await actor(["admin"]);
    const rows = await db.invoice.findMany({ where: { status: "overdue" }, select: { id: true } });
    if (!rows.length) return fail("Nothing is overdue right now");
    let n = 0;
    for (const r of rows) { const fd = new FormData(); fd.set("id", r.id); const res = await remindInvoice(fd); if (res.ok) n++; }
    return ok(`Reminders sent for ${n} overdue invoice${n === 1 ? "" : "s"}`);
  });
}
