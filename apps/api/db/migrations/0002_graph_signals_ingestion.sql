-- TIGERIS AI OS — schema v2 (Phase 2: evidence and graph)
-- Adds the temporal intelligence graph, signal triage history, snapshot ingestion with validation and
-- quarantine, and illustrative movement tracks. Same isolation model as 0001: institution_id on every row,
-- composite foreign keys, FORCE row-level security bound to app.institution_id.

-- ───────────────────────────── Intelligence graph ─────────────────────────────

CREATE TABLE entities (
  id             uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id),
  key            text NOT NULL,
  entity_type    text NOT NULL CHECK (entity_type IN
                   ('event','vessel','chokepoint','port','terminal','commodity','asset','institution','portfolio',
                    'holding','service','route','region')),
  name           text NOT NULL,
  description    text NOT NULL DEFAULT '',
  -- Geometry is optional; precision and provenance are explicit (TRD §13).
  lon            double precision CHECK (lon BETWEEN -180 AND 180),
  lat            double precision CHECK (lat BETWEEN -90 AND 90),
  geo_precision  text CHECK (geo_precision IN ('exact','approximate','illustrative')),
  claim_class    text NOT NULL CHECK (claim_class IN ('observed','sourced','inferred','assumed','synthetic','illustrative')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (institution_id, id),
  UNIQUE (institution_id, key),
  CHECK ((lon IS NULL) = (lat IS NULL)),
  CHECK (lon IS NULL OR geo_precision IS NOT NULL)
);

CREATE TABLE entity_relationships (
  id                 uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id     uuid NOT NULL,
  subject_id         uuid NOT NULL,
  predicate          text NOT NULL,
  object_id          uuid NOT NULL,
  -- Unlabelled edges cannot exist (FR-15, TR-019).
  relationship_class text NOT NULL CHECK (relationship_class IN ('observed','sourced','inferred','assumed','synthetic')),
  confidence_band    text NOT NULL CHECK (confidence_band IN ('high','moderate','low','insufficient')),
  rationale          text NOT NULL,
  valid_from         timestamptz,
  valid_to           timestamptz,
  status             text NOT NULL DEFAULT 'active' CHECK (status IN ('active','challenged','retired')),
  graph_version      integer NOT NULL DEFAULT 1,
  created_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (institution_id, id),
  FOREIGN KEY (institution_id, subject_id) REFERENCES entities(institution_id, id),
  FOREIGN KEY (institution_id, object_id) REFERENCES entities(institution_id, id),
  CHECK (subject_id <> object_id),
  CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to > valid_from)
);

CREATE TABLE relationship_evidence (
  institution_id  uuid NOT NULL,
  relationship_id uuid NOT NULL,
  evidence_id     uuid NOT NULL,
  stance          text NOT NULL CHECK (stance IN ('supporting','contradicting','contextual')),
  PRIMARY KEY (institution_id, relationship_id, evidence_id),
  FOREIGN KEY (institution_id, relationship_id) REFERENCES entity_relationships(institution_id, id),
  FOREIGN KEY (institution_id, evidence_id) REFERENCES evidence_objects(institution_id, id)
);

CREATE TABLE case_entities (
  institution_id uuid NOT NULL,
  case_id        uuid NOT NULL,
  entity_id      uuid NOT NULL,
  role           text NOT NULL CHECK (role IN ('origin','affected','context')),
  PRIMARY KEY (institution_id, case_id, entity_id),
  FOREIGN KEY (institution_id, case_id) REFERENCES cases(institution_id, id),
  FOREIGN KEY (institution_id, entity_id) REFERENCES entities(institution_id, id)
);

-- ───────────────────────────── Signals: evidence links and triage history ─────────────────────────────

ALTER TABLE signals
  ADD COLUMN signal_type text NOT NULL DEFAULT 'maritime'
    CHECK (signal_type IN ('maritime','land','energy','supply_chain','institutional')),
  ADD COLUMN confidence_band text NOT NULL DEFAULT 'insufficient'
    CHECK (confidence_band IN ('high','moderate','low','insufficient')),
  ADD COLUMN location_label text,
  ADD COLUMN entity_id uuid,
  ADD FOREIGN KEY (institution_id, entity_id) REFERENCES entities(institution_id, id);

CREATE TABLE signal_evidence (
  institution_id uuid NOT NULL,
  signal_id      uuid NOT NULL,
  evidence_id    uuid NOT NULL,
  PRIMARY KEY (institution_id, signal_id, evidence_id),
  FOREIGN KEY (institution_id, signal_id) REFERENCES signals(institution_id, id),
  FOREIGN KEY (institution_id, evidence_id) REFERENCES evidence_objects(institution_id, id)
);

