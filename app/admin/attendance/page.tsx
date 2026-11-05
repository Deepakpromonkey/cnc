import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { name, teamScope } from "@/lib/queries";
import { materialiseDay } from "@/lib/attendance";
import { DAY_MS, WEEKDAYS, fmtDate, fmtTime, fmtWhen, istDateKey, istDateOnly, istMonthDate, istParts } from "@/lib/time";
import { ROLE_LABEL } from "@/lib/status";
import { AttendanceView, type AttPerson } from "@/components/admin/attendance-view";

export const metadata = { title: "Attendance" };

const hm = (h: number | null) => (h === null ? "—" : `${Math.floor(h)} h ${String(Math.round((h % 1) * 60)).padStart(2, "0")} m`);

export default async function AttendancePage() {
  const u = await requireUser(["admin", "group_admin"]);
  const team = await teamScope(u);
  const now = new Date();
  const todayKey = istDateKey(now);
  const staff = await db.user.findMany({ where: { role: { in: ["admin", "group_admin", "cs", "employee"] }, status: "active", ...(team ? { id: { in: team } } : {}) }, include: { department: true }, orderBy: [{ role: "asc" }, { firstName: "asc" }] });
  // Keep today's row fresh (logins land all day).
  await Promise.all(staff.map((s) => materialiseDay(s.id, todayKey)));

  const month = istMonthDate(now);
  const uTeam = team ? { userId: { in: team } } : {};
  const dow = istParts(now).dow || 7;
  const weekStart = new Date(istDateOnly(now).getTime() - (dow - 1) * DAY_MS);
  const [days, sessions, leaves, company] = await Promise.all([
    db.attendanceDay.findMany({ where: { date: { gte: new Date(Math.min(month.getTime(), weekStart.getTime())) }, ...uTeam } }),
    db.attendanceSession.findMany({ where: { loginAt: { gte: new Date(now.getTime() - 8 * DAY_MS) }, ...uTeam }, orderBy: { loginAt: "desc" } }),
    db.leaveRequest.findMany({ where: { OR: [{ status: "pending" }, { toDate: { gte: istDateOnly(now) } }], ...uTeam }, include: { user: true }, orderBy: { fromDate: "asc" } }),
    db.company.findFirst(),
  ]);
  const weekKeys = Array.from({ length: 6 }, (_, i) => new Date(weekStart.getTime() + i * DAY_MS).toISOString().slice(0, 10));
  const working = (company?.workingDays ?? [1, 2, 3, 4, 5, 6]).includes(dow);

  const people: AttPerson[] = staff.map((s) => {
    const mine = days.filter((d) => d.userId === s.id);
    const today = mine.find((d) => d.date.toISOString().slice(0, 10) === todayKey);
    const open = sessions.find((x) => x.userId === s.id && !x.logoutAt && istDateKey(x.loginAt) === todayKey);
    const liveHours = today?.firstLoginAt && open ? (now.getTime() - today.firstLoginAt.getTime()) / 3_600_000 : today?.hours ? Number(today.hours) : null;
    const monthDays = mine.filter((d) => d.date >= month && d.date.toISOString().slice(0, 10) < todayKey);
    const worked = monthDays.filter((d) => d.hours !== null);
    return {
      id: s.id, name: name(s), role: ROLE_LABEL[s.role], dept: s.department?.name ?? "",
      first: today?.firstLoginAt ? fmtTime(today.firstLoginAt) : "—", last: open ? "still in" : today?.lastLogoutAt ? fmtTime(today.lastLogoutAt) : "—",
      hours: hm(liveHours), state: today?.state ?? "absent", auto: !!today?.autoLogout, remark: today?.remark?.replace(/^\[override\]\s*/, "") ?? "",
      week: weekKeys.map((k) => {
        const d = mine.find((x) => x.date.toISOString().slice(0, 10) === k);
        return { k, label: WEEKDAYS[new Date(`${k}T00:00:00Z`).getUTCDay()], state: k > todayKey ? "future" : d?.state ?? "absent", hours: d?.hours ? Number(d.hours) : null };
      }),
      month: {
        present: monthDays.filter((d) => d.state === "present").length, late: monthDays.filter((d) => d.state === "late").length,
        absent: monthDays.filter((d) => d.state === "absent").length, leave: monthDays.filter((d) => d.state === "leave").length,
        avg: hm(worked.length ? worked.reduce((t, d) => t + Number(d.hours), 0) / worked.length : null),
      },
      sessions: sessions.filter((x) => x.userId === s.id).slice(0, 12).map((x) => ({ login: fmtWhen(x.loginAt, now), logout: x.logoutAt ? fmtTime(x.logoutAt) : "—", open: !x.logoutAt, auto: x.autoLogout, ip: x.ip ?? "" })),
    };
  });
  const allMonth = days.filter((d) => d.date >= month && d.hours !== null && d.date.toISOString().slice(0, 10) < todayKey);
  return (
    <AttendanceView people={people} todayKey={todayKey} todayLabel={`${WEEKDAYS[istParts(now).dow]} ${fmtDate(istDateOnly(now))}`} working={working}
      avgMonth={hm(allMonth.length ? allMonth.reduce((t, d) => t + Number(d.hours), 0) / allMonth.length : null)} lateAfter={company?.lateLoginAfter ?? "10:30"}
      leaves={leaves.map((l) => ({ id: l.id, who: name(l.user), from: fmtDate(l.fromDate), to: fmtDate(l.toDate), type: l.type.replace("_", " "), reason: l.reason ?? "", status: l.status }))} />
  );
}
