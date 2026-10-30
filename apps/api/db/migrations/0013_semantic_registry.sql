-- TIGERIS AI OS — schema v13 (Phase 5A): semantic registry. Institution definitions and codified rules, versioned.
-- A version is drafted by one person and approved by another; an approved version is never edited, only superseded
-- (the previous approved version of the same key is retired). System definitions (engine metrics, sector indicators)
-- live in code with their engine version and are not stored here.

CREATE TABLE semantic_definitions (
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id   uuid NOT NULL REFERENCES institutions(id),
  key              text NOT NULL CHECK (key ~ '^[a-z][a-z0-9_:.-]{2,80}$'),
  version          integer NOT NULL CHECK (version > 0),
  kind             text NOT NULL CHECK (kind IN ('metric','term')),
  label            text NOT NULL,
  description      text NOT NULL CHECK (length(btrim(description)) >= 10),
  unit             text NOT NULL DEFAULT '',
  formula          text,
  owner_role       text NOT NULL CHECK (owner_role IN
                     ('executive','analyst','domain_expert','approver','operations_owner','administrator','auditor')),
  source_ref       text,
  jurisdiction     text,
  claim_class      text NOT NULL CHECK (claim_class IN ('observed','sourced','inferred','assumed','synthetic','illustrative')),
  status           text NOT NULL CHECK (status IN ('draft','approved','retired')),
  created_by       uuid REFERENCES principals(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  approved_by      uuid REFERENCES principals(id),
  approved_at      timestamptz,
  basis            text,
  PRIMARY KEY (id),
  UNIQUE (institution_id, key, version),
  CHECK (approved_by IS NULL OR approved_by IS DISTINCT FROM created_by)
);

CREATE TABLE semantic_rules (
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id   uuid NOT NULL REFERENCES institutions(id),
  key              text NOT NULL CHECK (key ~ '^[A-Z][A-Z0-9-]{2,40}$'),
  version          integer NOT NULL CHECK (version > 0),
  label            text NOT NULL,
  subject          text NOT NULL,
  operator         text NOT NULL CHECK (operator IN ('<=','<','>=','>')),
  threshold        numeric NOT NULL,
  unit             text NOT NULL DEFAULT '',
  severity         text NOT NULL CHECK (severity IN ('breach','attention')),
  attention_margin numeric NOT NULL DEFAULT 0 CHECK (attention_margin >= 0 AND attention_margin < 1),
  mandate_key      text,
  jurisdiction     text,
  rationale        text NOT NULL CHECK (length(btrim(rationale)) >= 10),
  claim_class      text NOT NULL CHECK (claim_class IN ('observed','sourced','inferred','assumed','synthetic','illustrative')),
  status           text NOT NULL CHECK (status IN ('draft','approved','retired')),
  created_by       uuid REFERENCES principals(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  approved_by      uuid REFERENCES principals(id),
  approved_at      timestamptz,
  basis            text,
  PRIMARY KEY (id),
  UNIQUE (institution_id, key, version),
  CHECK (approved_by IS NULL OR approved_by IS DISTINCT FROM created_by)
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['semantic_definitions','semantic_rules']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I USING (institution_id = app_institution_id())
                    WITH CHECK (institution_id = app_institution_id())', t || '_scope', t);
  END LOOP;
END $$;

GRANT SELECT, INSERT ON semantic_definitions, semantic_rules TO tigeris_app;
-- Only the approval fields and status move; content is immutable once written.
GRANT UPDATE (status, approved_by, approved_at) ON semantic_definitions, semantic_rules TO tigeris_app;
