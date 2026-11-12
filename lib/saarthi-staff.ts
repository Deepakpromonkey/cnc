import "server-only";
import { randomBytes } from "node:crypto";
import { SignJWT } from "jose";
import pino from "pino";
import { z } from "zod";

// Spec §10.3: the Saarthi Staff assistant. The CRM only vouches for who is at the keyboard (a short
// staff token signed with the staff secret); Saarthi's access groups decide what they may read.

const log = pino({ name: "saarthi-staff" });

const DEFAULT_URL = "https://api.mysarthi.tech";
const AUDIENCE = "saarthi-staff";
const TOKEN_SECONDS = 120; // Saarthi allows up to 15 minutes; each token works once anyway.

// Saarthi refuses a whole token whose email claim it can't read, so an odd legacy address is left out.
const saarthiEmail = z.email().max(254);

const staffSecret = () => process.env.SAARTHI_STAFF_SECRET?.trim() || "";

// A setting that can't work keeps the assistant off (the CRM's own Ask box stays), said once per process.
const warned = new Set<string>();
const off = (why: string) => {
  if (!warned.has(why)) log.warn(`${why}; the Saarthi Staff assistant stays off`);
  warned.add(why);
  return null;
};

/** Saarthi's origin ("https://api.mysarthi.tech"), or null when SAARTHI_STAFF_URL isn't one. */
function saarthiOrigin(raw: string) {
  try {
    const u = new URL(raw);
    // The script talks to the origin it was loaded from, so a path would point it elsewhere.
    if ((u.protocol === "https:" || u.protocol === "http:") && u.pathname.replace(/\/+$/, "") === "" && !u.search && !u.hash) return u.origin;
  } catch { /* not an address */ }
  return null;
}

/**
 * What the staff portals' pages need: Saarthi's address and the public staff key (`wst_…`).
 * Null, and the CRM keeps its own Ask box, unless both SAARTHI_STAFF_KEY and SAARTHI_STAFF_SECRET
 * are set (and the key and address are well-formed). The secret never leaves the server.
 */
export function saarthiStaffConfig(): { url: string; key: string } | null {
  const key = process.env.SAARTHI_STAFF_KEY?.trim();
  if (!key || !staffSecret()) return null;
  // The script ignores any other key, and the Ask box would hand questions to a panel that never appears.
  if (!key.startsWith("wst_")) return off("SAARTHI_STAFF_KEY must be the staff key (wst_…) from Saarthi's Staff assistant → Set up");
  const url = saarthiOrigin(process.env.SAARTHI_STAFF_URL?.trim() || DEFAULT_URL);
  if (!url) return off("SAARTHI_STAFF_URL must be an address like https://api.mysarthi.tech");
  return { url, key };
}

/**
 * A fresh staff token for the person signed in: HS256 with the staff secret, aud "saarthi-staff",
 * user_id (+ email), 2 minutes, and a new nonce every time (Saarthi accepts each token once).
 */
export async function signStaffToken(user: { id: string; email?: string | null }): Promise<string> {
  const secret = staffSecret();
  if (!secret) throw new Error("The Saarthi Staff assistant isn't set up");
  const email = user.email?.trim();
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    user_id: user.id,
    ...(email && saarthiEmail.safeParse(email).success ? { email } : {}),
    nonce: randomBytes(18).toString("base64url"),
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setAudience(AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + TOKEN_SECONDS)
    .sign(new TextEncoder().encode(secret));
}
