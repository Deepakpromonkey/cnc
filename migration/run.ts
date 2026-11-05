/* Legacy CRM (MySQL dump) → CNC CRM v2 (Postgres). Spec §5 mapping, §12 plan.
 *
 *   LEGACY_MYSQL_URL=mysql://root@localhost/legacy?socketPath=/tmp/cnc-legacy.sock \
 *   MIGRATION_TARGET_URL=postgresql://…/cnc_migrate npm run migrate:legacy
 *
 * Writes into an EMPTY target database (refuses otherwise), keeps legacy_row_id / legacy_id on
 * every row it can, and produces migration/report.md + migration/out/*.csv. Never copies
 * passwords. Re-runnable: drop and recreate the target, run again.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";
import { PrismaClient, type Prisma, type Role } from "@prisma/client";
import { EXCLUDE, HOLIDAY_AS_NOTICE } from "./exclusions";
import { blank, concernCategory, parseDeadline, priority, sentence, smartCase, statusName, stripHtml } from "./rules";

const TARGET = process.env.MIGRATION_TARGET_URL;
const SOURCE = process.env.LEGACY_MYSQL_URL;
if (!TARGET || !SOURCE) throw new Error("Set LEGACY_MYSQL_URL and MIGRATION_TARGET_URL");
if (TARGET === process.env.DATABASE_URL && !process.argv.includes("--into-app-db")) throw new Error("Target is the app database. Use a separate database, or pass --into-app-db on go-live night.");
process.env.DATABASE_URL = TARGET;
/** Opt-in: `--close-stale-days=30` closes open tasks that are more than N days past deadline. */
const CLOSE_STALE_DAYS = Number(process.argv.find((a) => a.startsWith("--close-stale-days="))?.split("=")[1] ?? 0) || 0;
const MIGRATION_AT = new Date(); // lib/* singletons (attendance) must write to the target too

const db = new PrismaClient({ datasources: { db: { url: TARGET } } });
const OUT = path.join(__dirname, "out");
const OFFSET = 330 * 60_000;

type Row = Record<string, unknown> & { id: number; row_id: string };
const S = (v: unknown) => (v === null || v === undefined ? "" : String(v));
/** Legacy system timestamps are UTC (verified from login-hour distribution, §12.6). */
const utc = (v: unknown) => (v ? new Date(`${S(v).replace(" ", "T")}Z`) : null);
/** Legacy DATE / user-entered datetime → IST calendar day "yyyy-mm-dd". */
const dayOf = (v: unknown) => (v ? S(v).slice(0, 10) : null);
const istDay = (d: Date) => new Date(d.getTime() + OFFSET).toISOString().slice(0, 10);
const dateOnly = (k: string | null) => (k ? new Date(`${k}T00:00:00Z`) : null);
const fromIst = (k: string, t: string) => new Date(`${k}T${t}:00+05:30`);

// ---------------- report ----------------
type Count = { source: number; created: number; skipped: Record<string, number> };
const counts = new Map<string, Count>();
const notes: string[] = [];
const issues = new Map<string, string[]>();
function count(table: string, source: number) { counts.set(table, { source, created: 0, skipped: {} }); }
function created(table: string, n = 1) { counts.get(table)!.created += n; }
function skip(table: string, reason: string, n = 1) { const c = counts.get(table)!; c.skipped[reason] = (c.skipped[reason] ?? 0) + n; }
function issue(group: string, line: string) { issues.set(group, [...(issues.get(group) ?? []), line]); }
const csv: Record<string, string[][]> = {};
function csvRow(file: string, row: (string | number | null)[]) { (csv[file] ??= []).push(row.map((x) => S(x))); }

