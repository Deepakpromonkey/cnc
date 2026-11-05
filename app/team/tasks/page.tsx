import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { brandScope } from "@/lib/queries";
import { loadProjects } from "@/lib/views";
import { teamTasks, todaysEod } from "@/lib/team-views";
import { istStartOfMonth, monthName } from "@/lib/time";
import { MyTasksView } from "@/components/team/views";
import { TasksView } from "@/components/admin/tasks-view";

export const metadata = { title: "Tasks" };

export default async function TeamTasks({ searchParams }: { searchParams: Promise<{ task?: string; f?: string }> }) {
  const u = await requireUser(["cs", "employee"]);
  const sp = await searchParams;
  const tasks = await teamTasks(u, sp.task ? {} : {});
  if (u.role === "employee") return <MyTasksView tasks={tasks} eod={await todaysEod(u)} initialTask={sp.task ?? null} />;
  const scope = (await brandScope(u)) ?? [];
  const [projects, done] = await Promise.all([
    loadProjects({ brandId: { in: scope } }),
    db.task.count({ where: { brandId: { in: scope }, completedAt: { gte: istStartOfMonth() } } }),
  ]);
  return <TasksView cs tasks={tasks} projects={projects} doneLabel={`Completed · ${monthName()}`} doneThisMonth={done} initialTask={sp.task ?? null} initialFilter={sp.f ?? "All"} initialProject={null} />;
}
