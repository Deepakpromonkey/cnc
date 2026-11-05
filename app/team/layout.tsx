import { requireUser, fullName } from "@/lib/auth";
import { db } from "@/lib/db";
import { brandScope, notifsFor, prefsFor, taskScope } from "@/lib/queries";
import { teamLookups } from "@/lib/team-views";
import { Shell, type NavItem } from "@/components/shell";
import { LookupsProvider } from "@/components/lookups";

export const dynamic = "force-dynamic";

// One portal, the rail follows the role (spec §8). The mockup's Employee/CS switch is a demo control.
export default async function TeamLayout({ children }: { children: React.ReactNode }) {
  const u = await requireUser(["cs", "employee"]);
  const scope = (await brandScope(u)) ?? [];
  const [notifs, lookups, openMine, review, requests, reports] = await Promise.all([
    notifsFor(u.id),
    teamLookups(u),
    db.task.count({ where: { assignees: { some: { userId: u.id } }, status: { isDone: false } } }),
    u.role === "cs" ? db.task.count({ where: { AND: [await taskScope(u), { status: { isReview: true } }] } }) : 0,
    u.role === "cs" ? db.workRequest.count({ where: { brandId: { in: scope }, status: "new" } }) : 0,
    u.role === "cs" ? db.user.count({ where: { reportsToId: u.id, role: "employee", status: "active" } }) : 0,
  ]);
  const nav: NavItem[] = u.role === "cs" ? [
    { href: "/team", label: "Today", icon: "today" },
    { href: "/team/brands", label: "My brands", icon: "brands", count: scope.length },
    { href: "/team/people", label: "My team", icon: "team", count: reports },
    { href: "/team/review", label: "Review queue", icon: "review", count: review, hot: true },
    { href: "/team/tasks", label: "Tasks", icon: "tasks" },
    { href: "/team/requests", label: "Work requests", icon: "requests", count: requests },
    { href: "/team/digest", label: "Client digest", icon: "digest" },
    { href: "/team/flags", label: "Flags", icon: "flags" },
    { href: "/team/eod", label: "EOD log", icon: "eod" },
    { href: "/team/attendance", label: "Attendance", icon: "attendance" },
    { href: "/team/concerns", label: "Concerns", icon: "concerns" },
    { href: "/team/announce", label: "Announcements", icon: "announce" },
    { href: "/team/profile", label: "Profile", icon: "profile" },
  ] : [
    { href: "/team", label: "Today", icon: "today" },
    { href: "/team/tasks", label: "My tasks", icon: "tasks", count: openMine },
    { href: "/team/eod", label: "EOD log", icon: "eod" },
    { href: "/team/attendance", label: "Attendance", icon: "attendance" },
    { href: "/team/concerns", label: "Concerns", icon: "concerns" },
    { href: "/team/announce", label: "Announcements", icon: "announce" },
    { href: "/team/score", label: "My score", icon: "score" },
    { href: "/team/profile", label: "Profile", icon: "profile" },
  ];
  return (
    <LookupsProvider value={lookups}>
      <Shell portal="team" tagline={u.role === "cs" ? "Paltan · Client servicing" : "Paltan · Team"} nav={nav} notifs={notifs} prefs={prefsFor(u)}
        me={{ name: fullName(u), sub: u.designation ?? (u.role === "cs" ? "Client servicing" : "Team") }}
        ask={u.role === "cs" ? "Ask Sarthi about your brands… “Kisan ka dieline kab tak?”" : "Ask Sarthi about your tasks… “aaj kya due hai?”"} place="Sector 63, Noida">
        {children}
      </Shell>
    </LookupsProvider>
  );
}