async function main() {
  // Raw strings for DATE/DATETIME: mysql2 would otherwise reinterpret them in the local timezone.
  const my = await mysql.createConnection({ uri: SOURCE!, dateStrings: true });
  const q = async <T = Row>(sql: string) => (await my.query(sql))[0] as T[];

  for (const t of ["user", "brand", "task", "company"] as const) {
    const n = await (db[t] as unknown as { count: () => Promise<number> }).count();
    if (n) throw new Error(`Target is not empty (${t} has ${n} rows). Recreate it and run again.`);
  }

  // ================= 0. config the dump doesn't carry =================
  await db.company.create({ data: { legalName: "Coffee & Creative Pvt. Ltd.", brandName: "Coffee & Creative", city: "Noida", state: "Uttar Pradesh", country: "India", portalUrl: "app.coffeeandcreative.in" } });
  const STATUSES = [
    { name: "New", tone: "crimson", isStart: true }, { name: "Progressing", tone: "neutral" }, { name: "In review", tone: "gold", isReview: true },
    { name: "Review rejected", tone: "crimson", isRejected: true }, { name: "Awaiting client", tone: "muted", isClientGate: true }, { name: "Completed", tone: "gold", isDone: true },
  ] as const;
  const status = new Map<string, string>();
  for (const [i, s] of STATUSES.entries()) status.set(s.name, (await db.taskStatus.create({ data: { ...s, order: i } })).id);
  await db.scoringWeight.createMany({ data: [["on_time", 25], ["review_pass", 20], ["cs_rating", 20], ["eod", 10], ["attendance", 10], ["client_approval", 5], ["throughput", 5], ["rework", 5]].map(([p, w]) => ({ parameter: p as never, weight: w as number })) });
  const SERVICING = ["Design", "Copy", "Video", "Motion", "Packaging", "Print production", "Social media", "Web"];
  for (const n of SERVICING) await db.servicingType.create({ data: { name: n } });
  notes.push("Company row, the 6 task statuses, scoring weights and servicing types are seeded defaults: the legacy `servicing` and `tasks_titles` tables are empty, and `status_list` mixes task and request states (mapped per §12.3).");

  // ================= 1. lookups =================
  const legacyDepts = await q("SELECT * FROM departments ORDER BY id");
  count("departments → department", legacyDepts.length);
  const dept = new Map<string, string>(); // legacy row_id → new id
  const deptByName = new Map<string, string>();
  for (const d of legacyDepts) {
    const nm = smartCase(S(d.name));
    const key = nm.toLowerCase();
    if (!deptByName.has(key)) { deptByName.set(key, (await db.department.create({ data: { name: nm, order: deptByName.size } })).id); created("departments → department"); }
    else skip("departments → department", "duplicate name merged (e.g. “creative director” ×2)");
    dept.set(d.row_id, deptByName.get(key)!);
  }
  const mgmt = (await db.department.create({ data: { name: "Management", order: 99 } })).id;

  const legacyScope = await q("SELECT * FROM scope_of_work ORDER BY id");
  count("scope_of_work → scope_of_work", legacyScope.length);
  const scope = new Map<string, string>();
  const scopeByName = new Map<string, string>();
  for (const s of legacyScope) {
    const nm = S(s.name).trim().replace(/\s+/g, " ");
    const key = nm.toLowerCase();
    if (!nm) { skip("scope_of_work → scope_of_work", "empty name"); continue; }
    if (!scopeByName.has(key)) { scopeByName.set(key, (await db.scopeOfWork.create({ data: { name: nm } })).id); created("scope_of_work → scope_of_work"); }
    else skip("scope_of_work → scope_of_work", "duplicate name merged");
    scope.set(s.row_id, scopeByName.get(key)!);
  }

  const titles = new Map<string, string>();
  const titleId = async (raw: string) => {
    const nm = smartCase(raw) || "Other";
    if (!titles.has(nm.toLowerCase())) titles.set(nm.toLowerCase(), (await db.taskTitle.create({ data: { name: nm } })).id);
    return titles.get(nm.toLowerCase())!;
  };
  for (const n of ["Static post", "Carousel", "Reel", "Story set", "Campaign film", "Packaging dieline", "Brochure", "Hoarding", "Copy", "Catalogue", "Retouching", "Logo lockup", "Menu", "Report deck", "A+ content", "Other"]) await titleId(n);

  const flagType = new Map<string, { id: string; points: number; name: string }>();
  const legacyFlags = await q("SELECT * FROM flags");
  count("flags → flag_type", legacyFlags.length);
  const FLAG_MAP: Record<string, { name: string; colour: "gold" | "crimson" | "muted"; points: number; note: string }> = {
    red: { name: "Red flag", colour: "crimson", points: -8, note: "Missed commitments, repeated lateness" },
    green: { name: "Praise", colour: "gold", points: 5, note: "+3 from CS · +5 from admin" },
    blue: { name: "Client concern", colour: "muted", points: -10, note: "Raised from client feedback" },
  };
  for (const f of legacyFlags) {
    const m = FLAG_MAP[S(f.name).toLowerCase()];
    if (!m) { skip("flags → flag_type", `unknown colour ${f.name}`); continue; }
    const r = await db.flagType.create({ data: { name: m.name, colour: m.colour, points: m.points, note: m.note } });
    flagType.set(f.row_id, { id: r.id, points: m.points, name: m.name });
    created("flags → flag_type");
  }

  // ================= 2. users (staff) =================
  const legacyUsers = await q("SELECT * FROM users ORDER BY id");
  count("users → user (staff)", legacyUsers.length);
  const user = new Map<string, { id: string; role: Role; name: string; dept: string | null; legacyId: number }>();
  const taken = new Set<string>();
  const csDeptFixed: string[] = [];
  const uniq = (v: string) => { let x = v.toLowerCase(); let i = 2; while (taken.has(x)) x = v.toLowerCase().replace("@", `+${i++}@`); taken.add(x); return x; };
  for (const u of legacyUsers) {
    if (EXCLUDE.users[u.id]) { skip("users → user (staff)", "test account (exclusions.ts)"); issue("Excluded users", `#${u.id} ${EXCLUDE.users[u.id]}`); continue; }
    const role = (["admin", "cs", "employee"].includes(S(u.role)) ? S(u.role) : "employee") as Role;
    const email = blank(S(u.email)) ?? `${u.row_id}@legacy.invalid`;
    const emailKey = taken.has(email.toLowerCase()) ? uniq(email) : (taken.add(email.toLowerCase()), email.toLowerCase());
    const loginRaw = blank(S(u.login_id)) ?? emailKey;
    const loginKey = taken.has(loginRaw.toLowerCase()) && loginRaw.toLowerCase() !== emailKey ? uniq(loginRaw) : (taken.add(loginRaw.toLowerCase()), loginRaw.toLowerCase());
    const first = smartCase(S(u.first_name), true), last = smartCase(S(u.last_name), true);
    const inactive = EXCLUDE.inactiveUsers[u.id];
    const r = await db.user.create({
      data: {
        firstName: first || "—", lastName: last, email: emailKey, loginId: loginKey, role, passwordHash: null,
        departmentId: dept.get(S(u.department_id)) ?? (role === "admin" ? mgmt : role === "cs" ? deptByName.get("client servicing") ?? null : null), designation: smartCase(S(u.designation)) || null,
        gender: S(u.gender).toLowerCase() === "male" ? "male" : S(u.gender).toLowerCase() === "female" ? "female" : null,
        dob: u.dob ? dateOnly(dayOf(u.dob)) : null, mobile: blank(S(u.mobile)), whatsappNo: blank(S(u.whatsapp_no)) ?? blank(S(u.mobile)),
        personalEmail: blank(S(u.personal_email)), personalContact: blank(S(u.personal_contact)), address: blank(S(u.address)),
        city: smartCase(S(u.city)) || null, state: smartCase(S(u.state)) || null, pincode: blank(S(u.pincode)), country: blank(S(u.country)) ?? "India",
        linkedin: blank(S(u.linkedin)), facebook: blank(S(u.facebook)), instagram: blank(S(u.instagram)),
        status: inactive ? "inactive" : "active", legacyRowId: u.row_id, legacyId: u.id, createdAt: utc(u.created_at) ?? new Date(),
      },
    });
    user.set(u.row_id, { id: r.id, role, name: `${first} ${last}`.trim(), dept: r.departmentId, legacyId: u.id });
    created("users → user (staff)");
    if (inactive) issue("Migrated as INACTIVE — confirm", `#${u.id} ${inactive}`);
    if (blank(S(u.image))) csvRow("legacy-images.csv", ["user", u.id, `${first} ${last}`, S(u.image)]);
    if (!dept.get(S(u.department_id)) && role === "cs") csDeptFixed.push(`${first} ${last}`);
    else if (!dept.get(S(u.department_id)) && role !== "admin") issue("Users without a department", `#${u.id} ${first} ${last}`);
  }
  if (csDeptFixed.length) notes.push(`${csDeptFixed.length} CS staff pointed at a department id that no longer exists in the old \`departments\` table (deleted “Client Servicing” row); they are placed in Client Servicing.`);
  notes.push("Passwords are not migrated (spec §2). Every migrated login has no password and must use the invite/reset email on go-live.");
  notes.push("Names stored in ALL CAPS (users, brands, POCs) are converted to Title Case; acronyms like RPS, TCS, LLP stay upper-case. Emails are lower-cased.");

  // Deleted ex-staff still referenced by tasks, history, attendance and brand CS lists.
  const refs = await q<{ rid: string; kind: string; n: number }>(`
    SELECT rid, kind, COUNT(*) n FROM (
      SELECT servicing_id rid, 'cs' kind FROM tasks UNION ALL SELECT user_id, 'creator' FROM tasks UNION ALL
      SELECT status_by, 'history' FROM tasks_status UNION ALL SELECT employee_id, 'assignee' FROM tasks_employees UNION ALL
      SELECT employee_id, 'eod' FROM employees_tasks_status UNION ALL SELECT employee_id, 'login' FROM employees_login_logs UNION ALL
      SELECT employee_id, 'attendance' FROM employees_attendances UNION ALL SELECT user_id, 'concern' FROM concerns UNION ALL
      SELECT employee_id, 'flag' FROM flags_employees
    ) x WHERE rid <> '' GROUP BY rid, kind`);
  const brandCsRaw = await q<{ cs: string }>("SELECT cs FROM brands");
  const csRefs = new Set(brandCsRaw.flatMap((b) => S(b.cs).split(",").map((s) => s.trim()).filter(Boolean)));
  const unknown = [...new Set([...refs.map((r) => r.rid), ...csRefs])].filter((rid) => !user.has(rid) && !legacyUsers.some((u) => u.row_id === rid));
  const notifTypes = await q<{ receiver: string; receiver_type: string }>("SELECT DISTINCT receiver, receiver_type FROM notifications");
  count("former staff → placeholder users", unknown.length);
  let k = 0;
  for (const rid of unknown) {
    const isCs = csRefs.has(rid) || refs.some((r) => r.rid === rid && r.kind === "cs") || notifTypes.some((n) => n.receiver === rid && n.receiver_type === "cs");
    const role: Role = isCs ? "cs" : "employee";
    const label = `Former ${isCs ? "CS" : "team member"} ${++k}`;
    const r = await db.user.create({ data: { firstName: label, lastName: "(legacy)", email: `former-${rid.slice(0, 8)}@legacy.invalid`, loginId: `former-${rid.slice(0, 8)}`, role, status: "inactive", legacyRowId: rid, designation: "Left before migration" } });
    user.set(rid, { id: r.id, role, name: label, dept: null, legacyId: 0 });
    created("former staff → placeholder users");
    const touched = refs.filter((x) => x.rid === rid).map((x) => `${x.n} ${x.kind}`).join(", ");
    const brands = (await q<{ brand_name: string }>(`SELECT brand_name FROM brands WHERE cs LIKE '%${rid}%'`)).map((b) => smartCase(b.brand_name));
    issue("Former staff (deleted in the old CRM) — please name them", `**${label}** · legacy id \`${rid}\` · ${touched || "no rows"}${brands.length ? ` · CS on ${brands.join(", ")}` : ""}`);
  }
  const system = await db.user.create({ data: { firstName: "Legacy CRM", lastName: "(import)", email: "legacy-import@legacy.invalid", loginId: "legacy-import", role: "admin", status: "inactive", designation: "Stands in where the old CRM didn't record who did it" } });
  const uid = (rid: unknown) => user.get(S(rid))?.id ?? null;
  const admins = [...user.values()].filter((u) => u.role === "admin");
  const vipin = [...user.values()].find((u) => u.name.startsWith("Vipin"))!;
  const nitin = [...user.values()].find((u) => u.name.startsWith("Nitin"));
  await db.setting.createMany({
    data: [
      { key: "payment_terms_options", value: ["7th of every month", "5th of every month", "30th of every month", "25th of every month", "Completion of the work", "30 days", "50% advance, 50% on delivery"] },
      { key: "praise_cs_points", value: 3 }, { key: "praise_admin_points", value: 5 }, { key: "score_visible_to_employee", value: true },
      { key: "hr_user_id", value: nitin?.id ?? vipin.id }, { key: "submit_requires_attachment", value: true }, { key: "client_rejection_creates_flag", value: false },
      { key: "digest_time", value: "09:00" }, { key: "nudge_interval_hours", value: 2 }, { key: "eod_chase_time", value: "19:30" },
      { key: "reminder_schedule", value: { before_days: 3, on_due: true, every_days: 5 } },
      { key: "sarthi_automations", value: { digest: true, nudges: true, qa: true, invoice_reminders: true, eod_chaser: true, weekly_note: false } },
    ],
  });

  // ================= 3. brands + brand_cs + brand_scope + client logins =================
  const legacyBrands = await q("SELECT * FROM brands ORDER BY id");
  count("brands → brand", legacyBrands.length);
  count("brands.cs → brand_cs", 0);
  count("brands.scope_of_work → brand_scope", 0);
  count("brands.email → user (client login)", 0);
  const brand = new Map<string, { id: string; name: string; primaryCs: string | null; client: string | null; legacyId: number }>();
  const FREQ: Record<string, "monthly_retainer" | "quarterly" | "yearly" | "project_based"> = { monthly: "monthly_retainer", quarterly: "quarterly", yearly: "yearly", "project based": "project_based" };
  for (const b of legacyBrands) {
    if (EXCLUDE.brands[b.id]) { skip("brands → brand", "junk/test brand (exclusions.ts)"); issue("Excluded brands", `#${b.id} ${EXCLUDE.brands[b.id]}`); continue; }
    const name = smartCase(S(b.brand_name));
    const freq = FREQ[S(b.freguency).toLowerCase()];
    if (!freq) issue("Data to check", `Brand ${name}: frequency “${S(b.freguency)}” not recognised → monthly retainer`);
    const r = await db.brand.create({
      data: {
        name, companyName: smartCase(S(b.company_name)) || name, division: blank(S(b.division)), address: blank(S(b.company_address)),
        city: smartCase(S(b.city)) || null, state: smartCase(S(b.state)) || null, pincode: blank(S(b.pincode)), country: blank(S(b.country)) ?? "India",
        frequency: freq ?? "monthly_retainer", paymentTerms: sentence(S(b.payment_terms)), officialEmail: blank(S(b.official_email_id))?.toLowerCase() ?? null,
        whatsapp: blank(S(b.whatsapp)), website: blank(S(b.website)), twitter: blank(S(b.twitter)), linkedin: blank(S(b.linkedin)), facebook: blank(S(b.facebook)),
        instagram: blank(S(b.instagram)), otherSocialLink: blank(S(b.other_social_link)), pocName: smartCase(S(b.poc)) || null, pocPhone: blank(S(b.poc_phone_no)),
        vatNumber: blank(S(b.vat_number)), gstin: blank(S(b.gst))?.toUpperCase() ?? null, additionalInformation: blank(S(b.additional_information)),
        status: "active", legacyRowId: b.row_id, createdAt: utc(b.created_at) ?? new Date(),
        preferences: { daily_digest: true, approval_pings: true, invoice_emails: true, weekly_summary: false, sarthi_qa: true },
      },
    });
    created("brands → brand");
    if (blank(S(b.image))) csvRow("legacy-images.csv", ["brand logo", b.id, name, S(b.image)]);
    if (!blank(S(b.gst))) issue("Data to check", `Brand ${name}: GST is “${S(b.gst)}” → left empty`);

    // CS comma list → brand_cs; the first *current* person is primary.
    const csIds = S(b.cs).split(",").map((s) => s.trim()).filter(Boolean);
    let primary: string | null = null;
    const live = csIds.filter((id) => user.get(id) && !user.get(id)!.name.startsWith("Former"));
    for (const rid of csIds) {
      const u = user.get(rid);
      if (!u) { skip("brands.cs → brand_cs", "CS id not found"); issue("Unmatched references", `Brand ${name}: CS \`${rid}\``); continue; }
      const isPrimary = rid === (live[0] ?? csIds[0]);
      await db.brandCs.create({ data: { brandId: r.id, userId: u.id, isPrimary } });
      if (isPrimary) primary = u.id;
      created("brands.cs → brand_cs");
    }
    if (csIds[0] && live[0] && csIds[0] !== live[0]) issue("Data to check", `Brand ${name}: first-listed CS has left — ${user.get(live[0])?.name} made primary`);

    for (const sid of S(b.scope_of_work).split(",").map((s) => s.trim()).filter(Boolean)) {
      const s = scope.get(sid);
      if (!s) { skip("brands.scope_of_work → brand_scope", "scope id not found"); issue("Unmatched references", `Brand ${name}: scope \`${sid}\``); continue; }
      await db.brandScope.create({ data: { brandId: r.id, scopeOfWorkId: s } }).catch(() => skip("brands.scope_of_work → brand_scope", "duplicate"));
      created("brands.scope_of_work → brand_scope");
    }

    // email + password → one client login; password is NOT migrated (forced reset).
    let clientId: string | null = null;
    const login = blank(S(b.email))?.toLowerCase();
    if (login) {
      let email = login;
      if (taken.has(email)) {
        const alt = blank(S(b.official_email_id))?.toLowerCase();
        const clash = [...user.values()].find((u) => u.legacyId && legacyUsers.find((x) => x.id === u.legacyId && [S(x.email).toLowerCase(), S(x.login_id).toLowerCase()].includes(login)));
        email = alt && !taken.has(alt) ? alt : uniq(login);
        issue("Login clashes", `${name}: client login **${login}** is also ${clash ? `${clash.name}'s staff login` : "used by another account"} → client login set to **${email}**`);
      }
      taken.add(email);
      const [first, ...rest] = (smartCase(S(b.poc)) || `${name} Team`).split(" ");
      const c = await db.user.create({ data: { firstName: first, lastName: rest.join(" "), email, loginId: email, role: "client", brandId: r.id, mobile: blank(S(b.poc_phone_no)), whatsappNo: blank(S(b.whatsapp)) ?? blank(S(b.poc_phone_no)), designation: `Client · ${name}`, legacyRowId: b.row_id, createdAt: utc(b.created_at) ?? new Date() } });
      clientId = c.id;
      created("brands.email → user (client login)");
    }
    brand.set(b.row_id, { id: r.id, name, primaryCs: primary, client: clientId, legacyId: b.id });
  }

  // ================= 4. projects =================
  const legacyProjects = await q("SELECT * FROM projects ORDER BY id");
  count("projects → project", legacyProjects.length);
  count("projects.scope_of_work → project_scope", 0);
  const project = new Map<string, { id: string; brand: string }>();
  for (const p of legacyProjects) {
    if (EXCLUDE.projects[p.id]) { skip("projects → project", "test/junk project (exclusions.ts)"); issue("Excluded projects", `#${p.id} ${EXCLUDE.projects[p.id]}`); continue; }
    const b = brand.get(S(p.brand_id));
    if (!b) { skip("projects → project", "brand excluded or missing"); issue("Skipped — brand missing", `Project #${p.id} “${S(p.project_name)}”`); continue; }
    const start = dayOf(p.start_date), end = dayOf(p.deadline);
    if (start && end && end < start) issue("Data to check", `Project “${S(p.project_name)}” (${b.name}): deadline ${end} is before start ${start}`);
    const terms = blank(S(p.payment_terms));
    if (terms && /^[b-df-hj-np-tv-z]{5,}$/i.test(terms)) issue("Data to check", `Project “${S(p.project_name)}”: payment terms “${terms}” look like keyboard mash`);
    const r = await db.project.create({
      data: {
        brandId: b.id, name: S(p.project_name).trim() || "Untitled", brandPoc: smartCase(S(p.brand_pco)) || null, pocPhone: blank(S(p.pco_phone_no)),
        type: blank(S(p.project_type)), subType: blank(S(p.project_sub_type)), description: blank(S(p.project_description)),
        startDate: dateOnly(start), deadline: dateOnly(end), referenceLink1: blank(S(p.reference_link1)), referenceLink2: blank(S(p.reference_link2)), referenceLink3: blank(S(p.reference_link3)),
        paymentTerms: terms, priority: priority(S(p.priority)), statusId: status.get("Progressing")!, legacyRowId: p.row_id,
        createdAt: utc(p.added_on) ?? new Date(), createdBy: vipin.id,
      },
    });
    project.set(p.row_id, { id: r.id, brand: b.id });
    created("projects → project");
    for (const sid of S(p.scope_of_work).split(",").map((s) => s.trim()).filter(Boolean)) {
      const s = scope.get(sid);
      if (!s) { skip("projects.scope_of_work → project_scope", "scope id not found"); continue; }
      await db.projectScope.create({ data: { projectId: r.id, scopeOfWorkId: s } });
      created("projects.scope_of_work → project_scope");
    }
  }
  const generalProject = new Map<string, string>();
  const general = async (brandId: string) => {
    if (!generalProject.has(brandId)) {
      generalProject.set(brandId, (await db.project.create({ data: { brandId, name: "General (migrated)", description: "Holds legacy tasks that had no project.", statusId: status.get("Progressing")!, createdBy: system.id } })).id);
    }
    return generalProject.get(brandId)!;
  };

  const comments = await q("SELECT * FROM projects_comments ORDER BY id");
  count("projects_comments → project_comment", comments.length);
  for (const c of comments) {
    const p = project.get(S(c.project_id));
    if (!p) { skip("projects_comments → project_comment", "project excluded"); continue; }
    const by = uid(c.comment_by) ?? (S(c.comment_by) === "brands" ? brand.get(S(c.brand_id))?.client : null) ?? system.id;
    await db.projectComment.create({ data: { projectId: p.id, userId: by, body: S(c.comment), visibleToClient: S(c.comment_by) === "brands", createdAt: utc(c.added_on) ?? new Date() } });
    created("projects_comments → project_comment");
  }

  // ================= 5. tasks + assignees + history + ratings =================
  const legacyTasks = await q("SELECT * FROM tasks ORDER BY id");
  const assigneesRaw = await q("SELECT * FROM tasks_employees ORDER BY id");
  const historyRaw = await q("SELECT * FROM tasks_status ORDER BY added_on, id");
  count("tasks → task", legacyTasks.length);
  count("tasks_employees → task_assignee", assigneesRaw.length);
  count("tasks_status → task_status_history", historyRaw.length);
  count("tasks.brand_rating → task_rating", 0);
  if (CLOSE_STALE_DAYS) count("bulk-closed at migration", 0);
  const closedList: string[] = [];
  const task = new Map<string, { id: string; brandId: string; status: string }>();
  const deadlineHow: Record<string, number> = {};
  const csSource: Record<string, number> = {};
  const csUsers = [...user.entries()].filter(([, u]) => u.role === "cs" && !u.name.startsWith("Former"));
  for (const t of legacyTasks) {
    if (EXCLUDE.tasks[t.id]) { skip("tasks → task", "test/junk task (exclusions.ts)"); issue("Excluded tasks", `#${t.id} “${EXCLUDE.tasks[t.id]}”`); continue; }
    let p = project.get(S(t.project_id));
    let b = brand.get(S(t.brand_id));
    if (!b && p) b = [...brand.values()].find((x) => x.id === p!.brand);
    if (!b) {
      skip("tasks → task", S(t.brand_id) && legacyBrands.some((x) => x.row_id === S(t.brand_id)) ? "brand excluded as junk" : "no brand and no project to infer it from");
      issue("Skipped tasks — need a brand", `#${t.id} “${S(t.task_name)}” · status ${S(t.status)} · raised ${S(t.added_on)}`);
      continue;
    }
    const named = [...brand.values()].find((x) => x.id !== b!.id && new RegExp(`\\b${x.name.split(" ")[0]}\\b`, "i").test(S(t.task_name)));
    if (named) issue("Tasks filed under one brand but named after another", `#${t.id} “${S(t.task_name)}” is under **${b.name}** — should it be ${named.name}?`);
    if (p && p.brand !== b.id) { issue("Data to check", `Task #${t.id} “${S(t.task_name)}”: project belongs to another brand → filed under ${b.name} · General`); p = undefined; }
    const projectId = p?.id ?? (await general(b.id));

    // CS: legacy `servicing_id` holds the CS user (the servicing table is empty).
    let cs = user.get(S(t.servicing_id))?.role === "cs" ? uid(t.servicing_id) : null;
    let src = cs ? "servicing_id" : "";
    if (!cs && user.get(S(t.user_id))?.role === "cs") { cs = uid(t.user_id); src = "creator is CS"; }
    if (!cs && b.primaryCs) { cs = b.primaryCs; src = "brand's primary CS"; }
    if (!cs) { cs = csUsers[0][1].id; src = "fallback"; }
    csSource[src] = (csSource[src] ?? 0) + 1;

    const raised = utc(t.added_on) ?? new Date();
    const raisedDay = istDay(raised);
    const legacyDeadline = dayOf(t.deadline);
    const startDay = dayOf(t.start_date);
    const base = legacyDeadline ?? startDay ?? raisedDay;
    const dl = parseDeadline(base, raisedDay, S(t.manual_deadline), !!legacyDeadline);
    deadlineHow[dl.how] = (deadlineHow[dl.how] ?? 0) + 1;
    if (!legacyDeadline && !dl.fromText) issue("Deadlines defaulted", `#${t.id} “${S(t.task_name)}” had no deadline → ${base} 18:00 IST (from ${startDay ? "start date" : "the day it was raised"})`);
    const deadlineAt = fromIst(dl.date, dl.time);
    const st = statusName(S(t.status));
    const desc = [stripHtml(S(t.task_description)), dl.note].filter(Boolean).join("\n\n") || null;

    const tStatus = await db.task.create({
      data: {
        brandId: b.id, projectId, titleId: await titleId(S(t.task_title)), name: S(t.task_name).trim() || "Untitled", description: desc,
        priority: priority(S(t.priority)), startDate: dateOnly(startDay), deadlineAt: startDay && deadlineAt < new Date(`${startDay}T00:00:00Z`) ? fromIst(startDay, dl.time) : deadlineAt,
        deadlineWasText: dl.fromText, statusId: status.get(st.name)!, csUserId: cs, createdById: uid(t.user_id) ?? system.id,
        startedAt: utc(t.task_started_on), submittedAt: utc(t.task_submitted_on), shareWithClient: true, sarthiNudge: true,
        legacyRowId: t.row_id, createdAt: raised,
      },
    });
    created("tasks → task");
    task.set(t.row_id, { id: tStatus.id, brandId: b.id, status: st.name });
    if (st.note) issue("Status mapped with a note", `#${t.id} “${S(t.task_name)}”: ${st.note} → ${st.name}`);

    // History: legacy has no "created" row — add one, then replay every action.
    const hist = historyRaw.filter((h) => h.task_id === t.row_id);
    let prev = status.get("New")!;
    await db.taskStatusHistory.create({ data: { taskId: tStatus.id, toStatusId: prev, byUserId: uid(t.user_id) ?? system.id, at: raised, note: "Created (legacy CRM)" } });
    let completedAt: Date | null = null;
    for (const h of hist) {
      const m = statusName(S(h.action));
      const to = status.get(m.name)!;
      const by = uid(h.status_by);
      if (!by) issue("Unmatched references", `History on task #${t.id}: user \`${S(h.status_by)}\` → “Legacy CRM”`);
      const note = [stripHtml(S(h.status_update)), m.note].filter(Boolean).join(" · ") || null;
      await db.taskStatusHistory.create({ data: { taskId: tStatus.id, fromStatusId: prev, toStatusId: to, byUserId: by ?? system.id, note, at: utc(h.added_on) ?? raised } });
      created("tasks_status → task_status_history");
      if (m.name === "Completed") completedAt = utc(h.added_on);
      prev = to;
    }
    if (prev !== status.get(st.name)) {
      await db.taskStatusHistory.create({ data: { taskId: tStatus.id, fromStatusId: prev, toStatusId: status.get(st.name)!, byUserId: system.id, note: "Status as recorded at migration", at: utc(t.updated_on) ?? raised } });
    }
    if (st.name === "Completed") await db.task.update({ where: { id: tStatus.id }, data: { completedAt: completedAt ?? utc(t.updated_on) ?? utc(t.task_submitted_on) ?? raised } });

    // Optional stale-task rule. completed_at is dated to the deadline so the close lands in the
    // task's own (pre-go-live) month and never counts against anyone's live score; the history
    // row carries the real date. Hidden from the client portal: it wasn't delivered.
    const daysLate = (MIGRATION_AT.getTime() - tStatus.deadlineAt.getTime()) / 86_400_000;
    if (CLOSE_STALE_DAYS && st.name !== "Completed" && daysLate > CLOSE_STALE_DAYS) {
      const note = `Closed at migration: ${Math.floor(daysLate)} days past its deadline (rule: more than ${CLOSE_STALE_DAYS} days). Legacy status was ${st.name}.`;
      await db.taskStatusHistory.create({ data: { taskId: tStatus.id, fromStatusId: status.get(st.name)!, toStatusId: status.get("Completed")!, byUserId: system.id, note, at: MIGRATION_AT } });
      await db.task.update({ where: { id: tStatus.id }, data: { statusId: status.get("Completed")!, completedAt: tStatus.deadlineAt, shareWithClient: false, description: [tStatus.description, note].filter(Boolean).join("\n\n") } });
      task.set(t.row_id, { id: tStatus.id, brandId: b.id, status: "Completed" });
      created("bulk-closed at migration");
      closedList.push(`#${t.id} “${S(t.task_name)}” · ${b.name} · was ${st.name} · due ${dl.date} · ${Math.floor(daysLate)} d late`);
    }

    const ass = assigneesRaw.filter((a) => a.task_id === t.row_id);
    const seen = new Set<string>();
    for (const [i, a] of ass.entries()) {
      const u = user.get(S(a.employee_id));
      if (!u) { skip("tasks_employees → task_assignee", "employee excluded (test account)"); continue; }
      if (seen.has(u.id)) { skip("tasks_employees → task_assignee", "duplicate"); continue; }
      seen.add(u.id);
      await db.taskAssignee.create({ data: { taskId: tStatus.id, userId: u.id, departmentId: dept.get(S(a.department_id)) ?? u.dept, startDate: dateOnly(dayOf(a.start_date)), endDate: dateOnly(dayOf(a.end_date)), isLead: i === 0 } });
      created("tasks_employees → task_assignee");
    }
    if (!seen.size) issue("Tasks with nobody assigned", `#${t.id} “${S(t.task_name)}” · ${b.name} · ${st.name}`);

    if (Number(t.brand_rating) > 0 && b.client) {
      await db.taskRating.create({ data: { taskId: tStatus.id, raterKind: "client", ratedByUserId: b.client, stars: Math.min(5, Number(t.brand_rating)), review: blank(S(t.brand_review)), at: utc(t.brand_review_submission) ?? raised } });
      created("tasks.brand_rating → task_rating");
    }
  }
  for (const h of historyRaw) if (!task.has(S(h.task_id))) skip("tasks_status → task_status_history", "task excluded or skipped");
  for (const a of assigneesRaw) if (!task.has(S(a.task_id))) skip("tasks_employees → task_assignee", "task excluded or skipped");

  if (CLOSE_STALE_DAYS) {
    notes.push(`Stale-task rule ON (--close-stale-days=${CLOSE_STALE_DAYS}): ${closedList.length} open tasks more than ${CLOSE_STALE_DAYS} days past deadline were marked Completed. Each gets a history row and a description note saying so, is hidden from the client portal (it wasn't delivered), and has completed_at set to its deadline so it can't drag down any October score. The legacy status is kept in the note.`);
    closedList.forEach((l) => issue(`Bulk-closed at migration — more than ${CLOSE_STALE_DAYS} days past deadline`, l));
  } else notes.push("Stale-task rule OFF. Re-run with `--close-stale-days=30` to close open tasks more than 30 days past deadline.");

  // ================= 6. EOD =================
  const eods = await q("SELECT * FROM employees_tasks_status ORDER BY id");
  count("employees_tasks_status → eod_log", eods.length);
  for (const e of eods) {
    const t = task.get(S(e.task_id)), u = uid(e.employee_id);
    if (!t || !u) { skip("employees_tasks_status → eod_log", !u ? "employee excluded (test account)" : "task excluded or skipped"); continue; }
    const date = dateOnly(dayOf(e.date))!;
    const remark = stripHtml(S(e.remark)) ?? `Status: ${S(e.task_status)}`;
    const existing = await db.eodLog.findUnique({ where: { userId_taskId_date: { userId: u, taskId: t.id, date } } });
    if (existing) { await db.eodLog.update({ where: { id: existing.id }, data: { remark: `${existing.remark}\n${remark}` } }); skip("employees_tasks_status → eod_log", "same person/task/day merged into one line"); continue; }
    await db.eodLog.create({ data: { userId: u, taskId: t.id, date, remark, statusAtTime: statusName(S(e.task_status)).name, createdAt: utc(e.added_on) ?? new Date() } });
    created("employees_tasks_status → eod_log");
  }

  // ================= 7. attendance =================
  const logs = await q("SELECT * FROM employees_login_logs ORDER BY punch_in");
  count("employees_login_logs → attendance_session", logs.length);
  let closed = 0;
  const days = new Set<string>();
  for (const l of logs) {
    const u = uid(l.employee_id);
    if (!u) { skip("employees_login_logs → attendance_session", "employee excluded (test account)"); continue; }
    const loginAt = utc(l.punch_in)!;
    let logoutAt = utc(l.punch_out);
    let auto = Number(l.auto_logout) === 1;
    if (logoutAt && logoutAt.getTime() - loginAt.getTime() > 20 * 3_600_000) { logoutAt = new Date(`${istDay(loginAt)}T23:59:59+05:30`); auto = true; closed++; }
    if (!logoutAt) { logoutAt = new Date(`${istDay(loginAt)}T23:59:59+05:30`); auto = true; closed++; }
    await db.attendanceSession.create({ data: { userId: u, loginAt, logoutAt, autoLogout: auto } });
    created("employees_login_logs → attendance_session");
    days.add(`${u}|${istDay(loginAt)}`);
  }
  notes.push(`${closed} legacy sessions had no logout (or one more than 20 h later); closed at 23:59:59 IST that day and tagged “auto”, as the midnight job does (§6.5).`);
  const att = await q("SELECT * FROM employees_attendances ORDER BY id");
  count("employees_attendances → attendance_day", att.length);
  for (const a of att) {
    const u = uid(a.employee_id);
    if (!u) { skip("employees_attendances → attendance_day", "employee excluded (test account)"); continue; }
    days.add(`${u}|${dayOf(a.date)}`);
  }

  // ================= 8. concerns =================
  const concerns = await q("SELECT * FROM concerns ORDER BY id");
  count("concerns → concern", concerns.length);
  count("concerns.reply → concern_reply", 0);
  const hr = nitin?.id ?? vipin.id;
  for (const c of concerns) {
    if (EXCLUDE.concerns[c.id]) { skip("concerns → concern", "test concern (exclusions.ts)"); issue("Excluded concerns", `#${c.id} “${EXCLUDE.concerns[c.id]}”`); continue; }
    const by = uid(c.user_id);
    if (!by) { skip("concerns → concern", "raised by an excluded test account"); continue; }
    const reply = stripHtml(S(c.reply));
    const r = await db.concern.create({
      data: {
        raisedByUserId: by, category: concernCategory(S(c.subject), S(c.details)), subject: S(c.subject).trim(), details: S(c.details).trim() || "(no details)",
        confidential: false, ownerUserId: hr, status: reply ? "in_discussion" : "open", legacyRowId: c.row_id, createdAt: utc(c.added_on) ?? new Date(),
      },
    });
    created("concerns → concern");
    if (reply) {
      await db.concernReply.create({ data: { concernId: r.id, userId: uid(c.reply_by) ?? system.id, body: reply, at: utc(c.reply_on) ?? utc(c.updated_on) ?? utc(c.added_on)! } });
      created("concerns.reply → concern_reply");
    }
  }
  notes.push("Concerns: legacy had no category, so one is inferred from the wording (mostly “team”). All are migrated as not confidential (spec §5) and owned by the HR admin (Nitin). Legacy `status` 0/1 has no clear meaning, so state comes from whether a reply exists.");

  // ================= 9. flags =================
  const flags = await q("SELECT * FROM flags_employees ORDER BY id");
  count("flags_employees → flag", flags.length);
  for (const f of flags) {
    if (EXCLUDE.flags[f.id]) { skip("flags_employees → flag", "test flag (exclusions.ts)"); issue("Excluded flags", `#${f.id} ${EXCLUDE.flags[f.id]}`); continue; }
    const target = user.get(S(f.employee_id));
    const type = flagType.get(S(f.flag_id));
    if (!target || !type) { skip("flags_employees → flag", !target ? "target is an excluded test account" : "unknown flag colour"); continue; }
    const d = dayOf(f.date) ?? istDay(utc(f.added_on)!);
    await db.flag.create({
      data: {
        flagTypeId: type.id, targetUserId: target.id, targetRole: target.role === "cs" ? "cs" : "employee", givenByUserId: system.id,
        brandId: brand.get(S(f.brand_id))?.id ?? null, projectId: project.get(S(f.project_id))?.id ?? null, taskId: task.get(S(f.task_id))?.id ?? null,
        subject: S(f.subject).trim() || type.name, feedback: S(f.feedback).trim() || "(no feedback)", pointsApplied: type.name === "Praise" ? 5 : type.points,
        month: new Date(`${d.slice(0, 7)}-01T00:00:00Z`), createdAt: utc(f.added_on) ?? new Date(),
      },
    });
    created("flags_employees → flag");
    if (type.name === "Red flag" && /good work/i.test(S(f.feedback))) issue("Data to check", `Flag #${f.id} on ${target.name}: red flag with feedback “${S(f.feedback)}” — wrong colour?`);
  }
  count("flags_client_servicing → flag", (await q("SELECT id FROM flags_client_servicing")).length);
  notes.push("Flags: the old CRM didn't store who gave a flag, so givers show as “Legacy CRM (import)”. Points use today's flag types (red −8, praise +5, client concern −10).");

  // ================= 10. work requests =================
  const reqs = await q("SELECT * FROM work_request ORDER BY id");
  count("work_request → work_request", reqs.length);
  for (const r of reqs) {
    if (EXCLUDE.workRequests[r.id]) { skip("work_request → work_request", "test request (exclusions.ts)"); issue("Excluded work requests", `#${r.id} “${EXCLUDE.workRequests[r.id]}”`); continue; }
    const b = brand.get(S(r.brand_id));
    if (!b) { skip("work_request → work_request", "brand missing"); continue; }
    const ref = blank(S(r.reference));
    const isUrl = ref && /^(https?:\/\/|www\.|[\w-]+\.[a-z]{2,}\/?)/i.test(ref);
    await db.workRequest.create({
      data: {
        brandId: b.id, projectId: project.get(S(r.project))?.id ?? null, subject: S(r.subject).trim(), description: [blank(S(r.description)), ref && !isUrl ? `Reference: ${ref}` : null].filter(Boolean).join("\n\n") || null,
        date: utc(r.added_on) ?? new Date(), referenceLink: isUrl ? (ref!.startsWith("http") ? ref : `https://${ref}`) : null, neededBy: dateOnly(dayOf(r.deadline)),
        pocName: smartCase(S(r.poc), true) || null, pocContact: blank(S(r.poc_contact)), priority: priority(S(r.priority)), status: "new",
        ownerUserId: b.primaryCs, raisedByUserId: b.client, channel: "portal", legacyRowId: r.row_id, createdAt: utc(r.added_on) ?? new Date(),
      },
    });
    created("work_request → work_request");
  }

  // ================= 11. announcements =================
  const anns = await q("SELECT * FROM announcement ORDER BY id");
  count("announcement → announcement", anns.length);
  const byName = (n: string) => [...user.values()].find((u) => u.name.toLowerCase() === smartCase(n, true).toLowerCase())?.id ?? null;
  for (const a of anns) {
    if (EXCLUDE.announcements[a.id]) { skip("announcement → announcement", "test notice (exclusions.ts)"); issue("Excluded announcements", `#${a.id} “${EXCLUDE.announcements[a.id]}”`); continue; }
    const asNotice = HOLIDAY_AS_NOTICE[a.id];
    if (asNotice) issue("Holidays imported as notices", `#${a.id} ${asNotice}`);
    await db.announcement.create({
      data: {
        type: S(a.type) === "holiday" && !asNotice ? "holiday" : "announcement", subject: S(a.subject).trim(), date: dateOnly(dayOf(a.announcement_date) ?? istDay(utc(a.added_on)!))!,
        message: blank(S(a.message)), showToClients: Number(a.show_to_clients) === 1, postedById: byName(S(a.add_by)), legacyRowId: a.row_id, createdAt: utc(a.added_on) ?? new Date(),
      },
    });
    created("announcement → announcement");
  }

  // ================= 7b. attendance days (after holidays exist) =================
  const { materialiseDay } = await import("../lib/attendance");
  let dayRows = 0;
  for (const key of days) {
    const [u, d] = key.split("|");
    await materialiseDay(u, d);
    dayRows++;
  }
  for (const a of att) {
    const u = uid(a.employee_id);
    if (!u) continue;
    const remark = blank(S(a.remark));
    if (remark) await db.attendanceDay.updateMany({ where: { userId: u, date: dateOnly(dayOf(a.date))! }, data: { remark } });
  }
  created("employees_attendances → attendance_day", att.filter((a) => uid(a.employee_id)).length);
  notes.push(`attendance_day is recomputed from sessions (first login → last logout, IST), not copied: ${dayRows} person-days written (legacy had ${att.length} attendance rows; the difference is days that only exist in the login log). No “absent” rows are invented for old dates.`);


  // ================= 12. notifications (as read) =================
  const notifs = await q("SELECT * FROM notifications ORDER BY id");
  count("notifications → notification (read)", notifs.length);
  const names: Record<string, Map<string, string>> = {
    Task: new Map(legacyTasks.map((t) => [t.row_id, S(t.task_name)])), concern: new Map(concerns.map((c) => [c.row_id, S(c.subject)])),
    announcement: new Map(anns.map((a) => [a.row_id, S(a.subject)])), work_request: new Map(reqs.map((r) => [r.row_id, S(r.subject)])),
    project: new Map(legacyProjects.map((p) => [p.row_id, S(p.project_name)])),
  };
  const MOD: Record<string, "task" | "concern" | "announcement" | "request" | "flag" | "system"> = { TasksModel: "task", ConcernModel: "concern", AnnouncementModel: "announcement", WorkRequestModel: "request", FlagsEmployeesModel: "flag", project: "task" };
  const batch: Prisma.NotificationCreateManyInput[] = [];
  for (const n of notifs) {
    const to = S(n.receiver_type) === "brand" ? brand.get(S(n.receiver))?.client : uid(n.receiver);
    if (!to) { skip("notifications → notification (read)", "receiver deleted, excluded or unknown"); continue; }
    const what = names[S(n.event)]?.get(S(n.event_id));
    const ex = S(n.event) === "Task" && legacyTasks.find((t) => t.row_id === S(n.event_id) && EXCLUDE.tasks[t.id]);
    if (ex) { skip("notifications → notification (read)", "about an excluded test task"); continue; }
    const at = utc(n.added_on) ?? new Date();
    batch.push({ userId: to, module: MOD[S(n.module)] ?? "system", event: `legacy.${S(n.event)}`, title: `${S(n.by_title) || S(n.event)}${what ? `: ${what}` : ""}`.slice(0, 250), emittedAt: at, readAt: at });
  }
  await db.notification.createMany({ data: batch });
  created("notifications → notification (read)", batch.length);

  // Not migrated by design (§5).
  for (const t of ["clients", "users_old", "cache", "cache_locks", "jobs", "job_batches", "failed_jobs", "sessions", "password_reset_tokens", "personal_access_tokens", "migrations", "status_list", "tasks_titles", "servicing", "tasks_attachments", "tasks_comments"]) {
    const n = (await q<{ n: number }>(`SELECT COUNT(*) n FROM \`${t}\``))[0].n;
    count(`${t} (not migrated)`, n);
    if (n) skip(`${t} (not migrated)`, t === "status_list" ? "replaced by the 6 seeded statuses, mapped per §12.3" : t === "users_old" ? "old copies of a ProMonkey admin and a test user" : "framework/system table (§5)", n);
  }

  await db.auditLog.create({ data: { actorKind: "system", action: "migration.legacy", entityType: "system", entityId: null, after: { source: "wwnecgawzt.sql", at: new Date().toISOString() } } });

  // Sequences after explicit inserts.
  for (const [table, col] of [["task", "code"], ["project", "code"], ["work_request", "code"], ["concern", "code"], ["announcement", "code"]]) {
    await db.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('${table}','${col}'), GREATEST(1, (SELECT COALESCE(max(${col}),1) FROM ${table})))`);
  }

  await my.end();
  notes.push("Projects: the legacy `projects.status` column is empty for every row, so all projects start as Progressing; close finished ones after go-live.");

  // Go-live readiness, measured on what was just migrated.
  const now = new Date();
  const openTasks = await db.task.findMany({ where: { status: { isDone: false } }, include: { status: true } });
  const late = openTasks.filter((t) => !t.status.isClientGate && !t.status.isReview && t.deadlineAt < now);
  const oldest = late.length ? Math.round((now.getTime() - Math.min(...late.map((t) => t.deadlineAt.getTime()))) / 86_400_000) : 0;
  const stale = late.filter((t) => now.getTime() - t.deadlineAt.getTime() > 14 * 86_400_000).length;
  const openConcerns = await db.concern.count({ where: { status: "open" } });
  const summary = {
    late: late.length, open: openTasks.length, oldest, stale, openConcerns,
    tasksIn: counts.get("tasks → task")!.created, tasksSrc: counts.get("tasks → task")!.source,
    staff: counts.get("users → user (staff)")!.created, brands: counts.get("brands → brand")!.created,
  };
  writeReport({ deadlineHow, csSource, admins: admins.length, summary });
}

type Summary = { late: number; open: number; oldest: number; stale: number; openConcerns: number; tasksIn: number; tasksSrc: number; staff: number; brands: number };
function writeReport(x: { deadlineHow: Record<string, number>; csSource: Record<string, number>; admins: number; summary: Summary }) {
  mkdirSync(OUT, { recursive: true });
  for (const [file, rows] of Object.entries(csv)) writeFileSync(path.join(OUT, file), ["kind,legacy_id,name,path", ...rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(","))].join("\n"));
  const lines: string[] = [];
  lines.push(`# Legacy migration — dry-run report`, "", `Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC · source \`wwnecgawzt.sql\` (Adminer dump) · target: separate database, the app's own data is untouched.`, "");
  const m = x.summary;
  const n = (g: string) => issues.get(g)?.length ?? 0;
  lines.push(`## Before go-live: decisions needed`, "",
    `The dump migrates cleanly: **${m.brands} brands, ${m.staff} staff, ${m.tasksIn} of ${m.tasksSrc} tasks**, with history, EOD, attendance, flags, concerns, requests, notices and notifications. No passwords are carried over. These need a person, not a script:`, "",
    `1. **Confirm the exclusion list** (spec §5, §16 item 4): ${n("Excluded tasks")} test tasks, ${n("Excluded brands")} brands, ${n("Excluded projects")} projects, ${n("Excluded concerns")} concerns, ${n("Excluded flags")} flags, ${n("Excluded work requests")} requests, ${n("Excluded announcements")} notices, plus the spec's 4 test users. ProMonkey's two logins (Amit, Gaurav) come across **inactive**.`,
    CLOSE_STALE_DAYS
      ? `2. **Stale open work**: the ${CLOSE_STALE_DAYS}-day rule closed **${n(`Bulk-closed at migration — more than ${CLOSE_STALE_DAYS} days past deadline`)} tasks** (listed below; CS should skim it for anything still live and reopen it). After the rule, ${m.late} of ${m.open} open tasks are past deadline${m.late ? ` (oldest ${m.oldest} days)` : ""}.`
      : `2. **Stale open work**: ${m.late} of ${m.open} open tasks are already past their deadline (oldest ${m.oldest} days, ${m.stale} more than two weeks). The old CRM never closed them, so v2 would open with a red board, ${m.late} overdue nudges from Sarthi and low health scores. Re-run with \`--close-stale-days=30\` to close the old ones, or have CS triage before go-live.`,
    `3. **${m.openConcerns} concerns are open with no reply** (one reply in the whole legacy table). They'll show as SLA-missed on day one.`,
    `4. **Name the ${n("Former staff (deleted in the old CRM) — please name them")} former staff** the old CRM deleted but still references (three were the first-listed CS on 8 brands). Vipin can identify them from the brands and counts listed below.`,
    `5. **${n("Tasks filed under one brand but named after another")} tasks look filed under the wrong brand**, and 1 task (“Panamax PDP Designs- 3”) has no brand at all — CS to check the list below.`,
    `6. **${n("Login clashes")} client logins clash with staff logins** (Trend Laminates, Ledvance use a teammate's @agencylife.in address) — the client logins were moved to the brand's official email; confirm with the clients.`,
    `7. **Timezone**: old timestamps are read as UTC (strong evidence below) — confirm on two known days with Vipin (§12.6).`,
    `8. **Logos and photos** aren't in the dump — need the old server's uploads folder or URL (\`migration/out/legacy-images.csv\` lists ${(csv["legacy-images.csv"] ?? []).length} files).`, "");
  lines.push(`## Counts`, "", `| Old table → new table | Source | Created | Skipped (reason) |`, `|---|---:|---:|---|`);
  for (const [t, c] of counts) lines.push(`| ${t} | ${c.source} | ${c.created} | ${Object.entries(c.skipped).map(([r, n]) => `${n} ${r}`).join("; ") || "—"} |`);
  lines.push("", `## Deadlines (spec §12.4)`, "", `How each migrated task got its \`deadline_at\` (IST):`, "");
  const HOW: Record<string, string> = { "date+time": "date and time read from the free-text note", time: "time read from the note, on the legacy deadline date", date: "legacy deadline date, 18:00 (no note)", default: "no deadline anywhere — start date / day raised, 18:00" };
  for (const [k, n] of Object.entries(x.deadlineHow)) lines.push(`- **${n}** — ${HOW[k] ?? k}`);
  lines.push("", "Every task with a free-text note keeps it at the end of its description as “Legacy deadline note: …” and is marked `deadline_was_text`. Bare times like “by 1:30” are read as afternoon (1–7 → pm) because that's studio hours.", "");
  lines.push(`## Who is CS on each task`, "", ...Object.entries(x.csSource).map(([k, n]) => `- **${n}** — ${k === "servicing_id" ? "from `tasks.servicing_id` (the old CRM stored the CS user there)" : k}`), "");
  lines.push(`## Decisions made in this run`, "", ...notes.map((n) => `- ${n}`), "- Timezone: old system timestamps (created, started, submitted, logins) are UTC. Logins peak at 05:00–07:00 stored time = 10:30–12:30 IST; read as IST they would be 5–7 am. Deadlines/start dates are calendar days. **Confirm with Vipin on two known days before go-live (§12.6).**", "");
  lines.push(`## Needs a decision or a look`, "");
  for (const [g, list] of issues) { lines.push(`### ${g} (${list.length})`, "", ...list.map((l) => `- ${l}`), ""); }
  lines.push(`## Files`, "", "- `migration/out/legacy-images.csv` — logo/photo paths from the old server. They aren't in the dump; give me the old site's uploads URL (or the folder) and they'll be fetched into the new storage with thumbnails.", "- `migration/exclusions.ts` — the exclusion list above, editable. Change it and re-run.", "");
  writeFileSync(path.join(__dirname, "report.md"), lines.join("\n"));
  console.log(lines.slice(0, 40).join("\n"));
  console.log(`\n… full report: migration/report.md`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
