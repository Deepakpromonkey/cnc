import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { razorpayLive } from "@/lib/razorpay";
import { inr } from "@/lib/money";
import { fmtDate } from "@/lib/time";
import { MockPayForm } from "./form";

export const metadata = { title: "Pay (test mode)" };
export const dynamic = "force-dynamic";

/** Dev stand-in for Razorpay's hosted page — only without live keys, never in production. */
export default async function MockPay({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ method?: string }> }) {
  // Test checkout: dev, or a staging box that opts in. Never once real Razorpay keys are set.
  if ((process.env.NODE_ENV === "production" && process.env.ALLOW_MOCK_PAYMENTS !== "1") || razorpayLive()) notFound();
  const u = await requireUser(["client", "admin"]);
  const { id } = await params;
  const inv = await db.invoice.findUnique({ where: { id }, include: { brand: true, payments: true } });
  if (!inv || (u.role === "client" && inv.brandId !== u.brandId)) notFound();
  const paid = inv.payments.reduce((s, p) => s + p.amountPaise, BigInt(0));
  const open = ["sent", "viewed", "overdue"].includes(inv.status);
  return (
    <div className="login-wrap">
      <div id="backdrop" style={{ backgroundImage: "var(--glow)" }} />
      <div className="login">
        <section className="card">
          <div>
            <div className="eyebrow">Razorpay · test mode</div>
            <h1 style={{ marginTop: 8 }}>{inr(inv.totalPaise - paid)}</h1>
            <p className="muted" style={{ margin: "8px 0 0" }}>INV-{inv.number} · {inv.brand.name} · due {fmtDate(inv.dueDate, true)}</p>
            <p className="small faint" style={{ margin: "6px 0 0" }}>No Razorpay keys are configured, so this page settles the payment through the same path the signed webhook uses. Nothing is charged.</p>
          </div>
          {open ? <MockPayForm id={inv.id} method={(await searchParams).method ?? "upi"} amount={inr(inv.totalPaise - paid)} />
            : <p className="ok" style={{ margin: 0 }}>This invoice is {inv.status === "paid" ? "already paid" : inv.status}.</p>}
        </section>
      </div>
    </div>
  );
}
