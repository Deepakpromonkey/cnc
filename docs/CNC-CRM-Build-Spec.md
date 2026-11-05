# Coffee & Creative CRM v2 — Build Spec

**Document type:** Build Spec (a Software Requirements Specification written for execution by Claude Code).
**Process:** Blueprint Handoff — approved HTML mockups + this Build Spec → Claude Code builds → acceptance checklist signed off by ProMonkey.
**Client:** Coffee & Creative Pvt. Ltd. (CNC), Noida. 24-year-old creative and ad agency, ~50 staff, ~20 active brands.
**Owner:** Gaurav (ProMonkey). **Builder:** Deepak, using Claude Code. **Version:** 1.0 · 24 Oct 2026.

---

## 0. How to use this document (read first)

1. The three HTML files are the **source of truth for UI and behaviour**. This document is the **source of truth for data, rules, permissions and integrations**. Where the two disagree, this document wins; raise it in the build log.
2. Build in the phase order in §13. Do not skip the migration phase; CNC's real data (19 brands, 37 users, 88 tasks) must come across.
3. Every screen in the HTML has a matching row in the acceptance checklists (§14). A phase is done only when every row for that phase is ticked by ProMonkey.
4. Sample data in the HTML (names, numbers, dates) is illustrative. Real data comes from the migration; after migration the screens must show real data with the same layout.
5. "Must", "must not" and "never" are hard requirements. "Should" is a strong default; deviate only with a reason written in the build log.
6. Claude Code setup: create `CLAUDE.md` in the repo root with §15 pasted in. Keep the three HTML files in `/design/` in the repo and reference them by path in every UI task.

### Files handed over

| File | What it is |
|---|---|
| `cnc-admin.html` | Admin portal (replaces Sarpanch). 12 views + drawers + forms. |
| `cnc-team.html` | Team portal (replaces Paltan). Employee view and Client-servicing (CS) view, switched by role. |
| `cnc-client.html` | Client portal (replaces Badelog). Light theme by default. |
| `1792759987056_wwnecgawzt.sql` | MySQL dump of the old CRM. Migration source. Never reuse its code; only its data. |
| This document | Build Spec. |

---

## 1. Goals and non-goals

