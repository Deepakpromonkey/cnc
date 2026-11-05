import { NextResponse } from "next/server";
import type { PaymentMethod } from "@prisma/client";
import pino from "pino";
import { db } from "@/lib/db";
import { verifyWebhook } from "@/lib/razorpay";
import { recordPayment } from "@/lib/invoices";

const log = pino({ name: "razorpay-webhook" });
const METHODS: PaymentMethod[] = ["upi", "card", "netbanking", "wallet"];

type Payload = {
  event?: string;
  payload?: {
    payment_link?: { entity?: { id?: string; notes?: { invoice_id?: string } } };
    payment?: { entity?: { id?: string; amount?: number; method?: string; notes?: { invoice_id?: string } } };
    order?: { entity?: { notes?: { invoice_id?: string } } };
  };
};

// Spec §6.11: signature verified on the raw body before anything is trusted.
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyWebhook(raw, req.headers.get("x-razorpay-signature"))) {
    log.warn("bad signature");
    return NextResponse.json({ ok: false, error: "bad signature" }, { status: 400 });
  }
  let body: Payload;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }

  if (body.event !== "payment_link.paid") {
    await db.auditLog.create({ data: { actorKind: "system", action: "razorpay.webhook.ignored", entityType: "razorpay", entityId: null, after: { event: body.event ?? null } } });
    return NextResponse.json({ ok: true, ignored: body.event ?? null });
  }

  const link = body.payload?.payment_link?.entity;
  const pay = body.payload?.payment?.entity;
  const invoiceId = link?.notes?.invoice_id ?? pay?.notes?.invoice_id ?? body.payload?.order?.entity?.notes?.invoice_id;
  const inv = invoiceId
    ? await db.invoice.findUnique({ where: { id: invoiceId } })
    : link?.id ? await db.invoice.findFirst({ where: { razorpayLinkId: link.id } }) : null;
  if (!inv || !pay?.id || !pay.amount) {
    await db.auditLog.create({ data: { actorKind: "system", action: "razorpay.webhook.unmatched", entityType: "razorpay", entityId: link?.id ?? null, after: { invoiceId: invoiceId ?? null, payment: pay?.id ?? null } } });
    return NextResponse.json({ ok: true, unmatched: true });
  }

  const method = (METHODS.includes(pay.method as PaymentMethod) ? pay.method : "upi") as PaymentMethod;
  try {
    // recordPayment is idempotent on razorpay_payment_id (Razorpay retries webhooks).
    await recordPayment({ invoiceId: inv.id, amountPaise: BigInt(pay.amount), method, razorpayPaymentId: pay.id, signatureOk: true });
  } catch (e) {
    log.error({ err: String(e), invoice: inv.id }, "record payment failed");
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
