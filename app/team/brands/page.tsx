import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { csBrands, teamTasks } from "@/lib/team-views";
import { CsBrandsView } from "@/components/team/cs-views";

export const metadata = { title: "My brands" };

export default async function TeamBrands() {
  const u = await requireUser(["cs", "employee"]);
  if (u.role !== "cs") redirect("/team");
  const [brands, tasks] = await Promise.all([csBrands(u), teamTasks(u)]);
  return <CsBrandsView brands={brands} tasks={tasks} />;
}
