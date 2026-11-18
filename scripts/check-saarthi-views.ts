// Spec §10.1 plumbing check for the Saarthi Staff assistant's per-viewer views
// (prisma/migrations/*_saarthi_staff_views). For every active non-client user it compares what
// each v_my_* view returns for viewer_id = that user with what the CRM's own code shows them:
// taskScope / brandScope / peopleScope from lib/queries.ts, and the page rules for invoices,
// requests, EOD and attendance (cited below). Clients and inactive users must get no rows, and
// sarthi_ro must read only the v_* and v_my_* views.
//   npm run check:saarthi-views   → per-user table, then "0 mismatches" or the differences (exit 1).
import { PrismaClient, type Role } from "@prisma/client";
import { db } from "../lib/db";
import { brandScope, peopleScope, taskScope, teamScope, type Viewer } from "../lib/queries";

const STAFF: Role[] = ["admin", "group_admin", "cs", "employee"];
const VIEWS = ["tasks", "brands", "people", "invoices", "requests", "eod", "attendance"] as const;
type ViewName = (typeof VIEWS)[number];

// Row keys: the id, or the natural key where the base view has no id (eod_log and attendance_day
// are unique on these columns).
const VIEW_SQL: Record<ViewName, string> = {
  tasks: "SELECT id::text AS k FROM v_my_tasks WHERE viewer_id = $1::uuid",
  brands: "SELECT id::text AS k FROM v_my_brands WHERE viewer_id = $1::uuid",
  people: "SELECT id::text AS k FROM v_my_people WHERE viewer_id = $1::uuid",
  invoices: "SELECT id::text AS k FROM v_my_invoices WHERE viewer_id = $1::uuid",
  requests: "SELECT id::text AS k FROM v_my_requests WHERE viewer_id = $1::uuid",
  eod: "SELECT user_id::text || '|' || task_id::text || '|' || to_char(date, 'YYYY-MM-DD') AS k FROM v_my_eod WHERE viewer_id = $1::uuid",
  attendance: "SELECT user_id::text || '|' || to_char(date, 'YYYY-MM-DD') AS k FROM v_my_attendance_days WHERE viewer_id = $1::uuid",
};
const SQL_NAME: Record<ViewName, string> = {
  tasks: "v_my_tasks", brands: "v_my_brands", people: "v_my_people", invoices: "v_my_invoices",
  requests: "v_my_requests", eod: "v_my_eod", attendance: "v_my_attendance_days",
};
const OLD_VIEWS = ["v_attendance_days", "v_brands", "v_eod", "v_invoices", "v_people", "v_requests", "v_tasks"];
const HELPERS = ["sarthi_viewer", "sarthi_team_scope", "sarthi_brand_scope", "sarthi_task_scope", "sarthi_staff_scope"];

const day = (d: Date) => d.toISOString().slice(0, 10);
const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

/** People whose working day the CRM shows this viewer (attendance pages, a CS's "My team", own EOD log). */
async function followed(u: Viewer): Promise<string[]> {
  if (u.role === "admin" || u.role === "group_admin") {
    // app/admin/attendance/page.tsx: active staff in teamScope (everyone for the super admin).
    const team = await teamScope(u);
    return ids(await db.user.findMany({ where: { role: { in: STAFF }, status: "active", ...(team ? { id: { in: team } } : {}) }, select: { id: true } }));
  }
  if (u.role === "cs") {
    // app/team/attendance + /team/eod (own) and lib/team-views.ts myTeam (active employees reporting to them).
    return [u.id, ...ids(await db.user.findMany({ where: { reportsToId: u.id, role: "employee", status: "active" }, select: { id: true } }))];
  }
  return [u.id]; // employee: /team/attendance, /team/eod
}

