import "server-only";
import { SignJWT } from "jose";
import type { User } from "@prisma/client";
import { db } from "./db";
import { fullName } from "./auth";
import { brandScope, taskScope } from "./queries";
import { fmtDue, lateness } from "./time";
import { inr } from "./money";
import { isLateStatus } from "./status";

// Spec §10.3: the CRM only issues identity and relays questions. Sarthi lives on ProMonkey's side.



export async function issueToken(u: User) {
  const secret = new TextEncoder().encode(process.env.SARTHI_WEBHOOK_SECRET || "dev-secret");
  return new SignJWT({ user_id: u.id, role: u.role, brand_ids: await brandScope(u), name: fullName(u), whatsapp: u.whatsappNo })
    .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("10m").setIssuer("cnc-crm").sign(secret);
}

export async function ask(u: User, question: string): Promise<{ answer: string; source: "sarthi" | "local" }> {
  const api = process.env.SARTHI_API_URL;
  await db.auditLog.create({ data: { actorUserId: u.id, actorKind: "user", action: "agent.ask", entityType: "sarthi", entityId: null, after: { question } } });
  if (api) {
    try {
      const res = await fetch(`${api.replace(/\/$/, "")}/ask`, {
        method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(20_000),
        body: JSON.stringify({ token: await issueToken(u), question }),
      });
      if (res.ok) return { answer: ((await res.json()) as { answer: string }).answer, source: "sarthi" };
    } catch { /* fall through to the local reader */ }
  }
  return { answer: await localAnswer(u, question), source: "local" };
}

/**
 * Read-only fallback used when Sarthi isn't reachable (or in dev). It only reads the same
 * scoped data the user can already see in the CRM.
 */
async function localAnswer(u: User, q: string) {
  const scope = await brandScope(u);
  const brandWhere = scope ? { brandId: { in: scope } } : {};
  const mine = await taskScope(u);
  const low = q.toLowerCase();
  const now = new Date();

  const brands = await db.brand.findMany({ where: scope ? { id: { in: scope } } : {}, select: { id: true, name: true } });
  const brand = brands.find((b) => low.includes(b.name.toLowerCase().split(" ")[0]));

  if (/invoice|paise|payment|outstanding|due|paid/.test(low) && (u.role === "admin" || u.role === "cs")) {
    const open = await db.invoice.findMany({ where: { ...brandWhere, status: { in: ["sent", "viewed", "overdue"] } }, include: { brand: true } });
    if (!open.length) return "Nothing outstanding right now. Every sent invoice is paid.";
    const total = open.reduce((s, i) => s + i.totalPaise, BigInt(0));
    const over = open.filter((i) => i.status === "overdue");
    return `${inr(total)} outstanding across ${open.length} invoice${open.length > 1 ? "s" : ""}.` +
      (over.length ? ` Overdue: ${over.map((i) => `${i.brand.name} INV-${i.number} (${inr(i.totalPaise)})`).join(", ")}.` : " None overdue.");
  }

  const tasks = await db.task.findMany({
    where: { AND: [mine, { ...(brand ? { brandId: brand.id } : {}), status: { isDone: false } }] },
    include: { status: true, brand: true, assignees: { include: { user: true } } },
    orderBy: { deadlineAt: "asc" }, take: 40,
  });

  if (brand) {
    if (!tasks.length) return `${brand.name}: nothing open right now.`;
    return `${brand.name}: ` + tasks.slice(0, 5).map((t) => {
      const l = isLateStatus(t.status) ? lateness(t.deadlineAt, now) : "";
      return `${t.name} is ${t.status.name.toLowerCase()} with ${t.assignees.map((a) => a.user.firstName).join(" & ")}, due ${fmtDue(t.deadlineAt, now)}${l ? ` (${l})` : ""}`;
    }).join("; ") + ".";
  }

  const late = tasks.filter((t) => isLateStatus(t.status) && t.deadlineAt < now);
  if (/late|overdue|delay/.test(low) || !late.length) {
    if (!late.length) return `Nothing is running late. ${tasks.length} task${tasks.length === 1 ? "" : "s"} open.`;
    return `${late.length} late: ` + late.slice(0, 6).map((t) => `${t.brand.name} ${t.name} (${t.assignees.map((a) => a.user.firstName).join(" & ")}, ${lateness(t.deadlineAt, now)})`).join("; ") + ".";
  }
  const dueToday = tasks.filter((t) => t.deadlineAt.toDateString() === now.toDateString());
  return `Right now: ${late.length} overdue, ${dueToday.length} due today, ${tasks.filter((t) => t.status.isClientGate).length} waiting on clients.`;
}
