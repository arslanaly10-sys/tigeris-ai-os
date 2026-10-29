-- TIGERIS AI OS — schema v1 (Phase 1 foundation)
-- Domains: institution & access · sources & evidence · signals & cases · audit.
-- Every institutional table carries institution_id, composite foreign keys that include it,
-- and a row-level security policy bound to the transaction-local setting app.institution_id.
-- Runs as tigeris_owner. The application connects as tigeris_app (non-owner, NOBYPASSRLS).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Current institution scope, set per transaction by the API: set_config('app.institution_id', $1, true).
CREATE FUNCTION app_institution_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.institution_id', true), '')::uuid $$;

-- ───────────────────────────── Institution and access ─────────────────────────────

CREATE TABLE institutions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key          text NOT NULL UNIQUE,
  name         text NOT NULL,
  is_synthetic boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE divisions (
  id             uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id),
  name           text NOT NULL,
  PRIMARY KEY (id),
  UNIQUE (institution_id, id)
);

CREATE TABLE principals (
  id             uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id),
  division_id    uuid,
  display_name   text NOT NULL,
  title          text NOT NULL,
  -- External identity provider mapping (OIDC issuer + subject). Demo principals use the demo issuer.
  idp_issuer     text NOT NULL,
  idp_subject    text NOT NULL,
  is_demo        boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (institution_id, id),
  UNIQUE (idp_issuer, idp_subject),
  FOREIGN KEY (institution_id, division_id) REFERENCES divisions(institution_id, id)
);

CREATE TABLE principal_roles (
  institution_id uuid NOT NULL,
  principal_id   uuid NOT NULL,
  role           text NOT NULL CHECK (role IN
                   ('executive','analyst','domain_expert','approver','operations_owner','administrator','auditor')),
  PRIMARY KEY (institution_id, principal_id, role),
  FOREIGN KEY (institution_id, principal_id) REFERENCES principals(institution_id, id)
);

-- ───────────────────────────── Sources and evidence ─────────────────────────────

CREATE TABLE sources (
  id                    uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id        uuid NOT NULL REFERENCES institutions(id),
  key                   text NOT NULL,
  publisher             text NOT NULL,
  title                 text NOT NULL,
  source_class          text NOT NULL CHECK (source_class IN ('public','third_party','licensed','client','synthetic')),
  url                   text,
  terms_ref             text,
  allowed_purpose       text NOT NULL,
  cadence               text,
  freshness_limit_hours integer CHECK (freshness_limit_hours > 0),
  approval_status       text NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('approved','pending','suspended')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (institution_id, id),
  UNIQUE (institution_id, key)
);

CREATE TABLE evidence_objects (
  id                uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id    uuid NOT NULL,
  source_id         uuid NOT NULL,
  external_id       text NOT NULL,
  title             text NOT NULL,
  summary           text NOT NULL,
  event_time        timestamptz,
  retrieved_at      timestamptz,
  version           text NOT NULL DEFAULT '1',
  sha256            text CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  object_key        text,
  validation_status text NOT NULL CHECK (validation_status IN ('validated','unverified','stale','disputed','quarantined')),
  validation_note   text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (institution_id, id),
  UNIQUE (institution_id, source_id, external_id, version),
  FOREIGN KEY (institution_id, source_id) REFERENCES sources(institution_id, id)
);

CREATE TABLE evidence_facts (
  id                 uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id     uuid NOT NULL,
  evidence_id        uuid NOT NULL,
  subject            text NOT NULL,
  predicate          text NOT NULL,
  value_num          numeric,
  value_text         text,
  unit               text,
  claim_class        text NOT NULL CHECK (claim_class IN ('observed','sourced','inferred','assumed','synthetic','illustrative')),
  valid_from         timestamptz,
  transformation     text,
  extraction_version text NOT NULL DEFAULT 'manual-v1',
  sort_order         integer NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE (institution_id, id),
  FOREIGN KEY (institution_id, evidence_id) REFERENCES evidence_objects(institution_id, id),
  CHECK (value_num IS NOT NULL OR value_text IS NOT NULL)
);

-- ───────────────────────────── Signals and cases ─────────────────────────────

CREATE TABLE cases (
  id                   uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id       uuid NOT NULL,
  key                  text NOT NULL,
  title                text NOT NULL,
  state                text NOT NULL CHECK (state IN
                         ('detected','triaged','analysis','scenario','review','decision','handoff','closed')),
  domain               text NOT NULL,
  sensitivity          text NOT NULL CHECK (sensitivity IN ('internal','restricted','confidential')),
  urgency              text NOT NULL CHECK (urgency IN ('critical','elevated','routine')),
  data_mode            text NOT NULL CHECK (data_mode IN ('live','snapshot','replay','scenario','synthetic_demo')),
  owner_principal_id   uuid NOT NULL,
  objective            text NOT NULL,
  summary              text NOT NULL,
  why_it_matters       text NOT NULL,
  unresolved_questions text[] NOT NULL DEFAULT '{}',
  confidence           jsonb NOT NULL,
  version              integer NOT NULL DEFAULT 1,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (institution_id, id),
  UNIQUE (institution_id, key),
  FOREIGN KEY (institution_id, owner_principal_id) REFERENCES principals(institution_id, id)
);

