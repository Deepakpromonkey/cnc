import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { pieces } from "@/lib/client-views";
import { WorkView } from "@/components/client/views";

export const metadata = { title: "Work" };

export default async function Work({ searchParams }: { searchParams: Promise<{ piece?: string }> }) {
  const u = await requireUser(["client"]);
  const [list, projects] = await Promise.all([pieces(u), db.project.findMany({ where: { brandId: u.brandId!, archivedAt: null }, select: { id: true, name: true } })]);
  return <WorkView pieces={list} projects={projects} initial={(await searchParams).piece} />;
}
