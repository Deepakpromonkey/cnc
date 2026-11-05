import "server-only";
import type { NotificationModule, Prisma } from "@prisma/client";
import { after } from "next/server";
import { db } from "./db";
import { processOutbox } from "./outbox";

type Tx = Prisma.TransactionClient;

export type Notify = { userId: string; module: NotificationModule; title: string; body?: string; link?: string };

type Actor = { id: string; impersonatorId?: string | null } | null;

/** Append-only audit row (spec §4.6, P1). */
export async function audit(
  tx: Tx | typeof db, a: Actor, action: string, entityType: string, entityId: string | null,
  before?: unknown, after?: unknown,
) {
  await tx.auditLog.create({
    data: {
      actorUserId: a?.id ?? null,
      actorKind: a ? "user" : "system",
      action, entityType, entityId,
      before: before === undefined ? undefined : (json(before) as Prisma.InputJsonValue),
      after: after === undefined ? undefined : (json({ ...(after as object), ...(a?.impersonatorId ? { impersonatedBy: a.impersonatorId } : {}) }) as Prisma.InputJsonValue),
    },
  });
}

/**
 * Writes an event to the outbox (spec §6.13, §10.4). In-app notifications are fanned out by
 * the worker; we also kick a drain after the response so dev works without a worker running.
 */
export async function emit(tx: Tx | typeof db, event: string, payload: Record<string, unknown>, notify: Notify[] = []) {
  const unique = dedupe(notify);
  await tx.eventOutbox.create({
    data: { event, payload: json(payload) as Prisma.InputJsonValue, notify: unique as unknown as Prisma.InputJsonValue },
  });
  try { after(() => processOutbox().catch(() => {})); } catch { /* outside a request: worker drains */ }
}

function dedupe(list: Notify[]) {
  const seen = new Set<string>();
  return list.filter((n) => n.userId && !seen.has(n.userId) && seen.add(n.userId));
}

/** BigInt / Decimal / Date safe JSON. */
export function json(v: unknown): unknown {
  return JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x)));
}
