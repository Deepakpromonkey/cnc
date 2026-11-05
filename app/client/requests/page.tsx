import { fullName, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requestsFor } from "@/lib/client-views";
import { RequestsView } from "@/components/client/views";

export const metadata = { title: "Requests" };

export default async function Requests({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  const u = await requireUser(["client"]);
  const [list, projects] = await Promise.all([requestsFor(u), db.project.findMany({ where: { brandId: u.brandId!, archivedAt: null, status: { isDone: false } }, select: { id: true, name: true } })]);
  return <RequestsView list={list} projects={projects} me={{ name: fullName(u), phone: u.mobile ?? "" }} initial={(await searchParams).r} />;
}
