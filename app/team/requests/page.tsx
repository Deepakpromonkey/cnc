import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { brandScope } from "@/lib/queries";
import { loadRequestVMs } from "@/lib/views";
import { RequestsView } from "@/components/admin/ops-views";

export const metadata = { title: "Work requests" };

export default async function TeamRequests({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  const u = await requireUser(["cs", "employee"]);
  if (u.role !== "cs") redirect("/team");
  const { r } = await searchParams;
  const scope = (await brandScope(u)) ?? [];
  return <RequestsView rows={await loadRequestVMs({ brandId: { in: scope } })} initial={r ?? null} />;
}
