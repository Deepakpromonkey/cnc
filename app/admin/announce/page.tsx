import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { name } from "@/lib/queries";
import { fileUrl } from "@/lib/storage";
import { MONTHS, dateKey, fmtDate, fmtWhen, istDateOnly } from "@/lib/time";
import { AnnounceView, type AnnVM } from "@/components/admin/ops-views";

export const metadata = { title: "Announcements" };

export default async function AnnouncePage() {
  await requireUser(["admin"]);
  const rows = await db.announcement.findMany({ where: { archivedAt: null }, include: { postedBy: true }, orderBy: { date: "desc" } });
  const today = istDateOnly();
  const vms: AnnVM[] = rows.map((a) => ({
    id: a.id, code: `A-${a.code}`, type: a.type, subject: a.subject, message: a.message ?? "", day: String(a.date.getUTCDate()), mon: MONTHS[a.date.getUTCMonth()],
    date: fmtDate(a.date, true), dateKey: dateKey(a.date), clients: a.showToClients, broadcast: a.broadcast, by: name(a.postedBy), on: fmtWhen(a.createdAt),
    image: fileUrl(a.imageFileId, "1280"), upcoming: a.date >= today,
  }));
  const next = [...vms].filter((a) => a.type === "holiday" && a.upcoming).sort((a, b) => a.dateKey.localeCompare(b.dateKey))[0];
  return <AnnounceView rows={vms} nextHoliday={next ? `${next.day} ${next.mon}` : "—"} />;
}