**Goals**
- One codebase, one login URL, three role-based experiences (admin, team [employee + CS], client).
- Every module and every field of the old system carried over (see §5 table-by-table mapping). No silent drops.
- Task tracking that managers and CS can actually run from: real deadlines, status history, EOD logs, overdue visibility.
- Measurable employee performance: a nightly computed score with transparent parameters plus human flags.
- Client self-service: approvals, requests, invoices and online payment.
- AI-readable: a clean relational schema with foreign keys, enums and an audit log, exposed to Sarthi (ProMonkey's SaaS agent) through a read-only database role and a signed-token SDK. Sarthi is **not** built inside this CRM; it is plugged in (§10).
- Luxury, brand-faithful UI exactly as in the HTML (crimson #A0202A, cream, espresso, gold; Fraunces + Manrope; dark "Espresso" and light "Crema" themes; backdrop picker).

**Non-goals (v1)**
- No mobile apps. The web app must be fully responsive (the HTML already is).
- No chat inside the CRM. Conversation happens on WhatsApp via Sarthi.
- No accounting/GST filing; invoices and payments only.
- No reseller/multi-tenant layer. One tenant: CNC.

---

## 2. Stack and infrastructure

| Layer | Decision |
|---|---|
| Framework | Next.js 15 (App Router), TypeScript, React Server Components where sensible, Route Handlers for the API. |
| Server | Node.js 22 LTS. Background jobs with BullMQ on Redis (nightly scoring, reminders, notification fan-out, digest payloads for Sarthi). |
| Database | PostgreSQL 16. Prisma ORM with migrations committed to the repo. `pgcrypto` for UUIDs. Timezone of all stored timestamps: UTC (`timestamptz`); **all display and all business rules in `Asia/Kolkata`**. |
| Auth | Email + password with Argon2id hashing; session cookies (httpOnly, SameSite=Lax, secure) with server-side session table; password reset via emailed magic link (30 min expiry). No reversible encryption of passwords anywhere (the old system stored them reversibly; this must not be migrated). |
| File storage | Local disk on the VPS under `/var/cnc/uploads` served through a signed-URL route, abstracted behind a `Storage` interface so S3-compatible storage can be swapped in. Images only (jpg, png, webp, svg, gif), max 10 MB per file; server converts to webp thumbnails (320px, 1280px). Heavy files are links only (§6.9). |
| Email | SMTP (CNC's Google Workspace) via Nodemailer for invites, resets, invoice copies, receipts. |
| Payments | Razorpay Payment Links + webhooks (§6.11). |
| WhatsApp | Not sent by the CRM. The CRM emits events to Sarthi; Sarthi sends WhatsApp (§10). |
| Hosting | ProMonkey's VPS. Docker Compose: `web` (Next.js), `worker` (BullMQ), `postgres`, `redis`, `nginx` (TLS via Let's Encrypt). Nightly `pg_dump` to an off-box location, 30-day retention. |
| Domains | New: `app.coffeeandcreative.in` (confirm with CNC). `sarpanch.agencylife.in`, `paltan.agencylife.in`, `badelog.agencylife.in` → 301 to the new URL. |
| Observability | pino JSON logs, request IDs, Sentry (or equivalent) for errors, `/healthz`. |

Repo layout (suggested, keep flat):

```
/app              Next.js routes: /(auth) /(admin) /(team) /(client) /api
/components       shared UI (pills, drawer, tables, upload, charts)
/lib              auth, db (prisma), storage, razorpay, sarthi-sdk, scoring, time (IST helpers)
/jobs             BullMQ processors
/prisma           schema.prisma + migrations + seed
/migration        one-off MySQL → Postgres scripts (§12)
/design           the three HTML files (reference only)
/docs             this spec, build log, decisions
CLAUDE.md
```

---

## 3. Roles and permissions

Four roles. One user has exactly one role. A client login belongs to exactly one brand.

| Capability | Admin | CS | Employee | Client |
|---|---|---|---|---|
| Dashboard (Today) | all brands | own brands | own tasks | own brand |
| Brands: view | all | own (assigned as CS) | names only (on tasks) | own profile |
| Brands: create/edit/deactivate | yes | edit contact fields of own brands | no | edit own contact/preferences only (§8.8) |
| Projects: create/edit | yes | own brands | no | view own |
| Tasks: create/edit/assign/delete | yes | own brands | no (can comment, move own task between allowed statuses §6.3) | view own; approve/reject when "Awaiting client" |
| Review (approve to client / reject) | yes | own brands | no | n/a |
| CS rating of a task | yes | own brands | no | no |
| Client rating of a task | no | no | no | yes, own completed tasks |
| EOD log | view all | view own brands' assignees | write own | no |
| Attendance | view all, remarks, leave approval | view own + own brands' assignees | view own, apply leave | no |
| Concerns | view all, reply, resolve, log on behalf | view non-confidential ones raised by their assignees (read only) | raise own, read replies | no |
| Flags: raise | yes (employee or CS) | on employees of own brands' tasks | no | no (a client rejection with note auto-creates a "Client concern" flag only if admin enables it, default off) |
| Flags: view | all | given by self + on own brands | own received | no |
| Work requests | all; answer, hold, convert, log on behalf | own brands | no | raise, read replies, add to thread |
| Invoices | create, send, record offline payment, void | view own brands' | no | view own, pay online, download |
| Announcements/holidays | create, edit, archive | view | view | view those marked "show to clients" |
| Users & access | all | no | own profile | own profile |
| Settings (company, statuses, flags, departments, scope, titles, servicing, integrations) | yes | no | no | no |
| Notifications | own | own | own | own |
| Sarthi | ask (status Q&A), configure agent access | ask (own brands) | ask (own tasks) | receives digests; may reply on WhatsApp |

Enforce on the server (route handlers / server actions), never only in the UI. Every mutation checks role + ownership (brand ownership for CS, assignment for employee, brand for client).

---

## 4. Data model

Conventions: UUID primary keys (`id`), `created_at`, `updated_at` (timestamptz), `created_by` (user id, nullable for system), soft delete via `status` enum where listed, otherwise hard delete is forbidden for business entities (use `archived_at`). All text is `text`. Money in paise as `bigint`. All enums are Postgres enums unless marked *table* (dynamic lists managed in Settings).

### 4.1 Core

**company** (single row) — `legal_name`, `brand_name`, `gstin`, `address`, `city`, `state`, `pincode`, `country`, `timezone` (fixed `Asia/Kolkata`), `portal_url`, `logo_file_id`, `studio_hours_start`, `studio_hours_end`, `late_login_after` (time, default 10:30), `working_days` (int[] 1–7, default Mon–Sat).

**user** — `first_name`, `last_name`, `email` (unique, citext), `login_id` (unique), `password_hash`, `role` enum(`admin`,`cs`,`employee`,`client`), `brand_id` (FK, required when role=client, null otherwise), `department_id` (FK), `designation`, `photo_file_id`, `gender` enum(`female`,`male`,`other`,null), `dob` date, `mobile`, `whatsapp_no`, `personal_email`, `personal_contact`, `address`, `city`, `state`, `pincode`, `country`, `linkedin`, `facebook`, `instagram`, `status` enum(`active`,`inactive`), `invited_at`, `last_login_at`, `legacy_row_id` (old hash), `legacy_id`.

**session** — `user_id`, `token_hash`, `ip`, `user_agent`, `expires_at`, `last_seen_at`. (Also the attendance source, see `attendance_session`.)

**department** (*table*) — `name` (unique), `order`, `status`. Migrate 27 old rows → dedupe ("creative director" appears twice) → clean list.

**scope_of_work** (*table*) — `name` (unique), `default_rate_paise` (nullable), `status`. 76 old rows migrate; admin may merge later.

**task_title** (*table*) — `name`, `status`. From old `tasks_titles`.

**servicing_type** (*table*) — `name`, `short_description`, `description`, `status`. From old `servicing`.

**task_status** (*table, dynamic, §6.2*) — `name` (unique), `tone` enum(`neutral`,`crimson`,`gold`,`muted`), `order`, `is_start` bool (exactly one row), `is_done` bool (exactly one row), `is_client_gate` bool (the "Awaiting client" semantic, at most one), `is_review` bool (the "In review" semantic, at most one), `is_rejected` bool (at most one), `status`. Seed: New(start, crimson) · Progressing(neutral) · In review(review, gold) · Review rejected(rejected, crimson) · Awaiting client(client_gate, muted) · Completed(done, gold).

**flag_type** (*table, dynamic, §6.6*) — `name`, `colour` enum(`gold`,`crimson`,`cream`,`muted`), `points` int (signed), `note`, `status`. Seed: Praise(gold,+5 admin/+3 CS, see rule) · Red flag(crimson,−8) · Client concern(muted,−10).

### 4.2 Brands and projects

**brand** — every column of old `brands`: `name` (brand name), `company_name`, `division`, `logo_file_id`, `address`, `city`, `state`, `pincode`, `country`, `frequency` enum(`monthly_retainer`,`quarterly`,`yearly`,`project_based`), `payment_terms` (text, from a settings-managed list but free text allowed), `official_email`, `whatsapp`, `website`, `twitter`, `linkedin`, `facebook`, `instagram`, `other_social_link`, `poc_name`, `poc_phone`, `vat_number`, `gstin`, `additional_information`, `since_year`, `status` enum(`active`,`inactive`), `legacy_row_id`. The old `email`/`password` columns become **user** rows with role=client (one per login; multiple allowed). Old counters (`total_projects`, `total_tasks`, …) are **not** stored; compute.

**brand_cs** — `brand_id`, `user_id` (role=cs), `is_primary` bool. Replaces the old comma list.

**brand_scope** — `brand_id`, `scope_of_work_id`. Replaces the old comma list.

**project** — every column of old `projects`: `brand_id`, `name`, `brand_poc`, `poc_phone`, `type` (text from list: Social media, Campaign, Packaging, Print, Launch, Brand identity, E-commerce, Website, Event, Other), `sub_type`, `description`, `start_date`, `deadline` date, `reference_link_1/2/3`, `payment_terms`, `priority` enum(`low`,`normal`,`high`,`urgent`), `status_id` (FK task_status; projects reuse the task status list), `archived_at`, `legacy_row_id`.

**project_scope** — `project_id`, `scope_of_work_id`.

**project_comment** — `project_id`, `user_id`, `body`, `file_id` (optional image). From old `projects_comments`.

### 4.3 Tasks

**task** — `brand_id`, `project_id`, `title_id` (FK task_title), `name`, `description`, `servicing_type_id`, `priority` enum, `start_date` date, `deadline_at` timestamptz (**required**, replaces free-text `manual_deadline`; migration parses what it can, else sets 18:00 IST of `deadline` date and flags `deadline_was_text=true`), `status_id` (FK task_status), `cs_user_id` (FK user role=cs), `created_by`, `started_at`, `submitted_at`, `completed_at`, `share_with_client` bool default true, `sarthi_nudge` bool default true, `legacy_row_id`.

**task_assignee** — `task_id`, `user_id`, `department_id` (snapshot at assignment), `start_date`, `end_date`, `is_lead` bool. Many per task (old `tasks_employees`). At least one required on create.

**task_attachment** — `task_id`, `kind` enum(`upload`,`link`), `file_id` (when upload), `url` (when link), `label`, `uploaded_by`, `visible_to_client` bool default true. Uploads are images only; links for everything else (§6.9).

**task_status_history** — `task_id`, `from_status_id`, `to_status_id`, `by_user_id`, `note`, `at`. Written on every change, including system changes. (Old `tasks_status`.)

**task_comment** — `task_id`, `user_id`, `body`, `file_id`, `visible_to_client` bool default false. Mentions via `@` stored as `mentions uuid[]`.

**eod_log** — `user_id`, `task_id`, `date` (IST date), `remark`, `status_at_time` (text snapshot), unique (`user_id`,`task_id`,`date`). (Old `employees_tasks_status`.)

**task_rating** — `task_id`, `rated_by_user_id`, `rater_kind` enum(`client`,`cs`), `stars` int 1–5, `review`, `at`. Unique per (task, rater_kind). Client rating = old `brand_rating`, `brand_review`, `brand_review_submission`.

### 4.4 People operations

**attendance_session** — `user_id`, `login_at`, `logout_at` (null while open), `auto_logout` bool, `session_id`, `ip`, `user_agent`. One row per login. (Old `employees_login_logs`.)

**attendance_day** (materialised nightly and on logout) — `user_id`, `date` (IST), `first_login_at`, `last_logout_at`, `hours` numeric, `state` enum(`present`,`late`,`absent`,`leave`,`holiday`,`weekend`), `remark`, `remark_by`. (Old `employees_attendances`.)

**leave_request** — `user_id`, `from_date`, `to_date`, `type` enum(`casual`,`sick`,`half_day`,`wfh`), `reason`, `status` enum(`pending`,`approved`,`rejected`), `decided_by`, `decided_at`.

**concern** — `raised_by_user_id`, `category` enum(`workload`,`client_behaviour`,`process`,`team`,`leave`,`equipment`,`workplace`,`pay`,`other`), `subject`, `details`, `file_id` (optional screenshot), `confidential` bool, `owner_user_id` (admin), `sla_hours` int default 24, `status` enum(`open`,`in_discussion`,`resolved`), `resolved_at`, `logged_on_behalf_by` (nullable), `legacy_row_id`. (Old `concerns` had one reply; v2 has a thread.)

**concern_reply** — `concern_id`, `user_id`, `body`, `at`.

**flag** — `flag_type_id`, `target_user_id`, `target_role` enum(`employee`,`cs`), `given_by_user_id`, `brand_id`, `project_id`, `task_id` (all nullable), `subject`, `feedback`, `points_applied` int (snapshot of flag_type.points at the time, with the admin/CS rule applied), `month` (date, first of month, IST). (Old `flags_employees` + `flags_client_servicing`.)

**performance_score** — `user_id`, `month`, `score` int, `rank_in_dept` int, `breakdown jsonb` (each parameter's raw value, normalised value, weight), `computed_at`. See §6.7.

**scoring_weight** (*table*) — `parameter` (enum of the 8 parameters), `weight` int, `enabled` bool. Editable by admin in Settings → Scoring rules.

### 4.5 Client-facing

**work_request** — every column of old `work_request`: `brand_id`, `project_id` (nullable), `subject`, `description`, `date` (raised), `reference_link`, `needed_by` date, `poc_name`, `poc_contact`, `priority` enum, `status` enum(`new`,`answered`,`on_hold`,`converted`), `owner_user_id` (CS), `converted_task_id`, `raised_by_user_id` (client user or staff when logged on behalf), `legacy_row_id`.

**work_request_attachment** — `work_request_id`, `kind`, `file_id`/`url`, `label`.

**work_request_reply** — `work_request_id`, `user_id`, `body`, `at`, `visible_to_client` bool default true.

**announcement** — every column of old `announcement`: `type` enum(`announcement`,`holiday`), `subject`, `date`, `message`, `show_to_clients` bool, `image_file_id`, `posted_by`, `archived_at`, `legacy_row_id`.

**invoice** — `number` (sequence `INV-{n}`), `brand_id`, `issue_date`, `due_date`, `subtotal_paise`, `gst_rate` numeric (default 18), `gst_paise`, `total_paise`, `notes`, `status` enum(`draft`,`sent`,`viewed`,`paid`,`overdue`,`void`), `razorpay_link_id`, `razorpay_short_url`, `sent_at`, `viewed_at`, `paid_at`, `reminders_enabled` bool, `created_by`.

**invoice_item** — `invoice_id`, `description`, `qty`, `unit_paise`, `amount_paise`.

**payment** — `invoice_id`, `amount_paise`, `method` enum(`upi`,`card`,`netbanking`,`wallet`,`offline`), `razorpay_payment_id`, `razorpay_signature_ok` bool, `reference` (for offline), `received_at`, `recorded_by`.

**invoice_event** — `invoice_id`, `kind` enum(`created`,`sent`,`viewed`,`reminder`,`paid`,`voided`), `by_user_id` nullable, `meta jsonb`, `at`. Drives the "Trail" in the UI.

### 4.6 Platform

**file** — `storage_key`, `original_name`, `mime`, `bytes`, `width`, `height`, `thumb_320_key`, `thumb_1280_key`, `uploaded_by`, `purpose` enum(`brand_logo`,`user_photo`,`task`,`project`,`request`,`comment`,`concern`,`announcement`,`company_logo`).

**notification** — `user_id` (receiver), `module` enum(`task`,`approval`,`request`,`concern`,`flag`,`invoice`,`announcement`,`attendance`,`sarthi`,`system`), `event` (text key), `title`, `body`, `link` (in-app path), `read_at`, `emitted_at`. One row per receiver (fan-out happens in the worker, not in the request). Old `notifications` (945 rows) are migrated as read.

**audit_log** — `actor_user_id` (null for system/Sarthi), `actor_kind` enum(`user`,`system`,`agent`), `action` (e.g. `task.status.changed`), `entity_type`, `entity_id`, `before jsonb`, `after jsonb`, `ip`, `at`. Append-only; every mutation through the API writes one row. Sarthi's reads are logged here too (`action='agent.query'`, `after={sql, rowcount}`).

**agent_access** (Sarthi config, §10) — `agent_name`, `db_role` (Postgres role name), `allowed_queries jsonb` (named, parameterised SQL the agent may run), `webhook_url`, `webhook_secret`, `enabled`.

**setting** — key/value for anything else (`payment_terms_options`, `digest_time`, `nudge_interval_hours`, `eod_chase_time`, `reminder_schedule`).

### 4.7 Indexes and constraints (minimum)
- FKs on every `*_id` with `ON DELETE RESTRICT` (business data) or `CASCADE` (child rows like comments, history, attachments).
- `task(brand_id, status_id)`, `task(deadline_at)`, `task_assignee(user_id)`, `task_status_history(task_id, at)`, `eod_log(user_id, date)`, `attendance_session(user_id, login_at)`, `notification(user_id, read_at)`, `invoice(brand_id, status)`, `audit_log(entity_type, entity_id, at)`.
- Check constraints: `stars between 1 and 5`; `deadline_at >= start_date`; exactly one `is_start` and one `is_done` task_status (enforce in service layer + partial unique index).

---

## 5. Old → new mapping (migration contract)

| Old table | New home | Notes |
|---|---|---|
| `brands` | `brand`, `brand_cs`, `brand_scope`, `user`(client) | `cs` comma list → `brand_cs` by matching names/ids; `scope_of_work` comma list → `brand_scope`; `email`+`password` → client user with **forced password reset** (passwords are not migrated); `freguency` → `frequency` enum; `image` → `file` (download old image if still reachable, else null). |
| `projects` | `project`, `project_scope` | `scope_of_work` comma list → `project_scope`; `status` → `task_status` by mapping table in §12. |
| `projects_comments` | `project_comment` | |
| `tasks` | `task` | `task_title` → `title_id`; `servicing_id` → `servicing_type_id`; `employee_assigned` + `tasks_employees` → `task_assignee`; `deadline`+`manual_deadline` → `deadline_at` (§12 parsing rule); `files` (comma paths) → `task_attachment` links; `brand_rating/review/submission` → `task_rating`(client). |
| `tasks_employees` | `task_assignee` | |
| `tasks_attachments` | `task_attachment` | kind=link if a URL, kind=upload if an old file is still downloadable. |
| `tasks_comments` | `task_comment` | |
| `tasks_status` | `task_status_history` | status slugs mapped per §12. |
| `tasks_titles` | `task_title` | |
| `servicing` | `servicing_type` | |
| `status_list` | `task_status` | 15 mixed old statuses → 6 seeds + request statuses (§12 map). The old comma-list counters (`task_ids` etc.) are dropped. |
| `employees_tasks_status` | `eod_log` | |
| `employees_attendances` | `attendance_day` | Recompute `hours`; old punch times were UTC-shifted — treat stored values as UTC and convert to IST (verify against a known day with Vipin before bulk run). |
| `employees_login_logs` | `attendance_session` | |
| `concerns` | `concern` + one `concern_reply` when `reply` present | `confidential=false` for migrated rows. |
| `flags`, `flags_employees`, `flags_client_servicing` | `flag_type`, `flag` | old red/green/blue → Red flag / Praise / Client concern. |
| `departments` | `department` | dedupe. |
| `scope_of_work` | `scope_of_work` | |
| `announcement` | `announcement` | |
| `work_request` | `work_request` | `reference` → `reference_link` or attachment. |
| `notifications` | `notification` (read) | |
| `users` | `user` | role map admin/cs/employee; `login_id` kept; passwords dropped → invite/reset email on go-live; counters dropped. |
| `clients` | — | empty in dump; not migrated. |
| `users_old`, `cache*`, `jobs*`, `sessions`, `password_reset_tokens`, `personal_access_tokens`, `migrations`, `failed_jobs` | — | not migrated. |

Test/junk accounts to exclude (confirm list with Gaurav before running): users "Promonkey Demo", "Deepak Gandhi", "Deepak2", "promonkey cs demo"; brands with placeholder names (e.g. `fjhvbkj`, `dfghj`, `bebo beauty` test row if confirmed) and any brand whose fields are keyboard mash.

---

## 6. Business rules

### 6.1 Time
- Everything the user sees is IST. Deadlines are entered as date + time (IST) and stored UTC.
- "Today", "due today", "late" are computed in IST.
- Lateness label: `< 1 h` → "N min late"; `< 12 h` → "N h late"; else `max(1, round(hours/24))` d late. Shown in crimson.

### 6.2 Task statuses (dynamic)
- Admin manages the list in Settings (add, rename, recolour, reorder, remove). Rename carries existing tasks. Remove is blocked while any task or project sits on that status, and for the `is_start`/`is_done` rows.
- The board columns, every status pill, every "Move to" menu, the dashboard flow strip and the client-portal step bar read from this table. Nothing is hard-coded except the four semantic flags (`is_start`, `is_review`, `is_client_gate`, `is_rejected`, `is_done`).
- Client-facing labels are derived from semantics, not names: start→"Queued", review→"Internal review", client_gate→"Your approval", done→"Done", anything else→"In the works".

### 6.3 Task flow and who may move what
- Create: admin, CS (own brands). Required: brand, project (or create inline), title type, name, ≥1 assignee with department, CS, priority, deadline date+time. Optional: description, servicing, start date, attachments/links, `share_with_client`, `sarthi_nudge`.
- Employee may move own task: start→Progressing (sets `started_at`), Progressing/Rejected→In review (sets `submitted_at`, requires at least one attachment or link unless admin disables the rule), and may "Pause" (a `task_comment` with `kind=pause`, not a status).
- CS/admin review: In review → `Awaiting client` (if `share_with_client`) or → `Completed` (if not shared); or → `Review rejected` with a **mandatory** note (one consolidated note; the UI blocks empty). Rejection note is stored in `task_status_history.note` and sent to assignees.
- Client: Awaiting client → Completed (approve, optional note) or → Review rejected (mandatory note). Only client users of that brand. Approval sets `completed_at`.
- Admin may move anything to anything; every move writes history.
- A task counts as **late** when `now > deadline_at` and status is not done/client_gate/review. (Review and client gate pause lateness for the assignee; CS turnaround is measured separately.)

### 6.4 EOD log
- One line per active task per working day, written by the assignee from the Team portal (Today card or EOD view).
- At `eod_chase_time` (default 19:30 IST) the worker finds assignees with ≥1 active task and no `eod_log` for today and emits `eod.missing` to Sarthi (which chases on WhatsApp). Missing EODs feed the score.

### 6.5 Attendance
- Attendance is **derived from logins**. `attendance_session` row on login; `logout_at` on explicit logout, session expiry, or the midnight job (`auto_logout=true`, logout_at = 23:59:59 IST).
- `attendance_day.first_login_at` = earliest login of the IST day; `last_logout_at` = latest logout; `hours` = difference (cap 14 h; auto-logout days are shown with an "auto" tag).
- `state`: `holiday` if an announcement of type holiday has that date; `weekend` if not a working day; `leave` if an approved leave covers it; `absent` if a working day with no session; `late` if first login > `late_login_after`; else `present`.
- Admin/CS can add a remark; admin can override `state` (audited).
- Leave requests go to admin; approval writes `leave` days.

### 6.6 Flags (dynamic types)
- Admin manages `flag_type` (name, colour from the four palette tokens, signed points, note). Remove is blocked while any flag of that type exists in the current month.
- Raising a flag: admin on employee or CS; CS on employees assigned to tasks of their brands. Fields: target, type, brand, project, task (all optional context), subject, feedback (required).
- Points applied = type points, except **Praise** given by CS applies +3 and by admin +5 (this special-case is a setting: `praise_cs_points`, `praise_admin_points`).
- Monthly cap: sum of flag points per user per month is clamped to ±15 in the score.
- Flags are visible to the target user (name of the giver, date, subject). Decision from Gaurav: **employees see their own flags and score** (transparency); keep a setting `score_visible_to_employee` default true.

### 6.7 Performance score (computed nightly 00:30 IST, per user with role employee or cs, per IST month)
Parameters, each normalised to 0–100, then weighted (weights editable in Settings; defaults below):

| Parameter | Computation (current month, IST) | Default weight |
|---|---|---|
| On-time delivery | completed tasks with `submitted_at ≤ deadline_at` ÷ completed tasks | 25 |
| Review pass rate | tasks whose **first** submission was not rejected ÷ tasks submitted | 20 |
| CS rating | avg `task_rating(cs).stars` × 20 | 20 |
| EOD discipline | days with EOD for every active task ÷ working days with ≥1 active task | 10 |
| Attendance | present+late days ÷ working days, minus 2 per late login (floor 0) | 10 |
| Client approval rate | tasks approved by client first time ÷ tasks sent to client | 5 |
| Throughput vs peers | user's weighted completed count ÷ department median, capped at 100 | 5 |
| Rework | 100 − (hours spent after a rejection ÷ total hours)×100 (hours from status history) | 5 |

`score = Σ(normalised × weight) ÷ Σ(weights) + clamp(Σ flag points, −15, +15)`, clamped 0–100. Store `breakdown` for display. Rank within department. For CS users use the CS parameter set shown in `cnc-team.html` (client rating on their brands 30, requests answered < 24 h 20, reviews turned in < 24 h 20, on-time on their brands 20, EOD 10) plus flags.

### 6.8 Concerns
- Raised by employee/CS from the Team portal; admin may log on behalf. `confidential=true` hides it from CS leads entirely (only admin + owner).
- Owner defaults to the admin user flagged as HR (setting `hr_user_id`); SLA 24 h; `open` → first reply sets `in_discussion`; "Mark resolved" sets `resolved_at`; reopen allowed.
- Every reply notifies the other party (in-app + Sarthi WhatsApp).

### 6.9 Files policy
- **Upload directly** (no link asked): brand logo, user photo, announcement image, images on tasks, projects, requests, comments, concerns.
- **Drive link option** appears beside the uploader only on task brief/updates, project references and work requests, with the copy "Heavy files? paste a Google Drive / Frame.io link for videos, PSDs, raw shoots".
- Images only on upload (validate mime + magic bytes), 10 MB cap, strip EXIF, generate webp thumbnails. Links are validated as http(s) URLs and stored as-is.

### 6.10 Work requests
- Client raises (project optional, subject, description, needed-by, priority, POC name + contact, reference images and/or link). Status `new`; owner = brand's primary CS.
- CS/admin: answer (reply visible to client), put on hold, convert to task (prefills brand, project, name=subject, brief link/attachments; sets `converted_task_id`, status `converted`), or log on behalf.
- First-reply time is tracked for the CS score.

### 6.11 Invoices and payments (Razorpay)
- Admin raises: brand, issue date, due (from terms options or explicit date), line items, GST rate (default 18, 0 for export). Draft → Send creates a Razorpay Payment Link for `total_paise`, stores `short_url`, emails the client users, emits `invoice.sent` to Sarthi.
- Client portal shows the invoice with Pay (UPI/card/netbanking) via the Razorpay link (open in new tab / Razorpay Checkout). Webhook `payment_link.paid` (signature verified) → `payment` row, invoice `paid`, `paid_at`, receipt email, `invoice.paid` event.
- Viewed: first open of the client invoice page sets `viewed_at` and status `viewed` (if `sent`).
- Overdue: nightly job sets `overdue` when `due_date < today` and unpaid. Reminders: 3 days before due, on due date, then every 5 days (setting `reminder_schedule`), emitted as events to Sarthi; "Remind now" button emits immediately.
- Offline payment: admin records amount, method `offline`, reference; partial payments allowed; invoice `paid` when sum ≥ total.
- Void: only admin; voided invoices stay visible with status `void`.

### 6.12 Announcements and holidays
- Announcement: subject, date, message, image, `show_to_clients`, broadcast toggle (emits `announcement.posted` to Sarthi).
- Holiday: subject, date, note, `show_to_clients` default true. Holidays feed attendance state and Sarthi pauses digests/nudges on those days.

### 6.13 Notifications
In-app bell (unread count, list, mark all read) for every user. Events and receivers:

| Event | Receivers |
|---|---|
| task.assigned / task.updated | assignees, CS |
| task.status.changed | assignees, CS, admin (only to review/rejected/client_gate/done); client users when `share_with_client` and status is client_gate or done |
| task.comment / project.comment | participants + mentions |
| task.rejected (by CS or client) | assignees, CS |
| request.created | brand CS, admin |
| request.replied | client users, CS |
| concern.created / concern.replied | owner admin / raiser |
| flag.given | target user |
| invoice.sent / viewed / paid / overdue | admin, brand CS; client users for sent/paid |
| announcement.posted | all staff; clients if `show_to_clients` |
| leave.requested / decided | admin / requester |
| eod.missing, task.late (hourly) | assignee (via Sarthi only, no in-app spam) |

All events are also written to an outbox table and delivered to Sarthi's webhook (§10).

---

## 7. Portal specs — Admin (`cnc-admin.html`)

Navigation (left rail, in this order): Today · Brands (count) · Projects & Tasks (late count, crimson) · Team · Users & access · Concerns (open count, crimson) · Announcements · Work Requests (new count) · Invoices · Attendance · Sarthi · Settings. Top bar: live IST clock, "Ask Sarthi" box, notifications bell, theme toggle, backdrop picker, user chip.

| View | Must contain (as in HTML) | Data/behaviour |
|---|---|---|
| **Today** | Hero greeting with counts (overdue, due today, awaiting client, new requests, outstanding ₹); "Running late" list; Sarthi panel (last Q&A, nudges/digests/answers counts); Brand health grid (8 cards, ring = health score); Team scores top 7 with flags; Attendance today; Work requests top 3; Invoices collected bar + 4 latest; Flow strip (count per status). | Health score per brand = 100 − 10×late tasks − 5×tasks awaiting client > 3 days − 15 if any invoice overdue − 5 if a rejected task is open, floor 0 (document in code; admin-tunable later). Links jump to the relevant tab. |
| **Brands** | Stats; chips All/Retainers/Project-based/Needs attention/Awaiting client; search; table (logo, name, company, CS +n, engagement, open, awaiting, health, invoice, last activity); detail panel with tabs Profile (all §4.2 fields) / Projects / Open tasks / Portal logins; buttons Edit brand, New project, New task, Raise invoice. | Edit brand drawer = every field (§4.2) with logo uploader. Portal logins tab: list client users, send reset, add login, "View as client" (impersonation, audited, admin only). |
| **Projects & Tasks** | Board / List / Projects modes; stats; chips All/Overdue/Due today/Awaiting client/Nothing shared yet; search; board columns from `task_status`; task drawer (status, priority, title, servicing, assignees with dept, CS, creator, start, deadline, deliverables with uploader + Drive link, Move to, client approval block, client rating, CS rating stars, timeline, EOD log, comments, Save/Edit/Ask Sarthi to nudge); project table + drawer (all §4.2 fields, tasks, comments); New task / New project forms (all fields). | Drag-and-drop between columns is a nice-to-have; the "Move to" select is required. |
| **Team** | Stats; chips by dept/flagged; scorecard table (8 columns of parameters + flags + score); person panel (score, parameter bars, flags, tasks on desk, Raise a flag); "Scoring rules" drawer (table of parameters/weights, flag points); CS team table (brands, open, late, unanswered requests, avg client rating, flags); Add team member. | Scores from `performance_score`; weights from `scoring_weight` (editable in the rules drawer for admin). |
| **Users & access** | Stats; chips Admin/CS/Employees/Clients; search; table; user drawer with every §4.1 field, edit, reset, deactivate; Add team member / Add client login forms (every field, photo uploader). | Invite sends email (and `user.invited` event for WhatsApp). |
| **Concerns** | Stats; chips; table; detail with thread, owner, visibility, SLA, reply, resolve, reassign; Log a concern form. | §6.8. |
| **Announcements** | Stats; chips; list with date block; detail; New announcement / Add holiday forms with image uploader. | §6.12. |
| **Work Requests** | Stats; chips; table; detail (all §4.5 fields, reference, reply, Convert to task, Answer, Hold, Log a request). | §6.10. |
| **Invoices** | Stats (billed, collected, due, overdue, settlement); chips; table; detail with trail and actions; Raise invoice form (line items, GST, due rule, Razorpay toggle, reminders toggle). | §6.11. |
| **Attendance** | Stats; chips Today/This week/Month; table (first login, last logout, hours, state, Mon–Fri dots); row click → login-log drawer (sessions, auto tag, remark, mark on leave). | §6.5. |
| **Sarthi** | Conversation (Q&A), ask box; Automations list with toggles; today's action log. | Reads `agent_access` + event outbox; toggles call Sarthi's API to enable/disable that automation for CNC (§10). |
| **Settings** | Company card; Users & roles card (counts, All users, Add team member); Integrations (WhatsApp via Sarthi, Razorpay, Uploads & Drive policy, Agent read access); Task statuses (pills + "+" + pencil → drawer: name, colour, position, remove); Task titles; Servicing types; Flags (list + "+" + pencil → drawer: name, colour, points, note, remove); Departments; Scope of work. | Each list is a `*table*` in §4. Drawer forms as in HTML; inline editing is **not** wanted. |

Drawer/scrim, toasts, pills, rings and bars behave exactly as the HTML; reuse its CSS tokens.

---

## 8. Portal specs — Team (`cnc-team.html`)

One portal, role decides the rail. The HTML's "Employee view / CS view" switch is a demo control: in production the rail follows the logged-in user's role and the switch is removed.

**Employee rail:** Today · My tasks (open count) · EOD log · Attendance · Concerns · Announcements · My score · Profile.
**CS rail:** Today · My brands · Review queue (count, crimson) · Tasks · Work requests (new count) · Client digest · Flags · EOD log · Attendance · Concerns · Announcements · Profile.

| View | Must contain | Rules |
|---|---|---|
| Today | Hero with late / due today / in review / with client counts; "On my desk" list; attendance card (first login, hours so far, no punch button); Sarthi card with ask box; EOD quick form (one line per active task + status select, Save); noticeboard. | Ask box answers via Sarthi SDK scoped to the user's own tasks (employee) or brands (CS). |
| My tasks | Board/List, chips All/Late/Due today/Rejected/Done, stats; task drawer: status, priority, deadline, CS, co-assignees, rejection note block, brief & references, "Share my work" uploader + Drive link, action button (Start / Submit for review / Resubmit), Pause, today's EOD line, timeline, comments; CS additionally Edit task + Flag assignee. | §6.3 transitions. Submit requires ≥1 attachment/link. |
| EOD log | History grouped by day; today's form for all active tasks. | §6.4. |
| Attendance | Stats (days present, late logins, absent, avg day, leaves left); month calendar with states; sessions table; Apply for leave form. | §6.5. |
| Concerns | My concerns as threaded cards; Raise a concern form (category, subject, details, optional screenshot, confidential toggle). | §6.8. |
| Announcements | List with date block. | |
| My score | Score with parameter bars and weights, rank, trend (last 2 months), "biggest lift available" sentence (rule-based: lowest-weighted-gap parameter), flags received. | §6.7; hidden if `score_visible_to_employee=false`. |
| Profile | All own fields; Edit profile (contact/address/social/photo only; name/role/dept/designation are admin-set); Change password. | |
| **CS: My brands** | Stats; table of own brands (POC, open, late, awaiting, invoice); detail (profile fields, scope, projects, New task/New project, Hold today's digest). | |
| **CS: Review queue** | Stats (waiting, avg turnaround, pass rate, rejected this month); cards with files, consolidated note textarea, star rating, Approve → client portal / Reject with note. | §6.3; empty note blocks reject; approve writes CS rating if stars set. |
| **CS: Tasks** | Same as My tasks but scoped to tasks where user is CS. | |
| **CS: Work requests** | Own brands' requests; detail with reply, Convert to task, Answer, Hold, Log a request. | §6.10. |
| **CS: Client digest** | One card per brand: the 9:00 digest text as Sarthi sends it, "Add a line", "Hold tomorrow". | Reads the digest preview from Sarthi (`GET /digest/preview?brand=`); add-a-line and hold call Sarthi's API. |
| **CS: Flags** | Flags raised by me; Raise a flag form (employee only for CS). | §6.6. |

---

## 9. Portal specs — Client (`cnc-client.html`)

Light theme default. Rail: Home · Approvals (count) · Work · Projects · Requests · Invoices (due count) · Notices · Your brand. No "Ask Sarthi" box in v1 (clients interact with Sarthi on WhatsApp).

| View | Must contain | Rules |
|---|---|---|
| Home | Hero (approvals waiting, in the works, done this month, open requests); Waiting on you list with Review buttons; "Your team at C&C" (brand CS users with phone/email, studio hours); today's digest card; In the works list with 5-step bar; Invoices & notices. | Only tasks with `share_with_client=true` are ever visible to clients. |
| Approvals | Stats; cards with file previews (thumbnails of image uploads; link chips), note textarea, Approve / Send back with note. | §6.3. |
| Work | Chips by client-language status; table with step bar, expected date, shared files; piece drawer: step bar, description, expected/delivered, CS, files, approval block, rating (stars + line) when done, story (status history in client language, rejections and EOD hidden), Request a change. | Client never sees internal comments, EOD, assignee names (CS name only), or internal rejection notes. |
| Projects | Stats; cards with description, progress bar, piece list, latest comment flagged `visible_to_client`. | |
| Requests | Table + detail thread; New request form (project, what, details, needed by, priority, contact, reference images uploader + Drive link, reference link). | §6.10. |
| Invoices | Stats (due now, paid this year, terms, GST); table; detail with Pay (UPI/Card/Netbanking → Razorpay), receipt/PDF downloads for paid. | §6.11. Invoice PDF generated server-side (simple branded template; include CNC GSTIN, client GSTIN, line items, GST split, payment status). |
| Notices | Announcements/holidays with `show_to_clients`. | |
| Your brand | Profile (company, contacts, address, GSTIN, socials, scope, engagement) read-mostly; Edit details (own name, phone, WhatsApp, login email, Instagram, website, logo upload); Change password; Preferences toggles (daily digest, approval pings, invoice emails, weekly summary, allow Sarthi Q&A). | Preferences are stored on the brand (`brand_preferences jsonb`) and pushed to Sarthi. |

---

## 10. Sarthi integration (plugged-in SaaS, not built here)

Decision (24 Oct 2026): Sarthi stays a ProMonkey SaaS product. CNC is a customer on the Sarthi platform. The CRM ships only the plumbing:

1. **Read-only database role.** Postgres role `sarthi_ro` with `SELECT` on a set of views (`v_tasks`, `v_brands`, `v_people`, `v_invoices`, `v_requests`, `v_attendance_days`, `v_eod`) that already apply the client-language mapping and exclude `password_hash`, confidential concerns, and internal comments. Concerns are **excluded entirely** from agent access. All agent queries are logged in `audit_log` via `pgaudit` or the proxy.
2. **Allowed queries (limited mode).** `agent_access.allowed_queries` lists named, parameterised SQL (e.g. `tasks_by_brand(brand)`, `overdue_tasks()`, `task_status(task_name)`, `invoices_outstanding()`, `who_is_in_today()`, `my_tasks(user)`). Admin can view them in Settings → Integrations → Agent read access. Sarthi's limited mode uses only these.
3. **Identity SDK.** `/lib/sarthi-sdk` issues a signed JWT (HS256, `agent_access.webhook_secret`) with `user_id`, `role`, `brand_ids`, `name`, `whatsapp`. The Ask boxes in Admin/Team post `{token, question}` to Sarthi's `/ask` and render the answer. Clients are identified by WhatsApp number on Sarthi's side.
4. **Event outbox.** Every event in §6.13 is written to `event_outbox` and POSTed to `agent_access.webhook_url` with an HMAC signature, with retries (BullMQ). Payloads include everything Sarthi needs to compose the message (task, brand, assignee names and WhatsApp numbers, deadline, link to the task).
5. **Automations live on Sarthi.** Daily client digest (09:00), overdue nudges (every 2 h while late, copy CS), status Q&A, invoice reminders, EOD chaser (19:30), weekly performance note. The CRM's Sarthi view shows their on/off state by calling Sarthi's API (`GET/PUT /customers/cnc/automations`) and shows today's actions from `GET /customers/cnc/log?date=`. Holidays are pushed to Sarthi so it pauses on those days.
6. **Nothing in the CRM sends WhatsApp.** If Sarthi is unreachable, the CRM keeps working; the outbox retries; in-app notifications are unaffected.

---

## 11. Design system (from the HTML — reuse, don't reinvent)

- Tokens in `:root` with dark/light variants exactly as in the HTML (`--bg`, `--surface`, `--fg`, `--brand #a0202a`, `--brand-ink`, `--gold`, `--cream`, `--muted`, `--line`, `--veil`, `--glow`). Light theme default for the client portal, dark for admin and team; user toggle persisted per user (`user_preferences jsonb`), not only localStorage.
- Fonts: Fraunces (display, italic accents) + Manrope (body), Google Fonts.
- Components to extract: shell/rail, top bar (clock, ask, bell, theme, backdrop, user chip), hero, tile/pour, card + card-h, stats/stat, chips, search, table (`tbl`, `tight`), pills (`st`), ring, member bar, board/col/tcard, drawer + scrim, forms (field, two, sw toggle, upload drop/thumbs, orlink), kv/pgrid/pf, timeline `tl`, bubbles, toast, defrow replaced by pill + pencil pattern.
- Backdrop picker: six CSS presets + user image upload (store as a `file`, purpose `backdrop`, per user).
- Logo: the official webp is embedded in the HTML as data URI; in the app serve `/public/brand/logo-red.webp` and `logo-cream.webp`.
- Responsive to 400 px; no horizontal scroll except board/tables inside their own scroll containers.

---

## 12. Migration plan (MySQL dump → Postgres)

1. Load the dump into a scratch MySQL (Docker). Write `/migration/*.ts` scripts run in this order: lookups (departments dedupe, scope, titles, servicing, statuses) → users (staff) → brands + brand_cs + brand_scope + client users → projects → tasks + assignees + attachments + history + comments + ratings → eod → attendance sessions/days → concerns → flags → requests → announcements → notifications (read).
2. Keep `legacy_row_id` and `legacy_id` on every migrated row; produce `/migration/report.md` with counts per table (source vs created vs skipped with reasons).
3. Status map (old slug → new): `new`→New; `progressing`, `progressing-from-review`, `paused`, `delay`, `task-on-hold`, `pending`→Progressing (with a history note of the old value); `in-review`→In review; `review-rejected`→Review rejected; `completed`→Completed; old query statuses `not-answered`/`answered`/`replied`/`on-hold`/`cancelled` are work-request statuses → new/answered/answered/on_hold/on_hold (+ note). Anything unmapped → Progressing + note, listed in the report.
4. Deadline parsing: if `manual_deadline` parses as a date/time (try `dd/mm/yyyy`, `dd-mm-yyyy`, `yyyy-mm-dd`, with optional `hh:mm`), use it; else use `deadline` date at 18:00 IST; set `deadline_was_text` and keep the raw text in `description` under "Legacy deadline note:".
5. Comma-separated `cs`, `scope_of_work`, `files`, `employee_assigned` → junction rows; log unmatched names.
6. Timezone: confirm with Vipin on two known days whether old punch times were UTC or IST, then convert once.
7. Passwords: none migrated. On go-live send every active user an invite/reset email; client users get a WhatsApp via Sarthi too.
8. Exclusions per §5. Dry-run twice on staging; final run on go-live night with the old system set read-only.

---

## 13. Build phases

| Phase | Scope | Exit criteria |
|---|---|---|
| 0 Foundation (3 d) | Repo, Docker Compose, Prisma schema (all of §4), seeds for dynamic lists, auth + sessions + roles, design tokens + shell + top bar + drawer + toast components, storage service, audit log middleware. | Login as each role shows the right empty rail; schema migration applies clean; `npm run check` (typecheck, lint, tests) green. |
| 1 Admin core (6 d) | Brands (all fields), Users & access, Settings (all lists incl. dynamic statuses/flags), Projects, Tasks (board/list/drawer/forms, status engine, history, attachments, comments). | §14 Admin rows A1–A6 ticked. |
| 2 Team portal (5 d) | Employee: Today, My tasks, EOD, Attendance (sessions → days), Concerns, Announcements, Profile, leave. CS: My brands, Review queue, Tasks, Work requests, Flags. | §14 Team rows ticked; attendance day computation verified against two real days. |
| 3 Client portal (4 d) | Home, Approvals, Work, Projects, Requests, Notices, Your brand; client-language mapping; visibility rules. | §14 Client rows ticked; a client can approve/reject end-to-end and the team sees it. |
| 4 Money (3 d) | Invoices, items, PDF, Razorpay links + webhooks, payments, reminders (events), overdue job. | Test-mode payment flows green; webhook signature verified; PDF matches template. |
| 5 Scoring + notifications (3 d) | Nightly scoring job, flags points, scoring weights UI, notifications fan-out + bell, event outbox. | Score for a seeded month matches a hand-computed sheet; every event in §6.13 appears in the bell. |
| 6 Sarthi plumbing (2 d) | RO role + views, allowed queries, SDK token, outbox webhook with HMAC + retries, Sarthi view, digest preview proxy. | Sarthi (ProMonkey) receives events and answers an Ask with real data. |
| 7 Migration (3 d) | Scripts, dry runs, report, timezone confirmation, exclusions. | Report reviewed by Gaurav; spot-checks with Vipin on 5 brands, 10 tasks, 3 users. |
| 8 Hardening + go-live (3 d) | Backups, rate limits, headers, Sentry, redirects of three old domains, invite emails, read-only old system, final migration. | Lighthouse ≥ 90 perf/accessibility on Today; all checklists ticked; sign-off. |

---

## 14. Acceptance checklists (tick each; builder adds evidence link/screenshot)

**Admin**
- A1 Today: all 8 blocks render real data; every link lands on the right tab; counts match the DB.
- A2 Brands: create with every field incl. logo upload; edit; deactivate; CS multi-select; scope multi-select; Portal logins tab works; filters/search work.
- A3 Projects & Tasks: board columns follow Settings; create task with 2 assignees; employee can't see others' tasks; Move to writes history; reject blocks empty note; client-gate + approval visible; uploads produce thumbnails; Drive link saved.
- A4 Team: scores show; Scoring rules editable; flag raised appears on profile and changes score next run; CS table counts correct.
- A5 Users & access: invite team member and client login with all fields; reset link works; deactivate blocks login.
- A6 Settings: add/rename/recolour/remove status (removal blocked when in use); same for flags; departments/scope/titles/servicing editable; integrations status visible.
- A7 Concerns / Announcements / Requests / Invoices / Attendance / Sarthi views each match their HTML and rules.

**Team**
- T1 Login creates attendance session; logout/midnight closes it; day state computed correctly for present/late/absent/holiday/leave.
- T2 Employee moves own task Start → Submit (blocked without a file/link) → sees rejection note → resubmits.
- T3 EOD saved from Today and from EOD view; missing EOD emits event at 19:30.
- T4 Concern raised confidential → invisible to CS lead; reply thread works.
- T5 My score shows breakdown; hidden when setting off.
- T6 CS review queue: approve sends to client gate; reject with note notifies assignee; stars saved as CS rating.
- T7 CS requests: answer, hold, convert to task with brief attached.

**Client**
- C1 Sees only shared tasks; status labels are client-language; no internal comments/EOD/assignee names leak.
- C2 Approve → task done, CS notified; send back without note blocked; with note → task rejected with note visible to team.
- C3 Rate a done piece; rating visible to admin/CS.
- C4 Raise request with images + Drive link; sees reply; sees "Converted" when CS converts.
- C5 Pay invoice in Razorpay test mode → paid, receipt email, trail updated; viewed status set on first open.
- C6 Edit own details, change password, toggle preferences (pushed to Sarthi).

**Platform**
- P1 Every mutation writes `audit_log`; agent queries logged.
- P2 Outbox delivers signed events; retries on failure.
- P3 Migration report counts match; spot-checks pass; no test accounts in prod.
- P4 Backups restore on staging; `/healthz` green; old domains redirect.

---

## 15. CLAUDE.md (paste into the repo)

```
# CNC CRM v2 — working rules for Claude Code
- Source of truth: /docs/CNC-CRM-Build-Spec.md (data, rules, permissions) and /design/*.html (UI, behaviour). Spec wins on conflict; note conflicts in /docs/build-log.md.
- Stack: Next.js 15 App Router + TypeScript, Prisma + Postgres 16, BullMQ + Redis, Docker Compose. Node 22.
- Time: store UTC, compute and display Asia/Kolkata. Use /lib/time helpers; never new Date() formatting in components.
- Every mutation: server-side role + ownership check (spec §3), audit_log row (spec §4.6), notification/outbox event where §6.13 says so.
- Dynamic lists (statuses, flags, departments, scope, titles, servicing) are tables; never hard-code their values except the semantic flags on task_status.
- Files: images upload (10 MB, thumbnails); heavy files are links. Follow §6.9 for which forms show the Drive link option.
- Passwords: Argon2id only. Never log secrets. Razorpay webhooks must verify signature.
- UI: reuse tokens/components extracted from /design; both themes; responsive to 400px; no horizontal page scroll.
- Before marking a phase done, run the §14 checklist rows for that phase and attach evidence in /docs/build-log.md.
- Commit per feature with a message that names the spec section. Keep PRs small.
- Do not install Sarthi logic here; implement only §10 plumbing.
```

---

## 16. Decisions log and open items

**Decided**
- Stack Next.js + Node + Postgres on ProMonkey VPS; one codebase; old domains redirect. (Gaurav, Oct 2026)
- Migrate real data, drop test junk. Passwords not migrated.
- Sarthi stays a plugged-in SaaS; CRM ships plumbing only. (24 Oct)
- Images upload; Drive links only for heavy files on briefs/updates/requests. (24 Oct)
- Statuses and flags are admin-managed lists; UI is pill list + add/edit icons + drawer. (24 Oct)
- Employees see their own flags and score (transparency); setting to hide.
- Clients pay online through the portal via Razorpay.
- Attendance = first login to last logout, IST.

**Open (answer before Phase 1)**
1. Final production domain (`app.coffeeandcreative.in` assumed).
2. Who is the HR owner for concerns by default (Nitin assumed).
3. Do CNC's clients count as CNC's end users on Sarthi billing, or is it per token for all? (affects nothing in the CRM, needed for the Sarthi customer setup).
4. Confirm the test-account exclusion list before migration.
5. Health score formula (§7 Today) — accept the default or tune after launch.
6. Drag-and-drop on the board: nice-to-have for v1 or later.
