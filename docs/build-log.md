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
