import { requireUser } from "@/lib/auth";
import { loadProjects, loadTasks } from "@/lib/views";
import { DAY_MS, istStartOfMonth, monthName } from "@/lib/time";
import { db } from "@/lib/db";
import { brandScope, taskScope } from "@/lib/queries";
import { TasksView } from "@/components/admin/tasks-view";

export const metadata = { title: "Projects & Tasks" };

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ task?: string; f?: string; project?: string }> }) {
  const u = await requireUser(["admin", "group_admin"]);
  const sp = await searchParams;
  const since = new Date(Date.now() - 30 * DAY_MS);
  const T = await taskScope(u);
  // Open work plus the last 30 days of finished work keeps the board honest and light.
  const tasks = await loadTasks({ AND: [T, { OR: [{ status: { isDone: false } }, { completedAt: { gte: since } }, ...(sp.task ? [{ id: sp.task }] : [])] }] });
  // Projects: every project with work the user can see (a group admin sees their group's work).
  const B = await brandScope(u);
  const projects = await loadProjects(B ? { OR: [{ brandId: { in: B } }, { tasks: { some: T } }] } : {});
  const doneThisMonth = await db.task.count({ where: { AND: [T, { completedAt: { gte: istStartOfMonth() } }] } });
  return <TasksView tasks={tasks} projects={projects} doneLabel={`Completed · ${monthName()}`} doneThisMonth={doneThisMonth} initialTask={sp.task ?? null} initialFilter={sp.f ?? "All"} initialProject={sp.project ?? null} />;
}
