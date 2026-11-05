import { createHmac } from "node:crypto";
import type { NotificationModule } from "@prisma/client";
import { db } from "./db";

type Notify = { userId: string; module: NotificationModule; title: string; body?: string; link?: string };

const MAX_ATTEMPTS = 8;
let draining = false;

/**
 * Drains the event outbox: fans out in-app notifications (one row per receiver), then
 * POSTs each event to Sarthi's webhook with an HMAC signature (spec §10.4). Safe to run
 * concurrently from the worker and from request `after()` hooks.
 */
export async function processOutbox(limit = 100) {
  if (draining) return;
  draining = true;
  try {
    const toFan = await db.eventOutbox.findMany({ where: { fannedOutAt: null }, orderBy: { createdAt: "asc" }, take: limit });
    for (const ev of toFan) {
      const list = (ev.notify as unknown as Notify[]) ?? [];
      // Claim the row first so two drainers never fan out twice.
      const claimed = await db.eventOutbox.updateMany({ where: { id: ev.id, fannedOutAt: null }, data: { fannedOutAt: new Date() } });
      if (!claimed.count || !list.length) continue;
      await db.notification.createMany({
        data: list.map((n) => ({ userId: n.userId, module: n.module, event: ev.event, title: n.title, body: n.body, link: n.link, emittedAt: ev.createdAt })),
      });
    }

    const url = process.env.SARTHI_WEBHOOK_URL;
    if (!url) return;
    const secret = process.env.SARTHI_WEBHOOK_SECRET || "";
    const toSend = await db.eventOutbox.findMany({
      where: { deliveredAt: null, attempts: { lt: MAX_ATTEMPTS } }, orderBy: { createdAt: "asc" }, take: limit,
    });
    for (const ev of toSend) {
      // Exponential backoff: 30 s, 1 m, 2 m, … between attempts.
      if (ev.attempts && Date.now() - ev.createdAt.getTime() < 30_000 * 2 ** (ev.attempts - 1)) continue;
      const body = JSON.stringify({ id: ev.id, event: ev.event, at: ev.createdAt, customer: "cnc", payload: ev.payload });
      const sig = createHmac("sha256", secret).update(body).digest("hex");
      try {
        const res = await fetch(url, {
          method: "POST", body, signal: AbortSignal.timeout(8000),
          headers: { "content-type": "application/json", "x-sarthi-signature": sig, "x-event-id": ev.id },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await db.eventOutbox.update({ where: { id: ev.id }, data: { deliveredAt: new Date(), attempts: { increment: 1 } } });
      } catch (e) {
        await db.eventOutbox.update({ where: { id: ev.id }, data: { attempts: { increment: 1 }, lastError: String(e).slice(0, 500) } });
      }
    }
  } finally {
    draining = false;
  }
}
