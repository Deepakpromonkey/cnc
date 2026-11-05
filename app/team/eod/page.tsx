import { requireUser } from "@/lib/auth";
import { loadTasks } from "@/lib/views";
import { eodHistory, todaysEod } from "@/lib/team-views";
import { fmtLongDay } from "@/lib/time";
import { EodView } from "@/components/team/views";

export const metadata = { title: "EOD log" };

export default async function TeamEod() {
  const u = await requireUser(["cs", "employee"]);
  const [tasks, eod, history] = await Promise.all([loadTasks({ assignees: { some: { userId: u.id } }, status: { isDone: false } }), todaysEod(u), eodHistory(u)]);
  return <EodView tasks={tasks} eod={eod} history={history} todayLabel={fmtLongDay()} />;
}
