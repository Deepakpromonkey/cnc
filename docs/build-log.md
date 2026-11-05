# Build log — CNC CRM v2

Builder: Deepak with Claude Code. Spec: docs/CNC-CRM-Build-Spec.md v1.0 (24 Oct 2026). Designs: design/cnc-admin.html, design/cnc-client.html (cnc-team.html not yet handed over in this repo).

## Status by phase (§13)
| Phase | State |
|---|---|
| 0 Foundation | Done: Prisma schema (all of §4) + constraints migration (one start/done status, stars 1–5, append-only audit_log trigger), seeds for dynamic lists, Argon2id auth + server sessions, attendance sessions on login/logout/expiry, design tokens/shell/drawer/toast, signed-URL file storage with webp thumbs, audit + event outbox. |
| 1 Admin core | In progress: all admin views + drawers/forms. |
| 2 Team portal | Not started (rail placeholder at /team). Notification links to /team/* resolve once it exists. |
| 3 Client portal | In progress. |
| 4 Money | Invoices, items, branded PDF (`/api/invoices/:id/pdf`), Razorpay payment links + signed webhook (`/api/razorpay/webhook`), offline/partial payments, overdue job, reminder schedule. Live-key test still pending. |
| 5 Scoring + notifications | Nightly scoring (lib/scoring.ts), flags with praise points setting, weights editable, outbox → in-app fan-out. |
| 6 Sarthi plumbing | `sarthi_ro` role + v_* views (migration `*_sarthi_readonly`), allowed queries in `agent_access`, JWT identity SDK, HMAC-signed outbox webhook with backoff, Sarthi view. Needs Sarthi endpoint URLs. |
| 7 Migration | Not run. Source dump: ~/Downloads/wwnecgawzt.sql (MySQL, 35 tables). Scripts go in /migration. |
| 8 Hardening | Dockerfile, docker-compose.yml, deploy/nginx.conf (TLS, rate limits, old-domain 301s), deploy/backup.sh (pg_dump, 30-day retention), `/api/healthz`. |

## Jobs (jobs/worker.ts, BullMQ, tz Asia/Kolkata)
outbox drain every 15 s · 00:05 close yesterday's sessions (auto-logout 23:59:59) + materialise attendance · 00:30 scores · 00:40 overdue flip + invoice reminders (3 d before, on due, every 5 d) · 19:30 EOD chaser (`eod.missing`, skips holidays/non-working days) · hourly `task.late` (Sarthi only).
Verified 25 Oct: worker starts, registers schedules, drains outbox; `npm run jobs:nightly` closes 19 staff days, scores 17 people.

## Decisions
- **Email uniqueness:** spec says citext; we store e-mails lower-cased with a plain unique index (no extension needed). Login accepts email or login ID, case-insensitive.
- **Sarthi fallback:** when `SARTHI_API_URL` is unset or unreachable, the Ask box answers from scoped CRM data (lib/sarthi-sdk.ts, read-only, logged as `agent.answer`). Sarthi itself is not built here (§10).
- **Razorpay without keys:** `createPaymentLink` returns a mock checkout link (`/pay/mock/:invoiceId`) that settles through the same `recordPayment` path as the webhook. Production requires the three `RAZORPAY_*` env vars.
- **Demo seed:** sample data from the HTML, with dates shifted so the mockup's Fri 23 Oct lands on the real IST day; a month of generated completed tasks/EOD/attendance so scores are computed, not typed in. Holidays keep their real dates.
- **Worker and `server-only`:** job code reuses lib/*; `jobs/preload.cjs` stubs the `server-only` marker (the `react-server` condition breaks next/navigation in plain Node).
- **Outbox:** in-app notifications are fanned out from `event_outbox.notify` by the drainer (worker, or `after()` in dev), never inline in the request.
- **Concerns** are excluded entirely from agent access; v_* views never expose `password_hash` or internal comments.
- **Next.js standalone build** required by the Dockerfile (`output: "standalone"` in next.config.ts).

## Open items (spec §16)
1. Final production domain (`app.coffeeandcreative.in` assumed).
2. Default HR owner for concerns (Nitin assumed; setting `hr_user_id`).
3. Sarthi billing basis (CNC clients as end users vs per token) — Sarthi customer setup only.
4. Confirm the test-account exclusion list before migration.
5. Health score formula (Today) — default implemented in lib/queries.ts `healthScore`.
6. Drag-and-drop on the board — "Move to" select is implemented; DnD is a nice-to-have.
Also: timezone of old punch times (confirm with Vipin on two known days before the attendance migration).


## Phase 7 · Migration — dry-run done (2026-10-25)

- `migration/` holds the scripts, the editable exclusion list and `report.md`. Three dry runs into the scratch DB `cnc_migrate` gave identical counts: 19 brands, 46 staff (+8 placeholders for deleted ex-staff), 19 client logins, 15 projects, 53 of 88 tasks (34 test tasks excluded, 1 without a brand skipped), 99 history rows, 38 EOD lines, 275 sessions, 123 attendance days, 16 concerns, 15 flags, 4 requests, 6 notices, 839 notifications (read).
- Legacy quirks handled: `tasks.servicing_id` holds the CS user; deadlines are mostly free text (parsed, raw note kept); deleted users still referenced; CS department row deleted; two client logins equal to staff logins; "holidays" that are really leave notes.
- Open before go-live: Gaurav to confirm exclusions; Vipin to name former staff, confirm UTC timestamps on two days, and triage 46 overdue + 15 unreplied concerns; old uploads folder for 63 images.
- Optional stale-task rule: `./migration/dry-run.sh --close-stale-days=30` closed 24 tasks (due 12 Aug–15 Sep) in the 2026-10-25 run; closed tasks are hidden from clients and dated to their deadline so live scores are unaffected. Rule is measured from the run date.

## Team portal (spec §8) — built 2026-10-25

- One portal at /team, rail by role. Employee: Today, My tasks (own drawer: Start → share work → Submit/Resubmit, Pause, EOD line), EOD log, Attendance (calendar + leave requests), Concerns (confidential toggle), Announcements, My score, Profile. CS: Today, My brands (contacts edit, hold digest), Review queue (approve → client gate or done, reject needs a note, CS stars), Tasks (admin board scoped to their brands, Flag assignee), Work requests (scoped), Client digest (preview, add a line, hold tomorrow → setting digest_overrides + Sarthi PUT), Flags.
- New: app/actions/team.ts, lib/team-views.ts, components/team/*. Employees can no longer jump New → In review (§6.3).
- Verified in the browser: employee start/submit (blocked without a file), EOD save, CS review reject-blocked/approve with rating, client notified, digest hold.
- Logout check (2026-10-25, client request): staff signing out with tasks still in their hands (not review/client/done) must give a reason per task; saved as today's EOD line + a "Logged out before finishing" note on the task (one per task per day). Closing the browser bypasses it; the 7:30 pm EOD chaser still applies.

## Group hierarchy — built 2026-11-04 (client request, extends spec §3)

- **Hierarchy:** super admin → group admin → CS → employee. New role `group_admin`; new table `team_group`; `user.group_id` + `user.reports_to_id` (migration `*_team_groups`). Rules: a CS reports to a group admin of the same group; an employee reports to a CS (or the group admin) of the same group. Changing someone's group/role unlinks people who reported to them across groups.
- **Group admin** signs in to the admin portal, scoped to the group: Today, Brands, Projects & Tasks, Team, Users & access, Work Requests, Attendance. Group brands = brands whose CS sits in the group; tasks = group brands + anything a group member is CS or assignee on (`taskScope` in lib/queries.ts). Can add/edit/deactivate/reset CS and employees in their own group only, approve leave and remark attendance for the group, raise flags on the group. Cannot reach Invoices, Settings, Concerns, Announcements or Sarthi (redirects to Today), add brands, client logins or invoices, or edit scoring weights.
- **CS** keep their brands (§3) and also see their reportees' work: Tasks and Review queue include tasks their reportees are on; new **My team** page (/team/people) shows each reportee's attendance today, desk, late count, today's EOD and score, plus their leave.
- **Super admin** creates groups in Settings → Groups and sets Group / Reports to on each person in Users & access (column + group filter).
- Notifications: review/rejected/client-gate/done moves and new work requests also reach the group admins of the people involved; leave requests go to admin + group admin + the CS the person reports to.
- Server checks: `teamScope`, `brandScope`, `taskScope`, `canSeeTask` (lib/queries.ts); `assertTask`, `assertPerson` (lib/tasks.ts). Every task action now checks the task, not only the brand.
- Demo: `npm run db:seed-groups` creates "Studio A" with login `ga-demo` (password = SEED_PASSWORD), Jahanavi + Meenakshi as its CS and four employees under them.
- Verified 2026-11-04 on dev: ga-demo sees 14 of 23 open tasks and 5 brands, no out-of-group task; restricted pages redirect; group admin added an employee under a CS through the form; CS sees a reportee's task on a brand that isn't theirs, a CS outside the group doesn't; My team page renders for a CS.
- 2026-11-04 (later): group admins also see **Unassigned** active CS/employees (no group) in Users & access and can "Add to my team" (saveUser allows editing a user with no group; anyone in another group stays off-limits).
- Staging 2026-11-04: Vipin → group admin of "Vipin's team", Nitin → group admin of "Nitin Team" (group Vipin created in Settings). Studio A demo undone (ga-demo inactive, its people unassigned). Super admin on staging is now login `admin` (admin@coffeeandcreative.in, CNC Admin), same password as the other staging logins. DB backups in /opt/cnc/backups.

## Admin UI pass — 2026-11-05 (client feedback)

- **Today · Running late:** the `.item .t span` rule also hit the assignee chip (`.who`), so brand / person / CS broke onto three lines. Now `.item .t > span` + a `.meta` flex row (brand · assignee · CS) and a crimson `.note` line for rejection notes; day/hour badge sits in a soft tile.
- **Projects & Tasks board:** columns were fixed at 272px with horizontal scroll, so "Awaiting client" and "Completed" sat off-screen and the hidden Completed column (20 cards) stretched the page to ~3200px of blank space. Columns now share the width (`--cols`), each column scrolls on its own (`max-height: calc(100vh - 140px)`), Completed shows 6 cards + "Show all". Added **drag-and-drop between columns** (same rules as "Move to": rejected status prompts for the mandatory note; server check in `moveTask`), brand + assignee filter dropdowns, "Clear" chip, priority dot on cards, and sortable headers on the List view. 3 / 2 / 1 columns under 1180 / 700 / 460px.
- **Users & access:** table no longer scrolls sideways at 1440px. Columns merged (login ID under the email, designation under department, contact, last sign-in); sortable headers (user, role, group, department); **Export CSV** of the filtered rows.
- **Brands:** engagement folded into the brand cell, "Last activity" hidden below 1560px, no cell wrapping; table fits beside the detail card.
- Shared CSS: `.tbl.fit`, `.nowrap`, `.sub`, `th.sortable`, `select.flt`, `.col .cards`, `.col.over`, `.tcard.dragging`; `.stage` no longer overflows at 400px.
- Verified in headless Chromium (both themes, 1440px and 400px): no page-level horizontal scroll; DnD moved a card New → Progressing (toast "Moved to Progressing", counts updated) and back. `npm run typecheck` clean; lint has only the pre-existing `<img>` warnings.
- Local dev on the Mac without Homebrew/Docker: embedded Postgres 17 via `dev-services/start-db.mjs` (outside the repo); Redis is only needed by the worker and `/api/healthz`.

## All-portal UI audit + click-through tests — 2026-11-05 (later)

- Screenshotted every page as admin, employee (himanshu), CS (gauri) and client (neharika) at 1440px; no console errors, no page-level horizontal scroll.
- Fixed: employee **My tasks** board rendered 5 columns in a 6-column grid (empty slot on the right) → board now sets `--cols` to the visible status count and uses the scrolling `.cards` body. Client **Requests** reply box was an unstyled browser textarea → proper field with label and primary Send. Client **Home** "Waiting on you" card was mostly empty → shows **Recently delivered** (last 4 done pieces with their star rating, click opens the piece).
- End-to-end run (`dev-services/e2e.mjs`, headless Chromium, 29 checks, all pass): employee start → submit blocked without a file/link → share link → submit → EOD line (drawer + EOD page); CS reject blocked without note → approve with 5 stars → task lands in Awaiting client; client approves → rates; client raises request → CS answers → admin converts to task; admin sends draft invoice → client pays through mock checkout → Paid; leave apply → admin approve; announcement posted → seen by employee; concern raised → admin reply → seen by employee; praise flag → seen on My score; Ask Sarthi answers from the CRM; Settings add task title; profile edit; CS notification bell (5 items); staff sign-out modal asks a reason per unfinished task and signs out.
- Test data left in the local DB is prefixed "Test" (notice, concern, flag, request, task title, leave for Himanshu); T-1211 went through the whole flow and is Completed with a client rating; INV-1046 is Paid (mock).
- 2026-11-05 (overflow sweep): client feedback "Completed is coming out" on the Brands detail tiles. Added an automatic overflow detector (`dev-services/overflow-all.mjs`, `drawers.mjs`: text wider than its box, children past the parent edge, page-level scroll) and ran it on every page for admin, group admin, employee, CS and client at 1280px and 1440px, plus 26 drawers/forms. Found and fixed: compact stat tiles (brand card, user drawer) spilled "Projects / Not started / Completed" → `.stats.compact` label style + "Done"; admin Today hero tiles overflowed at 1280px ("₹9.4L" +27px) → hero stacks below 1360px with five full-width tiles, number uses `clamp()`. Everything else reports clean.
- 2026-11-05 (1280px pass): laptop width exposed more: tables beside a detail card (Brands, Requests, Concerns, Team) inherited the 720px `min-width` and scrolled sideways → `.split .tbl{min-width:0}`, detail card 340px below 1360px; Brands "Waiting" column folds under "Open" and Users "Last sign-in" hides below 1400px (`.hide-lg`); `.tbl.fit` cells get 8px padding below 1400px; CS team table allows wrapping. Compact stat tiles: auto-fit 68px columns, 9px labels. Verified with `dev-services/fit2.mjs`: all admin tables fit at 1280 and 1440.

## New features — 2026-11-05 (client asked for "unique, working" additions without touching existing screens)

- **Quick jump (⌘K / Ctrl+K)** on every portal: `components/palette.tsx` + `quickSearch` in `app/actions/common.ts`. Searches tasks (name, brand, `T-1211`), brands, people, projects, invoices (`INV-1044`), work requests (`WR-307`) and the portal tabs, scoped server-side with `taskScope` / `brandScope` / `teamScope` (clients only see their own pieces, invoices and requests; employees only their tasks). Enter deep-links into the right drawer; Users & access now accepts `?u=<id>` for that. A list-icon button next to the bell opens it for mouse users.
- **Week view** on Projects & Tasks (admin and CS): fourth chip next to Board / List / Projects. Seven Monday-to-Sunday columns of the current week with ‹ › navigation, today highlighted, status pill on each card, counts of open tasks before/after the week.
- **Workload strip** on Team: one tile per employee with open tasks, due in the next 7 days and late, bar scaled to the busiest person, a line naming who is lightest; click a tile to open that person's panel.
- **Copy morning summary** on admin Today: one button under the greeting copies a WhatsApp-ready text (open tasks, overdue list with person and lateness, due today, awaiting client, new requests, outstanding money, concerns).
- Verified in headless Chromium (`dev-services/feat.mjs`): palette finds task / invoice / person / tab and opens the drawer, CS and client results are scoped, week view shows 7 columns and navigates, workload tile selects the panel, copy puts the text on the clipboard.

## Ten more features — 2026-11-05 (late)

1. **Bulk actions on the task List** (admin, CS): checkboxes per row, a sticky bar with "Move to…" and "Nudge via Sarthi". `bulkMoveTasks` / `bulkNudge` in `app/actions/tasks.ts` run each task through the normal move rules and report what was skipped.
2. **Duplicate task**: task drawer → Duplicate opens the task form prefilled (brand, project, people, brief, flags), new name "· copy", status New. `TaskForm duplicate` prop; `saveTask` creates because no id is sent.
3. **Add to calendar**: `/api/tasks/[id]/ics` returns a one-event .ics (1 h block ending at the deadline, 2 h alarm, link back), permission-checked with `canSeeTask`. Buttons in the admin drawer and the employee drawer.
4. **Birthdays soon** card on admin Today: staff with a date of birth in the next 14 days, "Today 🎂" highlighted.
5. **@mention autocomplete** in task comments (admin drawer + employee drawer): `MentionInput` in `components/kit.tsx`; the server already resolves "@First" to the user and notifies them.
6. **Keyboard shortcuts** on Projects & Tasks: N new task, B/W/L/P switch views, / focuses search, ? shows the list. Ignored while typing or when a drawer/dialog/palette is open.
7. **Stuck tasks**: `TaskVM.inStatusDays` (days since the last status change); cards show "3d here" (crimson from 5d), the list shows it under the name, and a "Stuck 3d+" filter chip.
8. **What moved yesterday** card on Today: yesterday's EOD lines grouped by person, each line links to its task.
9. **Studio pulse** card on Today: last 24 h of the audit log in plain English (logins, reads and agent answers hidden), with links to the task/invoice; group admins see their team only.
10. **Invoice aging + Remind all overdue** on Invoices: buckets "due in 7 days / 1–30 / 31–60 / 60+ days late" with amounts and counts, and one button that sends a Sarthi reminder for every overdue invoice (`remindAllOverdue`).

Verified in headless Chromium (`dev-services/feat2.mjs`): bulk move/nudge, stuck chip + badges, all shortcuts, duplicate creates "… · copy", .ics is 200 for allowed users and 404 for a client of another brand, mention popup inserts "@Himanshu" and the employee gets the notification, birthdays/yesterday/pulse cards render, aging shows 4 buckets and "Remind all" sent 2 reminders. Demo data: Himanshu and Gauri got dates of birth for the card test; T-1211 has a "· copy" task.
