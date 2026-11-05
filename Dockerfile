# CNC CRM — multi-stage build. Requires `output: "standalone"` in next.config.ts.
FROM node:22-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM deps AS build
COPY . .
RUN npx prisma generate && npm run build

# Web: Next.js standalone server (+ prisma CLI for `migrate deploy` on release).
FROM base AS web
ENV NODE_ENV=production PORT=3040 HOSTNAME=0.0.0.0
RUN useradd -r -u 1001 cnc && mkdir -p /var/cnc/uploads && chown cnc /var/cnc/uploads
COPY --from=build --chown=cnc /app/.next/standalone ./
COPY --from=build --chown=cnc /app/.next/static ./.next/static
COPY --from=build --chown=cnc /app/public ./public
COPY --from=build --chown=cnc /app/prisma ./prisma
COPY --from=build --chown=cnc /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build --chown=cnc /app/node_modules/prisma ./node_modules/prisma
USER cnc
EXPOSE 3040
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:3040/api/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]

# Worker: BullMQ jobs run from source with tsx (shares lib/ with the web app).
FROM deps AS worker
ENV NODE_ENV=production
COPY . .
RUN npx prisma generate && useradd -r -u 1001 cnc
USER cnc
CMD ["npx", "tsx", "--require", "./jobs/preload.cjs", "jobs/worker.ts"]
