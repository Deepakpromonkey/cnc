import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { clientContext, invoicesFor, noticesFor, pieces, studioHours, teamFor } from "@/lib/client-views";
import { greeting } from "@/lib/time";
import { HomeView } from "@/components/client/views";

export const metadata = { title: "Home" };

export default async function ClientHome({ searchParams }: { searchParams: Promise<{ piece?: string }> }) {
  const u = await requireUser(["client"]);
  const { brand, company } = await clientContext(u);
  const [list, inv, notices, team, openRequests, projects] = await Promise.all([
    pieces(u), invoicesFor(u), noticesFor(), teamFor(brand),
    db.workRequest.count({ where: { brandId: brand.id, status: { in: ["new", "answered", "on_hold"] } } }),
    db.project.findMany({ where: { brandId: brand.id, archivedAt: null }, select: { id: true, name: true, status: { select: { isDone: true } } } }),
  ]);
  const due = inv.filter((i) => i.open);
  const dueSum = "₹" + (due.reduce((s, i) => s + Number(i.totalPaise), 0) / 100).toLocaleString("en-IN");
  return (
    <HomeView greet={greeting()} first={u.firstName} brand={brand.name} pieces={list} projects={projects.map((p) => ({ id: p.id, name: p.name }))}
      activeProjects={projects.filter((p) => !p.status.isDone && list.some((t) => t.projectId === p.id && !t.done)).length}
      openRequests={openRequests} due={due.map((i) => ({ id: i.id, no: i.no, amount: i.amount, note: i.note, due: i.due }))} dueSum={dueSum} dueOn={due[0]?.due ?? ""}
      notices={notices} team={team} hours={studioHours(company)} initial={(await searchParams).piece} />
  );
}
