# Saarthi Staff assistant

CNC's staff ask Saarthi in plain words from inside the CRM ("Thermocool ke late tasks?", "aaj kya due hai?") and get a table, a count or a CSV built from CNC's own data. Each person gets only what the CRM itself shows them. Saarthi is ProMonkey's SaaS (spelled "Sarthi" on the CRM's screens and in the spec). The CRM ships only the plumbing (spec §10): it says who is at the keyboard, and it has read-only views of what each person may see. Saarthi's own guide is **Staff assistant** in its docs (mysarthi.tech/docs).

## What it is

- **Who:** active staff (admin, group admin, CS, employee), in /admin and /team.
- **How to open it:** type in the top bar's **Ask Sarthi…** box (the panel opens and asks the question), click **Sarthi is awake** at the foot of the side rail, or use Saarthi's tab on the right edge of the page. On a phone the panel takes the whole screen.
- **What it answers:** tasks, brands, people, invoices, work requests, EOD lines and attendance days, from the `v_my_*` views below. It only reads. It never changes anything in the CRM.
- **Clients never get it.** The client portal doesn't load it, the token route refuses clients, and no view has rows for them. (Saarthi reaches clients on WhatsApp, §10.)
- **Off until set up.** Without both `SAARTHI_STAFF_KEY` and `SAARTHI_STAFF_SECRET`, nothing changes: no script on the page, the token route answers 503, `noteStaffAsk` records nothing, and the Ask box and chip work as before.

## How it works

```text
Staff browser ──GET /api/saarthi/staff-token (CRM session)────────▶ CRM server
Staff browser ◀──{ token }: 2 minutes, single use, staff secret──── CRM server
Staff browser ──sign in with the token, then ask──────────────────▶ Saarthi (api.mysarthi.tech)
Saarthi ──one checked, read-only SELECT on v_my_* as sarthi_ro─────▶ CNC Postgres
```

The CRM vouches for **who** is asking. Saarthi's staff list and access groups decide **what** they may read, and the views make that match the CRM.

| Piece | File |
|---|---|
| Config and token signing (server only) | lib/saarthi-staff.ts |
| Token route | app/api/saarthi/staff-token/route.ts |
| Loads `staff-v1.js`; queues `init`, `ask`, `open`, `setTheme`, `logout` | components/saarthi-staff.tsx |
| Ask box hand-off, chip button, sign-out | components/shell.tsx |
| Turns it on for /admin and /team (never while impersonating) | app/admin/layout.tsx, app/team/layout.tsx |
| `agent.ask` audit row for Ask-box questions | `noteStaffAsk` in app/actions/common.ts |
| Per-viewer views and grants | prisma/migrations/20261111115642_saarthi_staff_views |
| Checker | scripts/check-saarthi-views.ts (`npm run check:saarthi-views`) |

**The token** is a JWT (HS256, signed with `SAARTHI_STAFF_SECRET`), made fresh on every request:

| Claim | Value |
|---|---|
| `user_id` | the CRM's `user.id` (a UUID). This is the **CRM user id** on Saarthi's staff list. |
| `email` | the login email; left out when Saarthi wouldn't accept it as an address |
| `aud` | `"saarthi-staff"` |
| `iat`, `exp` | now, and now + 120 s |
| `nonce` | 24 random URL-safe characters (Saarthi accepts each token once) |

The route answers 401 when nobody is signed in, 403 for a client or while an admin is viewing as someone, and 503 when the assistant isn't configured. Every answer carries `Cache-Control: no-store` and no CORS headers.

## How access works

Saarthi's **Only their own rows** rule filters a table by **one** column, equal to the person's CRM user id. CNC's rules (brands, a CS's reportees, a group, tasks someone is assigned to) don't fit in one column of the v_* views. So the migration adds seven per-viewer views. Each has `viewer_id` plus the columns of the matching v_* view, with one row per (staff member, row the CRM shows them). The views are live: a new task, a reassignment or a new reportee shows up at the next question.

