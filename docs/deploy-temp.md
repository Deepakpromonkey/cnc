# Temporary deployment (staging) — 200.234.44.81

Set up 2026-10-26 on the shared ProMonkey box (it also runs Pratibha — don't touch its pm2 apps, nginx or databases).

| Piece | Where |
|---|---|
| Code | `/opt/cnc/app` (built with `next build`, `output: standalone`) |
| Env | `/opt/cnc/app/.env` (own DB password + secrets; `ALLOW_MOCK_PAYMENTS=1` = test checkout) |
| Uploads | `/opt/cnc/uploads` |
| Database | local PostgreSQL 18, role `cnc`, database `cnc_crm` (restored from the dev DB) |
| Redis | Docker container `cnc-redis` on `127.0.0.1:6380` |
| Processes | pm2 `cnc-web` (127.0.0.1:3040), `cnc-worker`, `cnc-tunnel` — config `/opt/cnc/ecosystem.config.cjs`, saved with `pm2 save` |
| Public URL | Cloudflare quick tunnel (`*.trycloudflare.com`), no account |

## Quick-tunnel URL changes when `cnc-tunnel` restarts
```sh
pm2 logs cnc-tunnel --lines 80 --nostream | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | tail -1
# then set APP_URL in /opt/cnc/app/.env to it and:
pm2 restart cnc-web cnc-worker --update-env
```

## Redeploy code
From the Mac: tar the repo (no node_modules/.next/.env/.uploads) to `/opt/cnc/app`, then on the server:
```sh
cd /opt/cnc/app && npm ci && npx prisma migrate deploy && npx next build \
  && cp -r public .next/standalone/ && cp -r .next/static .next/standalone/.next/ \
  && pm2 restart cnc-web cnc-worker
```

## Going properly live
Point a domain (e.g. `app.coffeeandcreative.in`) at the box, add an nginx server block proxying to `127.0.0.1:3040`
with a Let's Encrypt cert, set `APP_URL`, turn `ALLOW_MOCK_PAYMENTS` off and add real Razorpay/SMTP keys, then
`pm2 delete cnc-tunnel`.
