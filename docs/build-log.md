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

## Saarthi Staff assistant (spec §10) — built 2026-11-11

- **What:** active staff (admin, group admin, CS, employee) ask Saarthi's Staff assistant from /admin and /team, and it answers from CNC's database as each person sees it in the CRM. It stays off until `SAARTHI_STAFF_KEY` and `SAARTHI_STAFF_SECRET` are both set. Guide and ops steps: docs/saarthi-staff-assistant.md.
- **Per-viewer views (§10.1):** migration `*_saarthi_staff_views` adds `v_my_tasks`, `v_my_brands`, `v_my_people`, `v_my_invoices`, `v_my_requests`, `v_my_eod` and `v_my_attendance_days`. Each is `viewer_id` + the matching v_* columns, one row per (active staff member, row the CRM shows them).
  - Helper views `sarthi_viewer`, `sarthi_team_scope`, `sarthi_brand_scope`, `sarthi_task_scope` and `sarthi_staff_scope` copy teamScope/brandScope/taskScope (lib/queries.ts) and the page filters. They aren't granted.
  - The views run with the owner's rights (security_invoker off), so `sarthi_ro` reads the 7 v_* and 7 v_my_* views and nothing else.
  - Saarthi's "Only their own rows" rule (`viewer_id` = CRM user id) narrows each query to one person.
  - `npm run check:saarthi-views` (scripts/check-saarthi-views.ts) compares every viewer's rows with the CRM's own code.
- **Identity (§10.3):** `GET /api/saarthi/staff-token` (lib/saarthi-staff.ts) sits behind the CRM login.
  - It answers 401 when nobody is signed in, 403 for a client or while impersonating, and 503 when the assistant isn't configured.
  - Otherwise it returns a fresh HS256 JWT signed with `SAARTHI_STAFF_SECRET` (jose, no new dependency): `user_id` = user.id, `email` (only when Saarthi would accept it), `aud` "saarthi-staff", a 2-minute expiry and a new 24-character nonce.
  - Every answer is `Cache-Control: no-store`, with no CORS headers.
- **Pages:** the admin and team layouts load `{SAARTHI_STAFF_URL}/widget/staff-v1.js` (components/saarthi-staff.tsx) with the public staff key, the token function and the page theme. The client layout is untouched.
  - The Ask box hands the question to the panel and writes `agent.ask` (`via: saarthi_staff`, new server action `noteStaffAsk`). noteStaffAsk refuses when the assistant isn't configured (added in review: no hand-off, nothing to record).
  - The "Sarthi is awake" chip becomes a button that opens the panel and looks the same.
  - The Crema/Espresso switch re-themes the panel.
  - Sign-out calls `SaarthiStaff.logout()` first, without waiting.
  - If the script fails to load, the Ask box falls back to askSarthi.
- **Decisions:**
  - **Per-person scope comes from views, not the token.** Saarthi uses a staff token only for who someone is: it ignores claims like `role` or `brand_ids`, and it filters a table by one column. A `brand_ids` claim can't express CNC's hierarchy (reportees, group brands, tasks someone is assigned to). The views can, and the checker keeps them equal to the CRM.
  - **The Ask box hands off to Saarthi's panel** (tables, follow-ups and CSV live there) instead of showing an answer in the CRM's drawer.
  - **No assistant while an admin is viewing as someone:** the script isn't loaded, the token route answers 403 and noteStaffAsk refuses. Nobody asks as someone else.
  - **Clients are excluded:** the script never loads in /client, the token route answers 403, and clients have no rows in any v_my_* view.
  - **Only active staff are viewers.** The CRM signs in active users only (lib/auth.ts currentUser).
  - **Group admins get the assistant within their group.** The admin Sarthi page stays closed to them, as before.
  - **EOD** = lines on the tasks the viewer can see (the task drawer shows every line), plus lines by the active staff they follow (their own; a CS's My team; a group admin's group).
  - **A group admin's v_my_people is their team scope.** It leaves out the unassigned active CS/employees that Users & access also lists for "Add to my team".
  - **v_my_invoices has no drafts**, as with v_invoices (§10.1). Group admins and employees get no invoices.
- **Spec conflicts:**
  - §10.3 says the Ask boxes post `{token, question}` to Sarthi's `/ask` and render the answer, with a token carrying `user_id`, `role`, `brand_ids`, `name` and `whatsapp`, signed with `agent_access.webhook_secret`. Saarthi has no `/ask`. Its Staff assistant signs people in with a staff token (`user_id`, `email`, `aud`, `nonce`, its own staff secret) and answers in its own panel. We follow Saarthi. The old relay (lib/sarthi-sdk.ts, `SARTHI_API_URL`) stays, unchanged, as the fallback.
  - §3 says a CS views EOD and attendance of their own brands' assignees. Since the 2026-11-04 hierarchy change, the CRM shows a CS their own and their My team's attendance, and EOD lines on the tasks they can see. The views follow the CRM.
  - §10.1 says agent queries are logged in audit_log via pgaudit or a proxy. Neither exists here. Saarthi's Activity keeps each staff question, its query and any refusal (never rows). The CRM's audit_log gets only the Ask-box questions (`agent.ask`).
