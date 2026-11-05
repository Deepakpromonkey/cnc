// One-shot nightly run (manual / cron fallback when the worker isn't up).
import { db } from "../lib/db";
import { closeYesterday, drainOutbox, invoicesNightly, nightlyScores } from "./tasks";

async function main() {
  const people = await closeYesterday();
  const scored = await nightlyScores();
  const inv = await invoicesNightly();
  await drainOutbox();
  console.log(`attendance closed for ${people} staff · scored ${scored} · ${inv.overdue} invoices marked overdue · ${inv.reminders} reminders queued`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
