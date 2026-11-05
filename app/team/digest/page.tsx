import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { digests } from "@/lib/team-views";
import { DigestView } from "@/components/team/cs-views";

export const metadata = { title: "Client digest" };

export default async function TeamDigest() {
  const u = await requireUser(["cs", "employee"]);
  if (u.role !== "cs") redirect("/team");
  return <DigestView digests={await digests(u)} nextLabel="tomorrow at 9:00 IST" />;
}
