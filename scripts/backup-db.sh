#!/bin/sh
# Backup diario de la BD JRPOS. Uso en el VPS (crontab):
#   0 3 * * * /opt/jrpos/scripts/backup-db.sh >> /var/log/jrpos-backup.log 2>&1
set -e
BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP=$(date +%Y%m%d_%H%M%S)
mkdir -p "$BACKUP_DIR"
docker compose -f "$(dirname "$0")/../docker-compose.yml" exec -T postgres \
  pg_dump -U "${POSTGRES_USER:-jrpos}" -d "${POSTGRES_DB:-jrpos}" -Fc \
  > "$BACKUP_DIR/jrpos_${STAMP}.dump"
# retencion
find "$BACKUP_DIR" -name "jrpos_*.dump" -mtime +"$KEEP_DAYS" -delete
echo "OK: $BACKUP_DIR/jrpos_${STAMP}.dump"
