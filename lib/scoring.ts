import type { ScoreParameter } from "@prisma/client";
import { db } from "./db";
import { DAY_MS, istDateKey, istMonthDate, istParts } from "./time";

// Spec §6.7. Nightly per IST month; every parameter normalised 0–100, weighted, + clamped flags.

export const PARAMS: { key: ScoreParameter; label: string; source: string; weight: number }[] = [
  { key: "on_time", label: "On-time delivery", source: "submitted_at ≤ deadline_at on completed tasks", weight: 25 },
  { key: "review_pass", label: "Review pass rate", source: "first submission not rejected", weight: 20 },
  { key: "cs_rating", label: "CS rating", source: "CS rates each task 1–5 (× 20)", weight: 20 },
  { key: "eod", label: "EOD discipline", source: "EOD logged for every active task, every working day", weight: 10 },
  { key: "attendance", label: "Attendance", source: "present + late ÷ working days, −2 per late login", weight: 10 },
  { key: "client_approval", label: "Client approval rate", source: "approved first time on the client portal", weight: 5 },
  { key: "throughput", label: "Throughput vs peers", source: "completed tasks ÷ department median", weight: 5 },
  { key: "rework", label: "Rework", source: "share of hours not spent after a rejection", weight: 5 },
];

export const CS_PARAMS = [
  { key: "client_rating", label: "Client rating on their brands", weight: 30 },
  { key: "requests_24h", label: "Requests answered < 24 h", weight: 20 },
  { key: "reviews_24h", label: "Reviews turned in < 24 h", weight: 20 },
  { key: "on_time_brands", label: "On-time on their brands", weight: 20 },
  { key: "eod", label: "EOD discipline", weight: 10 },
];

export type Breakdown = { key: string; label: string; raw: string; value: number; weight: number }[];

const pct = (a: number, b: number, empty = 100) => (b ? Math.round((a / b) * 100) : empty);
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

