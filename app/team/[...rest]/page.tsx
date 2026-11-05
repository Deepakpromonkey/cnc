import { redirect } from "next/navigation";

// Deep links into the Team portal (from notifications) land on its home until Phase 2.
export default function TeamRest() {
  redirect("/team");
}
