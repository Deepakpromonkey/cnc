import type { AttendanceState } from "@prisma/client";
import { db } from "./db";
import { DAY_MS, dateOnly, istDateKey, istParts } from "./time";

// Spec §6.5: attendance is derived from logins. Materialised nightly and on logout.

const CAP_HOURS = 14;

export async function materialiseDay(userId: string, key: string) {
  const start = new Date(`${key}T00:00:00+05:30`);
  const end = new Date(start.getTime() + DAY_MS);
  const date = dateOnly(key);

  const [company, sessions, holiday, leave, existing] = await Promise.all([
    db.company.findFirst(),
    db.attendanceSession.findMany({ where: { userId, loginAt: { gte: start, lt: end } }, orderBy: { loginAt: "asc" } }),
    db.announcement.findFirst({ where: { type: "holiday", date, archivedAt: null } }),
    db.leaveRequest.findFirst({ where: { userId, status: "approved", fromDate: { lte: date }, toDate: { gte: date } } }),
    db.attendanceDay.findUnique({ where: { userId_date: { userId, date } } }),
  ]);

  const first = sessions[0]?.loginAt ?? null;
  const closed = sessions.filter((s) => s.logoutAt);
  const last = closed.length ? new Date(Math.max(...closed.map((s) => s.logoutAt!.getTime()))) : null;
  const hours = first && last ? Math.min(CAP_HOURS, (last.getTime() - first.getTime()) / 3_600_000) : null;
  const dow = istParts(start).dow || 7;
  const working = (company?.workingDays ?? [1, 2, 3, 4, 5, 6]).includes(dow);

  let state: AttendanceState;
  if (holiday) state = "holiday";
  else if (!working) state = "weekend";
  else if (leave) state = "leave";
  else if (!first) state = "absent";
  else {
    const [h, m] = (company?.lateLoginAfter ?? "10:30").split(":").map(Number);
    const p = istParts(first);
    state = p.h * 60 + p.min > h * 60 + m ? "late" : "present";
  }
  // An admin override (audited) wins over the computed state.
  if (existing?.remark?.startsWith("[override]")) state = existing.state;

  return db.attendanceDay.upsert({
    where: { userId_date: { userId, date } },
    create: { userId, date, firstLoginAt: first, lastLogoutAt: last, hours, state, autoLogout: closed.some((s) => s.autoLogout) },
    update: { firstLoginAt: first, lastLogoutAt: last, hours, state, autoLogout: closed.some((s) => s.autoLogout) },
  });
}

/** Midnight job: close open sessions at 23:59:59 IST and materialise the day for all staff. */
export async function closeDay(key = istDateKey(new Date(Date.now() - DAY_MS))) {
  const endOfDay = new Date(`${key}T23:59:59+05:30`);
  const start = new Date(`${key}T00:00:00+05:30`);
  await db.attendanceSession.updateMany({
    where: { logoutAt: null, loginAt: { gte: start, lte: endOfDay } },
    data: { logoutAt: endOfDay, autoLogout: true },
  });
  const staff = await db.user.findMany({ where: { role: { in: ["admin", "group_admin", "cs", "employee"] }, status: "active" }, select: { id: true } });
  for (const u of staff) await materialiseDay(u.id, key);
  return staff.length;
}
