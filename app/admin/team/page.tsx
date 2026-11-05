import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { lateTaskWhere, name, settingValue, taskScope, teamScope } from "@/lib/queries";
import { loadTasks } from "@/lib/views";
import { fmtDate, istMonthDate, DAY_MS } from "@/lib/time";
import { FLAG_CLASS } from "@/lib/status";
import { PARAMS } from "@/lib/scoring";
import { TeamView, type PersonVM, type CsVM } from "@/components/admin/team-view";

export const metadata = { title: "Team" };

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const u = await requireUser(["admin", "group_admin"]);
  const { p } = await searchParams;
  const [team, T] = await Promise.all([teamScope(u), taskScope(u)]);
  const inTeam = team ? { id: { in: team } } : {};
  const month = istMonthDate();
  const prev = istMonthDate(new Date(month.getTime() - DAY_MS));
  const [people, openTasks, weights, csUsers, reqs, ratings, late, praiseCs, praiseAdmin, visible] = await Promise.all([
    db.user.findMany({
      where: { role: "employee", status: "active", ...inTeam },
      include: { department: true, scores: { where: { month: { in: [month, prev] } } }, flagsReceived: { where: { month }, include: { type: true, givenBy: true }, orderBy: { createdAt: "desc" } } },
    }),
    loadTasks({ AND: [T, { status: { isDone: false } }] }),
    db.scoringWeight.findMany(),
    db.user.findMany({ where: { role: "cs", status: "active", ...inTeam }, include: { csBrands: { include: { brand: true } }, flagsReceived: { where: { month }, include: { type: true, givenBy: true } }, scores: { where: { month } } } }),
    db.workRequest.findMany({ where: { status: "new" }, select: { ownerUserId: true } }),
    db.taskRating.findMany({ where: { raterKind: "client" }, include: { task: { select: { brandId: true } } } }),
    db.task.findMany({ where: { AND: [await lateTaskWhere(), T] }, select: { csUserId: true } }),
    settingValue("praise_cs_points", 3), settingValue("praise_admin_points", 5), settingValue("score_visible_to_employee", true),
  ]);

  const persons: PersonVM[] = people.map((u) => {
    const cur = u.scores.find((s) => s.month.getTime() === month.getTime());
    const last = u.scores.find((s) => s.month.getTime() === prev.getTime());
    const bd = (cur?.breakdown ?? []) as { key: string; label: string; raw: string; value: number; weight: number }[];
    const v = (k: string) => bd.find((b) => b.key === k);
    return {
      id: u.id, name: name(u), dept: u.department?.name ?? "", desig: u.designation ?? "", score: cur?.score ?? 0, last: last?.score ?? null, rank: cur?.rankInDept ?? null,
      tasks: Number(v("throughput")?.raw.split(" ")[0] ?? 0), ontime: v("on_time")?.value ?? 0, pass: v("review_pass")?.value ?? 0,
      cs: v("cs_rating")?.raw ?? "—", eod: v("eod")?.value ?? 0, att: v("attendance")?.value ?? 0,
      breakdown: bd.filter((b) => b.key !== "flags"), flagPts: v("flags")?.value ?? 0,
      flags: u.flagsReceived.map((f) => ({ c: FLAG_CLASS[f.type.colour], type: f.type.name, subject: f.subject, feedback: f.feedback, by: name(f.givenBy), on: fmtDate(f.createdAt), pts: f.pointsApplied })),
      open: openTasks.filter((t) => t.assignees.some((a) => a.id === u.id)),
    };
  }).sort((a, b) => b.score - a.score);

  const cs: CsVM[] = csUsers.map((u) => {
    const brandIds = u.csBrands.map((b) => b.brandId);
    const rs = ratings.filter((r) => brandIds.includes(r.task.brandId));
    return {
      id: u.id, name: name(u), desig: u.designation ?? "", brands: u.csBrands.map((b) => b.brand.name), score: u.scores[0]?.score ?? null,
      open: openTasks.filter((t) => t.cs.id === u.id).length, late: late.filter((t) => t.csUserId === u.id).length,
      unanswered: reqs.filter((r) => r.ownerUserId === u.id).length, rating: rs.length ? (rs.reduce((s, r) => s + r.stars, 0) / rs.length).toFixed(1) : "—",
      flags: u.flagsReceived.map((f) => ({ c: FLAG_CLASS[f.type.colour], subject: f.subject })),
    };
  });

  const rules = PARAMS.map((x) => {
    const w = weights.find((y) => y.parameter === x.key);
    return { key: x.key, label: x.label, source: x.source, weight: w?.weight ?? x.weight, enabled: w?.enabled ?? true };
  });
  return <TeamView people={persons} cs={cs} rules={rules} praise={{ cs: Number(praiseCs), admin: Number(praiseAdmin) }} visible={!!visible} lateCount={late.length} initial={p ?? null} />;
}
