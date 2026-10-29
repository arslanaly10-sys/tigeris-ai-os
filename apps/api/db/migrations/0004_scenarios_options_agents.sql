-- TIGERIS AI OS — schema v4 (Phase 3): assumption register, scenario runs, draft options, agent runs.
-- Runs, options and agent runs are append-only records: the application role may insert and read, never
-- update or delete. A changed input produces a new run, so every stored number stays reproducible.

-- Numeric limits so mandate checks compare against the register, not against numbers in code.
ALTER TABLE mandates ADD COLUMN limit_value numeric, ADD COLUMN limit_unit text;

-- Labelled assumptions with an explicit low / central / high range (CLAUDE.md §2).
CREATE TABLE assumptions (
  id                uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id    uuid NOT NULL REFERENCES institutions(id),
  key               text NOT NULL,
  label             text NOT NULL,
  unit              text NOT NULL,
  low               numeric NOT NULL,
  central           numeric NOT NULL,
  high              numeric NOT NULL,
  rationale         text NOT NULL,
  basis_evidence_id uuid REFERENCES evidence_objects(id),
  owner_role        text NOT NULL CHECK (owner_role IN
                      ('executive','analyst','domain_expert','approver','operations_owner','administrator','auditor')),
  claim_class       text NOT NULL DEFAULT 'assumed' CHECK (claim_class = 'assumed'),
  version           integer NOT NULL DEFAULT 1,
  effective_from    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (institution_id, key, version),
  CHECK (low <= central AND central <= high)
);

CREATE TABLE scenario_runs (
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id  uuid NOT NULL REFERENCES institutions(id),
  key             text NOT NULL,
  case_id         uuid NOT NULL REFERENCES cases(id),
  template_key    text NOT NULL,
  engine_version  text NOT NULL,
  title           text NOT NULL,
  drivers         jsonb NOT NULL,
  inputs          jsonb NOT NULL,
  outputs         jsonb NOT NULL,
  warnings        jsonb NOT NULL DEFAULT '[]',
  input_hash      text NOT NULL,
  output_hash     text NOT NULL,
  data_mode       text NOT NULL DEFAULT 'scenario' CHECK (data_mode = 'scenario'),
  created_by      uuid NOT NULL REFERENCES principals(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (institution_id, key)
);
CREATE INDEX scenario_runs_case_idx ON scenario_runs (case_id, created_at DESC);

CREATE TABLE agent_runs (
  id                uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id    uuid NOT NULL REFERENCES institutions(id),
  agent_key         text NOT NULL,
  sector_key        text NOT NULL,
  task              text NOT NULL,
  case_id           uuid REFERENCES cases(id),
  scenario_run_id   uuid REFERENCES scenario_runs(id),
  model_id          text NOT NULL,
  model_version     text NOT NULL,
  -- D-14: external model calls are disabled in the MVP. Lifting this needs a decision entry and a migration.
  external          boolean NOT NULL DEFAULT false CHECK (NOT external),
  template_key      text NOT NULL,
  template_version  text NOT NULL,
  inputs            jsonb NOT NULL,
  output_text       text NOT NULL,
  grounding         jsonb NOT NULL,
  policy_decision   text NOT NULL,
  status            text NOT NULL CHECK (status IN ('completed', 'refused')),
  triggered_by      uuid NOT NULL REFERENCES principals(id),
  started_at        timestamptz NOT NULL,
  finished_at       timestamptz NOT NULL,
  PRIMARY KEY (id)
);
CREATE INDEX agent_runs_recent_idx ON agent_runs (institution_id, started_at DESC);

CREATE TABLE draft_options (
  id                  uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id      uuid NOT NULL REFERENCES institutions(id),
  key                 text NOT NULL,
  scenario_run_id     uuid NOT NULL REFERENCES scenario_runs(id),
  case_id             uuid NOT NULL REFERENCES cases(id),
  rank                integer NOT NULL CHECK (rank > 0),
  action_class        text NOT NULL,
  title               text NOT NULL,
  summary             text NOT NULL,
  rank_basis          text NOT NULL,
  mandate_checks      jsonb NOT NULL,
  authority           jsonb NOT NULL,
  confidence          jsonb NOT NULL,
  cited_refs          jsonb NOT NULL,
  ranker_version      text NOT NULL,
  -- Phase 3 only drafts. Review and decision states arrive with the Phase 4 workflow.
  status              text NOT NULL DEFAULT 'draft' CHECK (status = 'draft'),
  drafted_by_run_id   uuid REFERENCES agent_runs(id),
  created_by          uuid NOT NULL REFERENCES principals(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (institution_id, key)
);
CREATE INDEX draft_options_run_idx ON draft_options (scenario_run_id, rank);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['assumptions','scenario_runs','agent_runs','draft_options']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I USING (institution_id = app_institution_id())
                    WITH CHECK (institution_id = app_institution_id())', t || '_scope', t);
  END LOOP;
END $$;

GRANT SELECT ON assumptions TO tigeris_app;
GRANT SELECT, INSERT ON scenario_runs, agent_runs, draft_options TO tigeris_app;