async function settings() {
  const rows = await db.setting.findMany({ where: { key: { in: ["praise_cs_points", "praise_admin_points"] } } });
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function praisePoints(giverRole: string, typePoints: number, typeName: string) {
  if (!/praise/i.test(typeName)) return typePoints;
  const s = await settings();
  return giverRole === "cs" ? Number(s.praise_cs_points ?? 3) : Number(s.praise_admin_points ?? 5);
}

function workingDaysIn(from: Date, to: Date, workingDays: number[], holidays: Set<string>) {
  const out: string[] = [];
  for (let t = from.getTime(); t < to.getTime(); t += DAY_MS) {
    const d = new Date(t);
    const dow = istParts(d).dow || 7; // 1–7, Mon–Sun
    const k = istDateKey(d);
    if (workingDays.includes(dow) && !holidays.has(k)) out.push(k);
  }
  return out;
}

/** Computes and stores performance_score for every employee/CS for the IST month of `at`. */
export async function computeScores(at = new Date()) {
  const month = istMonthDate(at);
  const from = new Date(month.getTime() - 330 * 60_000); // IST midnight on the 1st, as UTC instant
  const nextMonth = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1));
  const to = new Date(Math.min(nextMonth.getTime() - 330 * 60_000, at.getTime()));

  const [company, weights, statuses, holidaysRows, people] = await Promise.all([
    db.company.findFirst(),
    db.scoringWeight.findMany(),
    db.taskStatus.findMany(),
    db.announcement.findMany({ where: { type: "holiday", archivedAt: null } }),
    db.user.findMany({ where: { role: { in: ["employee", "cs"] }, status: "active" } }),
  ]);
  const wmap = new Map(weights.map((w) => [w.parameter, w.enabled ? w.weight : 0]));
  const rejected = statuses.find((s) => s.isRejected)?.id;
  const review = statuses.find((s) => s.isReview)?.id;
  const gate = statuses.find((s) => s.isClientGate)?.id;
  const done = statuses.find((s) => s.isDone)?.id;
  const holidays = new Set(holidaysRows.map((h) => h.date.toISOString().slice(0, 10)));
  const wdays = workingDaysIn(from, to, company?.workingDays ?? [1, 2, 3, 4, 5, 6], holidays);

  const results: { userId: string; dept: string | null; score: number; breakdown: Breakdown; completed: number }[] = [];

  for (const p of people) {
    const flags = await db.flag.findMany({ where: { targetUserId: p.id, month } });
    const flagPts = clamp(flags.reduce((s, f) => s + f.pointsApplied, 0), -15, 15);
    let breakdown: Breakdown;

    if (p.role === "employee") {
      const tasks = await db.task.findMany({
        where: { assignees: { some: { userId: p.id } } },
        include: { history: { orderBy: { at: "asc" } }, ratings: true },
      });
      const completed = tasks.filter((t) => t.completedAt && t.completedAt >= from && t.completedAt < to);
      const onTime = completed.filter((t) => (t.submittedAt ?? t.completedAt!) <= t.deadlineAt).length;
      const submitted = tasks.filter((t) => t.history.some((h) => h.toStatusId === review && h.at >= from && h.at < to));
      const firstPass = submitted.filter((t) => {
        const firstReview = t.history.findIndex((h) => h.toStatusId === review);
        const next = t.history[firstReview + 1];
        return !next || next.toStatusId !== rejected;
      }).length;
      const csRatings = tasks.flatMap((t) => t.ratings.filter((r) => r.raterKind === "cs" && r.at >= from && r.at < to));
      const csAvg = csRatings.length ? csRatings.reduce((s, r) => s + r.stars, 0) / csRatings.length : 0;
      const sentToClient = tasks.filter((t) => t.history.some((h) => h.toStatusId === gate && h.at >= from && h.at < to));
      const clientFirst = sentToClient.filter((t) => {
        const i = t.history.findIndex((h) => h.toStatusId === gate);
        return t.history[i + 1]?.toStatusId === done;
      }).length;

      // EOD: working days (so far) where the person had an active task, vs days with an EOD for every active task.
      const eods = await db.eodLog.findMany({ where: { userId: p.id, date: { gte: month, lt: nextMonth } } });
      const eodByDay = new Map<string, Set<string>>();
      eods.forEach((e) => {
        const k = e.date.toISOString().slice(0, 10);
        if (!eodByDay.has(k)) eodByDay.set(k, new Set());
        eodByDay.get(k)!.add(e.taskId);
      });
      let activeDays = 0, eodDays = 0;
      for (const k of wdays) {
        const dayStart = new Date(`${k}T00:00:00+05:30`), dayEnd = new Date(dayStart.getTime() + DAY_MS);
        const active = tasks.filter((t) => (t.startedAt ?? t.createdAt) < dayEnd && (!t.completedAt || t.completedAt >= dayStart));
        if (!active.length) continue;
        activeDays++;
        const logged = eodByDay.get(k);
        if (logged && active.every((t) => logged.has(t.id))) eodDays++;
      }

      const days = await db.attendanceDay.findMany({ where: { userId: p.id, date: { gte: month, lt: nextMonth } } });
      const presentish = days.filter((d) => d.state === "present" || d.state === "late").length;
      const lateCount = days.filter((d) => d.state === "late").length;
      const attendance = clamp(pct(presentish, wdays.length) - 2 * lateCount, 0, 100);

      // Rework: hours spent between a rejection and the next submission, vs total active hours.
      let rework = 0, total = 0;
      for (const t of tasks) {
        const h = t.history;
        for (let i = 0; i < h.length; i++) {
          const end = h[i + 1]?.at ?? (t.completedAt ?? to);
          const dur = Math.max(0, Math.min(end.getTime(), to.getTime()) - Math.max(h[i].at.getTime(), from.getTime())) / 3_600_000;
          if (h[i].toStatusId === done || h[i].toStatusId === gate) continue;
          total += dur;
          if (h[i].toStatusId === rejected) rework += dur;
        }
      }

      breakdown = [
        { key: "on_time", label: "On-time delivery", raw: `${onTime}/${completed.length}`, value: pct(onTime, completed.length), weight: wmap.get("on_time") ?? 25 },
        { key: "review_pass", label: "Review pass rate", raw: `${firstPass}/${submitted.length}`, value: pct(firstPass, submitted.length), weight: wmap.get("review_pass") ?? 20 },
        { key: "cs_rating", label: "CS rating", raw: csRatings.length ? csAvg.toFixed(1) : "—", value: csRatings.length ? Math.round(csAvg * 20) : 80, weight: wmap.get("cs_rating") ?? 20 },
        { key: "eod", label: "EOD discipline", raw: `${eodDays}/${activeDays}`, value: pct(eodDays, activeDays), weight: wmap.get("eod") ?? 10 },
        { key: "attendance", label: "Attendance", raw: `${presentish}/${wdays.length} · ${lateCount} late`, value: attendance, weight: wmap.get("attendance") ?? 10 },
        { key: "client_approval", label: "Client approval rate", raw: `${clientFirst}/${sentToClient.length}`, value: pct(clientFirst, sentToClient.length), weight: wmap.get("client_approval") ?? 5 },
        { key: "throughput", label: "Throughput vs peers", raw: `${completed.length} done`, value: completed.length, weight: wmap.get("throughput") ?? 5 },
        { key: "rework", label: "Rework", raw: `${rework.toFixed(1)} h of ${total.toFixed(0)} h`, value: total ? clamp(Math.round(100 - (rework / total) * 100), 0, 100) : 100, weight: wmap.get("rework") ?? 5 },
      ];
      results.push({ userId: p.id, dept: p.departmentId, score: 0, breakdown, completed: completed.length });
    } else {
      // CS parameter set (§6.7 last paragraph).
      const brandIds = (await db.brandCs.findMany({ where: { userId: p.id } })).map((b) => b.brandId);
      const ratings = await db.taskRating.findMany({ where: { raterKind: "client", at: { gte: from, lt: to }, task: { brandId: { in: brandIds } } } });
      const reqs = await db.workRequest.findMany({ where: { brandId: { in: brandIds }, date: { gte: from, lt: to } } });
      const fast = reqs.filter((r) => r.firstReplyAt && r.firstReplyAt.getTime() - r.date.getTime() < DAY_MS).length;
      const reviews = await db.taskStatusHistory.findMany({
        where: { fromStatusId: review, at: { gte: from, lt: to }, task: { csUserId: p.id } },
        include: { task: { include: { history: true } } },
      });
      const quick = reviews.filter((r) => {
        const into = r.task.history.filter((h) => h.toStatusId === review && h.at <= r.at).sort((a, b) => b.at.getTime() - a.at.getTime())[0];
        return into && r.at.getTime() - into.at.getTime() < DAY_MS;
      }).length;
      const brandDone = await db.task.findMany({ where: { brandId: { in: brandIds }, completedAt: { gte: from, lt: to } } });
      const brandOnTime = brandDone.filter((t) => (t.submittedAt ?? t.completedAt!) <= t.deadlineAt).length;
      const eodCount = await db.eodLog.count({ where: { userId: p.id, date: { gte: month, lt: nextMonth } } });
      const avg = ratings.length ? ratings.reduce((s, r) => s + r.stars, 0) / ratings.length : 0;
      breakdown = [
        { key: "client_rating", label: "Client rating on their brands", raw: ratings.length ? avg.toFixed(1) : "—", value: ratings.length ? Math.round(avg * 20) : 80, weight: 30 },
        { key: "requests_24h", label: "Requests answered < 24 h", raw: `${fast}/${reqs.length}`, value: pct(fast, reqs.length), weight: 20 },
        { key: "reviews_24h", label: "Reviews turned in < 24 h", raw: `${quick}/${reviews.length}`, value: pct(quick, reviews.length), weight: 20 },
        { key: "on_time_brands", label: "On-time on their brands", raw: `${brandOnTime}/${brandDone.length}`, value: pct(brandOnTime, brandDone.length), weight: 20 },
        { key: "eod", label: "EOD discipline", raw: `${eodCount} lines`, value: clamp(pct(eodCount, wdays.length), 0, 100), weight: 10 },
      ];
      results.push({ userId: p.id, dept: p.departmentId, score: 0, breakdown, completed: brandDone.length });
    }
    results[results.length - 1].score = flagPts; // stash flags; finalised below
  }

  // Throughput normalisation needs department medians.
  const byDept = new Map<string, number[]>();
  results.forEach((r) => {
    const k = r.dept ?? "none";
    byDept.set(k, [...(byDept.get(k) ?? []), r.completed]);
  });
  const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

  for (const r of results) {
    const tp = r.breakdown.find((b) => b.key === "throughput");
    if (tp) {
      const med = median(byDept.get(r.dept ?? "none") ?? [0]);
      tp.value = med ? clamp(Math.round((r.completed / med) * 100), 0, 100) : r.completed ? 100 : 0;
    }
    const sw = r.breakdown.reduce((s, b) => s + b.weight, 0) || 1;
    const base = r.breakdown.reduce((s, b) => s + b.value * b.weight, 0) / sw;
    const flagPts = r.score;
    r.breakdown.push({ key: "flags", label: "Flags", raw: `${flagPts >= 0 ? "+" : ""}${flagPts}`, value: flagPts, weight: 0 });
    r.score = clamp(Math.round(base + flagPts), 0, 100);
  }

  // Rank within department.
  for (const [, group] of groupBy(results, (r) => r.dept ?? "none")) {
    group.sort((a, b) => b.score - a.score).forEach((r, i) => ((r as { rank?: number }).rank = i + 1));
  }

  for (const r of results) {
    await db.performanceScore.upsert({
      where: { userId_month: { userId: r.userId, month } },
      create: { userId: r.userId, month, score: r.score, rankInDept: (r as { rank?: number }).rank, breakdown: r.breakdown },
      update: { score: r.score, rankInDept: (r as { rank?: number }).rank, breakdown: r.breakdown, computedAt: new Date() },
    });
  }
  await db.auditLog.create({ data: { actorKind: "system", action: "score.computed", entityType: "performance_score", entityId: null, after: { month: month.toISOString().slice(0, 10), people: results.length } } });
  return results.length;
}

function groupBy<T>(xs: T[], k: (x: T) => string) {
  const m = new Map<string, T[]>();
  xs.forEach((x) => m.set(k(x), [...(m.get(k(x)) ?? []), x]));
  return m;
}

