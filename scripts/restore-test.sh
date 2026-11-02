#!/usr/bin/env bash
# Proves a backup restores (D-122): restores it into a scratch database, then checks every table has the same row
# count as the source and the audit chain ends on the same hash. Drops the scratch database afterwards.
# Usage: scripts/restore-test.sh <backup.dump>   (same superuser connection rules as backup.sh)
# Compare against a quiet source: writes between the backup and this check make the counts differ.
set -euo pipefail
FILE="$1"
SRC="${TIGERIS_DB_NAME:-tigeris}"
TMP="${SRC}_restore_test"
sha256sum -c "$FILE.sha256" >/dev/null
local_su() { [[ -z "${PGHOST:-}" && "$(id -u)" == "0" ]] && id postgres >/dev/null 2>&1; }
q() {
  if local_su; then su postgres -c "psql -d $1 -v ON_ERROR_STOP=1 -qAt -c $(printf '%q' "$2")"
  else psql -d "$1" -v ON_ERROR_STOP=1 -qAt -c "$2"; fi
}
restore() {
  if local_su; then su postgres -c "pg_restore --no-owner --exit-on-error -d $TMP" < "$FILE"
  else pg_restore --no-owner --exit-on-error -d "$TMP" "$FILE"; fi
}
q postgres "DROP DATABASE IF EXISTS $TMP" 2>/dev/null; q postgres "CREATE DATABASE $TMP"
trap 'q postgres "DROP DATABASE IF EXISTS $TMP" >/dev/null' EXIT
restore
COUNTS="select string_agg(t || '=' || n, ' ' order by t) from (select table_name t, (xpath('/row/c/text()', query_to_xml(format('select count(*) c from public.%I', table_name), false, true, '')))[1]::text n from information_schema.tables where table_schema='public' and table_type='BASE TABLE') x"
LAST="select coalesce((select hash from public.audit_events order by seq desc limit 1), 'none')"
a=$(q "$SRC" "$COUNTS"); b=$(q "$TMP" "$COUNTS")
[[ "$a" == "$b" ]] || { echo "Row counts differ after restore"; diff <(tr ' ' '\n' <<<"$a") <(tr ' ' '\n' <<<"$b") || true; exit 1; }
[[ "$(q "$SRC" "$LAST")" == "$(q "$TMP" "$LAST")" ]] || { echo "Audit chain head differs after restore"; exit 1; }
echo "Restore test passed: $(wc -w <<<"$a") tables with matching row counts; audit chain head $(q "$TMP" "$LAST" | cut -c1-12)…"
