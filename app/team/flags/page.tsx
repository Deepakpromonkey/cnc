import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { flagsGiven } from "@/lib/team-views";
import { CsFlagsView } from "@/components/team/cs-views";

export const metadata = { title: "Flags" };

export default async function TeamFlags() {
  const u = await requireUser(["cs", "employee"]);
  if (u.role !== "cs") redirect("/team");
  return <CsFlagsView flags={await flagsGiven(u)} />;
}
