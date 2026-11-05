"use server";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { actor, Forbidden, fullName } from "@/lib/auth";
import { audit, emit } from "@/lib/events";
import { moveTask } from "@/lib/tasks";
import { recordPayment, invNo } from "@/lib/invoices";
import { razorpayLive } from "@/lib/razorpay";
import { cleanUrl, filesFrom, saveImage } from "@/lib/storage";
import { settingValue } from "@/lib/queries";
import { fail, guard, ok, opt, str, type Result } from "@/lib/result";
import { istMonthDate } from "@/lib/time";
import { inr } from "@/lib/money";

async function me() {
  const u = await actor(["client"]);
  if (!u.brandId) throw new Forbidden("This login has no brand");
  return u;
}

async function staffFor(brandId: string) {
  const [cs, admins] = await Promise.all([
    db.brandCs.findMany({ where: { brandId } }),
    db.user.findMany({ where: { role: "admin", status: "active" }, select: { id: true } }),
  ]);
  return { cs: cs.map((c) => c.userId), admins: admins.map((a) => a.id) };
}

/** Approve, or send back with a note (§6.3, C2). */
export async function decidePiece(fd: FormData): Promise<Result> {
  return guard(async () => {
    const u = await me();
    const t = await db.task.findUnique({ where: { id: str(fd, "id") }, include: { cs: true, assignees: { orderBy: { isLead: "desc" } } } });
    if (!t || t.brandId !== u.brandId || !t.shareWithClient) return fail("Not your piece");
    const approve = str(fd, "decision") !== "reject";
    const note = opt(fd, "note");
    if (!approve && !note) return fail("Add a note so the designer knows what to change");
    const to = await db.taskStatus.findFirstOrThrow({ where: approve ? { isDone: true } : { isRejected: true } });
    await moveTask(u, t.id, to.id, note);
    // Optional: a client send-back raises a "Client concern" flag (setting, default off — §3).
    if (!approve && (await settingValue("client_rejection_creates_flag", false)) && t.assignees[0]) {
      const type = await db.flagType.findFirst({ where: { name: { contains: "concern", mode: "insensitive" }, status: "active" } });
      if (type) {
        await db.flag.create({ data: { flagTypeId: type.id, targetUserId: t.assignees[0].userId, targetRole: "employee", givenByUserId: u.id, brandId: t.brandId, taskId: t.id, subject: `Sent back: ${t.name}`, feedback: note!, pointsApplied: type.points, month: istMonthDate() } });
      }
    }
    return ok(approve ? `Approved · ${t.cs.firstName} has been told` : "Sent back with your note");
  });
}

/** Client rating on a done piece (C3). */
export async function ratePiece(fd: FormData): Promise<Result> {
  return guard(async () => {
    const u = await me();
    const t = await db.task.findUnique({ where: { id: str(fd, "id") }, include: { status: true } });
    if (!t || t.brandId !== u.brandId || !t.shareWithClient) return fail("Not your piece");
    if (!t.status.isDone) return fail("You can rate it once it's done");
    const stars = Number(str(fd, "stars"));
    if (!(stars >= 1 && stars <= 5)) return fail("Pick 1 to 5 stars");
    const review = opt(fd, "review");
    await db.$transaction(async (tx) => {
      await tx.taskRating.upsert({
        where: { taskId_raterKind: { taskId: t.id, raterKind: "client" } },
        create: { taskId: t.id, raterKind: "client", ratedByUserId: u.id, stars, review },
        update: { stars, review, ratedByUserId: u.id, at: new Date() },
      });
      await audit(tx, u, "task.rated.client", "task", t.id, undefined, { stars, review });
      const { cs, admins } = await staffFor(t.brandId);
      await emit(tx, "task.rated.client", { task: { id: t.id, name: t.name }, stars, review, by: fullName(u) },
        [...new Set([t.csUserId, ...cs, ...admins])].map((userId) => ({ userId, module: "approval" as const, title: `${fullName(u)} rated ${t.name} ${"★".repeat(stars)}`, body: review ?? undefined, link: `/admin/tasks?task=${t.id}` })));
    });
    return ok("Thanks — the team sees this");
  });
}

/** First open of an unpaid invoice marks it viewed (§6.11). */
export async function markInvoiceViewed(id: string): Promise<Result> {
  return guard(async () => {
    const u = await me();
    if (u.impersonatorId) return ok(); // an admin peeking doesn't count as the client opening it
    const inv = await db.invoice.findUnique({ where: { id }, include: { brand: true } });
    if (!inv || inv.brandId !== u.brandId) return fail("Not your invoice");
    if (inv.viewedAt || !["sent", "overdue"].includes(inv.status)) return ok();
    await db.$transaction(async (tx) => {
      await tx.invoice.update({ where: { id }, data: { viewedAt: new Date(), ...(inv.status === "sent" ? { status: "viewed" } : {}) } });
      await tx.invoiceEvent.create({ data: { invoiceId: id, kind: "viewed", byUserId: u.id, meta: { via: "portal" } } });
      await audit(tx, u, "invoice.viewed", "invoice", id);
      const { cs, admins } = await staffFor(inv.brandId);
      await emit(tx, "invoice.viewed", { invoice: { id, number: invNo(inv.number), total: inr(inv.totalPaise) }, brand: inv.brand.name, by: fullName(u) },
        [...new Set([...admins, ...cs])].map((userId) => ({ userId, module: "invoice" as const, title: `${inv.brand.name} opened ${invNo(inv.number)}`, link: `/admin/money?inv=${id}` })));
    });
    return ok();
  });
}

