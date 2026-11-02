#!/usr/bin/env bash
# Backs up the TIGERIS database (D-122): a custom-format pg_dump plus its SHA-256, written to BACKUP_DIR.
# Runs as a PostgreSQL superuser (or a role with BYPASSRLS): row-level security is forced on every institutional
# table, so a dump by any other role would refuse or miss rows. Usage: scripts/backup.sh [output-dir]
# Remote databases: set PGHOST, PGPORT, PGUSER and PGPASSWORD (libpq) for a superuser or BYPASSRLS role.
set -euo pipefail
DB_NAME="${TIGERIS_DB_NAME:-tigeris}"
OUT_DIR="${1:-${BACKUP_DIR:-./backups}}"
mkdir -p "$OUT_DIR"
FILE="$OUT_DIR/${DB_NAME}-$(date -u +%Y%m%dT%H%M%SZ).dump"
# Local: as the postgres OS user. Remote: set the standard PGHOST, PGPORT, PGUSER and PGPASSWORD for a superuser.
if [[ -z "${PGHOST:-}" && "$(id -u)" == "0" ]] && id postgres >/dev/null 2>&1; then
  su postgres -c "pg_dump --format=custom --no-owner -d $DB_NAME" > "$FILE"
else
  pg_dump --format=custom --no-owner -d "$DB_NAME" > "$FILE"
fi
sha256sum "$FILE" > "$FILE.sha256"
echo "$FILE"
