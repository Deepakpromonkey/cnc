import "server-only";
import type { PaymentMethod, Prisma } from "@prisma/client";
import { db } from "./db";
import { audit, emit } from "./events";
import { createPaymentLink } from "./razorpay";
import { sendMail } from "./mail";
import { fullName } from "./auth";
import { inr } from "./money";
import { fmtDate, istDateOnly } from "./time";
import { invoicePdf } from "./pdf";

export const invNo = (n: number) => `INV-${n}`;

const inc = { brand: { include: { clientUsers: { where: { status: "active" as const } }, cs: true } }, items: true, payments: true } satisfies Prisma.InvoiceInclude;

/** Draft → sent: Razorpay link, email to client users, Sarthi event (§6.11). */
export async function sendInvoice(id: string, by: { id: string }) {
  const inv = await db.invoice.findUniqueOrThrow({ where: { id }, include: inc });
  if (inv.status !== "draft") throw new Error("Already sent");
  const clients = inv.brand.clientUsers;
  const link = await createPaymentLink({
    invoiceId: inv.id, number: invNo(inv.number), amountPaise: inv.totalPaise, brandName: inv.brand.name,
    customer: { name: inv.brand.companyName ?? inv.brand.name, email: clients[0]?.email ?? inv.brand.officialEmail, contact: inv.brand.pocPhone?.replace(/\s/g, "") },
  });
  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.invoice.update({ where: { id }, data: { status: "sent", sentAt: now, issueDate: inv.issueDate ?? istDateOnly(now), razorpayLinkId: link.id, razorpayShortUrl: link.short_url } });
    await tx.invoiceEvent.create({ data: { invoiceId: id, kind: "sent", byUserId: by.id, meta: { channels: ["portal", "email", "whatsapp"], link: link.short_url } } });
    await audit(tx, by, "invoice.sent", "invoice", id, undefined, { link: link.id });
    await emit(tx, "invoice.sent", {
      invoice: { id, number: invNo(inv.number), total: inr(inv.totalPaise), due: fmtDate(inv.dueDate, true), pay_url: link.short_url },
      brand: inv.brand.name, clients: clients.map((c) => ({ name: fullName(c), whatsapp: c.whatsappNo, email: c.email })),
    }, [
      ...clients.map((c) => ({ userId: c.id, module: "invoice" as const, title: `${invNo(inv.number)} · ${inr(inv.totalPaise)} due ${fmtDate(inv.dueDate)}`, link: `/client/money?inv=${id}` })),
      ...inv.brand.cs.map((c) => ({ userId: c.userId, module: "invoice" as const, title: `${invNo(inv.number)} sent to ${inv.brand.name}`, link: undefined })),
    ]);
  });
  if (clients.length) {
    const pdf = await invoicePdf(id);
    await sendMail({
      to: clients.map((c) => c.email), subject: `${invNo(inv.number)} from Coffee & Creative · ${inr(inv.totalPaise)}`,
      text: `Hi,\n\nYour invoice ${invNo(inv.number)} for ${inr(inv.totalPaise)} is due on ${fmtDate(inv.dueDate, true)}.\nPay online (UPI, card, netbanking): ${link.short_url}\nOr from your portal: ${process.env.APP_URL}/client/money\n\n— Coffee & Creative`,
      attachments: [{ filename: `${invNo(inv.number)}.pdf`, content: pdf }],
    });
  }
  return link.short_url;
}

/**
 * Records money in. Called by the signed Razorpay webhook, the dev mock checkout, and
 * admin "record offline payment". Partial payments allowed; paid when sum ≥ total.
 */
