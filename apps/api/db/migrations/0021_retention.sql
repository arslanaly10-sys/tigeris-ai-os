-- TIGERIS AI OS — schema v21 (pilot readiness): data retention (D-126). An administrator sets how long two kinds of
-- operational data are kept; nothing else can be purged. Cases, evidence, sources, decisions, recommendations, memory,
-- the audit chain, model costs and connector runs are never in scope: numbers and decisions cite them.
--   import_row_issues     raw rejected/warned import rows (they can hold client data); the run keeps its counts
--   closed_interventions  interventions resolved or dismissed; the audit chain keeps their closure
-- Purging is a named human action through retention_purge(), which deletes only within the caller's institution.

CREATE TABLE retention_policies (
  id             uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id),
  data_class     text NOT NULL CHECK (data_class IN ('import_row_issues','closed_interventions')),
  keep_days      integer NOT NULL CHECK (keep_days BETWEEN 30 AND 3650),
  reason         text NOT NULL CHECK (length(btrim(reason)) >= 10),
  set_by         uuid NOT NULL REFERENCES principals(id),
  set_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (institution_id, data_class)
);

ALTER TABLE retention_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE retention_policies FORCE ROW LEVEL SECURITY;
CREATE POLICY retention_policies_scope ON retention_policies USING (institution_id = app_institution_id())
  WITH CHECK (institution_id = app_institution_id());
GRANT SELECT, INSERT ON retention_policies TO tigeris_app;
GRANT UPDATE (keep_days, reason, set_by, set_at) ON retention_policies TO tigeris_app;

-- The app role gets no DELETE on these tables; this function is the only way to purge, and only by a stored policy.
CREATE FUNCTION retention_purge(p_class text) RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  inst uuid := app_institution_id();
  days integer;
  n integer;
BEGIN
  IF inst IS NULL THEN RAISE EXCEPTION 'no institution scope'; END IF;
  SELECT keep_days INTO days FROM retention_policies WHERE institution_id = inst AND data_class = p_class;
  IF days IS NULL THEN RETURN 0; END IF;
  IF p_class = 'import_row_issues' THEN
    DELETE FROM row_issues ri USING connector_runs cr
     WHERE ri.institution_id = inst AND cr.institution_id = inst AND ri.run_id = cr.id
       AND cr.finished_at < now() - make_interval(days => days);
  ELSIF p_class = 'closed_interventions' THEN
    DELETE FROM interventions
     WHERE institution_id = inst AND status IN ('resolved','dismissed')
       AND closed_at < now() - make_interval(days => days);
  ELSE
    RAISE EXCEPTION 'unknown data class %', p_class;
  END IF;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION retention_purge(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention_purge(text) TO tigeris_app;
