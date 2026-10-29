#!/usr/bin/env bash
# Creates the TIGERIS database and its two roles (idempotent, drops and recreates the database).
#   tigeris_owner — owns schema objects; used only by migrations and seed.
#   tigeris_app   — application role: no ownership, no BYPASSRLS, no superuser.
# Connects as a PostgreSQL superuser via PG_SUPERUSER_URL (default: local socket as postgres).
set -euo pipefail

SUPER_URL="${PG_SUPERUSER_URL:-}"
run_psql() {
  if [[ -n "$SUPER_URL" ]]; then
    psql "$SUPER_URL" -v ON_ERROR_STOP=1 -q "$@"
  elif [[ "$(id -u)" == "0" ]] && id postgres >/dev/null 2>&1; then
    su postgres -c "psql -v ON_ERROR_STOP=1 -q $(printf '%q ' "$@")"
  else
    psql -U postgres -v ON_ERROR_STOP=1 -q "$@"
  fi
}

DB_NAME="${TIGERIS_DB_NAME:-tigeris}"

run_psql -d postgres <<SQL
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();
DROP DATABASE IF EXISTS ${DB_NAME};
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tigeris_owner') THEN
    CREATE ROLE tigeris_owner LOGIN PASSWORD 'tigeris_owner_dev';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tigeris_app') THEN
    CREATE ROLE tigeris_app LOGIN PASSWORD 'tigeris_app_dev' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
\$\$;
CREATE DATABASE ${DB_NAME} OWNER tigeris_owner;
SQL

run_psql -d "${DB_NAME}" <<SQL
REVOKE ALL ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO tigeris_owner;
GRANT USAGE ON SCHEMA public TO tigeris_app;
SQL

echo "Database '${DB_NAME}' ready with roles tigeris_owner and tigeris_app."
