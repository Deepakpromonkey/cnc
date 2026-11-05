import { redirect } from "next/navigation";
import { currentUser, homeFor } from "@/lib/auth";

export default async function Root() {
  const u = await currentUser();
  redirect(u ? homeFor(u.role) : "/login");
}
