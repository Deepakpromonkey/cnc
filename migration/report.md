# Legacy migration — dry-run report

Generated 2026-10-24 20:34 UTC · source `wwnecgawzt.sql` (Adminer dump) · target: separate database, the app's own data is untouched.

## Before go-live: decisions needed

The dump migrates cleanly: **19 brands, 46 staff, 53 of 88 tasks**, with history, EOD, attendance, flags, concerns, requests, notices and notifications. No passwords are carried over. These need a person, not a script:

1. **Confirm the exclusion list** (spec §5, §16 item 4): 34 test tasks, 3 brands, 4 projects, 7 concerns, 4 flags, 9 requests, 4 notices, plus the spec's 4 test users. ProMonkey's two logins (Amit, Gaurav) come across **inactive**.
2. **Stale open work**: 46 of 49 open tasks are already past their deadline (oldest 73 days, 45 more than two weeks). The old CRM never closed them, so v2 would open with a red board, 46 overdue nudges from Sarthi and low health scores. Re-run with `--close-stale-days=30` to close the old ones, or have CS triage before go-live.
3. **15 concerns are open with no reply** (one reply in the whole legacy table). They'll show as SLA-missed on day one.
4. **Name the 8 former staff** the old CRM deleted but still references (three were the first-listed CS on 8 brands). Vipin can identify them from the brands and counts listed below.
5. **9 tasks look filed under the wrong brand**, and 1 task (“Panamax PDP Designs- 3”) has no brand at all — CS to check the list below.
6. **2 client logins clash with staff logins** (Trend Laminates, Ledvance use a teammate's @agencylife.in address) — the client logins were moved to the brand's official email; confirm with the clients.
7. **Timezone**: old timestamps are read as UTC (strong evidence below) — confirm on two known days with Vipin (§12.6).
8. **Logos and photos** aren't in the dump — need the old server's uploads folder or URL (`migration/out/legacy-images.csv` lists 63 files).

## Counts

| Old table → new table | Source | Created | Skipped (reason) |
|---|---:|---:|---|
| departments → department | 25 | 24 | 1 duplicate name merged (e.g. “creative director” ×2) |
| scope_of_work → scope_of_work | 73 | 73 | — |
| flags → flag_type | 3 | 3 | — |
| users → user (staff) | 50 | 46 | 4 test account (exclusions.ts) |
| former staff → placeholder users | 8 | 8 | — |
| brands → brand | 22 | 19 | 3 junk/test brand (exclusions.ts) |
| brands.cs → brand_cs | 0 | 38 | — |
| brands.scope_of_work → brand_scope | 0 | 19 | — |
| brands.email → user (client login) | 0 | 19 | — |
| projects → project | 19 | 15 | 4 test/junk project (exclusions.ts) |
| projects.scope_of_work → project_scope | 0 | 4 | — |
| projects_comments → project_comment | 2 | 0 | 2 project excluded |
| tasks → task | 88 | 53 | 34 test/junk task (exclusions.ts); 1 no brand and no project to infer it from |
| tasks_employees → task_assignee | 84 | 54 | 1 employee excluded (test account); 29 task excluded or skipped |
| tasks_status → task_status_history | 58 | 46 | 12 task excluded or skipped |
| tasks.brand_rating → task_rating | 0 | 0 | — |
| employees_tasks_status → eod_log | 54 | 38 | 14 employee excluded (test account); 2 task excluded or skipped |
| employees_login_logs → attendance_session | 330 | 275 | 55 employee excluded (test account) |
| employees_attendances → attendance_day | 142 | 122 | 20 employee excluded (test account) |
| concerns → concern | 23 | 16 | 7 test concern (exclusions.ts) |
| concerns.reply → concern_reply | 0 | 1 | — |
| flags_employees → flag | 19 | 15 | 4 test flag (exclusions.ts) |
| flags_client_servicing → flag | 0 | 0 | — |
| work_request → work_request | 13 | 4 | 9 test request (exclusions.ts) |
| announcement → announcement | 10 | 6 | 4 test notice (exclusions.ts) |
| notifications → notification (read) | 945 | 839 | 17 about an excluded test task; 89 receiver deleted, excluded or unknown |
| clients (not migrated) | 0 | 0 | — |
| users_old (not migrated) | 2 | 0 | 2 old copies of a ProMonkey admin and a test user |
| cache (not migrated) | 0 | 0 | — |
| cache_locks (not migrated) | 0 | 0 | — |
| jobs (not migrated) | 0 | 0 | — |
| job_batches (not migrated) | 0 | 0 | — |
| failed_jobs (not migrated) | 0 | 0 | — |
| sessions (not migrated) | 1 | 0 | 1 framework/system table (§5) |
| password_reset_tokens (not migrated) | 0 | 0 | — |
| personal_access_tokens (not migrated) | 1478 | 0 | 1478 framework/system table (§5) |
| migrations (not migrated) | 4 | 0 | 4 framework/system table (§5) |
| status_list (not migrated) | 15 | 0 | 15 replaced by the 6 seeded statuses, mapped per §12.3 |
| tasks_titles (not migrated) | 0 | 0 | — |
| servicing (not migrated) | 0 | 0 | — |
| tasks_attachments (not migrated) | 0 | 0 | — |
| tasks_comments (not migrated) | 0 | 0 | — |

## Deadlines (spec §12.4)

How each migrated task got its `deadline_at` (IST):

- **9** — no deadline anywhere — start date / day raised, 18:00
- **32** — time read from the note, on the legacy deadline date
- **7** — legacy deadline date, 18:00 (no note)
- **5** — date and time read from the free-text note

Every task with a free-text note keeps it at the end of its description as “Legacy deadline note: …” and is marked `deadline_was_text`. Bare times like “by 1:30” are read as afternoon (1–7 → pm) because that's studio hours.

## Who is CS on each task

- **10** — creator is CS
- **42** — from `tasks.servicing_id` (the old CRM stored the CS user there)
- **1** — brand's primary CS

## Decisions made in this run

- Company row, the 6 task statuses, scoring weights and servicing types are seeded defaults: the legacy `servicing` and `tasks_titles` tables are empty, and `status_list` mixes task and request states (mapped per §12.3).
- 9 CS staff pointed at a department id that no longer exists in the old `departments` table (deleted “Client Servicing” row); they are placed in Client Servicing.
- Passwords are not migrated (spec §2). Every migrated login has no password and must use the invite/reset email on go-live.
- Names stored in ALL CAPS (users, brands, POCs) are converted to Title Case; acronyms like RPS, TCS, LLP stay upper-case. Emails are lower-cased.
- Stale-task rule OFF. Re-run with `--close-stale-days=30` to close open tasks more than 30 days past deadline.
- 157 legacy sessions had no logout (or one more than 20 h later); closed at 23:59:59 IST that day and tagged “auto”, as the midnight job does (§6.5).
- Concerns: legacy had no category, so one is inferred from the wording (mostly “team”). All are migrated as not confidential (spec §5) and owned by the HR admin (Nitin). Legacy `status` 0/1 has no clear meaning, so state comes from whether a reply exists.
- Flags: the old CRM didn't store who gave a flag, so givers show as “Legacy CRM (import)”. Points use today's flag types (red −8, praise +5, client concern −10).
- attendance_day is recomputed from sessions (first login → last logout, IST), not copied: 123 person-days written (legacy had 142 attendance rows; the difference is days that only exist in the login log). No “absent” rows are invented for old dates.
- Projects: the legacy `projects.status` column is empty for every row, so all projects start as Progressing; close finished ones after go-live.
- Timezone: old system timestamps (created, started, submitted, logins) are UTC. Logins peak at 05:00–07:00 stored time = 10:30–12:30 IST; read as IST they would be 5–7 am. Deadlines/start dates are calendar days. **Confirm with Vipin on two known days before go-live (§12.6).**

## Needs a decision or a look

### Migrated as INACTIVE — confirm (2)

- #1 Amit Tanwar · amit@promonkey.tech (ProMonkey admin)
- #53 Gaurav Dhingra · login gaurav@promonkey.tech (ProMonkey)

### Excluded users (4)

- #130 Promonkey Demo (spec §5)
- #131 promonkey cs demo (spec §5)
- #135 Deepak Gandhi (spec §5)
- #136 Deepak2 (spec §5)

### Former staff (deleted in the old CRM) — please name them (8)

- **Former CS 1** · legacy id `5eaa239c69c997e2b986941f67496f05` · 6 cs, 2 creator, 6 login, 4 attendance · CS on Pinklam, RPS Group, Adventure Tales
- **Former CS 2** · legacy id `9aa4d13d2c1a6e345149e61acfd6769f` · 3 cs, 3 creator, 2 history, 7 login, 3 attendance, 1 concern · CS on Trend Laminates, Marc, Aravali One
- **Former CS 3** · legacy id `f8fd4a6079ceece7619c643dd8e49e13` · 2 creator, 16 login, 8 attendance · CS on Digitek, fvjbvdkja
- **Former team member 4** · legacy id `98d035ce9d184ce8d06ffdd3b0d1e752` · 4 history, 6 assignee, 9 eod, 8 login, 3 attendance, 2 concern
- **Former team member 5** · legacy id `31b0752cc8cae5e6c81b22d49076d5e5` · 3 login, 2 attendance
- **Former team member 6** · legacy id `89c1511da69d7e415cdd3cff0f1063c5` · 4 login, 3 attendance
- **Former team member 7** · legacy id `bc6fa529d8f3dbb4aeb497664b9795f7` · 6 login, 2 attendance
- **Former team member 8** · legacy id `2542707e5fb25daab519673e789f3c45` · 1 login, 1 attendance

### Data to check (14)

- Brand Trend Laminates: first-listed CS has left — Jahanavi Khullar made primary
- Brand Pinklam: first-listed CS has left — Jahanavi Khullar made primary
- Brand RPS Group: first-listed CS has left — Jahanavi Khullar made primary
- Brand Adventure Tales: GST is “NA” → left empty
- Brand Adventure Tales: first-listed CS has left — Jahanavi Khullar made primary
- Brand Marc: first-listed CS has left — Jahanavi Khullar made primary
- Brand Aravali One: first-listed CS has left — Jahanavi Khullar made primary
- Brand Digitek: first-listed CS has left — Pranjal Arya made primary
- Brand Rasa Group: GST is “NA” → left empty
- Project “Founder Led Video” (Digitek): deadline 2026-08-04 is before start 2026-08-31
- Project “charcoal catalogue”: payment terms “jsksks” look like keyboard mash
- Project “Catalogue”: payment terms “kskskssjjs” look like keyboard mash
- Flag #3 on Prince Sharma: red flag with feedback “good work” — wrong colour?
- Flag #4 on Prince Sharma: red flag with feedback “good work” — wrong colour?

### Login clashes (2)

- Trend Laminates: client login **akhil@agencylife.in** is also Akhil Kumar Pandey's staff login → client login set to **premlaminates@gmail.com**
- Ledvance: client login **arun@agencylife.in** is also Arun Kumar's staff login → client login set to **a.tiwari@ledvance.com**

### Excluded brands (3)

- #20 drfgh / dfghj — keyboard mash (spec §5)
- #21 bebo beauty — terms 'nsksks', GST 'sksksjjs', POC 'ridhima' (spec §5: 'if confirmed')
- #22 fvjbvdkja / fjhvbkj — keyboard mash (spec §5)

### Excluded projects (4)

- #12 promonkey testing (type 'demo', terms '12345')
- #18 investors deck — type 'jfjwdkbfwekjvne', sub 'dvbkwjvbKK'
- #19 test — type 'gfghjghj'
- #20 rjgvbeijgnjek — keyboard mash

### Excluded tasks (34)

- #3 “Test task”
- #14 “Promonkey Test”
- #15 “testing Promonkey”
- #16 “promonkey testing”
- #17 “testing”
- #18 “Testing”
- #19 “testing promonkey”
- #20 “jjj”
- #28 “Promonkey testing”
- #29 “Promonkey testing”
- #31 “testing promonkey”
- #32 “testing”
- #33 “new (empty test)”
- #39 “test task”
- #40 “ddedf”
- #41 “demo”
- #45 “cdc”
- #46 “cdc (duplicate)”
- #47 “Hdhakjxn”
- #57 “demo”
- #59 “testttt”
- #63 “testing3333”
- #67 “test”
- #68 “ytfhg / xcvcb”
- #69 “v”
- #70 “d ,mb”
- #71 “test / sdsdsd”
- #72 “yhtgrfd”
- #74 “hjsavhAVSX”
- #76 “akdskks”
- #83 “dnntdg”
- #88 “jhcfajbajbv”
- #89 “test”
- #90 “test2”

### Deadlines defaulted (6)

- #4 “office space EDM” had no deadline → 2026-08-12 18:00 IST (from start date)
- #6 “Crosswalk Grid” had no deadline → 2026-08-12 18:00 IST (from start date)
- #49 “Catalogue” had no deadline → 2026-09-25 18:00 IST (from start date)
- #51 “Catalogue” had no deadline → 2026-09-25 18:00 IST (from start date)
- #52 “Catalogue” had no deadline → 2026-09-25 18:00 IST (from start date)
- #54 “Catalogue” had no deadline → 2026-09-25 18:00 IST (from start date)

### Tasks filed under one brand but named after another (9)

- #9 “Linkedin Carousel for Digitek” is under **RPS Group** — should it be Digitek?
- #10 “Summercool envelope” is under **Thermocool** — should it be Summercool?
- #25 “Thermocool RPD Images” is under **Marc** — should it be Thermocool?
- #34 “RPD's for digitek market places” is under **Marc** — should it be Digitek?
- #35 “OFFICE BRANDING FOR AVANI'S NEW LOCATION” is under **RPS Group** — should it be Avani?
- #65 “Avani catalogue” is under **Himalaya Opticals** — should it be Avani?
- #66 “avani catalogue” is under **Himalaya Opticals** — should it be Avani?
- #79 “digitek smp” is under **Longway** — should it be Digitek?
- #87 “digitek smp” is under **Longway** — should it be Digitek?

### Skipped tasks — need a brand (1)

- #22 “Panamax PDP Designs- 3” · status completed · raised 2026-08-20 05:30:05

### Tasks with nobody assigned (9)

- #26 “refine the old catalogue” · Marc · New
- #49 “Catalogue” · Digitek · New
- #50 “need videos” · Thermocool · New
- #55 “need banners, stickers” · Thermocool · New
- #60 “need website images” · Aravali One · New
- #62 “website images” · Aravali One · New
- #65 “Avani catalogue” · Himalaya Opticals · New
- #66 “avani catalogue” · Himalaya Opticals · New
- #77 “website” · Himalaya Opticals · New

### Status mapped with a note (2)

- #34 “RPD's for digitek market places”: Legacy status: pause → Progressing
- #86 “Catalogue - 14 pages”: Legacy status: pause → Progressing

### Excluded concerns (7)

- #3 “promonkey testing”
- #4 “Test / test”
- #8 “testing / demo”
- #9 “test / test (Deepak2)”
- #12 “demo testing by promonkey”
- #13 “test / client”
- #21 “cfgvhbn / vghbn”

### Excluded flags (4)

- #1 subject 'as', feedback 'demo testing promonkey'
- #5 subject 'as' / 'as'
- #9 fgfhgh / cfgvb
- #15 as / as (promonkey cs demo)

### Excluded work requests (9)

- #2 “test”
- #3 “dgfg”
- #6 “jfjwevjwvjkrsvks”
- #8 “ksjcjhs · brand 'undefined'”
- #9 “ksjkschsjcjs · brand 'undefined'”
- #10 “gffgdfgd”
- #11 “gdfdfgfdgdfg · brand 'undefined'”
- #12 “test”
- #13 “test2 · brand 'undefined'”

### Excluded announcements (4)

- #2 “testing”
- #6 “testing promonkey”
- #7 “testing (holiday)”
- #11 “test (holiday)”

### Holidays imported as notices (3)

- #8 “on leave for 5 days hghgh” — a leave note
- #9 “Leave 25th to 30sept” — a leave note
- #10 “weekend” — not a holiday

## Files

- `migration/out/legacy-images.csv` — logo/photo paths from the old server. They aren't in the dump; give me the old site's uploads URL (or the folder) and they'll be fetched into the new storage with thumbnails.
- `migration/exclusions.ts` — the exclusion list above, editable. Change it and re-run.