CREATE TABLE signals (
  id             uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL,
  key            text NOT NULL,
  title          text NOT NULL,
  summary        text NOT NULL,
  domain         text NOT NULL,
  urgency        text NOT NULL CHECK (urgency IN ('critical','elevated','routine')),
  data_mode      text NOT NULL CHECK (data_mode IN ('live','snapshot','replay','scenario','synthetic_demo')),
  disposition    text NOT NULL DEFAULT 'new' CHECK (disposition IN ('new','monitoring','corroborated','dismissed','case_opened')),
  detected_at    timestamptz NOT NULL,
  case_id        uuid,
  PRIMARY KEY (id),
  UNIQUE (institution_id, id),
  UNIQUE (institution_id, key),
  FOREIGN KEY (institution_id, case_id) REFERENCES cases(institution_id, id)
);

CREATE TABLE case_evidence (
  institution_id uuid NOT NULL,
  case_id        uuid NOT NULL,
  evidence_id    uuid NOT NULL,
  sort_order     integer NOT NULL DEFAULT 0,
  PRIMARY KEY (institution_id, case_id, evidence_id),
  FOREIGN KEY (institution_id, case_id) REFERENCES cases(institution_id, id),
  FOREIGN KEY (institution_id, evidence_id) REFERENCES evidence_objects(institution_id, id)
);

CREATE TABLE case_events (
  id                 uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id     uuid NOT NULL,
  case_id            uuid NOT NULL,
  actor_principal_id uuid,
  event_type         text NOT NULL,
  from_state         text,
  to_state           text,
  rationale          text,
  occurred_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  FOREIGN KEY (institution_id, case_id) REFERENCES cases(institution_id, id),
  FOREIGN KEY (institution_id, actor_principal_id) REFERENCES principals(institution_id, id)
);

-- ───────────────────────────── Audit (append-only, hash-chained) ─────────────────────────────

CREATE TABLE audit_events (
  seq                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id                 uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  institution_id     uuid NOT NULL REFERENCES institutions(id),
  actor_principal_id uuid,
  actor_type         text NOT NULL CHECK (actor_type IN ('human','service')),
  action             text NOT NULL,
  object_type        text NOT NULL,
  object_id          text,
  case_id            uuid,
  payload            jsonb NOT NULL DEFAULT '{}',
  occurred_at        timestamptz NOT NULL DEFAULT now(),
  prev_hash          text,
  hash               text NOT NULL CHECK (hash ~ '^[0-9a-f]{64}$')
);

CREATE FUNCTION audit_events_append_only() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only';
END $$;

CREATE TRIGGER audit_events_no_update BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_events_append_only();

-- ───────────────────────────── Indexes ─────────────────────────────

CREATE INDEX cases_queue_idx ON cases (institution_id, state, updated_at DESC);
CREATE INDEX signals_queue_idx ON signals (institution_id, disposition, detected_at DESC);
CREATE INDEX evidence_source_idx ON evidence_objects (institution_id, source_id, event_time);
CREATE INDEX evidence_facts_evidence_idx ON evidence_facts (institution_id, evidence_id, sort_order);
CREATE INDEX case_events_case_idx ON case_events (institution_id, case_id, occurred_at);
CREATE INDEX audit_case_idx ON audit_events (institution_id, case_id, occurred_at);
CREATE INDEX audit_object_idx ON audit_events (object_type, object_id, occurred_at);

-- ───────────────────────────── Row-level security ─────────────────────────────

-- institutions is not FORCEd so the owner-run resolve_institution_id() below can see it; the app role
-- is still restricted. All other tables are FORCEd: even the owner must set app.institution_id.
ALTER TABLE institutions ENABLE ROW LEVEL SECURITY;
CREATE POLICY institutions_scope ON institutions USING (id = app_institution_id());

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['divisions','principals','principal_roles','sources','evidence_objects','evidence_facts',
                           'cases','signals','case_evidence','case_events','audit_events']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I USING (institution_id = app_institution_id())
                    WITH CHECK (institution_id = app_institution_id())', t || '_scope', t);
  END LOOP;
END $$;

-- ───────────────────────────── Grants to the application role ─────────────────────────────

GRANT SELECT ON institutions TO tigeris_app;
GRANT SELECT, INSERT, UPDATE ON divisions, principals, principal_roles, sources, evidence_objects,
  evidence_facts, cases, signals, case_evidence, case_events TO tigeris_app;
-- Audit: insert and read only. No UPDATE/DELETE grant; trigger blocks it even for the owner.
GRANT SELECT, INSERT ON audit_events TO tigeris_app;
GRANT EXECUTE ON FUNCTION app_institution_id() TO tigeris_app;

-- Pre-authentication lookup for demo sign-in: resolves an institution key to its id without
-- granting the app role cross-institution SELECT. SECURITY DEFINER runs as the owner.
CREATE FUNCTION resolve_institution_id(p_key text) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT id FROM institutions WHERE key = p_key $$;
REVOKE ALL ON FUNCTION resolve_institution_id(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_institution_id(text) TO tigeris_app;
