-- TIGERIS AI OS — schema v14 (Phase 5B): intervention engine. Watch rules (versioned, approved by a second person)
-- and the interventions a deterministic sweep raises from them. An intervention names its rule version, its inputs
-- and lineage; a person acknowledges, resolves or dismisses it. The sweep never closes one: when the condition
-- clears it only records when.

CREATE TABLE watch_rules (
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id   uuid NOT NULL REFERENCES institutions(id),
  key              text NOT NULL CHECK (key ~ '^W-[A-Z0-9-]{2,40}$'),
  version          integer NOT NULL CHECK (version > 0),
  label            text NOT NULL,
  kind             text NOT NULL CHECK (kind IN ('semantic','signal_untriaged','connector_stale','decision_drift')),
  params           jsonb NOT NULL DEFAULT '{}'::jsonb,
  severity         text NOT NULL CHECK (severity IN ('breach','attention')),
  route_roles      text[] NOT NULL CHECK (cardinality(route_roles) > 0),
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

CREATE TABLE interventions (
  id                  uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id      uuid NOT NULL REFERENCES institutions(id),
  key                 text NOT NULL CHECK (key ~ '^INT-[0-9]{8}-[0-9]{4}$'),
  watch_rule_id       uuid NOT NULL REFERENCES watch_rules(id),
  engine_version      text NOT NULL,
  subject_ref         text NOT NULL,
  severity            text NOT NULL CHECK (severity IN ('breach','attention')),
  title               text NOT NULL,
  detail              text NOT NULL,
  inputs              jsonb NOT NULL,
  route_roles         text[] NOT NULL,
  classification      text NOT NULL CHECK (classification IN ('internal','restricted','confidential')),
  sector_key          text,
  case_id             uuid REFERENCES cases(id),
  status              text NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved','dismissed')),
  first_seen_at       timestamptz NOT NULL DEFAULT now(),
  last_seen_at        timestamptz NOT NULL DEFAULT now(),
  condition_cleared_at timestamptz,
  acknowledged_by     uuid REFERENCES principals(id),
  acknowledged_at     timestamptz,
  closed_by           uuid REFERENCES principals(id),
  closed_at           timestamptz,
  close_reason        text,
  PRIMARY KEY (id),
  UNIQUE (institution_id, key),
  CHECK (status NOT IN ('resolved','dismissed') OR (closed_by IS NOT NULL AND length(btrim(close_reason)) >= 10))
);

-- At most one live intervention per rule and subject; a recurrence after closure raises a new one.
CREATE UNIQUE INDEX interventions_live ON interventions (institution_id, watch_rule_id, subject_ref)
  WHERE status IN ('open','acknowledged');
CREATE INDEX interventions_status ON interventions (institution_id, status, last_seen_at DESC);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['watch_rules','interventions']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I USING (institution_id = app_institution_id())
                    WITH CHECK (institution_id = app_institution_id())', t || '_scope', t);
  END LOOP;
END $$;

GRANT SELECT, INSERT ON watch_rules, interventions TO tigeris_app;
GRANT UPDATE (status, approved_by, approved_at) ON watch_rules TO tigeris_app;
-- The sweep refreshes what it observed; people move the status. Rule, subject and first sighting never change.
GRANT UPDATE (severity, title, detail, inputs, last_seen_at, condition_cleared_at, status,
              acknowledged_by, acknowledged_at, closed_by, closed_at, close_reason) ON interventions TO tigeris_app;
