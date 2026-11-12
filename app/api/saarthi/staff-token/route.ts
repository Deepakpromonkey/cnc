import { NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { currentUser } from "@/lib/auth";
import { saarthiStaffConfig, signStaffToken } from "@/lib/saarthi-staff";

// Spec §10.3: the Saarthi Staff assistant asks this route for a fresh staff token whenever it signs
// in. Behind the CRM's own login, never cached, and never with CORS headers, so no other website can
// fetch a token with an employee's session.
export const dynamic = "force-dynamic";

const STAFF: Role[] = ["admin", "group_admin", "cs", "employee"];

const answer = (body: { token: string } | { error: string }, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET() {
  const u = await currentUser();
  if (!u) return answer({ error: "Sign in to the CRM first." }, 401);
  if (!STAFF.includes(u.role)) return answer({ error: "The assistant is for the team." }, 403);
  // An admin viewing as someone else must never ask as them.
  if (u.impersonatorId) return answer({ error: "Not while viewing as someone else." }, 403);
  if (!saarthiStaffConfig()) return answer({ error: "The Saarthi Staff assistant isn't set up." }, 503);
  return answer({ token: await signStaffToken(u) });
}
