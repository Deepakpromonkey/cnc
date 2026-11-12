"use server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { actor, currentUser, endSession, fullName, hashPassword, homeFor, newToken, sha256, startSession, verifyPassword } from "@/lib/auth";
import { audit } from "@/lib/events";
import { ask } from "@/lib/sarthi-sdk";
import { saarthiStaffConfig } from "@/lib/saarthi-staff";
import { fileUrl, saveImage } from "@/lib/storage";
import { sendMail } from "@/lib/mail";
import { fail, guard, ok, str, type Result } from "@/lib/result";
import { materialiseDay } from "@/lib/attendance";
import { istDateKey } from "@/lib/time";

// ---------- auth ----------
const attempts = new Map<string, { n: number; at: number }>();

export async function signIn(_: unknown, fd: FormData): Promise<{ error?: string }> {
  const id = str(fd, "login").toLowerCase();
  const pw = str(fd, "password");
  if (!id || !pw) return { error: "Enter your email or login ID and password." };
  // Basic brute-force brake per identifier (hardening phase adds nginx rate limits).
  const a = attempts.get(id);
  if (a && a.n >= 8 && Date.now() - a.at < 15 * 60_000) return { error: "Too many attempts. Try again in 15 minutes." };
  const u = await db.user.findFirst({ where: { OR: [{ email: id }, { loginId: id }] } });
  const good = u?.passwordHash ? await verifyPassword(u.passwordHash, pw) : false;
  if (!u || !good || u.status !== "active") {
    attempts.set(id, { n: (a?.n ?? 0) + 1, at: Date.now() });
    return { error: u && u.status !== "active" ? "This login has been deactivated." : "That didn't match. Check the details or reset your password." };
  }
  attempts.delete(id);
  await startSession(u.id);
  await audit(db, { id: u.id }, "auth.login", "user", u.id);
  if (u.role !== "client") await materialiseDay(u.id, istDateKey());
  redirect(homeFor(u.role));
}

export async function signOut() {
  const u = await currentUser();
  await endSession();
  if (u) {
    await audit(db, { id: u.id }, "auth.logout", "user", u.id);
    if (u.role !== "client" && !u.impersonatorId) await materialiseDay(u.id, istDateKey());
  }
  return ok();
}

export async function requestReset(_: unknown, fd: FormData): Promise<{ done?: boolean; error?: string }> {
  const id = str(fd, "login").toLowerCase();
  if (!id) return { error: "Enter your email or login ID." };
  const u = await db.user.findFirst({ where: { OR: [{ email: id }, { loginId: id }], status: "active" } });
  if (u) await sendResetLink(u.id);
  return { done: true }; // same answer either way — no account enumeration
}

export async function sendResetLink(userId: string) {
  const u = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const { token, tokenHash } = newToken();
  await db.passwordReset.create({ data: { userId, tokenHash, expiresAt: new Date(Date.now() + 30 * 60_000) } });
  const link = `${process.env.APP_URL}/reset/${token}`;
  await sendMail({ to: u.email, subject: "Set your Coffee & Creative password", text: `Hi ${u.firstName},\n\nUse this link within 30 minutes to set your password:\n${link}\n\n— Coffee & Creative` });
  return link;
}

export async function resetPassword(_: unknown, fd: FormData): Promise<{ error?: string }> {
  const token = str(fd, "token");
  const pw = str(fd, "password");
  if (pw.length < 10) return { error: "Use at least 10 characters." };
  if (pw !== str(fd, "repeat")) return { error: "The two passwords don't match." };
  const r = await db.passwordReset.findUnique({ where: { tokenHash: sha256(token) } });
  if (!r || r.usedAt || r.expiresAt < new Date()) return { error: "This link has expired. Ask for a new one." };
  await db.$transaction([
    db.user.update({ where: { id: r.userId }, data: { passwordHash: await hashPassword(pw) } }),
    db.passwordReset.update({ where: { id: r.id }, data: { usedAt: new Date() } }),
    db.session.deleteMany({ where: { userId: r.userId } }),
  ]);
  await audit(db, { id: r.userId }, "auth.password.reset", "user", r.userId);
  const u = await db.user.findUniqueOrThrow({ where: { id: r.userId } });
  await startSession(u.id);
  redirect(homeFor(u.role));
}

export async function changePassword(fd: FormData): Promise<Result> {
  return guard(async () => {
    const u = await actor();
    if (u.impersonatorId) return fail("Not while viewing as someone else.");
    const cur = str(fd, "current"), pw = str(fd, "password");
    if (!u.passwordHash || !(await verifyPassword(u.passwordHash, cur))) return fail("Current password is wrong.");
    if (pw.length < 10) return fail("Use at least 10 characters.");
    if (pw !== str(fd, "repeat")) return fail("The two new passwords don't match.");
    await db.user.update({ where: { id: u.id }, data: { passwordHash: await hashPassword(pw) } });
    await db.session.deleteMany({ where: { userId: u.id, id: { not: u.sessionId } } });
    await audit(db, u, "auth.password.changed", "user", u.id);
    return ok("Password changed");
  });
}

// ---------- impersonation (admin "view as client", audited) ----------
const IMP_COOKIE = "cnc_imp_return";

