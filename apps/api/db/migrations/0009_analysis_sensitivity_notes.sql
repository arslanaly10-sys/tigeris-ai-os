-- TIGERIS AI OS — schema v9 (slices F/G): agentic case analysis runs and reviewer notes with recorded disagreement.
-- Analysis runs are append-only records of what each agent read and drafted; agents cannot change a case.
-- Reviewer notes are append-only so a disagreement can never be edited away after a decision.

CREATE TABLE analysis_runs (
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id   uuid NOT NULL REFERENCES institutions(id),
  key              text NOT NULL,
  case_id          uuid NOT NULL REFERENCES cases(id),
  version          text NOT NULL,
  question         text NOT NULL,
  scenario_run_id  uuid REFERENCES scenario_runs(id),
  steps            jsonb NOT NULL,
  gap_count        integer NOT NULL CHECK (gap_count >= 0),
  input_hash       text NOT NULL CHECK (input_hash ~ '^[0-9a-f]{64}$'),
  created_by       uuid NOT NULL REFERENCES principals(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (institution_id, key)
);
CREATE INDEX analysis_runs_case_idx ON analysis_runs (case_id, created_at DESC);

ALTER TABLE agent_runs ADD COLUMN analysis_run_id uuid REFERENCES analysis_runs(id);

CREATE TABLE review_notes (
  id                 uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id     uuid NOT NULL REFERENCES institutions(id),
  recommendation_id  uuid NOT NULL REFERENCES recommendations(id),
  case_id            uuid NOT NULL REFERENCES cases(id),
  author_id          uuid NOT NULL REFERENCES principals(id),
  author_role        text NOT NULL CHECK (author_role IN
                       ('executive','analyst','domain_expert','approver','operations_owner','administrator','auditor')),
  stance             text NOT NULL CHECK (stance IN ('agree','disagree','note')),
  body               text NOT NULL CHECK (length(btrim(body)) >= 20),
  created_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);
CREATE INDEX review_notes_rec_idx ON review_notes (recommendation_id, created_at);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['analysis_runs','review_notes']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I USING (institution_id = app_institution_id())
                    WITH CHECK (institution_id = app_institution_id())', t || '_scope', t);
  END LOOP;
END $$;

GRANT SELECT, INSERT ON analysis_runs, review_notes TO tigeris_app;
