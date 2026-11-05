import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { FilePurpose } from "@prisma/client";
import { db } from "./db";

// Spec §6.9: images only, 10 MB, mime + magic bytes, EXIF stripped, webp thumbs 320/1280.
// Local disk behind a Storage interface so S3-compatible storage can be swapped in.

export interface Storage {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
}

class DiskStorage implements Storage {
  constructor(private root: string) {}
  private p(key: string) {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(path.resolve(this.root))) throw new Error("bad key");
    return full;
  }
  async put(key: string, data: Buffer) {
    await mkdir(path.dirname(this.p(key)), { recursive: true });
    await writeFile(this.p(key), data);
  }
  get(key: string) { return readFile(this.p(key)); }
}

export const storage: Storage = new DiskStorage(process.env.UPLOAD_DIR || "/var/cnc/uploads");

export const MAX_BYTES = 10 * 1024 * 1024;

const SIGS: [string, (b: Buffer) => boolean][] = [
  ["image/jpeg", (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ["image/png", (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))],
  ["image/gif", (b) => b.subarray(0, 4).toString("ascii") === "GIF8"],
  ["image/webp", (b) => b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP"],
  ["image/svg+xml", (b) => /^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(b.subarray(0, 2048).toString("utf8"))],
];

function sniff(buf: Buffer) {
  return SIGS.find(([, test]) => test(buf))?.[0] ?? null;
}

export class UploadError extends Error {}

export async function saveImage(file: globalThis.File, purpose: FilePurpose, uploadedBy: string | null) {
  if (file.size > MAX_BYTES) throw new UploadError(`${file.name} is over 10 MB`);
  const raw = Buffer.from(await file.arrayBuffer());
  const mime = sniff(raw);
  if (!mime || (file.type && file.type !== mime && !(file.type === "image/jpg" && mime === "image/jpeg"))) {
    throw new UploadError(`${file.name} is not a JPG, PNG, WebP, SVG or GIF image`);
  }
  if (mime === "image/svg+xml" && /<script|on\w+\s*=|javascript:/i.test(raw.toString("utf8"))) {
    throw new UploadError(`${file.name} contains scripts`);
  }

  const id = randomUUID();
  const ym = new Date().toISOString().slice(0, 7);
  const ext = { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp", "image/svg+xml": "svg" }[mime];
  const base = `${purpose}/${ym}/${id}`;

  // Re-encode raster images: sharp drops EXIF/GPS unless asked to keep it.
  let stored = raw;
  if (mime === "image/jpeg" || mime === "image/png" || mime === "image/webp") {
    const img = sharp(raw).rotate();
    stored = await (mime === "image/jpeg" ? img.jpeg({ quality: 90 }) : mime === "image/png" ? img.png() : img.webp({ quality: 90 })).toBuffer();
  }
  const meta = await sharp(stored, { animated: false }).metadata();
  const thumb = (w: number) => sharp(stored, { animated: false }).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();

  await storage.put(`${base}.${ext}`, stored);
  await storage.put(`${base}.320.webp`, await thumb(320));
  await storage.put(`${base}.1280.webp`, await thumb(1280));

  return db.file.create({
    data: {
      id, storageKey: `${base}.${ext}`, originalName: file.name.slice(0, 200), mime, bytes: stored.length,
      width: meta.width ?? null, height: meta.height ?? null,
      thumb320Key: `${base}.320.webp`, thumb1280Key: `${base}.1280.webp`, uploadedBy, purpose,
    },
  });
}

export async function saveImages(files: globalThis.File[], purpose: FilePurpose, uploadedBy: string | null) {
  const out = [];
  for (const f of files.filter((f) => f && f.size)) out.push(await saveImage(f, purpose, uploadedBy));
  return out;
}

// ---- signed URLs (files are never public) ----
const secret = () => process.env.FILE_URL_SECRET || "dev-secret";
export type Variant = "o" | "320" | "1280";

function sign(id: string, v: Variant, exp: number) {
  return createHmac("sha256", secret()).update(`${id}.${v}.${exp}`).digest("base64url");
}

/** Hour-bucketed expiry keeps URLs stable within a render cache window. */
export function fileUrl(id: string | null | undefined, v: Variant = "320") {
  if (!id) return null;
  const exp = (Math.floor(Date.now() / 3_600_000) + 25) * 3600;
  return `/api/files/${id}?v=${v}&e=${exp}&s=${sign(id, v, exp)}`;
}

export function verifyFileSig(id: string, v: Variant, exp: number, sig: string) {
  if (exp * 1000 < Date.now()) return false;
  const a = Buffer.from(sign(id, v, exp));
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Form helper: every non-empty File for a field name. */
export function filesFrom(fd: FormData, name: string) {
  return fd.getAll(name).filter((f): f is globalThis.File => typeof f === "object" && f !== null && "size" in f && (f as globalThis.File).size > 0);
}

/** Validates an http(s) link; returns normalised string or null. */
export function cleanUrl(v: FormDataEntryValue | null | undefined) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const withProto = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withProto);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}
