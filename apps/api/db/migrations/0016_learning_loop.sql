-- TIGERIS AI OS — schema v16 (Phase 5D): learning loop. A missed outcome review proposes a new version of each
-- assumption the missed figure depends on; a domain expert approves or rejects it. Approval adds a new assumption
-- version (every version is kept); nothing changes without that approval (D-108).

CREATE TABLE assumption_proposals (
  id                uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id    uuid NOT NULL REFERENCES institutions(id),
  key               text NOT NULL CHECK (key ~ '^AP-[0-9]{8}-[0-9]{2,4}$'),
  assumption_key    text NOT NULL,
  base_version      integer NOT NULL CHECK (base_version > 0),
  outcome_review_id uuid NOT NULL REFERENCES outcome_reviews(id),
  method_version    text NOT NULL,
  low               numeric NOT NULL,
  central           numeric NOT NULL,
  high              numeric NOT NULL,
  basis             text NOT NULL,
  status            text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved','rejected')),
  proposed_for      uuid REFERENCES principals(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  decided_by        uuid REFERENCES principals(id),
  decided_at        timestamptz,
  decision_note     text,
  new_version       integer,
  PRIMARY KEY (id),
  UNIQUE (institution_id, key),
  UNIQUE (institution_id, assumption_key, outcome_review_id),
  CHECK (low <= central AND central <= high),
  -- The person whose outcome review raised the proposal never decides it.
  CHECK (decided_by IS NULL OR decided_by IS DISTINCT FROM proposed_for),
  CHECK (status = 'proposed' OR (decided_by IS NOT NULL AND length(btrim(decision_note)) >= 10))
);

ALTER TABLE assumption_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE assumption_proposals FORCE ROW LEVEL SECURITY;
CREATE POLICY assumption_proposals_scope ON assumption_proposals USING (institution_id = app_institution_id())
  WITH CHECK (institution_id = app_institution_id());
GRANT SELECT, INSERT ON assumption_proposals TO tigeris_app;
GRANT UPDATE (status, decided_by, decided_at, decision_note, new_version) ON assumption_proposals TO tigeris_app;

-- Approving a proposal appends a new assumption version; existing versions are never updated or deleted.
GRANT INSERT ON assumptions TO tigeris_app;
