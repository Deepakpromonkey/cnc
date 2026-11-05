import "server-only";
import type { Prisma, User } from "@prisma/client";
import { db } from "./db";
import { adminLookups, loadTasks } from "./views";
import { brandScope, lateTaskWhere, name, settingValue, taskScope } from "./queries";
import { fileUrl } from "./storage";
import { brandStats } from "./brand-stats";
import { DAY_MS, MONTHS, WEEKDAYS, dateKey, fmtDate, fmtTime, fmtWhen, istDateKey, istDateOnly, istMonthDate, istParts, istStartOfMonth } from "./time";
import { CONCERN_CATEGORIES, CONCERN_CLASS, CONCERN_LABEL, FLAG_CLASS, FREQUENCY_LABEL, clientLabel } from "./status";

// View-models for the Team portal (spec §8). Employees see their own desk; CS see their brands.

export async function teamLookups(u: User) {
  const L = { ...(await adminLookups()), me: { id: u.id, role: u.role, groupId: u.groupId } };
  const scope = await brandScope(u);
  if (!scope) return L;
  const ids = new Set(scope);
  return { ...L, brands: L.brands.filter((b) => ids.has(b.id)), projects: L.projects.filter((p) => ids.has(p.brandId)) };
}

/** Tasks a team member works with: assigned (employee) or on their brands (CS). Open + last 30 days done. */
export async function teamTasks(u: User, extra: Prisma.TaskWhereInput = {}) {
  // CS: their brands + anything their reportees are on (hierarchy). Employee: their own desk.
  const mine = await taskScope(u);
  return loadTasks({ AND: [mine, { OR: [{ status: { isDone: false } }, { completedAt: { gte: new Date(Date.now() - 30 * DAY_MS) } }] }, extra] });
}

export async function todaysEod(u: User) {
  const rows = await db.eodLog.findMany({ where: { userId: u.id, date: istDateOnly() } });
  return Object.fromEntries(rows.map((r) => [r.taskId, r.remark]));
}

export async function eodHistory(u: User) {
  const rows = await db.eodLog.findMany({ where: { userId: u.id }, include: { task: { include: { brand: true } } }, orderBy: [{ date: "desc" }, { createdAt: "asc" }], take: 200 });
  const days = new Map<string, { day: string; lines: { task: string; brand: string; remark: string; status: string }[] }>();
  for (const r of rows) {
    const k = dateKey(r.date);
    if (!days.has(k)) days.set(k, { day: `${WEEKDAYS[r.date.getUTCDay()]} ${fmtDate(r.date)}`, lines: [] });
    days.get(k)!.lines.push({ task: r.task.name, brand: r.task.brand.name, remark: r.remark, status: r.statusAtTime ?? "" });
  }
  return [...days.values()];
}

