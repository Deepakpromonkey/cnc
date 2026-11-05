import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import type { Role, User } from "@prisma/client";
import { db } from "./db";

const COOKIE = "cnc_session";
const SESSION_HOURS = 12;

// Argon2id (algorithm 2), OWASP-ish parameters.
const ARGON = { algorithm: 2 as const, memoryCost: 19456, timeCost: 2, parallelism: 1 };

export const hashPassword = (pw: string) => hash(pw, ARGON);
export const verifyPassword = (h: string, pw: string) => verify(h, pw).catch(() => false);

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export const homeFor = (role: Role) =>
  role === "admin" || role === "group_admin" ? "/admin" : role === "client" ? "/client" : "/team";

async function clientMeta() {
  const h = await headers();
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || null,
    userAgent: h.get("user-agent"),
  };
}

/** Creates a session + the attendance session it drives (spec §6.5). */
export async function startSession(userId: string, impersonatorId?: string) {
  const token = randomBytes(32).toString("base64url");
  const meta = await clientMeta();
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 3_600_000);
  const session = await db.session.create({
    data: { userId, tokenHash: sha256(token), expiresAt, impersonatorId, ...meta },
  });
  if (!impersonatorId) {
    await db.$transaction([
      db.attendanceSession.create({ data: { userId, loginAt: new Date(), sessionId: session.id, ...meta } }),
      db.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } }),
    ]);
  }
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    path: "/", expires: expiresAt,
  });
  return session;
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    const s = await db.session.findUnique({ where: { tokenHash: sha256(token) } });
    if (s) {
      await db.attendanceSession.updateMany({ where: { sessionId: s.id, logoutAt: null }, data: { logoutAt: new Date() } });
      await db.session.delete({ where: { id: s.id } });
    }
  }
  jar.delete(COOKIE);
}

export type SessionUser = User & { impersonatorId: string | null; sessionId: string };

export const currentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const s = await db.session.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!s) return null;
  if (s.expiresAt < new Date()) {
    // Session expiry closes the attendance session at the moment it lapsed.
    await db.attendanceSession.updateMany({ where: { sessionId: s.id, logoutAt: null }, data: { logoutAt: s.expiresAt } });
    await db.session.delete({ where: { id: s.id } }).catch(() => {});
    return null;
  }
  if (s.user.status !== "active") return null;
  if (Date.now() - s.lastSeenAt.getTime() > 5 * 60_000) {
    await db.session.update({ where: { id: s.id }, data: { lastSeenAt: new Date() } });
  }
  return { ...s.user, impersonatorId: s.impersonatorId, sessionId: s.id };
});

/** Page/layout guard. */
export async function requireUser(roles?: Role[]) {
  const u = await currentUser();
  if (!u) redirect("/login");
  if (roles && !roles.includes(u.role)) redirect(homeFor(u.role));
  return u;
}

export class Forbidden extends Error {
  constructor(msg = "Not allowed") { super(msg); }
}

/** Server-action guard: throws instead of redirecting. */
export async function actor(roles?: Role[]) {
  const u = await currentUser();
  if (!u) throw new Forbidden("Please sign in again");
  if (roles && !roles.includes(u.role)) throw new Forbidden();
  return u;
}

export function newToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: sha256(token) };
}

export function fullName(u: { firstName: string; lastName: string }) {
  return `${u.firstName} ${u.lastName}`.trim();
}
