import { requireUser } from "@/lib/auth";
import { loadRequestVMs } from "@/lib/views";
import { brandScope } from "@/lib/queries";
import { RequestsView } from "@/components/admin/ops-views";

export const metadata = { title: "Work Requests" };

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  const u = await requireUser(["admin", "group_admin"]);
  const { r } = await searchParams;
  const B = await brandScope(u);
  const vms = await loadRequestVMs(B ? { brandId: { in: B } } : {});
  return <RequestsView rows={vms} initial={r ?? null} />;
}
