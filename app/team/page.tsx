import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { brandScope } from "@/lib/queries";
import { loadTasks } from "@/lib/views";
import { myAttendance, notices, teamTasks, todaysEod } from "@/lib/team-views";
import { fmtWhen, greeting, istParts } from "@/lib/time";
import { TodayView } from "@/components/team/views";

export const metadata = { title: "Today" };

export default async function TeamToday({ searchParams }: { searchParams: Promise<{ task?: string }> }) {
  const u = await requireUser(["cs", "employee"]);
  const { task } = await searchParams;
  const cs = u.role === "cs";
  const [tasks, eod, att, board, lastQa, company, scope] = await Promise.all([
    teamTasks(u), todaysEod(u), myAttendance(u), notices(),
    db.auditLog.findFirst({ where: { action: "agent.answer", actorUserId: u.id }, orderBy: { at: "desc" } }),
    db.company.findFirst(), brandScope(u),
  ]);
  const mine = cs ? await loadTasks({ assignees: { some: { userId: u.id } }, status: { isDone: false } }) : tasks;
  const open = tasks.filter((t) => !t.status.isDone);
  const desk = (cs ? open.filter((t) => t.status.isReview || t.isLate || t.dueToday) : open)
    .sort((a, b) => Number(b.status.isReview) - Number(a.status.isReview) || Number(b.isLate) - Number(a.isLate) || a.dueKey.localeCompare(b.dueKey));
  const qa = lastQa?.after as { question?: string; answer?: string } | null;
  const [lh, lm] = (company?.lateLoginAfter ?? "10:30").split(":").map(Number);
  const firstMin = att.first === "—" ? null : (() => { const m = /(\d+):(\d+) (am|pm)/.exec(att.first)!; return ((+m[1] % 12) + (m[3] === "pm" ? 12 : 0)) * 60 + +m[2]; })();
  return (
    <TodayView role={u.role} first={u.firstName} greet={greeting()} initialTask={task ?? null}
      counts={{ late: open.filter((t) => t.isLate).length, dueToday: open.filter((t) => t.dueToday).length, review: open.filter((t) => t.status.isReview).length, client: open.filter((t) => t.status.isClientGate).length, open: open.length, brands: scope?.length }}
      desk={desk} mine={mine} eod={eod}
      att={{ first: att.first, soFar: att.soFar, open: att.open, lateAfter: company?.lateLoginAfter ?? "10:30", late: firstMin !== null && firstMin > lh * 60 + lm, working: (company?.workingDays ?? [1, 2, 3, 4, 5, 6]).includes(istParts(new Date()).dow || 7) }}
      qa={qa?.question ? { q: qa.question, a: qa.answer ?? "", when: fmtWhen(lastQa!.at) } : null} notices={board} />
  );
}
