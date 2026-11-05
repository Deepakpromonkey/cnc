import { requireUser } from "@/lib/auth";
import { notices } from "@/lib/team-views";
import { NoticesView } from "@/components/team/views";

export const metadata = { title: "Announcements" };

export default async function TeamAnnounce() {
  await requireUser(["cs", "employee"]);
  return <NoticesView notices={await notices()} />;
}
