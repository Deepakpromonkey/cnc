import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { brandScope } from "@/lib/queries";
import { audit } from "@/lib/events";
import { invoicePdf } from "@/lib/pdf";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await currentUser();
  if (!u) return new NextResponse("Sign in", { status: 401 });
  if (u.role === "employee") return new NextResponse("Forbidden", { status: 403 });
  const inv = await db.invoice.findUnique({ where: { id } });
  if (!inv) return new NextResponse("Not found", { status: 404 });
  const scope = await brandScope(u);
  if (scope && !scope.includes(inv.brandId)) return new NextResponse("Forbidden", { status: 403 });
  // Clients never see drafts.
  if (u.role === "client" && inv.status === "draft") return new NextResponse("Not found", { status: 404 });

  const pdf = await invoicePdf(id);
  await audit(db, u, "invoice.pdf.downloaded", "invoice", id);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(pdf.length),
      "Content-Disposition": `inline; filename="INV-${inv.number}${inv.status === "paid" ? "-receipt" : ""}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