export async function impersonate(fd: FormData): Promise<Result> {
  return guard(async () => {
    const a = await actor(["admin"]);
    const target = await db.user.findUnique({ where: { id: str(fd, "userId") } });
    if (!target || target.role !== "client" || target.status !== "active") return fail("Pick an active client login.");
    await audit(db, a, "auth.impersonate.start", "user", target.id, undefined, { by: a.id });
    const jar = await cookies();
    const current = jar.get("cnc_session")?.value;
    if (current) jar.set(IMP_COOKIE, current, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 3600 });
    await startSession(target.id, a.id);
    return ok(`Viewing as ${fullName(target)}`, { url: "/client" });
  });
}

export async function stopImpersonating(): Promise<Result> {
  const u = await currentUser();
  const jar = await cookies();
  const back = jar.get(IMP_COOKIE)?.value;
  if (u?.impersonatorId) {
    await db.session.delete({ where: { id: u.sessionId } }).catch(() => {});
    await audit(db, { id: u.impersonatorId }, "auth.impersonate.stop", "user", u.id);
  }
  if (back && (await db.session.findUnique({ where: { tokenHash: sha256(back) } }))) {
    jar.set("cnc_session", back, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
    jar.delete(IMP_COOKIE);
    return ok(undefined, { url: "/admin/brands" });
  }
  jar.delete("cnc_session");
  return ok(undefined, { url: "/login" });
}

// ---------- notifications ----------
export async function openNotification(id: string): Promise<Result> {
  const u = await actor();
  const n = await db.notification.findFirst({ where: { id, userId: u.id } });
  if (!n) return fail("Gone");
  if (!n.readAt) await db.notification.update({ where: { id }, data: { readAt: new Date() } });
  return ok(undefined, { url: n.link ?? undefined });
}

export async function markAllRead(): Promise<Result> {
  const u = await actor();
  await db.notification.updateMany({ where: { userId: u.id, readAt: null }, data: { readAt: new Date() } });
  return ok();
}

// ---------- preferences (theme + backdrop, per user, spec §11) ----------
export async function savePrefs(p: { theme?: "light" | "dark"; backdrop?: string; veil?: number; blur?: number; clearImage?: boolean }): Promise<Result> {
  const u = await actor();
  const cur = (u.preferences ?? {}) as Record<string, unknown>;
  const next: Record<string, unknown> = { ...cur };
  if (p.theme === "light" || p.theme === "dark") next.theme = p.theme;
  if (p.backdrop && /^(glow|plain|rings|linen|marble|beans)$/.test(p.backdrop)) next.backdrop = p.backdrop;
  if (typeof p.veil === "number") next.veil = Math.max(30, Math.min(95, Math.round(p.veil)));
  if (typeof p.blur === "number") next.blur = Math.max(0, Math.min(20, Math.round(p.blur)));
  if (p.clearImage) delete next.backdropFileId;
  await db.user.update({ where: { id: u.id }, data: { preferences: next as Prisma.InputJsonValue } });
  return ok();
}

export async function uploadBackdrop(fd: FormData): Promise<Result> {
  return guard(async () => {
    const u = await actor();
    const f = fd.get("file");
    if (!(f instanceof File) || !f.size) return fail("Pick an image");
    const file = await saveImage(f, "backdrop", u.id);
    const cur = (u.preferences ?? {}) as Record<string, unknown>;
    await db.user.update({ where: { id: u.id }, data: { preferences: { ...cur, backdropFileId: file.id } as Prisma.InputJsonValue } });
    return ok(undefined, { url: fileUrl(file.id, "1280")! });
  });
}

// ---------- Sarthi ----------
export async function askSarthi(question: string): Promise<{ ok: true; answer: string; source: string } | { ok: false; error: string }> {
  try {
    const u = await actor(["admin", "group_admin", "cs", "employee"]);
    const q = question.trim().slice(0, 500);
    if (!q) return { ok: false, error: "Ask something" };
    const r = await ask(u, q);
    await db.auditLog.create({ data: { actorUserId: u.id, actorKind: "agent", action: "agent.answer", entityType: "sarthi", entityId: null, after: { question: q, answer: r.answer, source: r.source } } });
    return { ok: true, ...r };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sarthi is unreachable" };
  }
}

/**
 * The Ask box handed a question to the Saarthi Staff assistant's panel (spec §10.3). The answer
 * lives on Saarthi; the CRM keeps its own "agent.ask" row, in the shape askSarthi writes.
 */
export async function noteStaffAsk(question: string): Promise<Result> {
  return guard(async () => {
    const u = await actor(["admin", "group_admin", "cs", "employee"]);
    if (u.impersonatorId) return fail("Not while viewing as someone else.");
    // Without the assistant there was no hand-off, so nothing to record.
    if (!saarthiStaffConfig()) return fail("The Saarthi Staff assistant isn't set up.");
    const q = String(question ?? "").trim().slice(0, 500);
    if (!q) return fail("Ask something");
    await audit(db, u, "agent.ask", "sarthi", null, undefined, { question: q, via: "saarthi_staff" });
    return ok();
  });
}
