-- TIGERIS AI OS — schema v15 (Phase 5C): decision guardrails and post-decision monitoring.
-- A guardrail is a standing rule recorded from an approved decision. The decision policy enforces every active
-- guardrail on later approvals of the same action class: it blocks them, or requires a named role, optionally only
-- above a size threshold. Guardrail content is immutable; it is lifted (with a reason), never edited.

CREATE TABLE guardrails (
  id                uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id    uuid NOT NULL REFERENCES institutions(id),
  key               text NOT NULL CHECK (key ~ '^GR-[0-9]{8}-[0-9]{2}$'),
  decision_id       uuid NOT NULL REFERENCES decisions(id),
  case_id           uuid NOT NULL REFERENCES cases(id),
  action_class      text NOT NULL,
  effect            text NOT NULL CHECK (effect IN ('block','require_role')),
  required_role     text CHECK (required_role IN
                      ('executive','analyst','domain_expert','approver','operations_owner','administrator','auditor')),
  threshold_value   numeric CHECK (threshold_value IS NULL OR threshold_value >= 0),
  threshold_unit    text,
  statement         text NOT NULL CHECK (length(btrim(statement)) >= 10),
  expires_on        date,
  status            text NOT NULL DEFAULT 'active' CHECK (status IN ('active','lifted')),
  created_by        uuid NOT NULL REFERENCES principals(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  lifted_by         uuid REFERENCES principals(id),
  lifted_at         timestamptz,
  lift_reason       text,
  PRIMARY KEY (id),
  UNIQUE (institution_id, key),
  CHECK ((effect = 'require_role') = (required_role IS NOT NULL)),
  CHECK ((threshold_value IS NULL) = (threshold_unit IS NULL)),
  CHECK (status = 'active' OR (lifted_by IS NOT NULL AND length(btrim(lift_reason)) >= 10))
);
CREATE INDEX guardrails_active ON guardrails (institution_id, action_class) WHERE status = 'active';

ALTER TABLE guardrails ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardrails FORCE ROW LEVEL SECURITY;
CREATE POLICY guardrails_scope ON guardrails USING (institution_id = app_institution_id())
  WITH CHECK (institution_id = app_institution_id());
GRANT SELECT, INSERT ON guardrails TO tigeris_app;
GRANT UPDATE (status, lifted_by, lifted_at, lift_reason) ON guardrails TO tigeris_app;

-- Post-decision monitoring is a new watch-rule kind.
ALTER TABLE watch_rules DROP CONSTRAINT watch_rules_kind_check;
ALTER TABLE watch_rules ADD CONSTRAINT watch_rules_kind_check
  CHECK (kind IN ('semantic','signal_untriaged','connector_stale','decision_drift','decision_monitor'));
