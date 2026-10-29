-- TIGERIS AI OS — schema v3: mandate register and authority matrix (read-only in the MVP UI).
-- Phase 4 policy-as-code evaluates against these rules; until then they document who may decide what.

CREATE TABLE mandates (
  id             uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id),
  key            text NOT NULL,
  title          text NOT NULL,
  description    text NOT NULL,
  category       text NOT NULL,
  limit_text     text NOT NULL,
  owner_role     text NOT NULL CHECK (owner_role IN
                   ('executive','analyst','domain_expert','approver','operations_owner','administrator','auditor')),
  claim_class    text NOT NULL CHECK (claim_class IN ('observed','sourced','inferred','assumed','synthetic','illustrative')),
  PRIMARY KEY (id),
  UNIQUE (institution_id, key)
);

CREATE TABLE authority_rules (
  id                     uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id         uuid NOT NULL REFERENCES institutions(id),
  action_class           text NOT NULL,
  description            text NOT NULL,
  required_role          text NOT NULL CHECK (required_role IN
                           ('executive','analyst','domain_expert','approver','operations_owner','administrator','auditor')),
  threshold_text         text NOT NULL,
  -- D-20: expert review is mandatory and self-approval is always blocked. Enforced by CHECKs, not by data.
  requires_expert_review boolean NOT NULL DEFAULT true CHECK (requires_expert_review),
  two_person             boolean NOT NULL DEFAULT false,
  self_approval_blocked  boolean NOT NULL DEFAULT true CHECK (self_approval_blocked),
  claim_class            text NOT NULL CHECK (claim_class IN ('observed','sourced','inferred','assumed','synthetic','illustrative')),
  sort_order             integer NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE (institution_id, action_class)
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['mandates','authority_rules']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I USING (institution_id = app_institution_id())
                    WITH CHECK (institution_id = app_institution_id())', t || '_scope', t);
  END LOOP;
END $$;

-- Read-only for the application: changes go through governed administration (Phase 4).
GRANT SELECT ON mandates, authority_rules TO tigeris_app;
