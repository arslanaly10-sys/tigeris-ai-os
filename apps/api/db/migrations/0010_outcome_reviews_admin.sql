-- TIGERIS AI OS — schema v10 (slice H): expected-versus-observed outcome reviews, and role administration.
-- Outcome reviews are append-only; a later review of the same figure supersedes the earlier one on screen, and both
-- stay on the record. Role grants and revocations are made by the Governance Administrator and audited.

CREATE TABLE outcome_reviews (
  id                uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id    uuid NOT NULL REFERENCES institutions(id),
  key               text NOT NULL,
  memory_id         uuid NOT NULL REFERENCES memory_entries(id),
  case_id           uuid NOT NULL REFERENCES cases(id),
  figure_ref        text NOT NULL,
  figure_label      text NOT NULL,
  unit              text NOT NULL,
  expected_low      numeric NOT NULL,
  expected_central  numeric NOT NULL,
  expected_high     numeric NOT NULL,
  observed_value    numeric NOT NULL,
  observed_on       date NOT NULL,
  source            text NOT NULL CHECK (length(btrim(source)) >= 5),
  source_url        text CHECK (source_url IS NULL OR source_url ~ '^https://'),
  variance          numeric NOT NULL,
  variance_pct      numeric,
  within_range      boolean NOT NULL,
  verdict           text NOT NULL CHECK (verdict IN ('held','missed','not_comparable')),
  note              text NOT NULL CHECK (length(btrim(note)) >= 10),
  version           text NOT NULL,
  reviewer_id       uuid NOT NULL REFERENCES principals(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (institution_id, key)
);
CREATE INDEX outcome_reviews_memory_idx ON outcome_reviews (memory_id, figure_ref, created_at DESC);

ALTER TABLE outcome_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE outcome_reviews FORCE ROW LEVEL SECURITY;
CREATE POLICY outcome_reviews_scope ON outcome_reviews USING (institution_id = app_institution_id())
  WITH CHECK (institution_id = app_institution_id());

GRANT SELECT, INSERT ON outcome_reviews TO tigeris_app;
-- Role revocation by the Governance Administrator (audited in the API).
GRANT DELETE ON principal_roles TO tigeris_app;
