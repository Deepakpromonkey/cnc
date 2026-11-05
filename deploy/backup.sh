#!/usr/bin/env bash
# Nightly pg_dump with 30-day retention (spec §2). Cron on the VPS, e.g.:
#   15 2 * * * /opt/cnc/deploy/backup.sh >> /var/log/cnc-backup.log 2>&1
# BACKUP_DIR should be off-box (mounted storage); BACKUP_REMOTE optionally rsyncs elsewhere.
set -euo pipefail
cd "$(dirname "$0")/.."
BACKUP_DIR="${BACKUP_DIR:-/var/backups/cnc}"
KEEP_DAYS="${KEEP_DAYS:-30}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR"

docker compose exec -T postgres pg_dump -U cnc -d cnc_crm --format=custom --no-owner > "$BACKUP_DIR/cnc_crm-$STAMP.dump"
tar -czf "$BACKUP_DIR/uploads-$STAMP.tgz" -C "$(docker volume inspect -f '{{ .Mountpoint }}' "$(basename "$PWD")_uploads")" .

if [[ -n "${BACKUP_REMOTE:-}" ]]; then
  rsync -a "$BACKUP_DIR/" "$BACKUP_REMOTE/"
fi

find "$BACKUP_DIR" -type f \( -name 'cnc_crm-*.dump' -o -name 'uploads-*.tgz' \) -mtime +"$KEEP_DAYS" -delete
echo "$(date -u) backup ok: cnc_crm-$STAMP.dump"
# Restore: docker compose exec -T postgres pg_restore -U cnc -d cnc_crm --clean --if-exists < FILE.dump
