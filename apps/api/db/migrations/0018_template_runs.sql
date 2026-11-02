-- TIGERIS AI OS — schema v18 (Phase 5F): runs of declarative scenario templates other than the Hormuz engine.
-- Kept apart from scenario_runs so code that reads a case's Hormuz runs never meets another template's outputs.
-- Runs are append-only and attach to a case (case-first).

CREATE TABLE template_runs (
  id             uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id),
  key            text NOT NULL CHECK (key ~ '^TR-[0-9]{8}-[0-9]{2,4}$'),
  case_id        uuid NOT NULL REFERENCES cases(id),
  template_key   text NOT NULL,
  engine_version text NOT NULL,
  title          text NOT NULL,
  drivers        jsonb NOT NULL,
  inputs         jsonb NOT NULL,
  outputs        jsonb NOT NULL,
  input_hash     text NOT NULL,
  output_hash    text NOT NULL,
  data_mode      text NOT NULL DEFAULT 'scenario' CHECK (data_mode = 'scenario'),
  created_by     uuid NOT NULL REFERENCES principals(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (institution_id, key)
);
CREATE INDEX template_runs_case ON template_runs (institution_id, case_id, created_at DESC);

ALTER TABLE template_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY template_runs_scope ON template_runs USING (institution_id = app_institution_id())
  WITH CHECK (institution_id = app_institution_id());
GRANT SELECT, INSERT ON template_runs TO tigeris_app;