| View (columns of) | Admin | Group admin | CS | Employee |
|---|---|---|---|---|
| `v_my_tasks` (v_tasks) | every task | tasks of the group's brands, or whose CS or any assignee is in the group | tasks of their brands, or whose CS or an assignee is them or an employee reporting to them | tasks assigned to them |
| `v_my_brands` (v_brands) | every brand | brands with a CS (brand_cs) in the group | their brands (brand_cs) | none (brand names come with their tasks) |
| `v_my_people` (v_people) | every login, clients and inactive users included (as /admin/people) | everyone in the group except clients, inactive included | themselves + employees reporting to them, any status | themselves |
| `v_my_invoices` (v_invoices) | every invoice except drafts (void included) | none | their brands', no drafts | none |
| `v_my_requests` (v_requests) | every work request | the group's brands' | their brands' | none |
| `v_my_eod` (v_eod) | every EOD line | lines on their tasks + lines by active group staff | lines on their tasks + their own + their active reportees' | lines on their tasks (co-assignees' too, as the task drawer shows) + their own |
| `v_my_attendance_days` (v_attendance_days) | every active staff member | active group staff | own + active reportees | own |

- **Viewers are active staff only.** Clients and inactive users have no rows in any view, because the CRM signs nobody else in. A group admin without a group sees only themselves and the tasks they are CS or assignee on.
- **The rules are the CRM's own:** `teamScope`, `brandScope`, `taskScope`/`canSeeTask` and `peopleScope` in lib/queries.ts, plus each page's filter (money pages for invoices, /admin/requests and /team/requests, the attendance pages and a CS's My team, the task drawer for EOD). The helper views `sarthi_viewer`, `sarthi_team_scope`, `sarthi_brand_scope`, `sarthi_task_scope` and `sarthi_staff_scope` hold the same rules in SQL.
- **Where this differs from spec §3**, it follows the CRM as it is since the 2026-11-04 hierarchy change (a CS's EOD and attendance). See docs/build-log.md.
- **Whose rows, not which dates.** The views keep every date. The CRM's attendance pages show this month, and a CS's My team shows today, but the views hold every attendance day of the people each viewer follows.

**Never exposed:** concerns (there is no view of them), `password_hash`, internal task and project comments, draft invoices, and the tables themselves. `sarthi_ro` has `SELECT` on the 7 v_* and 7 v_my_* views and nothing else, not even the sarthi_* helpers. Views run with their owner's rights (`security_invoker` off, spelled out in the migration). That is how a v_my_* view reads tables `sarthi_ro` can't.

**Saarthi does the per-person part.** A database connection isn't tied to one person: `sarthi_ro` can read every viewer's rows, and also the full v_* views (kept for §10.1 and §10.2). The limit to one person is Saarthi's own-rows rule. So:

- the data map allows only the v_my_* views;
- every view in every access group has **Only their own rows: `viewer_id` = their CRM user id**;
- **Try as** shows it working before anyone signs in.

**Keep the checker green.** `npm run check:saarthi-views` compares, for every active staff member, each v_my_* view (`WHERE viewer_id = them`) with what the CRM's own code returns. Then it checks that non-staff have no rows, that `sarthi_ro` reads exactly the 14 views, and that the views run with the owner's rights. It prints one line per person and ends with `0 mismatches` (exit 0) or the differences (exit 1). Run it:

- after changing `teamScope`, `brandScope`, `taskScope`, `peopleScope` or the filter of a page the views copy. Change the sarthi_* helper views to match, in a new migration.
- after changing a v_* view. Each v_my_* view fixed its column list when it was created (`t.*`), so a new v_* column doesn't reach it. Postgres also won't drop a v_* view, or one of its columns, while a v_my_* view depends on it. In one migration: drop the v_my_* view, change the v_* view, recreate the v_my_* view (with `security_invoker = false` and its comments) and `GRANT SELECT … TO sarthi_ro`. Then save the data map in Saarthi again.
- on each environment after `prisma migrate deploy`. Where the database user can't `SET ROLE sarthi_ro`, the live sarthi_ro test prints `skipped`; everything else still runs.

**Speed.** Each view takes a few ms at today's size (under 100 tasks). Postgres can't know a viewer's role when it plans the query. So at about 20k tasks `v_my_tasks` takes 160–210 ms and `v_my_eod` up to about 300 ms, against Saarthi's default limit of 10 s for a staff query. If tasks pass about 10k, split each data view into one branch per role, and add indexes on `task(cs_user_id)` and `eod_log(task_id)` (with matching `@@index` entries in schema.prisma).

## Ops setup (once per environment)

This applies to staging (docs/deploy-temp.md) and production. The views come with the code: `npx prisma migrate deploy`, part of every redeploy, creates them.

### 1. Give sarthi_ro a login

The migrations created `sarthi_ro` without a login. Run this as a database admin on CNC's database, by hand (never in a migration or the repo):

```sql
ALTER ROLE sarthi_ro LOGIN PASSWORD '<long random password>';
-- Only if CONNECT was taken away from PUBLIC on this database:
GRANT CONNECT ON DATABASE cnc_crm TO sarthi_ro;
```

The password goes only into Saarthi's console, which keeps it in its vault. Not into .env, the repo or chat. When it connects, Saarthi checks that the user can't write. If it refuses with "CREATE on schema public" (a database from Postgres 14 or older), run `REVOKE CREATE ON SCHEMA public FROM PUBLIC;`.

**Let Saarthi reach the database.** In production Saarthi refuses `localhost`, private addresses (10.x, 172.16–31.x, 192.168.x and the like) and unencrypted connections. So:

- Postgres listens on a public address (`listen_addresses`) with TLS on (`ssl = on`). **Require encryption** works with a self-signed certificate. **Verify certificate** needs a certificate from a public CA for the host name.
- Allow Saarthi's addresses (shown on Saarthi's connection page) in the firewall and in `pg_hba.conf`, for `sarthi_ro` only:

  ```text
  hostssl  cnc_crm  sarthi_ro  <Saarthi's address>/32  scram-sha-256
  ```

- CNC staging shares its VPS with Saarthi. Saarthi still has to use the public address. If the connection test is refused, Postgres's log names the address the connection came from. On a shared box that can be Docker's network rather than the public IP, so allow that address in `pg_hba.conf`.

### 2. Saarthi console

Use app.mysarthi.tech, in CNC's workspace, as an owner or admin.

**Plan.** The Staff assistant and database answers need Growth or Agency (**Plan & features**). As shipped, Growth allows 1 database and 10 staff members, and Agency 5 and 50. Every active person on the staff list takes a seat. Count CNC's staff:

```sql
SELECT role, count(*) FROM v_people WHERE status = 'active' AND role <> 'client' GROUP BY role;
```

**Connect the database:** Knowledge → Databases → Connect a database.

- PostgreSQL; CNC's host and port; database `cnc_crm`; schema `public`; user `sarthi_ro` and its password; encryption **Require encryption** (or **Verify certificate**).
- **Used by:** leave it empty (no role). Then no website or WhatsApp chat uses this database. The Staff assistant doesn't need a role.
- **Description** (the AI reads it): "CNC's CRM: tasks, brands, people, invoices, client work requests, EOD lines and attendance, each as one staff member sees them."

**Data map** (the most any group can read):

- Tick the seven v_my_* views and nothing else. Never tick the v_* views: they hold every row.
- Columns: all except `viewer_id`. It only ever holds the person's own id, and the own-rows rule works without it being ticked.
- **Row filter:** `viewer_id = {token.user_id}` for every view, and no **Shared tables**. Saarthi wants one or the other for each table, and Shared would let any chat that uses this database read every row.
- **Masks:** Last 4 on `v_my_people.mobile` and `v_my_people.whatsapp_no`. Decide with CNC about `v_my_brands.poc_phone` and `v_my_brands.whatsapp` (client contacts a CS works with). A masked field can be shown but not searched or sorted. If admins need full numbers, mark those fields **Team sees it**, and switch on **Show protected fields as your team sees them** in the Admins group only.
- **Notes** help the AI:
  - money is in paise (`total_paise / 100` = rupees);
  - `status` is the internal status and `status_label` the client wording;
  - `deadline_ist`, `first_login_ist` and `last_logout_ist` are India time;
  - `is_late` means past the deadline and not done, in review or with the client.

  Then press **Fill all from data** for typical values.
- **Ask your data** (in Saarthi's console) reads these views without the own-rows rule, so there each row appears once per staff member who can see it.

**Staff assistant → Set up.** Getting started lists the steps:

1. **Turn the assistant on.** Saarthi makes the staff key `wst_…`, which goes into `SAARTHI_STAFF_KEY`.
2. **CRM websites:** the CRM's exact address. Production is `https://app.coffeeandcreative.in` (assumed, §16 open item 1); staging is its current `https://….trycloudflare.com` address; dev is `http://localhost:3040`. Exact addresses only, no wildcards or paths. The staging quick tunnel gets a new address whenever `cnc-tunnel` restarts, so update it here too. Removing an address signs out everyone using it.
3. **Create staff secret.** It is shown once and goes into `SAARTHI_STAFF_SECRET` on the CRM's server.
4. **Add the code to your CRM** is already done in this repo. The step ticks itself at the first sign-in.
5. Access groups, people and Try as: see below.

Set up also has **Limits** (daily credits: 1,000 for all staff and 300 per person, by default) and **Test a staff token**.

**Access groups.** Make one group per role. Each gets only the views that role has rows in, and on **every** view **Only their own rows: `viewer_id` = their CRM user id**:

| Group | Views | CSV |
|---|---|---|
| Admins | all seven | CNC's call |
| Group admins | all but `v_my_invoices` (group admins have no money access) | off |
| CS | all seven, but on `v_my_people` only `id`, `name`, `first_name`, `last_name`, `role`, `department` and `designation` | off |
| Employees | `v_my_tasks`, `v_my_eod`, `v_my_attendance_days`, `v_my_people` (their own row) | off |

The CS group's narrow `v_my_people` matters: the view also holds their reportees' email, phone numbers, status and last login, which the CRM never shows a CS (My team lists names, department, designation and today's work). Unticking those columns in the group keeps the assistant to what the CRM shows.

A view without the rule shows every staff member's rows. The editor's warning **Some tables without the rule** must never appear for these groups. Starter questions are optional (up to six, 120 characters each), for example:

- Admins: "Late tasks by brand", "Overdue invoices"
- Group admins: "Late tasks in my group", "Open work requests"
- CS: "Tasks waiting for client approval", "Unpaid invoices of my brands"
- Employees: "My tasks due this week", "My EOD lines this week"

**People.** Add every active staff member with **Add many**: one line each, with name, email, CRM user id and group. This command lists them from the CRM's database as tab-separated lines with no header, ready to paste. Add `-h`, `-p` and `-U` as for your database (dev: `-h localhost -p 5434`).

```sh
psql -d cnc_crm -At -F $'\t' -c "
  SELECT name, email, id,
         CASE role WHEN 'admin' THEN 'Admins' WHEN 'group_admin' THEN 'Group admins'
                   WHEN 'cs' THEN 'CS' ELSE 'Employees' END
  FROM v_people
  WHERE status = 'active' AND role IN ('admin', 'group_admin', 'cs', 'employee')
  ORDER BY 4, 1"
```

- Email alone also works: Saarthi links the CRM user id at the person's first sign-in. Until then, every question they ask about the views is refused ("…your staff record has no CRM user id yet") and Try as can't show their rows, because every view has the own-rows rule. So include the id.
- If Saarthi says an email "doesn't look right" (an odd legacy address), clear the email on that line. The CRM user id is enough.
- **Keep the list in step with the CRM.**
  - Add new staff.
  - When someone's role changes, change their group too. The views follow the CRM by themselves; the group doesn't.
  - When someone leaves, disable or remove them in Saarthi. The CRM already refuses an inactive login, and the views give them nothing, but they still hold a seat.

**Try as** a CS and an employee (People → Try as) and ask "my open tasks". **Why** shows the `viewer_id = ••…` condition, and the answer holds only their rows.

**Test a staff token** (Set up): sign in to the CRM, open `/api/saarthi/staff-token` in the same browser, and paste the `token` value (without the JSON around it) within two minutes. Testing doesn't use the token up.

### 3. CRM environment variables

| Variable | Value | Public? |
|---|---|---|
| `SAARTHI_STAFF_URL` | Saarthi's address, with no path. Empty means `https://api.mysarthi.tech`. | Yes: the pages load the script from it |
| `SAARTHI_STAFF_KEY` | the staff key `wst_…` (Set up) | Yes: the staff pages carry it |
| `SAARTHI_STAFF_SECRET` | the staff secret `sk_live_staff_…` (Set up → Create staff secret) | **No**: server only |

- Nothing turns on until both the key and the secret are set. A key that doesn't start with `wst_`, or an address with a path, keeps the assistant off and logs one warning (`saarthi-staff`, never the values).
- The secret is read only on the server (lib/saarthi-staff.ts is `server-only`) and is never logged. Keep it out of the repo and chat. It isn't `SARTHI_WEBHOOK_SECRET` (the outbox's signatures and the old relay's token), and it isn't Saarthi's website SDK secret.
- **Staging:** add the three lines to `/opt/cnc/app/.env`, then run `pm2 restart cnc-web --update-env`. The values are read at request time, so there is no rebuild. The worker doesn't use them.
- **Production (docker-compose):** put the same lines in `.env`, then run `docker compose up -d web`.
- **Rotating the secret:** Set up → Staff secret → Rotate. The old secret works for 24 hours, so update `.env` and restart within that time. If it leaked, use **Stop the old secret now**: it signs everyone out until the CRM has the new secret.

### 4. Check

1. Run `npm run check:saarthi-views` on the server. It should end with `0 mismatches`. With docker-compose, the web image has no source or tsx, so run it in the worker image: `docker compose run --rm worker npx tsx --require ./jobs/preload.cjs scripts/check-saarthi-views.ts`.
2. In a private window, sign in as an employee and open the panel: the greeting uses their first name. Sign out, then sign in as someone else: the first person's chat must not appear.
3. Saarthi → Staff assistant → **Activity** shows the questions. **Last sign-in problem** on Set up explains a refused sign-in.

## Local dev with a local Saarthi

Saarthi's dev setup runs its backend on `http://localhost:5000` and its console on `http://localhost:3000`, with its own Postgres and Redis on 5432 and 6379 (leave those alone). CNC's database is on `localhost:5434`.

1. Build Saarthi's staff script once (`npm run build` in saarthi/widget). Until then `/widget/staff-v1.js` answers 404 and the CRM keeps its old Ask box.
2. Make sure Saarthi's backend `.env` has `DB_ALLOW_PRIVATE_HOSTS=true`, so it may read `localhost:5434`, and restart the backend after changing it. This is accepted outside production only.
3. On CNC's database: `ALTER ROLE sarthi_ro LOGIN PASSWORD '…';` with a local-only password.
4. In the local console, as the workspace owner, connect PostgreSQL: host `127.0.0.1`, port `5434`, database `cnc_crm`, user `sarthi_ro`, encryption **Off (testing only)**. Only owners can choose it, and production refuses it. Set up the data map, groups and people as above, with CRM user ids from the local database.
5. In Set up: add the CRM website `http://localhost:3040`, turn the assistant on, and create the staff secret.
6. In CNC's `.env`:

   ```sh
   SAARTHI_STAFF_URL="http://localhost:5000"
   SAARTHI_STAFF_KEY="wst_…"                # from the local console
   SAARTHI_STAFF_SECRET="sk_live_staff_…"   # from the local console
   ```

   The dev server picks up `.env` changes by itself. To go back to the old Ask box, empty the key or the secret.

## Behaviour notes

- **Viewing as someone (impersonation):** no assistant on the page, the token route answers 403, and the Ask box uses the old answers. Nobody asks Saarthi as someone else.
- **Sign-out** calls `SaarthiStaff.logout()` first, without waiting for it. The assistant signs out in every tab of that browser, then the CRM signs out. If a CRM session ends another way (it expires, or the person is deactivated), the assistant stops at its next renewal, within 30 minutes, because the token route then answers 401. A deactivated person's questions find no rows even before that, because the views drop inactive users at once.
- **Theme:** the panel starts in the page's theme (Espresso is dark, Crema is light) and follows the Crema / Espresso switch at once.
- **Ask box:** with the assistant on, the question opens the panel and is asked there. The box clears, and the CRM writes `agent.ask` (`via: "saarthi_staff"`) to audit_log. Questions typed in the panel itself are recorded only on Saarthi's Activity: the question, the query and any refusal, never the rows, kept 90 days by default.
- **Fallback:** the Ask box works as before (`askSarthi`) when the assistant isn't configured, while impersonating, or if its script fails to load. It relays to `SARTHI_API_URL` when that is set, and otherwise answers from the CRM's own data (lib/sarthi-sdk.ts), logged as `agent.answer`. If the script failed, the chip says "Sarthi couldn't load. Reload the page to try again."
- **Today and Sarthi pages** still show only the CRM's own answers (`agent.answer`): the last answer and "questions answered" on Today, and the chat on /admin/sarthi. Answers given in Saarthi's panel are on Saarthi's Activity, so with the assistant on these stay quiet.
- **Group admins** have it in /admin, scoped to their group. The admin Sarthi page stays closed to them, as before.
- **Nothing calls Saarthi until the panel opens.** The token route is asked only then, and again to renew.
- **CSP and recorders:** the CRM sends no Content-Security-Policy today. If one is added, allow Saarthi's host in `script-src` and `connect-src`, plus `style-src 'unsafe-inline'`. Keep session-recording tools off /admin and /team: they could copy rows shown in the panel.

## When something's wrong

| Symptom | Look at |
|---|---|
| The chip is plain text and the Ask box shows the old answer | Are the key and the secret both set on that server? Does the key start with `wst_`? Is the address free of a path (the log says)? Is an admin viewing as someone? |
| "Sarthi couldn't load. Reload the page to try again." | The script didn't load from `SAARTHI_STAFF_URL`: is Saarthi up and the address right? Locally, is the staff script built? |
| "Sign in to your CRM to use the assistant." | The token route gave no token: the CRM session is gone (401), or the env vars were removed since the page loaded (503). |
| "Couldn't sign you in to the assistant (bad_signature)…" | `SAARTHI_STAFF_SECRET` isn't the current staff secret (after a rotation?). Use Set up → Test a staff token. |
| "The assistant isn't set up for this address." | The CRM's exact address isn't in CRM websites (did the staging tunnel restart?). |
| "You're not on …'s staff list…" | Add them on People, with their CRM user id. |
| "…your staff record has no CRM user id yet…" | They were added by email only and haven't signed in yet: add the id. |
| Someone sees too much or too little | Check their group (People), then the group's own-rows rules, then run `npm run check:saarthi-views`. |
