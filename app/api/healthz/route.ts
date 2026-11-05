import { NextResponse } from "next/server";
import Redis from "ioredis";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

async function pingRedis() {
  const r = new Redis(process.env.REDIS_URL || "redis://127.0.0.1:6379", { lazyConnect: true, connectTimeout: 1500, maxRetriesPerRequest: 0, enableOfflineQueue: false });
  r.on("error", () => {});
  try {
    await r.connect();
    return (await r.ping()) === "PONG";
  } catch {
    return false;
  } finally {
    r.disconnect();
  }
}

// DB down = not ok (503). Redis down is reported but non-fatal: the web app works without the worker.
export async function GET() {
  let dbOk = false;
  try {
    await db.$queryRaw`select 1`;
    dbOk = true;
  } catch { /* reported below */ }
  const redis = await pingRedis();
  return NextResponse.json({ ok: dbOk, db: dbOk, redis, time: new Date().toISOString() }, { status: dbOk ? 200 : 503 });
}
