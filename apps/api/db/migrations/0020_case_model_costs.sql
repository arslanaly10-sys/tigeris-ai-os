-- TIGERIS AI OS — schema v20 (Phase 5I follow-up, D-124): model cost per case and decision.
-- Case analysis may now draft through Claude under the same gateway rules as Ask TIGERIS (grounded, budgeted, off
-- until configured), so agent runs may record an external model, and every model call names the case it served.
ALTER TABLE agent_runs DROP CONSTRAINT agent_runs_external_check;
ALTER TABLE model_usage ADD COLUMN case_id uuid REFERENCES cases(id);
CREATE INDEX model_usage_case ON model_usage (institution_id, case_id, created_at);
