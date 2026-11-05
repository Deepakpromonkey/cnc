import "server-only";
import path from "node:path";
import PDFDocument from "pdfkit";
import { db } from "./db";
import { inr } from "./money";
import { fmtDate, fmtDayYear } from "./time";

const CRIMSON = "#a0202a", ESPRESSO = "#1e1517", MUTED = "#7a6860", LINE = "#e6dccf";

/** Simple branded invoice / receipt (§9 Invoices). Built-in Helvetica keeps it dependency-free. */
export async function invoicePdf(id: string): Promise<Buffer> {
  const inv = await db.invoice.findUniqueOrThrow({ where: { id }, include: { brand: true, items: true, payments: true } });
  const co = await db.company.findFirst();
  const doc = new PDFDocument({ size: "A4", margin: 48 });
  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise<Buffer>((r) => doc.on("end", () => r(Buffer.concat(chunks))));

  try {
    // webp isn't supported by pdfkit; fall back to a wordmark.
    doc.font("Helvetica-Bold").fontSize(20).fillColor(CRIMSON).text("Coffee & Creative", 48, 48);
  } catch { /* ignore */ }
  doc.font("Helvetica").fontSize(9).fillColor(MUTED)
    .text(co?.legalName ?? "Coffee & Creative Pvt. Ltd.", 48, 74)
    .text([co?.address, co?.city, co?.state, co?.pincode].filter(Boolean).join(", "))
    .text(`GSTIN ${co?.gstin ?? "—"}`);

  const paid = inv.status === "paid";
  doc.font("Helvetica-Bold").fontSize(26).fillColor(ESPRESSO).text(paid ? "Receipt" : "Tax invoice", 300, 48, { width: 247, align: "right" });
  doc.font("Helvetica").fontSize(10).fillColor(MUTED)
    .text(`INV-${inv.number}`, 300, 82, { width: 247, align: "right" })
    .text(`Issued ${fmtDate(inv.issueDate, true)}`, { width: 247, align: "right" })
    .text(`Due ${fmtDate(inv.dueDate, true)}`, { width: 247, align: "right" });

  doc.moveTo(48, 140).lineTo(547, 140).strokeColor(LINE).stroke();
  doc.font("Helvetica-Bold").fontSize(9).fillColor(MUTED).text("BILL TO", 48, 156);
  doc.font("Helvetica-Bold").fontSize(12).fillColor(ESPRESSO).text(inv.brand.companyName ?? inv.brand.name, 48, 170);
  doc.font("Helvetica").fontSize(9).fillColor(MUTED)
    .text([inv.brand.address, inv.brand.city, inv.brand.state, inv.brand.pincode].filter(Boolean).join(", ") || " ")
    .text(`GSTIN ${inv.brand.gstin ?? "—"}`);

  let y = 240;
  doc.font("Helvetica-Bold").fontSize(9).fillColor(MUTED);
  doc.text("DESCRIPTION", 48, y).text("QTY", 340, y, { width: 40, align: "right" }).text("RATE", 390, y, { width: 70, align: "right" }).text("AMOUNT", 470, y, { width: 77, align: "right" });
  y += 16;
  doc.moveTo(48, y).lineTo(547, y).strokeColor(LINE).stroke();
  y += 8;
  doc.font("Helvetica").fontSize(10).fillColor(ESPRESSO);
  for (const it of inv.items) {
    const h = doc.heightOfString(it.description, { width: 280 });
    doc.text(it.description, 48, y, { width: 280 }).text(String(Number(it.qty)), 340, y, { width: 40, align: "right" })
      .text(inr(it.unitPaise), 390, y, { width: 70, align: "right" }).text(inr(it.amountPaise), 470, y, { width: 77, align: "right" });
    y += Math.max(h, 14) + 8;
  }
  doc.moveTo(48, y).lineTo(547, y).strokeColor(LINE).stroke();
  y += 10;
  const rate = Number(inv.gstRate);
  const intra = (inv.brand.gstin ?? "").slice(0, 2) === (co?.gstin ?? "").slice(0, 2);
  const rows: [string, string][] = [["Subtotal", inr(inv.subtotalPaise)]];
  if (rate === 0) rows.push(["GST (export, 0%)", inr(0)]);
  else if (intra) rows.push([`CGST ${rate / 2}%`, inr(inv.gstPaise / BigInt(2))], [`SGST ${rate / 2}%`, inr(inv.gstPaise - inv.gstPaise / BigInt(2))]);
  else rows.push([`IGST ${rate}%`, inr(inv.gstPaise)]);
  for (const [l, v] of rows) { doc.fontSize(10).fillColor(MUTED).text(l, 340, y, { width: 120, align: "right" }).fillColor(ESPRESSO).text(v, 470, y, { width: 77, align: "right" }); y += 16; }
  doc.font("Helvetica-Bold").fontSize(13).fillColor(CRIMSON).text("Total", 340, y + 4, { width: 120, align: "right" }).text(inr(inv.totalPaise), 450, y + 4, { width: 97, align: "right" });
  y += 40;

  const paidSum = inv.payments.reduce((s, p) => s + p.amountPaise, BigInt(0));
  doc.font("Helvetica-Bold").fontSize(9).fillColor(MUTED).text("PAYMENT STATUS", 48, y);
  doc.font("Helvetica").fontSize(10).fillColor(paid ? "#9a7a3e" : CRIMSON)
    .text(paid ? `Paid in full${inv.paidAt ? ` on ${fmtDayYear(inv.paidAt)}` : ""} · ${inv.payments.map((p) => p.method.toUpperCase()).join(", ")}` : paidSum > BigInt(0) ? `Part paid ${inr(paidSum)} · balance ${inr(inv.totalPaise - paidSum)}` : `Unpaid · ${inv.status === "void" ? "VOID" : `pay at ${inv.razorpayShortUrl ?? "your client portal"}`}`, 48, y + 14, { width: 499 });
  if (inv.notes) doc.fillColor(MUTED).fontSize(9).text(inv.notes, 48, y + 40, { width: 499 });
  doc.fontSize(8).fillColor(MUTED).text("Coffee & Creative · lets brew thoughts", 48, 770, { width: 499, align: "center", lineBreak: false });
  void path;
  doc.end();
  return done;
}