CREATE TABLE signal_events (
  id                 uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id     uuid NOT NULL,
  signal_id          uuid NOT NULL,
  actor_principal_id uuid NOT NULL,
  action             text NOT NULL CHECK (action IN ('corroborate','challenge','monitor','dismiss','open_case')),
  from_disposition   text NOT NULL,
  to_disposition     text NOT NULL,
  rationale          text NOT NULL CHECK (length(trim(rationale)) >= 3),
  occurred_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  FOREIGN KEY (institution_id, signal_id) REFERENCES signals(institution_id, id),
  FOREIGN KEY (institution_id, actor_principal_id) REFERENCES principals(institution_id, id)
);

-- ───────────────────────────── Ingestion and validation ─────────────────────────────

CREATE TABLE ingestion_jobs (
  id                 uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id     uuid NOT NULL,
  source_id          uuid,
  package_id         text NOT NULL,
  package_sha256     text NOT NULL CHECK (package_sha256 ~ '^[0-9a-f]{64}$'),
  rule_set_version   text NOT NULL,
  actor_principal_id uuid,
  status             text NOT NULL CHECK (status IN ('completed','rejected')),
  accepted_count     integer NOT NULL DEFAULT 0,
  warned_count       integer NOT NULL DEFAULT 0,
  quarantined_count  integer NOT NULL DEFAULT 0,
  rejected_count     integer NOT NULL DEFAULT 0,
  started_at         timestamptz NOT NULL DEFAULT now(),
  completed_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (institution_id, id),
  -- Idempotent receipt: the same package is never ingested twice (TR-003).
  UNIQUE (institution_id, package_sha256),
  FOREIGN KEY (institution_id, source_id) REFERENCES sources(institution_id, id),
  FOREIGN KEY (institution_id, actor_principal_id) REFERENCES principals(institution_id, id)
);

CREATE TABLE validation_runs (
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id   uuid NOT NULL,
  ingestion_job_id uuid NOT NULL,
  evidence_id      uuid,
  external_id      text NOT NULL,
  rule_set_version text NOT NULL,
  checks           jsonb NOT NULL,
  outcome          text NOT NULL CHECK (outcome IN ('accepted','warned','quarantined','rejected','duplicate')),
  rationale        text NOT NULL,
  occurred_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  FOREIGN KEY (institution_id, ingestion_job_id) REFERENCES ingestion_jobs(institution_id, id),
  FOREIGN KEY (institution_id, evidence_id) REFERENCES evidence_objects(institution_id, id)
);

-- ───────────────────────────── Illustrative movement ─────────────────────────────

CREATE TABLE movement_tracks (
  id             uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL,
  source_id      uuid NOT NULL,
  key            text NOT NULL,
  kind           text NOT NULL CHECK (kind IN ('vessel','truck')),
  label          text NOT NULL,
  -- MVP movement is never live (D-25): only replay of synthetic or illustrative tracks.
  data_mode      text NOT NULL CHECK (data_mode IN ('replay','synthetic_demo')),
  claim_class    text NOT NULL CHECK (claim_class IN ('synthetic','illustrative')),
  -- [[lon, lat, seconds_from_start], ...]
  points         jsonb NOT NULL CHECK (jsonb_typeof(points) = 'array' AND jsonb_array_length(points) >= 2),
  PRIMARY KEY (id),
  UNIQUE (institution_id, key),
  FOREIGN KEY (institution_id, source_id) REFERENCES sources(institution_id, id)
);

-- ───────────────────────────── Indexes ─────────────────────────────

CREATE INDEX rel_subject_idx ON entity_relationships (institution_id, subject_id, predicate);
CREATE INDEX rel_object_idx ON entity_relationships (institution_id, object_id, predicate);
CREATE INDEX signal_events_idx ON signal_events (institution_id, signal_id, occurred_at);
CREATE INDEX validation_runs_job_idx ON validation_runs (institution_id, ingestion_job_id);
CREATE INDEX entities_name_idx ON entities (institution_id, lower(name));

-- ───────────────────────────── Row-level security and grants ─────────────────────────────

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['entities','entity_relationships','relationship_evidence','case_entities',
                           'signal_evidence','signal_events','ingestion_jobs','validation_runs','movement_tracks']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I USING (institution_id = app_institution_id())
                    WITH CHECK (institution_id = app_institution_id())', t || '_scope', t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE ON entities, entity_relationships, relationship_evidence, case_entities,
  signal_evidence, movement_tracks TO tigeris_app;
-- Triage history and validation runs are append-only for the application.
GRANT SELECT, INSERT ON signal_events, ingestion_jobs, validation_runs TO tigeris_app;
