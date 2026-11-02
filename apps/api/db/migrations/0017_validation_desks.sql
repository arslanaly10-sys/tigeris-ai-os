-- TIGERIS AI OS — schema v17 (Phase 5E): organisation levels, desk membership and validation requests.
-- Divisions gain a key, a kind and a parent: asset-class desks roll up to the Investment Committee, which rolls up
-- to the Executive Office (D-107). A validation request asks a named person or a desk to confirm or dispute a
-- finding by a due date; requests sent together form a batch whose answers are rolled up side by side.

ALTER TABLE divisions ADD COLUMN key text;
ALTER TABLE divisions ADD COLUMN kind text NOT NULL DEFAULT 'desk' CHECK (kind IN ('executive','committee','desk'));
ALTER TABLE divisions ADD COLUMN parent_id uuid;
ALTER TABLE divisions ADD COLUMN description text;
ALTER TABLE divisions ADD CONSTRAINT divisions_key_format CHECK (key IS NULL OR key ~ '^[A-Z][A-Z0-9-]{1,30}$');
ALTER TABLE divisions ADD CONSTRAINT divisions_key_unique UNIQUE (institution_id, key);
ALTER TABLE divisions ADD CONSTRAINT divisions_parent_fk
  FOREIGN KEY (institution_id, parent_id) REFERENCES divisions(institution_id, id);

CREATE TABLE desk_members (
  institution_id uuid NOT NULL REFERENCES institutions(id),
  division_id    uuid NOT NULL,
  principal_id   uuid NOT NULL,
  added_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (institution_id, division_id, principal_id),
  FOREIGN KEY (institution_id, division_id) REFERENCES divisions(institution_id, id),
  FOREIGN KEY (institution_id, principal_id) REFERENCES principals(institution_id, id)
);

CREATE TABLE validation_requests (
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id   uuid NOT NULL REFERENCES institutions(id),
  key              text NOT NULL CHECK (key ~ '^VR-[0-9]{8}-[0-9]{2,4}$'),
  batch_key        text NOT NULL CHECK (batch_key ~ '^VB-[0-9]{8}-[0-9]{2,4}$'),
  subject_type     text NOT NULL CHECK (subject_type IN ('case','scenario_run','recommendation','intervention')),
  subject_key      text NOT NULL,
  subject_label    text NOT NULL,
  case_id          uuid REFERENCES cases(id),
  classification   text NOT NULL CHECK (classification IN ('internal','restricted','confidential')),
  question         text NOT NULL CHECK (length(btrim(question)) >= 10),
  requested_by     uuid NOT NULL REFERENCES principals(id),
  assignee_principal_id uuid REFERENCES principals(id),
  assignee_division_id  uuid REFERENCES divisions(id),
  due_on           date NOT NULL,
  status           text NOT NULL DEFAULT 'open' CHECK (status IN ('open','answered','withdrawn')),
  verdict          text CHECK (verdict IN ('confirmed','disputed','insufficient_evidence')),
  response         text,
  assumptions      jsonb NOT NULL DEFAULT '[]'::jsonb,
  answered_by      uuid REFERENCES principals(id),
  answered_at      timestamptz,
  withdrawn_reason text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (institution_id, key),
  -- Exactly one assignee: a named person or a desk.
  CHECK ((assignee_principal_id IS NULL) <> (assignee_division_id IS NULL)),
  -- The requester never validates their own finding.
  CHECK (answered_by IS NULL OR answered_by IS DISTINCT FROM requested_by),
  CHECK (status <> 'answered' OR (verdict IS NOT NULL AND answered_by IS NOT NULL AND length(btrim(response)) >= 10)),
  CHECK (status <> 'withdrawn' OR length(btrim(withdrawn_reason)) >= 10)
);
CREATE INDEX validation_requests_open ON validation_requests (institution_id, status, due_on);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['desk_members','validation_requests']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I USING (institution_id = app_institution_id())
                    WITH CHECK (institution_id = app_institution_id())', t || '_scope', t);
  END LOOP;
END $$;

GRANT SELECT ON desk_members TO tigeris_app;
GRANT SELECT, INSERT ON validation_requests TO tigeris_app;
GRANT UPDATE (status, verdict, response, assumptions, answered_by, answered_at, withdrawn_reason)
  ON validation_requests TO tigeris_app;

-- Overdue validation requests are raised by the intervention engine.
ALTER TABLE watch_rules DROP CONSTRAINT watch_rules_kind_check;
ALTER TABLE watch_rules ADD CONSTRAINT watch_rules_kind_check
  CHECK (kind IN ('semantic','signal_untriaged','connector_stale','decision_drift','decision_monitor','validation_overdue'));