/** Edit details (§9 Your brand): own name/phone/login email + brand WhatsApp, Instagram, website, logo. */
export async function saveClientDetails(fd: FormData): Promise<Result> {
  return guard(async () => {
    const u = await me();
    const [first, ...rest] = str(fd, "name").split(/\s+/);
    if (!first) return fail("Your name is required");
    const email = str(fd, "email").toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Enter a valid login email");
    if (email !== u.email && (await db.user.findFirst({ where: { OR: [{ email }, { loginId: email }], id: { not: u.id } } }))) return fail("That email already has a login");
    const website = opt(fd, "website");
    if (website && !cleanUrl(website)) return fail("Website doesn't look like a web address");
    const logo = filesFrom(fd, "logo")[0];
    const file = logo ? await saveImage(logo, "brand_logo", u.id) : null;
    const userData = { firstName: first, lastName: rest.join(" "), email, ...(u.loginId === u.email ? { loginId: email } : {}), mobile: opt(fd, "phone"), whatsappNo: opt(fd, "whatsapp") };
    const brandData = { whatsapp: opt(fd, "whatsapp"), instagram: opt(fd, "instagram"), website, ...(file ? { logoFileId: file.id } : {}) };
    await db.$transaction(async (tx) => {
      const before = await tx.brand.findUniqueOrThrow({ where: { id: u.brandId! }, select: { whatsapp: true, instagram: true, website: true, logoFileId: true } });
      await tx.user.update({ where: { id: u.id }, data: userData });
      await tx.brand.update({ where: { id: u.brandId! }, data: brandData });
      await audit(tx, u, "client.details.updated", "brand", u.brandId!, { ...before, email: u.email, mobile: u.mobile }, { ...brandData, ...userData });
      await emit(tx, "brand.contact.changed", { brand_id: u.brandId, user: { name: `${first} ${rest.join(" ")}`.trim(), whatsapp: userData.whatsappNo, email } });
    });
    return ok("Saved");
  });
}

const PREF_KEYS = ["daily_digest", "approval_pings", "invoice_emails", "weekly_summary", "sarthi_qa"];

/** Preference toggles on the brand, pushed to Sarthi (C6). */
export async function setPreference(fd: FormData): Promise<Result> {
  return guard(async () => {
    const u = await me();
    const key = str(fd, "key");
    if (!PREF_KEYS.includes(key)) return fail("Unknown preference");
    const on = str(fd, "value") === "on";
    const b = await db.brand.findUniqueOrThrow({ where: { id: u.brandId! } });
    const cur = (b.preferences ?? {}) as Record<string, boolean>;
    const next = { ...cur, [key]: on };
    await db.brand.update({ where: { id: b.id }, data: { preferences: next as Prisma.InputJsonValue } });
    await audit(db, u, "brand.preferences.changed", "brand", b.id, cur, next);
    await emit(db, "brand.preferences.changed", { brand: { id: b.id, name: b.name }, preferences: next, by: fullName(u) });
    return ok("Saved");
  });
}

/** Dev-only stand-in for Razorpay Checkout; settles through the same recordPayment path as the webhook. */
export async function mockPay(_: unknown, fd: FormData): Promise<{ error?: string }> {
  let back = "/client/money";
  try {
    if ((process.env.NODE_ENV === "production" && process.env.ALLOW_MOCK_PAYMENTS !== "1") || razorpayLive()) return { error: "Mock checkout is only available in test mode." };
    const u = await actor(["client", "admin"]);
    const inv = await db.invoice.findUniqueOrThrow({ where: { id: str(fd, "id") }, include: { payments: true } });
    if (u.role === "client" && inv.brandId !== u.brandId) return { error: "Not your invoice" };
    if (!["sent", "viewed", "overdue"].includes(inv.status)) return { error: "This invoice isn't open for payment." };
    const method = (["upi", "card", "netbanking"].includes(str(fd, "method")) ? str(fd, "method") : "upi") as "upi" | "card" | "netbanking";
    const paid = inv.payments.reduce((s, p) => s + p.amountPaise, BigInt(0));
    await recordPayment({ invoiceId: inv.id, amountPaise: inv.totalPaise - paid, method, razorpayPaymentId: `pay_mock_${randomBytes(6).toString("hex")}`, signatureOk: true });
    back = u.role === "admin" ? `/admin/money?inv=${inv.id}` : `/client/money?inv=${inv.id}&paid=1`;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Payment failed" };
  }
  redirect(back);
}
