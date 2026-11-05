import { requireUser } from "@/lib/auth";
import { clientContext, invoicesFor } from "@/lib/client-views";
import { MoneyView } from "@/components/client/views";

export const metadata = { title: "Invoices" };

export default async function Money({ searchParams }: { searchParams: Promise<{ inv?: string; paid?: string }> }) {
  const u = await requireUser(["client"]);
  const [{ brand }, list] = await Promise.all([clientContext(u), invoicesFor(u)]);
  const sp = await searchParams;
  const rates = [...new Set(list.map((i) => i.gstRate))];
  return <MoneyView list={list} terms={brand.paymentTerms ?? ""} gst={rates.length === 1 ? `GST ${rates[0]}%` : "GST 18%"} initial={sp.inv} justPaid={sp.paid === "1"} />;
}