export async function myAttendance(u: User) {
  const now = new Date();
  const month = istMonthDate(now);
  const company = await db.company.findFirst();
  const [days, sessions, leaves, holidays] = await Promise.all([
    db.attendanceDay.findMany({ where: { userId: u.id, date: { gte: month } }, orderBy: { date: "asc" } }),
    db.attendanceSession.findMany({ where: { userId: u.id, loginAt: { gte: new Date(now.getTime() - 14 * DAY_MS) } }, orderBy: { loginAt: "desc" } }),
    db.leaveRequest.findMany({ where: { userId: u.id }, orderBy: { fromDate: "desc" }, take: 20 }),
    db.announcement.findMany({ where: { type: "holiday", archivedAt: null, date: { gte: month } } }),
  ]);
  const todayKey = istDateKey(now);
  const todaySessions = sessions.filter((s) => istDateKey(s.loginAt) === todayKey);
  const first = todaySessions.length ? todaySessions[todaySessions.length - 1].loginAt : null;
  const soFar = first ? (now.getTime() - first.getTime()) / 3_600_000 : 0;
  const past = days.filter((d) => dateKey(d.date) < todayKey);
  const worked = past.filter((d) => d.hours !== null);
  const year = istParts(now).y;
  const used = leaves.filter((l) => l.status === "approved" && l.type !== "wfh" && l.fromDate.getUTCFullYear() === year)
    .reduce((s, l) => s + (l.type === "half_day" ? 0.5 : Math.round((l.toDate.getTime() - l.fromDate.getTime()) / DAY_MS) + 1), 0);
  const allowance = await settingValue<number>("leave_allowance_days", 18);
  const hm = (h: number) => `${Math.floor(h)} h ${String(Math.round((h % 1) * 60)).padStart(2, "0")} m`;

  // Month calendar, Monday first.
  const p = istParts(now);
  const daysInMonth = new Date(Date.UTC(p.y, p.m + 1, 0)).getUTCDate();
  const firstDow = (new Date(Date.UTC(p.y, p.m, 1)).getUTCDay() + 6) % 7;
  const byKey = new Map(days.map((d) => [dateKey(d.date), d]));
  const holidayKeys = new Set(holidays.map((h) => dateKey(h.date)));
  const cal = Array.from({ length: daysInMonth }, (_, i) => {
    const k = `${p.y}-${String(p.m + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
    const d = byKey.get(k);
    const dow = new Date(`${k}T00:00:00Z`).getUTCDay() || 7;
    const working = (company?.workingDays ?? [1, 2, 3, 4, 5, 6]).includes(dow);
    const state = k > todayKey ? "future" : d?.state ?? (holidayKeys.has(k) ? "holiday" : working ? (k === todayKey ? "today" : "absent") : "weekend");
    return { day: i + 1, state, hours: d?.hours ? Number(d.hours) : null, today: k === todayKey };
  });
  return {
    month: `${MONTHS[p.m]} ${p.y}`, offset: firstDow, cal, lateAfter: company?.lateLoginAfter ?? "10:30",
    first: first ? fmtTime(first) : "—", soFar: first ? hm(soFar) : "—", open: todaySessions.some((s) => !s.logoutAt),
    present: past.filter((d) => d.state === "present").length, late: past.filter((d) => d.state === "late").length,
    absent: past.filter((d) => d.state === "absent").length, avg: worked.length ? hm(worked.reduce((s, d) => s + Number(d.hours), 0) / worked.length) : "—",
    leavesLeft: Math.max(0, allowance - used), allowance,
    sessions: sessions.map((s) => ({ login: fmtWhen(s.loginAt, now), logout: s.logoutAt ? fmtTime(s.logoutAt) : "—", open: !s.logoutAt, auto: s.autoLogout })),
    leaves: leaves.map((l) => ({ id: l.id, from: fmtDate(l.fromDate), to: fmtDate(l.toDate), type: l.type.replace("_", " "), reason: l.reason ?? "", status: l.status })),
  };
}

export async function myScore(u: User) {
  const month = istMonthDate();
  const prev = istMonthDate(new Date(month.getTime() - DAY_MS));
  const [scores, flags, visible, deptSize] = await Promise.all([
    db.performanceScore.findMany({ where: { userId: u.id, month: { in: [month, prev] } } }),
    db.flag.findMany({ where: { targetUserId: u.id }, include: { type: true, givenBy: true }, orderBy: { createdAt: "desc" }, take: 20 }),
    settingValue("score_visible_to_employee", true),
    db.user.count({ where: { departmentId: u.departmentId ?? undefined, role: u.role, status: "active" } }),
  ]);
  const cur = scores.find((s) => s.month.getTime() === month.getTime());
  const last = scores.find((s) => s.month.getTime() === prev.getTime());
  const bd = ((cur?.breakdown ?? []) as { key: string; label: string; raw: string; value: number; weight: number }[]);
  const params = bd.filter((b) => b.key !== "flags");
  const lift = [...params].filter((b) => b.weight).sort((a, b) => (100 - b.value) * b.weight - (100 - a.value) * a.weight)[0];
  return {
    visible: !!visible, score: cur?.score ?? null, last: last?.score ?? null, rank: cur?.rankInDept ?? null, of: deptSize,
    computed: cur ? fmtWhen(cur.computedAt) : null, params, flagPts: bd.find((b) => b.key === "flags")?.value ?? 0,
    lift: lift && lift.value < 100 ? `Biggest lift available: ${lift.label.toLowerCase()} — it carries ${lift.weight} points of weight and you're at ${Math.round(lift.value)} (${lift.raw}).` : "Every parameter is at or near the top. Keep the pour steady.",
    flags: flags.map((f) => ({ c: FLAG_CLASS[f.type.colour], type: f.type.name, subject: f.subject, feedback: f.feedback, by: name(f.givenBy), on: fmtDate(f.createdAt), pts: f.pointsApplied })),
  };
}

export async function myConcerns(u: User) {
  const now = new Date();
  const mine = await db.concern.findMany({ where: { raisedByUserId: u.id }, include: { owner: true, replies: { include: { user: true }, orderBy: { at: "asc" } } }, orderBy: { createdAt: "desc" } });
  const vm = (c: (typeof mine)[number]) => ({
    id: c.id, code: `C-${c.code}`, subject: c.subject, details: c.details, cat: CONCERN_CATEGORIES[c.category], when: fmtWhen(c.createdAt, now),
    owner: name(c.owner), status: c.status, label: CONCERN_LABEL[c.status], cls: CONCERN_CLASS[c.status], confidential: c.confidential, file: fileUrl(c.fileId, "1280"),
    thread: c.replies.map((r) => ({ who: name(r.user), when: fmtWhen(r.at, now), body: r.body, mine: r.userId === u.id })),
  });
  let team: ReturnType<typeof vm>[] = [];
  if (u.role === "cs") {
    // §3: CS may read non-confidential concerns raised by people who work on their brands.
    const scope = (await brandScope(u)) ?? [];
    const people = await db.taskAssignee.findMany({ where: { task: { brandId: { in: scope } } }, select: { userId: true }, distinct: ["userId"] });
    const rows = await db.concern.findMany({ where: { confidential: false, raisedByUserId: { in: people.map((p) => p.userId), not: u.id } }, include: { owner: true, raisedBy: true, replies: { include: { user: true }, orderBy: { at: "asc" } } }, orderBy: { createdAt: "desc" }, take: 30 });
    team = rows.map((c) => ({ ...vm(c), subject: `${c.subject}`, details: c.details, owner: `${name(c.raisedBy)} → ${name(c.owner)}` }));
  }
  return { mine: mine.map(vm), team };
}

export async function notices() {
  const rows = await db.announcement.findMany({ where: { archivedAt: null }, include: { postedBy: true }, orderBy: { date: "desc" }, take: 40 });
  const today = istDateOnly();
  return rows.map((a) => ({
    id: a.id, type: a.type, subject: a.subject, message: a.message ?? "", day: String(istParts(a.date).d), mon: MONTHS[istParts(a.date).m], date: fmtDate(a.date, true),
    by: name(a.postedBy), clients: a.showToClients, image: fileUrl(a.imageFileId, "1280"), upcoming: a.date >= today,
  }));
}

export async function myProfile(u: User) {
  const full = await db.user.findUniqueOrThrow({ where: { id: u.id }, include: { department: true } });
  return {
    id: full.id, name: name(full), role: full.role, dept: full.department?.name ?? "", desig: full.designation ?? "", photo: fileUrl(full.photoFileId, "320"),
    fields: {
      email: full.email, loginId: full.loginId, mobile: full.mobile, whatsappNo: full.whatsappNo, personalEmail: full.personalEmail, personalContact: full.personalContact,
      address: full.address, city: full.city, state: full.state, pincode: full.pincode, country: full.country, linkedin: full.linkedin, facebook: full.facebook, instagram: full.instagram,
      gender: full.gender, dob: full.dob ? fmtDate(full.dob, true) : null,
    } as Record<string, string | null>,
  };
}

// ---------------- CS ----------------

export async function csBrands(u: User) {
  const scope = (await brandScope(u)) ?? [];
  const [stats, rows, digest] = await Promise.all([
    brandStats(scope),
    db.brand.findMany({ where: { id: { in: scope } }, include: { scope: { include: { scope: true } }, projects: { where: { archivedAt: null }, include: { status: true }, orderBy: { createdAt: "desc" } }, cs: true } }),
    settingValue<Record<string, Record<string, { hold?: boolean }>>>("digest_overrides", {}),
  ]);
  const today = istDateKey();
  return stats.map((s) => {
    const r = rows.find((x) => x.id === s.id)!;
    return {
      ...s, logo: fileUrl(r.logoFileId, "320"), primary: r.cs.find((c) => c.isPrimary)?.userId === u.id,
      profile: {
        companyName: r.companyName, frequency: FREQUENCY_LABEL[r.frequency], paymentTerms: r.paymentTerms, officialEmail: r.officialEmail, whatsapp: r.whatsapp,
        pocName: r.pocName, pocPhone: r.pocPhone, website: r.website, instagram: r.instagram, city: r.city, gstin: r.gstin, additionalInformation: r.additionalInformation,
      } as Record<string, string | null>,
      scopeNames: r.scope.map((x) => x.scope.name),
      projects: r.projects.map((p) => ({ id: p.id, name: p.name, type: p.type ?? "", status: p.status.name, deadline: fmtDate(p.deadline) })),
      heldToday: !!digest[s.id]?.[today]?.hold,
    };
  });
}
export type CsBrandVM = Awaited<ReturnType<typeof csBrands>>[number];

/** Review queue stats (§8): waiting, avg turnaround, first-pass rate, rejected this month. */
export async function reviewStats(u: User) {
  const scope = (await brandScope(u)) ?? [];
  const since = istStartOfMonth();
  const hist = await db.taskStatusHistory.findMany({
    where: { at: { gte: since }, task: { brandId: { in: scope } }, OR: [{ to: { isReview: true } }, { from: { isReview: true } }] },
    include: { to: true, from: true }, orderBy: { at: "asc" },
  });
  const entered = new Map<string, Date>();
  const turn: number[] = [];
  let passed = 0, rejected = 0;
  for (const h of hist) {
    if (h.to.isReview) entered.set(h.taskId, h.at);
    else if (h.from?.isReview) {
      const e = entered.get(h.taskId);
      if (e) turn.push(h.at.getTime() - e.getTime());
      if (h.to.isRejected) rejected++; else passed++;
    }
  }
  const avg = turn.length ? turn.reduce((a, b) => a + b, 0) / turn.length / 3_600_000 : null;
  return { avg: avg === null ? "—" : avg < 24 ? `${avg.toFixed(1)} h` : `${(avg / 24).toFixed(1)} d`, pass: passed + rejected ? `${Math.round((passed / (passed + rejected)) * 100)}%` : "—", rejected };
}

/** The 9:00 digest each brand gets, composed like Sarthi composes it (preview). */
export async function digests(u: User) {
  const scope = (await brandScope(u)) ?? [];
  const tomorrow = istDateKey(new Date(Date.now() + DAY_MS));
  const today = istDateKey();
  const [brands, tasks, overrides] = await Promise.all([
    db.brand.findMany({ where: { id: { in: scope }, status: "active" }, include: { clientUsers: { where: { status: "active" } } }, orderBy: { name: "asc" } }),
    db.task.findMany({ where: { brandId: { in: scope }, shareWithClient: true, OR: [{ status: { isDone: false } }, { completedAt: { gte: new Date(Date.now() - DAY_MS) } }] }, include: { status: true }, orderBy: { deadlineAt: "asc" } }),
    settingValue<Record<string, Record<string, { hold?: boolean; line?: string }>>>("digest_overrides", {}),
  ]);
  return brands.map((b) => {
    const prefs = (b.preferences ?? {}) as { daily_digest?: boolean };
    const mine = tasks.filter((t) => t.brandId === b.id);
    const first = b.clientUsers[0]?.firstName ?? b.pocName?.split(" ")[0] ?? "there";
    const lines = mine.map((t) => `• ${t.name} — ${clientLabel(t.status).toLowerCase()}${t.status.isClientGate ? " (your nod needed)" : ""}`);
    const o = overrides[b.id] ?? {};
    return {
      id: b.id, name: b.name, optedIn: prefs.daily_digest !== false, to: b.clientUsers.map((c) => c.whatsappNo).filter(Boolean).join(", ") || b.whatsapp || "—",
      text: `Good morning ${first}! Coffee & Creative update for ${b.name}:\n${lines.join("\n") || "• Nothing in the works today."}\nReply here if anything needs a tweak. — Sarthi, for ${u.firstName}`,
      todayLine: o[today]?.line ?? "", tomorrowLine: o[tomorrow]?.line ?? "", heldToday: !!o[today]?.hold, heldTomorrow: !!o[tomorrow]?.hold, tomorrow,
    };
  });
}

export async function flagsGiven(u: User) {
  const rows = await db.flag.findMany({ where: { givenByUserId: u.id }, include: { type: true, target: true, brand: true, task: true }, orderBy: { createdAt: "desc" }, take: 60 });
  return rows.map((f) => ({ id: f.id, c: FLAG_CLASS[f.type.colour], type: f.type.name, who: name(f.target), subject: f.subject, feedback: f.feedback, on: fmtDate(f.createdAt), pts: f.pointsApplied, brand: f.brand?.name ?? "", task: f.task?.name ?? "" }));
}

// ---------------- CS: my team (hierarchy, client request 2026-11-04) ----------------

/** The employees who report to a CS: today's attendance, desk, EOD and score. */
export async function myTeam(u: User) {
  const now = new Date();
  const today = istDateOnly(now), todayKey = istDateKey(now), month = istMonthDate(now);
  const people = await db.user.findMany({ where: { reportsToId: u.id, role: "employee", status: "active" }, include: { department: true }, orderBy: { firstName: "asc" } });
  const ids = people.map((p) => p.id);
  const [days, open, late, eod, scores, leaves, company] = await Promise.all([
    db.attendanceDay.findMany({ where: { userId: { in: ids }, date: today } }),
    loadTasks({ assignees: { some: { userId: { in: ids } } }, status: { isDone: false } }),
    db.task.findMany({ where: { AND: [await lateTaskWhere(now), { assignees: { some: { userId: { in: ids } } } }] }, select: { id: true, assignees: { select: { userId: true } } } }),
    db.eodLog.findMany({ where: { userId: { in: ids }, date: today }, include: { task: true } }),
    db.performanceScore.findMany({ where: { userId: { in: ids }, month } }),
    db.leaveRequest.findMany({ where: { userId: { in: ids }, OR: [{ status: "pending" }, { toDate: { gte: today } }] }, include: { user: true }, orderBy: { fromDate: "asc" } }),
    db.company.findFirst(),
  ]);
  const sessions = await db.attendanceSession.findMany({ where: { userId: { in: ids }, loginAt: { gte: istStartOfMonth(now) } }, orderBy: { loginAt: "asc" } });
  return {
    lateAfter: company?.lateLoginAfter ?? "10:30",
    people: people.map((p) => {
      const d = days.find((x) => x.userId === p.id);
      const first = sessions.find((x) => x.userId === p.id && istDateKey(x.loginAt) === todayKey);
      const desk = open.filter((t) => t.assignees.some((a) => a.id === p.id));
      const active = desk.filter((t) => !t.status.isReview && !t.status.isClientGate);
      const lines = eod.filter((e) => e.userId === p.id);
      return {
        id: p.id, name: name(p), desig: p.designation ?? "", dept: p.department?.name ?? "",
        in: first ? fmtTime(first.loginAt) : "—", state: d?.state ?? (first ? "present" : "absent"),
        open: desk.length, late: late.filter((t) => t.assignees.some((a) => a.userId === p.id)).length,
        eod: `${lines.length}/${active.length}`, eodDone: lines.length >= active.length && active.length > 0,
        score: scores.find((x) => x.userId === p.id)?.score ?? null,
        desk, lines: lines.map((l) => ({ task: l.task.name, remark: l.remark, status: l.statusAtTime ?? "" })),
      };
    }),
    leaves: leaves.map((l) => ({ id: l.id, who: name(l.user), from: fmtDate(l.fromDate), to: fmtDate(l.toDate), type: l.type.replace("_", " "), reason: l.reason ?? "", status: l.status })),
  };
}
export type MyTeam = Awaited<ReturnType<typeof myTeam>>;
