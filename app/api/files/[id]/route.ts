import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { storage, verifyFileSig, type Variant } from "@/lib/storage";

// Files are never public: every URL is HMAC-signed with an expiry (spec §2, §6.9).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const q = new URL(req.url).searchParams;
  const v = (q.get("v") ?? "320") as Variant;
  const exp = Number(q.get("e"));
  const sig = q.get("s") ?? "";
  if (!["o", "320", "1280"].includes(v) || !Number.isFinite(exp) || !/^[0-9a-f-]{36}$/i.test(id) || !verifyFileSig(id, v, exp, sig)) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const f = await db.file.findUnique({ where: { id } });
  if (!f) return new NextResponse("Not found", { status: 404 });

  const key = v === "320" ? f.thumb320Key ?? f.storageKey : v === "1280" ? f.thumb1280Key ?? f.storageKey : f.storageKey;
  const mime = key === f.storageKey ? f.mime : "image/webp";
  let body: Buffer;
  try {
    body = await storage.get(key);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
  const headers: Record<string, string> = {
    "Content-Type": mime,
    "Content-Length": String(body.length),
    "Cache-Control": "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": `inline; filename="${encodeURIComponent(v === "o" ? f.originalName : `${f.id}.${v}.webp`)}"`,
  };
  if (mime === "image/svg+xml") headers["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
  return new NextResponse(new Uint8Array(body), { status: 200, headers });
}
