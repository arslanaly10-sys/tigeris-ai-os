-- TIGERIS AI OS — schema v22 (D-127, slice L1): live data. A REST connector may name an observation format; each
-- sync then stores dated values per series. One row per connector, series and observation date: a re-fetch that
-- returns a revised value updates it and records which run fetched it, so every value resolves to a fetch.

ALTER TABLE connectors
  ADD COLUMN observation_format text CHECK (observation_format IN
    ('fred_csv','ecb_csv','worldbank_json','eia_v2','arcgis_features')),
  ADD COLUMN observation_options jsonb NOT NULL DEFAULT '{}';

CREATE TABLE observations (
  id             uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id),
  connector_id   uuid NOT NULL REFERENCES connectors(id),
  run_id         uuid NOT NULL REFERENCES connector_runs(id),
  series_key     text NOT NULL CHECK (length(series_key) BETWEEN 1 AND 200),
  observed_on    date NOT NULL,
  value          numeric NOT NULL,
  unit           text,
  fetched_at     timestamptz NOT NULL,
  revised        boolean NOT NULL DEFAULT false,
  PRIMARY KEY (id),
  UNIQUE (institution_id, connector_id, series_key, observed_on)
);
CREATE INDEX observations_latest ON observations (institution_id, series_key, observed_on DESC);

ALTER TABLE observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE observations FORCE ROW LEVEL SECURITY;
CREATE POLICY observations_scope ON observations USING (institution_id = app_institution_id())
  WITH CHECK (institution_id = app_institution_id());
GRANT SELECT, INSERT ON observations TO tigeris_app;
GRANT UPDATE (value, unit, run_id, fetched_at, revised) ON observations TO tigeris_app;
