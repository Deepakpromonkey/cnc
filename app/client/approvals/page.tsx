import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { monthStart, pieces } from "@/lib/client-views";
import { ApprovalsView } from "@/components/client/views";

export const metadata = { title: "Approvals" };

/** Average time from "shared for approval" to the client's decision, this month. */
async function avgResponse(brandId: string) {
  const from = monthStart();
  const decided = await db.taskStatusHistory.findMany({
    where: { at: { gte: from }, by: { role: "client" }, task: { brandId } },
    include: { task: { include: { history: { include: { to: true }, orderBy: { at: "asc" } } } } },
  });
  const gaps = decided.map((d) => {
    const gate = d.task.history.filter((h) => h.to.isClientGate && h.at <= d.at).pop();
    return gate ? d.at.getTime() - gate.at.getTime() : null;
  }).filter((x): x is number => x !== null);
  if (!gaps.length) return "—";
  const h = gaps.reduce((a, b) => a + b, 0) / gaps.length / 3_600_000;
  return h < 24 ? `${Math.max(1, Math.round(h))} h` : `${(h / 24).toFixed(1)} d`;
}

export default async function Approvals({ searchParams }: { searchParams: Promise<{ piece?: string }> }) {
  const u = await requireUser(["client"]);
  const [list, avg, projects] = await Promise.all([
    pieces(u), avgResponse(u.brandId!),
    db.project.findMany({ where: { brandId: u.brandId!, archivedAt: null }, select: { id: true, name: true } }),
  ]);
  return <ApprovalsView pieces={list} projects={projects} avgResp={avg} initial={(await searchParams).piece} />;
}
