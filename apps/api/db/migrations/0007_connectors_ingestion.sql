-- TIGERIS AI OS — schema v7 (slice C): connector registry, file and document ingestion, row-level issues.
-- Secrets are never stored: a connector names the environment variable or secret-store key that holds its
-- credential (`auth_ref`). A connector becomes `connected` only after an authenticated fetch succeeds.

CREATE TABLE connectors (
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id   uuid NOT NULL REFERENCES institutions(id),
  key              text NOT NULL,
  provider         text NOT NULL,
  name             text NOT NULL,
  connection_type  text NOT NULL CHECK (connection_type IN
                     ('file','rest','webhook','sql','sftp','rss','document','stream')),
  auth_type        text NOT NULL CHECK (auth_type IN ('none','api_key','oauth2','basic','mtls','ssh_key')),
  -- Name of the environment variable / secret-store key holding the credential. Never the credential itself.
  auth_ref         text CHECK (auth_ref IS NULL OR auth_ref ~ '^[A-Z][A-Z0-9_]{2,63}$'),
  endpoint         text,
  datasets         jsonb NOT NULL DEFAULT '[]',
  sector_key       text CHECK (sector_key IN
                     ('energy','utilities','capital','supply_chain','banking','manufacturing','real_estate','insurance')),
  classification   text NOT NULL CHECK (classification IN ('internal','restricted','confidential')),
  schedule         text,
  status           text NOT NULL DEFAULT 'configured' CHECK (status IN
                     ('sample','configured','connected','paused','failed','retired')),
  schema_version   text NOT NULL DEFAULT 'v1',
  mapping_version  text NOT NULL DEFAULT 'v1',
  source_id        uuid NOT NULL REFERENCES sources(id),
  last_success_at  timestamptz,
  last_error       text,
  last_error_at    timestamptz,
  retry_count      integer NOT NULL DEFAULT 0,
  next_retry_at    timestamptz,
  read_only        boolean NOT NULL DEFAULT true CHECK (read_only),
  created_by       uuid NOT NULL REFERENCES principals(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (institution_id, key)
);

CREATE TABLE uploaded_files (
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id  uuid NOT NULL REFERENCES institutions(id),
  connector_id    uuid NOT NULL REFERENCES connectors(id),
  original_name   text NOT NULL,
  media_type      text NOT NULL,
  size_bytes      integer NOT NULL CHECK (size_bytes > 0),
  sha256          text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  storage_path    text NOT NULL,
  classification  text NOT NULL CHECK (classification IN ('internal','restricted','confidential')),
  uploaded_by     uuid NOT NULL REFERENCES principals(id),
  uploaded_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE connector_runs (
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id  uuid NOT NULL REFERENCES institutions(id),
  key             text NOT NULL,
  connector_id    uuid NOT NULL REFERENCES connectors(id),
  dataset         text NOT NULL,
  trigger         text NOT NULL CHECK (trigger IN ('upload','manual','schedule','test')),
  file_id         uuid REFERENCES uploaded_files(id),
  status          text NOT NULL CHECK (status IN ('running','succeeded','partial','failed')),
  rows_total      integer NOT NULL DEFAULT 0,
  rows_accepted   integer NOT NULL DEFAULT 0,
  rows_warned     integer NOT NULL DEFAULT 0,
  rows_rejected   integer NOT NULL DEFAULT 0,
  mapping_version text NOT NULL,
  error           text,
  actor_id        uuid REFERENCES principals(id),
  started_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz,
  PRIMARY KEY (id),
  UNIQUE (institution_id, key)
);
CREATE INDEX connector_runs_recent_idx ON connector_runs (institution_id, started_at DESC);

CREATE TABLE row_issues (
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id  uuid NOT NULL REFERENCES institutions(id),
  run_id          uuid NOT NULL REFERENCES connector_runs(id),
  row_number      integer NOT NULL CHECK (row_number >= 1),
  field           text,
  severity        text NOT NULL CHECK (severity IN ('error','warning')),
  code            text NOT NULL,
  message         text NOT NULL,
  raw             jsonb NOT NULL,
  PRIMARY KEY (id)
);
CREATE INDEX row_issues_run_idx ON row_issues (run_id, row_number);

-- Text extracted from uploaded PDF, DOCX and plain-text documents; the original file stays in storage.
CREATE TABLE documents (
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id   uuid NOT NULL REFERENCES institutions(id),
  key              text NOT NULL,
  title            text NOT NULL,
  file_id          uuid NOT NULL REFERENCES uploaded_files(id),
  page_count       integer,
  char_count       integer NOT NULL,
  excerpt          text NOT NULL,
  full_text        text NOT NULL,
  sector_key       text CHECK (sector_key IN
                     ('energy','utilities','capital','supply_chain','banking','manufacturing','real_estate','insurance')),
  source_id        uuid NOT NULL REFERENCES sources(id),
  source_record_id text NOT NULL,
  record_mode      text NOT NULL CHECK (record_mode IN ('live','imported','synthetic','sample','manual')),
  classification   text NOT NULL CHECK (classification IN ('internal','restricted','confidential')),
  mapping_version  text NOT NULL,
  quality_status   text NOT NULL DEFAULT 'valid' CHECK (quality_status IN ('valid','warning','quarantined')),
  ingested_at      timestamptz NOT NULL DEFAULT now(),
  connector_id     uuid REFERENCES connectors(id),
  run_id           uuid REFERENCES connector_runs(id),
  PRIMARY KEY (id),
  UNIQUE (institution_id, key)
);

-- Imported canonical records point back at the connector and run that brought them in.
ALTER TABLE positions ADD COLUMN connector_id uuid REFERENCES connectors(id), ADD COLUMN run_id uuid REFERENCES connector_runs(id);
ALTER TABLE managers ADD COLUMN connector_id uuid REFERENCES connectors(id), ADD COLUMN run_id uuid REFERENCES connector_runs(id);
ALTER TABLE dd_records ADD COLUMN connector_id uuid REFERENCES connectors(id), ADD COLUMN run_id uuid REFERENCES connector_runs(id);
-- Positions are point-in-time: the same holding can be reported again with a later as-of date.
ALTER TABLE positions DROP CONSTRAINT positions_institution_id_key_key;
ALTER TABLE positions ADD CONSTRAINT positions_institution_key_asof UNIQUE (institution_id, key, as_of);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['connectors','uploaded_files','connector_runs','row_issues','documents']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I USING (institution_id = app_institution_id())
                    WITH CHECK (institution_id = app_institution_id())', t || '_scope', t);
  END LOOP;
END $$;

GRANT SELECT, INSERT ON connectors, uploaded_files, connector_runs, row_issues, documents TO tigeris_app;
GRANT UPDATE (status, schedule, last_success_at, last_error, last_error_at, retry_count, next_retry_at, updated_at)
  ON connectors TO tigeris_app;
GRANT UPDATE (status, rows_total, rows_accepted, rows_warned, rows_rejected, error, finished_at)
  ON connector_runs TO tigeris_app;

-- Background job queue (pg-boss). Job tables hold job state only, never institutional records; jobs carry the
-- institution id and every worker sets the row-level-security scope before touching data.
CREATE SCHEMA IF NOT EXISTS pgboss;
GRANT USAGE, CREATE ON SCHEMA pgboss TO tigeris_app;