- Verified 2026-11-11 on dev (local cnc_crm, dev server on :3040):
  - `npm run db:deploy` applied the migration. `npm run check:saarthi-views`: 19 viewers (2 admin, 0 group_admin, 9 cs, 8 employee), every row ✓, "0 mismatches".
    - Admins see 88 tasks / 19 brands / 38 people / 11 invoices / 7 requests / 203 EOD lines / 209 attendance days.
    - The 19 clients have no rows.
    - `sarthi_ro` reads exactly the 14 views, and security_invoker is off on all 12 new views.
    - As sarthi_ro, v_my_tasks reads, while sarthi_task_scope and task are refused.
    - Re-run while writing this entry: same result.
  - Throwaway copy with the hierarchy cases (since dropped): group admins with and without a group, inactive staff, a brand shared between groups, an admin and a client tagged into a group, and EOD lines on tasks the writer was later taken off.
    - 21 viewers (3 group admins), 0 mismatches.
    - Deliberately broken views were caught (UNION → UNION ALL; the staff-scope active filter removed), exit 1.
  - Speed: about 3–4 ms on dev data. The viewer filter is an index lookup on user_pkey, and other roles' branches never execute. At about 20k tasks: v_my_tasks 160–210 ms, v_my_eod 43–309 ms, the rest ≤ 6 ms.
  - Before config: no cookie gives 401, an admin gives 503, and there is no script (8/8).
  - Token route with test values in .env (restored byte-for-byte afterwards): HTTP 106/106.
    - Admin, cs and employee get 200 with tokens that verify: HS256, aud "saarthi-staff", their own user_id and email, exp − iat = 120, a fresh 24-character nonce, no other claims.
    - Client 403, impersonated admin 403, no cookie 401. POST gives 405.
    - Every answer is no-store, with no Access-Control-* headers (also for a foreign Origin and for OPTIONS).
    - Staff pages carry the script preload and the key, never the secret. Client pages and an impersonated admin carry nothing.
  - noteStaffAsk 14/14: staff get ok and the agent.ask row; an impersonated admin, a client, no session and a blank question are refused, with no row. lib/saarthi-staff.ts unit checks 19/19.
  - Headless Chromium against a local stub of staff-v1.js (Saarthi never contacted): 33/33.
    - init is queued once, with the key, the token function and the theme.
    - The chip opens the panel. The Ask box asks, clears and notes the question.
    - The theme switch calls setTheme. Sign-out calls logout() about 3 ms before the CRM's sign-out.
    - When the script fails, the chip shows its toast and the Ask box falls back to the old answers.
    - An impersonated admin and a client get nothing.
    - The chip button looks identical to the old div (219×65).
  - `npm run typecheck` passes. `npm run lint` passes with only the existing no-img-element warnings. The production build in a separate dist dir passes, and no client chunk contains SAARTHI_STAFF.
- Leftover: 3 test `agent.ask` rows stay in the local audit_log (append-only trigger, not bypassed).
- Open:
  - End-to-end against a real Saarthi workspace hasn't been run yet: the browser checks used a stub. The Phase 6 exit (§13: Sarthi answers an Ask with real data) still needs it.
  - Ops, per environment: `ALTER ROLE sarthi_ro LOGIN PASSWORD …`, the Saarthi console setup and the three env vars (guide). Staging's quick-tunnel address changes when cnc-tunnel restarts, and Saarthi's CRM websites take exact addresses only.
  - Run `npm run check:saarthi-views` on staging after `prisma migrate deploy`. Staging has two group admins (Vipin, Nitin); dev has none (`npm run db:seed-groups` was left unrun on dev on purpose).
  - If tasks pass about 10k: split the data views into one branch per role and add indexes on task(cs_user_id) and eod_log(task_id), with matching @@index entries in schema.prisma.
  - A change to teamScope/brandScope/taskScope, or to a page's filter, needs the same change in the sarthi_* views (new migration). A v_* column change needs its v_my_* view dropped and recreated in the same migration. The checker flags drift.
  - Noticed, not changed (outside §10): app/api/invoices/[id]/pdf/route.ts refuses only employees. So a group admin can download invoice PDFs (drafts included) of their group's brands, although money pages are super-admin only for them.
