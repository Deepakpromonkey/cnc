import { requireUser } from "@/lib/auth";
import { materialiseDay } from "@/lib/attendance";
import { istDateKey } from "@/lib/time";
import { myAttendance } from "@/lib/team-views";
import { MyAttendanceView } from "@/components/team/views";

export const metadata = { title: "Attendance" };

export default async function TeamAttendance() {
  const u = await requireUser(["cs", "employee"]);
  await materialiseDay(u.id, istDateKey());
  return <MyAttendanceView a={await myAttendance(u)} />;
}
