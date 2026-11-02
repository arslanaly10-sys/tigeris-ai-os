#!/usr/bin/env bash
# Creates the TIGERIS database and its two roles. Default: drops and recreates the database (local development).
# TIGERIS_DB_KEEP=1: never drops anything; creates the roles and the database only if missing (deployments, D-122).
# Role passwords: TIGERIS_OWNER_PASSWORD and TIGERIS_APP_PASSWORD (dev defaults only for local use).
#   tigeris_owner — owns schema objects; used only by migrations and seed.
#   tigeris_app   — application role: no ownership, no BYPASSRLS, no superuser.
# Connects as a PostgreSQL superuser via PG_SUPERUSER_URL, given without a database name
# (postgres://user:pass@host:5432); default: local socket as postgres.
set -euo pipefail

SUPER_URL="${PG_SUPERUSER_URL:-}"
# run_psql <database> [psql args...]
run_psql() {
  local db="$1"; shift
  if [[ -n "$SUPER_URL" ]]; then
    psql "${SUPER_URL%/}/${db}" -v ON_ERROR_STOP=1 -q "$@"
  elif [[ "$(id -u)" == "0" ]] && id postgres >/dev/null 2>&1; then
    su postgres -c "psql -d ${db} -v ON_ERROR_STOP=1 -q $(printf '%q ' "$@")"
  else
    psql -U postgres -d "${db}" -v ON_ERROR_STOP=1 -q "$@"
  fi
}

DB_NAME="${TIGERIS_DB_NAME:-tigeris}"
OWNER_PW="${TIGERIS_OWNER_PASSWORD:-tigeris_owner_dev}"
APP_PW="${TIGERIS_APP_PASSWORD:-tigeris_app_dev}"
KEEP="${TIGERIS_DB_KEEP:-0}"
if [[ "$KEEP" == "1" ]]; then DROP=""; else
  DROP="SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();
DROP DATABASE IF EXISTS ${DB_NAME};"
fi

run_psql postgres <<SQL
${DROP}
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tigeris_owner') THEN
    CREATE ROLE tigeris_owner LOGIN PASSWORD '${OWNER_PW}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tigeris_app') THEN
    CREATE ROLE tigeris_app LOGIN PASSWORD '${APP_PW}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
\$\$;
SQL
if [[ -z "$(run_psql postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}'")" ]]; then
  run_psql postgres -c "CREATE DATABASE ${DB_NAME} OWNER tigeris_owner"
fi

run_psql "${DB_NAME}" <<SQL
REVOKE ALL ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO tigeris_owner;
GRANT USAGE ON SCHEMA public TO tigeris_app;
SQL

echo "Database '${DB_NAME}' ready with roles tigeris_owner and tigeris_app."