/** What the CRM's own code shows this viewer, as row keys per view. */
async function crmRows(u: Viewer): Promise<Record<ViewName, string[]>> {
  const [T, B, P, people] = await Promise.all([taskScope(u), brandScope(u), peopleScope(u), followed(u)]);
  const inBrands = B ? { brandId: { in: B } } : {};
  const money = u.role === "admin" || u.role === "cs";
  const tasks = await db.task.findMany({ where: T, select: { id: true } });
  const [brands, users, invoices, requests, eod, att] = await Promise.all([
    // app/admin/brands/page.tsx and lib/team-views.ts csBrands: the brand scope (employees: none).
    db.brand.findMany({ where: B ? { id: { in: B } } : {}, select: { id: true } }),
    db.user.findMany({ where: P, select: { id: true } }),
    // /admin/money is super-admin only; a CS sees their brands' invoices (My brands, invoice PDF route).
    // Group admins have no money pages, employees none. v_invoices leaves drafts out by design (§10.1).
    money ? db.invoice.findMany({ where: { ...inBrands, status: { not: "draft" } }, select: { id: true } }) : Promise.resolve([]),
    // /admin/requests and /team/requests: loadRequestVMs(brand scope). An employee's scope is empty.
    db.workRequest.findMany({ where: inBrands, select: { id: true } }),
    // Task drawers list every EOD line on a visible task (lib/views.ts taskVM); plus the followed people's lines.
    // (By task id: Prisma drops an empty relation filter like the super admin's `task: {}` inside an OR.)
    db.eodLog.findMany({ where: { OR: [{ taskId: { in: ids(tasks) } }, { userId: { in: people } }] }, select: { userId: true, taskId: true, date: true } }),
    db.attendanceDay.findMany({ where: { userId: { in: people } }, select: { userId: true, date: true } }),
  ]);
  return {
    tasks: ids(tasks), brands: ids(brands), people: ids(users), invoices: ids(invoices), requests: ids(requests),
    eod: eod.map((e) => `${e.userId}|${e.taskId}|${day(e.date)}`),
    attendance: att.map((a) => `${a.userId}|${day(a.date)}`),
  };
}

async function viewRows(viewerId: string): Promise<Record<ViewName, string[]>> {
  const out = await Promise.all(VIEWS.map((v) => db.$queryRawUnsafe<{ k: string }[]>(VIEW_SQL[v], viewerId)));
  return Object.fromEntries(VIEWS.map((v, i) => [v, out[i].map((r) => r.k)])) as Record<ViewName, string[]>;
}

type Diff = { who: string; view: ViewName; missing: string[]; extra: string[]; dupes: number };

function compare(who: string, view: ViewName, got: string[], want: string[]): Diff | null {
  const g = new Set(got), w = new Set(want);
  const missing = [...w].filter((k) => !g.has(k)), extra = [...g].filter((k) => !w.has(k));
  const dupes = got.length - g.size;
  return missing.length || extra.length || dupes ? { who, view, missing, extra, dupes } : null;
}

/** Runs one statement as sarthi_ro inside a rolled-back transaction (own client: the expected refusals aren't logged). */
async function asSarthiRo(probe: PrismaClient, sql: string, ...params: unknown[]): Promise<"ok" | "denied" | "no-set-role"> {
  const ROLLBACK = "rollback";
  let stage = "set";
  try {
    await probe.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL ROLE sarthi_ro");
      stage = "query";
      await tx.$queryRawUnsafe(sql, ...params);
      throw new Error(ROLLBACK);
    });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === ROLLBACK) return "ok";
    if (/permission denied/i.test(msg)) return stage === "set" ? "no-set-role" : "denied";
    throw e;
  }
  return "ok";
}

