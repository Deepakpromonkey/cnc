import { requireUser } from "@/lib/auth";
import { myProfile } from "@/lib/team-views";
import { ProfileView } from "@/components/team/views";

export const metadata = { title: "Profile" };

export default async function TeamProfile() {
  const u = await requireUser(["cs", "employee"]);
  return <ProfileView p={await myProfile(u)} />;
}
