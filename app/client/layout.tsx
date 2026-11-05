import { fullName, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { notifsFor, prefsFor } from "@/lib/queries";
import { Shell, type NavItem } from "@/components/shell";
import "./client.css";

export const dynamic = "force-dynamic";

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const u = await requireUser(["client"]);
  const brandId = u.brandId ?? "";
  const [brand, approvals, due, notifs] = await Promise.all([
    db.brand.findUnique({ where: { id: brandId }, select: { name: true } }),
    db.task.count({ where: { brandId, shareWithClient: true, status: { isClientGate: true } } }),
    db.invoice.count({ where: { brandId, status: { in: ["sent", "viewed", "overdue"] } } }),
    notifsFor(u.id),
  ]);
  const nav: NavItem[] = [
    { href: "/client", label: "Home", icon: "today" },
    { href: "/client/approvals", label: "Approvals", icon: "approvals", count: approvals, hot: true },
    { href: "/client/work", label: "Work", icon: "tasks" },
    { href: "/client/projects", label: "Projects", icon: "brands" },
    { href: "/client/requests", label: "Requests", icon: "requests" },
    { href: "/client/money", label: "Invoices", icon: "money", count: due, hot: true },
    { href: "/client/announce", label: "Notices", icon: "announce" },
    { href: "/client/profile", label: "Your brand", icon: "profile" },
  ];
  return (
    <Shell portal="client" tagline="Badelog · Client" nav={nav} notifs={notifs} prefs={prefsFor(u)}
      me={{ name: fullName(u), sub: brand?.name ?? "" }} impersonating={!!u.impersonatorId}>
      {children}
    </Shell>
  );
}
