-- TIGERIS AI OS — schema v19 (Phase 5I): AI economics. Every external model call, and every time one was skipped
-- (budget reached, call failed, draft failed grounding), is recorded with its tokens and cost (D-113). Append-only.

CREATE TABLE model_usage (
  id             uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id),
  feature        text NOT NULL,
  model          text NOT NULL,
  outcome        text NOT NULL CHECK (outcome IN ('used','fallback_budget','fallback_error','fallback_grounding')),
  input_tokens   integer NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens  integer NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  cost_usd       numeric NOT NULL DEFAULT 0 CHECK (cost_usd >= 0),
  principal_id   uuid REFERENCES principals(id),
  detail         text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);
CREATE INDEX model_usage_month ON model_usage (institution_id, created_at DESC);

ALTER TABLE model_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_usage FORCE ROW LEVEL SECURITY;
CREATE POLICY model_usage_scope ON model_usage USING (institution_id = app_institution_id())
  WITH CHECK (institution_id = app_institution_id());
GRANT SELECT, INSERT ON model_usage TO tigeris_app;
