import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { myTeam } from "@/lib/team-views";
import { MyTeamView } from "@/components/team/my-team";

export const metadata = { title: "My team" };

// CS → the employees who report to them (hierarchy, client request 2026-11-04).
export default async function TeamPeople() {
  const u = await requireUser(["cs", "employee"]);
  if (u.role !== "cs") redirect("/team");
  return <MyTeamView team={await myTeam(u)} />;
}
