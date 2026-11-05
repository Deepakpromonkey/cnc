#!/bin/sh
# Dry run: rebuild the scratch target database and migrate the legacy dump into it.
# Needs the dump loaded in a MySQL reachable at LEGACY_MYSQL_URL (see migration/README.md).
set -e
cd "$(dirname "$0")/.."
TARGET_DB=${TARGET_DB:-cnc_migrate}
case "$TARGET_DB" in cnc_crm) echo "Refusing: $TARGET_DB is the app database"; exit 1;; esac
PG=${PG_BIN:-/opt/homebrew/opt/postgresql@16/bin}
"$PG/dropdb" --if-exists "$TARGET_DB"
"$PG/createdb" "$TARGET_DB"
export MIGRATION_TARGET_URL="postgresql://${PGUSER:-$USER}@localhost:5432/$TARGET_DB?schema=public"
DATABASE_URL="$MIGRATION_TARGET_URL" npx prisma migrate deploy >/dev/null
export LEGACY_MYSQL_URL=${LEGACY_MYSQL_URL:-mysql://root@localhost/legacy?socketPath=/tmp/cnc-legacy.sock}
npx tsx migration/run.ts "$@"
