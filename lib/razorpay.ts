import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Spec §6.11: Razorpay Payment Links + signed webhooks. Without keys (local dev) we hand out a
// mock checkout link that settles through the same code path as the webhook.

const keyId = () => process.env.RAZORPAY_KEY_ID || "";
const keySecret = () => process.env.RAZORPAY_KEY_SECRET || "";
export const razorpayLive = () => Boolean(keyId() && keySecret());

export async function createPaymentLink(opts: {
  invoiceId: string; number: string; amountPaise: bigint; brandName: string;
  customer: { name: string; email?: string | null; contact?: string | null }; expireBy?: Date;
}) {
  if (!razorpayLive()) {
    // Relative, so the test checkout works from localhost, a tunnel or staging alike.
    const url = `/pay/mock/${opts.invoiceId}`;
    return { id: `plink_mock_${opts.invoiceId.slice(0, 8)}`, short_url: url };
  }
  const res = await fetch("https://api.razorpay.com/v1/payment_links", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Basic " + Buffer.from(`${keyId()}:${keySecret()}`).toString("base64"),
    },
    body: JSON.stringify({
      amount: Number(opts.amountPaise), currency: "INR", accept_partial: false,
      reference_id: opts.number, description: `${opts.number} · ${opts.brandName}`,
      customer: { name: opts.customer.name, email: opts.customer.email ?? undefined, contact: opts.customer.contact ?? undefined },
      notify: { sms: false, email: false }, reminder_enable: false,
      notes: { invoice_id: opts.invoiceId },
      callback_url: `${process.env.APP_URL}/client/money?paid=${opts.invoiceId}`, callback_method: "get",
      ...(opts.expireBy ? { expire_by: Math.floor(opts.expireBy.getTime() / 1000) } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Razorpay: ${res.status} ${await res.text()}`);
  return (await res.json()) as { id: string; short_url: string };
}

/** X-Razorpay-Signature = HMAC-SHA256(raw body, webhook secret). */
export function verifyWebhook(raw: string, signature: string | null) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(raw).digest("hex"));
  const got = Buffer.from(signature);
  return expected.length === got.length && timingSafeEqual(expected, got);
}
