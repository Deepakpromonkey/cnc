import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { taskScope } from "@/lib/queries";
import { loadTasks } from "@/lib/views";
import { reviewStats } from "@/lib/team-views";
import { ReviewView } from "@/components/team/cs-views";

export const metadata = { title: "Review queue" };

export default async function TeamReview() {
  const u = await requireUser(["cs", "employee"]);
  if (u.role !== "cs") redirect("/team");
  const [queue, stats] = await Promise.all([loadTasks({ AND: [await taskScope(u), { status: { isReview: true } }] }), reviewStats(u)]);
  return <ReviewView queue={queue} stats={stats} />;
}
