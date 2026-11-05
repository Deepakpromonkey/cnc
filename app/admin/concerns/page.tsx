import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { name } from "@/lib/queries";
import { fileUrl } from "@/lib/storage";
import { fmtDate, fmtWhen, istStartOfMonth } from "@/lib/time";
import { CONCERN_CATEGORIES } from "@/lib/status";
import { ConcernsView, type ConcernVM } from "@/components/admin/ops-views";

export const metadata = { title: "Concerns" };

export default async function ConcernsPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  await requireUser(["admin"]);
  const { c } = await searchParams;
  const now = new Date();
  const rows = await db.concern.findMany({ include: { raisedBy: true, owner: true, replies: { include: { user: true }, orderBy: { at: "asc" } } }, orderBy: { createdAt: "desc" } });
  const vms: ConcernVM[] = rows.map((r) => {
    const firstReply = r.replies.find((x) => x.userId !== r.raisedByUserId);
    const overdue = !firstReply && r.status !== "resolved" && now.getTime() - r.createdAt.getTime() > r.slaHours * 3_600_000;
    return {
      id: r.id, code: `C-${r.code}`, subject: r.subject, details: r.details, by: name(r.raisedBy), byId: r.raisedByUserId, cat: CONCERN_CATEGORIES[r.category], when: fmtWhen(r.createdAt, now),
      owner: name(r.owner), ownerId: r.ownerUserId, status: r.status, confidential: r.confidential, sla: r.slaHours, overdue, closed: r.resolvedAt ? fmtDate(r.resolvedAt) : "",
      file: fileUrl(r.fileId, "1280"), onBehalf: !!r.loggedOnBehalfBy,
      thread: r.replies.map((x) => ({ who: name(x.user), when: fmtWhen(x.at, now), body: x.body, mine: x.userId === r.raisedByUserId })),
      monthly: r.createdAt >= istStartOfMonth(now),
      resolveHrs: r.resolvedAt ? (r.resolvedAt.getTime() - r.createdAt.getTime()) / 3_600_000 : null,
    };
  });
  return <ConcernsView rows={vms} initial={c ?? null} />;
}
