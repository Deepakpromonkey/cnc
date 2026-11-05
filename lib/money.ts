// Money is stored in paise (bigint). Display is rupees, Indian grouping.

export function toPaise(rupees: string | number) {
  const n = typeof rupees === "number" ? rupees : Number(String(rupees).replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n)) return BigInt(0);
  return BigInt(Math.round(n * 100));
}

export function rupees(paise: bigint | number) {
  return Number(paise) / 100;
}

/** ₹2,40,000 */
export function inr(paise: bigint | number) {
  const r = rupees(paise);
  return "₹" + r.toLocaleString("en-IN", { maximumFractionDigits: r % 1 ? 2 : 0 });
}

/** ₹8.1L */
export function lakh(paise: bigint | number) {
  return "₹" + (rupees(paise) / 100_000).toFixed(1) + "L";
}

export function gstSplit(subtotal: bigint, rate: number) {
  const gst = BigInt(Math.round((Number(subtotal) * rate) / 100));
  return { gst, total: subtotal + gst };
}
