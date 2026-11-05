import { requireUser } from "@/lib/auth";
import { myConcerns } from "@/lib/team-views";
import { MyConcernsView } from "@/components/team/views";

export const metadata = { title: "Concerns" };

export default async function TeamConcerns() {
  const u = await requireUser(["cs", "employee"]);
  const c = await myConcerns(u);
  return <MyConcernsView mine={c.mine} team={c.team} />;
}
