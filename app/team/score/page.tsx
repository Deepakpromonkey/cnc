import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { myScore } from "@/lib/team-views";
import { monthName } from "@/lib/time";
import { ScoreView } from "@/components/team/views";

export const metadata = { title: "My score" };

export default async function TeamScore() {
  const u = await requireUser(["cs", "employee"]);
  if (u.role === "cs") redirect("/team/flags");
  const dept = u.departmentId ? (await db.department.findUnique({ where: { id: u.departmentId } }))?.name ?? "" : "";
  return <ScoreView s={await myScore(u)} dept={dept} month={monthName(new Date(), true)} />;
}
