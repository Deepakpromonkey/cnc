// Background jobs (spec §2): BullMQ on Redis, schedules in Asia/Kolkata.
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import pino from "pino";
import { db } from "../lib/db";
import { closeYesterday, drainOutbox, eodChaser, invoicesNightly, lateTaskEvents, nightlyScores } from "./tasks";

const log = pino({ name: "worker" });
const TZ = "Asia/Kolkata";
const QUEUE = "cnc";
const connection = new IORedis(process.env.REDIS_URL || "redis://127.0.0.1:6379", { maxRetriesPerRequest: null });

const JOBS: Record<string, () => Promise<unknown>> = {
  "outbox.drain": drainOutbox,
  "attendance.close-day": closeYesterday,
  "scores.compute": nightlyScores,
  "invoices.nightly": invoicesNightly,
  "eod.chase": eodChaser,
  "tasks.late": lateTaskEvents,
};

const SCHEDULE: [string, { every: number } | { pattern: string; tz: string }][] = [
  ["outbox.drain", { every: 15_000 }],
  ["attendance.close-day", { pattern: "5 0 * * *", tz: TZ }],
  ["scores.compute", { pattern: "30 0 * * *", tz: TZ }],
  ["invoices.nightly", { pattern: "40 0 * * *", tz: TZ }],
  ["eod.chase", { pattern: "30 19 * * *", tz: TZ }],
  ["tasks.late", { pattern: "0 * * * *", tz: TZ }],
];

async function main() {
  const queue = new Queue(QUEUE, { connection });
  for (const [name, repeat] of SCHEDULE) {
    await queue.upsertJobScheduler(name, repeat, { name, opts: { removeOnComplete: 200, removeOnFail: 500, attempts: 3, backoff: { type: "exponential", delay: 30_000 } } });
  }
  const worker = new Worker(QUEUE, async (job) => {
    const fn = JOBS[job.name];
    if (!fn) throw new Error(`Unknown job ${job.name}`);
    const t = Date.now();
    const result = await fn();
    if (job.name !== "outbox.drain") log.info({ job: job.name, result, ms: Date.now() - t }, "done");
    return result;
  }, { connection, concurrency: 1 });
  worker.on("failed", (job, err) => log.error({ job: job?.name, err: err.message }, "failed"));
  log.info({ schedules: SCHEDULE.map(([n]) => n) }, "worker up");

  const stop = async () => {
    log.info("shutting down");
    await worker.close();
    await queue.close();
    await connection.quit();
    await db.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((e) => {
  log.error({ err: String(e) }, "worker crashed");
  process.exit(1);
});
