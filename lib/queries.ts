import "server-only";
import { cache } from "react";
import type { Prisma, User } from "@prisma/client";
import { db } from "./db";
import { fileUrl } from "./storage";
import { fmtWhen } from "./time";
import type { StatusDef } from "./status";

export const statuses = cache(async (): Promise<StatusDef[]> =>
  db.taskStatus.findMany({ where: { status: "active" }, orderBy: { order: "asc" } }));

/** Prisma filter: open tasks that are late right now (§6.3). */
export async function lateTaskWhere(now = new Date()): Promise<Prisma.TaskWhereInput> {
  return { deadlineAt: { lt: now }, status: { isDone: false, isClientGate: false, isReview: false } };
}

export type Viewer = Pick<User, "id" | "role" | "brandId" | "groupId">;

/** Super admin or group admin: both use the admin portal; group admins see their group only. */
export const isAdminish = (u: Pick<User, "role">) => u.role === "admin" || u.role === "group_admin";

/**
 * People a user may see (hierarchy, client request 2026-11-04): null = everyone (super admin).
 * Group admin → everyone in their group. CS → themselves + employees reporting to them. Employee → self.
 */
export const teamScope = cache(async (u: Viewer): Promise<string[] | null> => {
  if (u.role === "admin") return null;
  if (u.role === "group_admin") {
    if (!u.groupId) return [u.id];
    return (await db.user.findMany({ where: { groupId: u.groupId, role: { not: "client" } }, select: { id: true } })).map((x) => x.id);
  }
  if (u.role === "cs") return [u.id, ...(await db.user.findMany({ where: { reportsToId: u.id, role: "employee" }, select: { id: true } })).map((x) => x.id)];
  if (u.role === "employee") return [u.id];
  return [];
});

/** Brand ids a user may see: null = all (super admin). Group admin → brands whose CS sits in the group. */
export const brandScope = cache(async (u: Viewer): Promise<string[] | null> => {
  if (u.role === "admin") return null;
  if (u.role === "client") return u.brandId ? [u.brandId] : [];
  if (u.role === "cs") return (await db.brandCs.findMany({ where: { userId: u.id } })).map((b) => b.brandId);
  if (u.role === "group_admin") {
    if (!u.groupId) return [];
    return [...new Set((await db.brandCs.findMany({ where: { user: { groupId: u.groupId } } })).map((b) => b.brandId))];
  }
  return [];
});

/** Prisma filter for the tasks a user may see: their brands, or work their team is on. */
export async function taskScope(u: Viewer): Promise<Prisma.TaskWhereInput> {
  if (u.role === "admin") return {};
  if (u.role === "client") return { brandId: u.brandId ?? "", shareWithClient: true };
  if (u.role === "employee") return { assignees: { some: { userId: u.id } } };
  const [brands, team] = await Promise.all([brandScope(u), teamScope(u)]);
  return { OR: [{ brandId: { in: brands ?? [] } }, { csUserId: { in: team ?? [] } }, { assignees: { some: { userId: { in: team ?? [] } } } }] };
}

/** Same rule as taskScope, for a task already loaded. */
export async function canSeeTask(u: Viewer, t: { brandId: string; csUserId: string; assignees: { userId: string }[] }) {
  if (u.role === "admin") return true;
  if (u.role === "employee") return t.assignees.some((a) => a.userId === u.id);
  if (u.role === "client") return u.brandId === t.brandId;
  const [brands, team] = await Promise.all([brandScope(u), teamScope(u)]);
  return !!brands?.includes(t.brandId) || !!team?.includes(t.csUserId) || t.assignees.some((a) => team?.includes(a.userId));
}

/** Prisma filter: users a manager may see (staff only). */
export async function peopleScope(u: Viewer): Promise<Prisma.UserWhereInput> {
  const team = await teamScope(u);
  return team ? { id: { in: team } } : {};
}

export async function notifsFor(userId: string) {
  const rows = await db.notification.findMany({ where: { userId }, orderBy: { emittedAt: "desc" }, take: 25 });
  const label: Record<string, string> = { task: "Task", approval: "Approval", request: "Work request", concern: "Concern", flag: "Flag", invoice: "Invoice", announcement: "Notice", attendance: "Attendance", sarthi: "Sarthi", system: "System" };
  return rows.map((n) => ({ id: n.id, title: n.title, module: label[n.module] ?? n.module, when: fmtWhen(n.emittedAt), read: !!n.readAt }));
}

export function prefsFor(u: User) {
  const p = (u.preferences ?? {}) as { backdrop?: string; backdropFileId?: string; veil?: number; blur?: number };
  return { backdrop: p.backdrop, veil: p.veil, blur: p.blur, bdImage: p.backdropFileId ? fileUrl(p.backdropFileId, "1280") : null };
}

export const name = (u: { firstName: string; lastName: string } | null | undefined) => (u ? `${u.firstName} ${u.lastName}`.trim() : "—");

export async function settingValue<T>(key: string, fallback: T): Promise<T> {
  const s = await db.setting.findUnique({ where: { key } });
  return (s?.value as T) ?? fallback;
}

/** Health score per brand (§7 Today); documented formula, tunable later. */
export function healthScore(b: { late: number; staleClient: number; overdueInvoice: boolean; openRejected: boolean }) {
  return Math.max(0, 100 - 10 * b.late - 5 * b.staleClient - (b.overdueInvoice ? 15 : 0) - (b.openRejected ? 5 : 0));
}
