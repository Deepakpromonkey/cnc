import { requireUser, fullName } from "@/lib/auth";
import { db } from "@/lib/db";
import { brandScope, lateTaskWhere, notifsFor, prefsFor, taskScope } from "@/lib/queries";
import { Shell, type NavItem } from "@/components/shell";
import { LookupsProvider } from "@/components/lookups";
import { adminLookups } from "@/lib/views";
import { saarthiStaffConfig } from "@/lib/saarthi-staff";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const u = await requireUser(["admin", "group_admin"]);
  const ga = u.role === "group_admin";
  const [bScope, tScope] = await Promise.all([brandScope(u), taskScope(u)]);
  const inBrands = bScope ? { id: { in: bScope } } : {};
  const [brands, late, concerns, requests, notifs, lookups, group] = await Promise.all([
    db.brand.count({ where: { status: "active", ...inBrands } }),
    db.task.count({ where: { AND: [await lateTaskWhere(), tScope] } }),
    ga ? 0 : db.concern.count({ where: { status: "open" } }),
    db.workRequest.count({ where: { status: "new", ...(bScope ? { brandId: { in: bScope } } : {}) } }),
    notifsFor(u.id),
    adminLookups(u),
    u.groupId ? db.teamGroup.findUnique({ where: { id: u.groupId } }) : null,
  ]);
  // Group admins run their own group: no money, settings, concerns (HR) or Sarthi config.
  const SUPER_ONLY = new Set(["/admin/concerns", "/admin/announce", "/admin/money", "/admin/sarthi", "/admin/settings"]);
  const all: NavItem[] = [
    { href: "/admin", label: "Today", icon: "today" },
    { href: "/admin/brands", label: "Brands", icon: "brands", count: brands },
    { href: "/admin/tasks", label: "Projects & Tasks", icon: "tasks", count: late, hot: true },
    { href: "/admin/team", label: "Team", icon: "team" },
    { href: "/admin/people", label: "Users & access", icon: "people" },
    { href: "/admin/concerns", label: "Concerns", icon: "concerns", count: concerns, hot: true },
    { href: "/admin/announce", label: "Announcements", icon: "announce" },
    { href: "/admin/requests", label: "Work Requests", icon: "requests", count: requests },
    { href: "/admin/money", label: "Invoices", icon: "money" },
    { href: "/admin/attendance", label: "Attendance", icon: "attendance" },
    { href: "/admin/sarthi", label: "Sarthi", icon: "sarthi" },
    { href: "/admin/settings", label: "Settings", icon: "settings" },
  ];
  const nav = ga ? all.filter((n) => !SUPER_ONLY.has(n.href)) : all;
  return (
    <LookupsProvider value={lookups}>
    <Shell portal="admin" tagline={ga ? `Sarpanch · ${group?.name ?? "Group"}` : "Sarpanch · Admin"} nav={nav} notifs={notifs} prefs={prefsFor(u)}
      me={{ name: fullName(u), sub: ga ? `Group admin · ${group?.name ?? "no group"}` : `Admin · ${u.designation?.split(" ")[0] ?? ""}` }}
      ask="Ask Sarthi… “Thermocool ka reel kahan tak pahuncha?”" place="Sector 63, Noida"
      staff={u.impersonatorId ? undefined : saarthiStaffConfig() ?? undefined}>
      {children}
    </Shell>
    </LookupsProvider>
  );
}
