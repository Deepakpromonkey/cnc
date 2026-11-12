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

## Local dev
- Needs Homebrew `postgresql@16` and `redis` running (`brew services start postgresql@16 redis`). DB: `cnc_crm` (see `.env`, copied from `.env.example`).
- Fresh database with demo data: `npm run db:reset && npm run db:seed`. The seed loads the sample data from /design and shifts the mockup's "today" to the real IST day.
- App: `npm run dev` → http://localhost:3040. Typecheck: `npm run typecheck`.
- Logins: any seeded user by login ID (e.g. admin `vipin`, CS `jahanavi`, client `neharika@himalayaopticals.in`); the password is `SEED_PASSWORD` in `.env`. Never paste it into code, docs or chat.
- Jobs: `npm run worker` (BullMQ schedules, IST) or `npm run jobs:nightly` (one-shot close-day + scores + overdue). Job code runs with `jobs/preload.cjs`, which stubs the `server-only` marker outside Next.
- Without `RAZORPAY_*` keys, invoices get a mock checkout link (`/pay/mock/:id`); without `SARTHI_API_URL`, the Ask box answers from the CRM's own data (lib/sarthi-sdk.ts); without `SMTP_HOST`, mail is logged, not sent.
- Without `SAARTHI_STAFF_KEY` and `SAARTHI_STAFF_SECRET`, the Saarthi Staff assistant doesn't load and the Ask box behaves as before; to run it (e.g. against a local Saarthi on :5000), see docs/saarthi-staff-assistant.md.
