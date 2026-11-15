#!/usr/bin/env bash
set -euo pipefail

DIR="${BACKUP_DIR:-/tmp/meridian-backups}"
KEEP="${BACKUP_KEEP:-7}"
mkdir -p "$DIR"

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
OUT="$DIR/meridian-$STAMP.dump"

pg_dump -d "$DATABASE_URL" -Fc -f "$OUT"

COUNT=$(ls -1 "$DIR"/meridian-*.dump 2>/dev/null | wc -l)
if [ "$COUNT" -gt "$KEEP" ]; then
  ls -1t "$DIR"/meridian-*.dump | tail -n +$((KEEP + 1)) | xargs -r rm --
fi

echo "backup ok: $OUT ($(du -h "$OUT" | cut -f1))"