async function main() {
  const problems: string[] = [];
  const diffs: Diff[] = [];
  const [{ current_database: dbName }] = await db.$queryRawUnsafe<{ current_database: string }[]>("SELECT current_database()");

  const all = await db.user.findMany({ select: { id: true, loginId: true, role: true, status: true, brandId: true, groupId: true } });
  const viewers = all.filter((u) => u.status === "active" && u.role !== "client")
    .sort((a, b) => STAFF.indexOf(a.role) - STAFF.indexOf(b.role) || a.loginId.localeCompare(b.loginId));
  const byRole = STAFF.map((r) => `${viewers.filter((u) => u.role === r).length} ${r}`).join(", ");
  console.log(`Saarthi staff views · database ${dbName} · ${viewers.length} viewers (${byRole})\n`);

  const w = Math.max(5, ...viewers.map((u) => u.loginId.length)) + 2;
  const cols = VIEWS.map((v) => v.padStart(Math.max(v.length, 9))).join(" ");
  console.log(`${"login".padEnd(w)}${"role".padEnd(13)}${cols}`);
  for (const u of viewers) {
    const [got, want] = await Promise.all([viewRows(u.id), crmRows(u)]);
    let line = `${u.loginId.padEnd(w)}${u.role.padEnd(13)}`;
    for (const v of VIEWS) {
      const d = compare(u.loginId, v, got[v], want[v]);
      if (d) diffs.push(d);
      const cell = d ? `${got[v].length}≠${new Set(want[v]).size}` : String(got[v].length);
      line += cell.padStart(Math.max(v.length, 9)) + " ";
    }
    console.log(line + (diffs.some((d) => d.who === u.loginId) ? " ✗" : " ✓"));
  }

  // Nobody but an active staff member is ever a viewer (clients, inactive users, unknown ids).
  const viewerIds = new Set(viewers.map((u) => u.id));
  const clients = all.filter((u) => u.role === "client").length;
  const inactive = all.filter((u) => u.role !== "client" && u.status !== "active").length;
  for (const v of VIEWS) {
    const rows = await db.$queryRawUnsafe<{ viewer_id: string }[]>(`SELECT DISTINCT viewer_id::text AS viewer_id FROM ${SQL_NAME[v]}`);
    const strays = rows.filter((r) => !viewerIds.has(r.viewer_id));
    if (strays.length) problems.push(`${SQL_NAME[v]} has rows for ${strays.length} non-viewer(s): ${strays.slice(0, 5).map((r) => r.viewer_id).join(", ")}`);
  }
  console.log(`\nNon-viewers (${clients} clients, ${inactive} inactive staff): ${problems.length ? "see below" : "no rows in any v_my_* view ✓"}`);

  // sarthi_ro reads exactly the 7 v_* views and the 7 v_my_* views (helpers and tables stay closed).
  const readable = (await db.$queryRawUnsafe<{ relname: string }[]>(
    `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v', 'm', 'p', 'f') AND has_table_privilege('sarthi_ro', c.oid, 'SELECT')`,
  )).map((r) => r.relname).sort();
  const expected = [...OLD_VIEWS, ...VIEWS.map((v) => SQL_NAME[v])].sort();
  const grantsOk = readable.join() === expected.join();
  if (!grantsOk) problems.push(`sarthi_ro can read [${readable.join(", ")}], expected [${expected.join(", ")}]`);
  console.log(`sarthi_ro SELECT: ${readable.length} views${grantsOk ? " (7 v_* + 7 v_my_*), nothing else ✓" : " ✗"}`);

  // Views run with the owner's rights (security_invoker off), so sarthi_ro needs no grant on the helpers.
  const opts = await db.$queryRawUnsafe<{ relname: string; reloptions: string[] | null }[]>(
    `SELECT relname, reloptions FROM pg_class WHERE relkind = 'v' AND relname = ANY($1::text[])`, [...HELPERS, ...VIEWS.map((v) => SQL_NAME[v])],
  );
  const invoker = opts.filter((o) => (o.reloptions ?? []).some((x) => /^security_invoker=(true|on|yes|1)$/i.test(x))).map((o) => o.relname);
  if (opts.length !== HELPERS.length + VIEWS.length) problems.push(`expected ${HELPERS.length + VIEWS.length} new views, found ${opts.length}`);
  if (invoker.length) problems.push(`security_invoker is on for ${invoker.join(", ")}`);
  console.log(`security_invoker: off on all ${opts.length} new views${invoker.length ? " ✗" : " ✓"}`);

  // Live: as sarthi_ro the granted view works and a helper or table is refused.
  const probe = new PrismaClient();
  const someone = viewers[0]?.id ?? "00000000-0000-0000-0000-000000000000";
  const live = await asSarthiRo(probe, "SELECT count(*)::int AS n FROM v_my_tasks WHERE viewer_id = $1::uuid", someone);
  if (live === "no-set-role") console.log("as sarthi_ro: skipped (this database user can't SET ROLE sarthi_ro)");
  else {
    const helper = await asSarthiRo(probe, "SELECT 1 FROM sarthi_task_scope LIMIT 1");
    const table = await asSarthiRo(probe, "SELECT 1 FROM task LIMIT 1");
    const ok = live === "ok" && helper === "denied" && table === "denied";
    if (!ok) problems.push(`as sarthi_ro: v_my_tasks ${live}, sarthi_task_scope ${helper}, task ${table}`);
    console.log(`as sarthi_ro: v_my_tasks ${live === "ok" ? "readable" : live}; sarthi_task_scope ${helper}, task ${table}${ok ? " ✓" : " ✗"}`);
  }
  await probe.$disconnect();

  const total = diffs.length + problems.length;
  if (!total) {
    console.log("\n0 mismatches");
    return;
  }
  console.log(`\n${total} mismatch${total === 1 ? "" : "es"}:`);
  const few = (xs: string[]) => xs.slice(0, 6).join(", ") + (xs.length > 6 ? ` … +${xs.length - 6}` : "");
  for (const d of diffs) {
    console.log(`  ${d.who} · ${SQL_NAME[d.view]}:${d.missing.length ? ` missing ${d.missing.length} [${few(d.missing)}]` : ""}${d.extra.length ? ` extra ${d.extra.length} [${few(d.extra)}]` : ""}${d.dupes ? ` ${d.dupes} duplicate row(s)` : ""}`);
  }
  for (const p of problems) console.log(`  ${p}`);
  process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