export async function recordPayment(opts: {
  invoiceId: string; amountPaise: bigint; method: PaymentMethod; razorpayPaymentId?: string; signatureOk?: boolean; reference?: string; recordedBy?: string | null;
}) {
  if (opts.razorpayPaymentId && (await db.payment.findUnique({ where: { razorpayPaymentId: opts.razorpayPaymentId } }))) return; // idempotent webhook
  const inv = await db.invoice.findUniqueOrThrow({ where: { id: opts.invoiceId }, include: inc });
  if (inv.status === "void") throw new Error("Invoice is void");
  const paidSoFar = inv.payments.reduce((s, p) => s + p.amountPaise, BigInt(0)) + opts.amountPaise;
  const fully = paidSoFar >= inv.totalPaise;
  await db.$transaction(async (tx) => {
    await tx.payment.create({ data: { invoiceId: inv.id, amountPaise: opts.amountPaise, method: opts.method, razorpayPaymentId: opts.razorpayPaymentId, razorpaySignatureOk: !!opts.signatureOk, reference: opts.reference, recordedBy: opts.recordedBy ?? null } });
    if (fully) await tx.invoice.update({ where: { id: inv.id }, data: { status: "paid", paidAt: new Date() } });
    await tx.invoiceEvent.create({ data: { invoiceId: inv.id, kind: "paid", byUserId: opts.recordedBy ?? null, meta: { amount: opts.amountPaise.toString(), method: opts.method, partial: !fully, reference: opts.reference ?? opts.razorpayPaymentId } } });
    await audit(tx, opts.recordedBy ? { id: opts.recordedBy } : null, "invoice.payment", "invoice", inv.id, undefined, { amount: opts.amountPaise.toString(), method: opts.method, fully });
    if (fully) {
      const admins = await tx.user.findMany({ where: { role: "admin", status: "active" }, select: { id: true } });
      await emit(tx, "invoice.paid", { invoice: { id: inv.id, number: invNo(inv.number), total: inr(inv.totalPaise), method: opts.method }, brand: inv.brand.name, clients: inv.brand.clientUsers.map((c) => ({ name: fullName(c), whatsapp: c.whatsappNo })) }, [
        ...admins.map((a) => ({ userId: a.id, module: "invoice" as const, title: `${inv.brand.name} paid ${invNo(inv.number)} · ${inr(inv.totalPaise)}`, link: `/admin/money?inv=${inv.id}` })),
        ...inv.brand.cs.map((c) => ({ userId: c.userId, module: "invoice" as const, title: `${inv.brand.name} paid ${invNo(inv.number)}` })),
        ...inv.brand.clientUsers.map((c) => ({ userId: c.id, module: "invoice" as const, title: `Payment received · ${invNo(inv.number)}`, link: `/client/money?inv=${inv.id}` })),
      ]);
    }
  });
  if (fully && inv.brand.clientUsers.length && opts.method !== "offline") {
    await sendMail({ to: inv.brand.clientUsers.map((c) => c.email), subject: `Receipt · ${invNo(inv.number)} · ${inr(inv.totalPaise)}`, text: `Thank you — we've received ${inr(inv.totalPaise)} for ${invNo(inv.number)}.\n\n— Coffee & Creative`, attachments: [{ filename: `${invNo(inv.number)}-receipt.pdf`, content: await invoicePdf(inv.id) }] });
  }
}

/** Nightly: unpaid past due → overdue (§6.11). */
export async function markOverdue(todayKey: string) {
  const today = new Date(`${todayKey}T00:00:00Z`);
  const rows = await db.invoice.findMany({ where: { status: { in: ["sent", "viewed"] }, dueDate: { lt: today } }, include: { brand: true } });
  for (const inv of rows) {
    await db.invoice.update({ where: { id: inv.id }, data: { status: "overdue" } });
    await audit(db, null, "invoice.overdue", "invoice", inv.id);
    const admins = await db.user.findMany({ where: { role: "admin", status: "active" }, select: { id: true } });
    await emit(db, "invoice.overdue", { invoice: { id: inv.id, number: invNo(inv.number), total: inr(inv.totalPaise) }, brand: inv.brand.name },
      admins.map((a) => ({ userId: a.id, module: "invoice" as const, title: `${invNo(inv.number)} · ${inv.brand.name} is overdue`, link: `/admin/money?inv=${inv.id}` })));
  }
  return rows.length;
}
