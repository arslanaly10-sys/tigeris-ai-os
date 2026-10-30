-- TIGERIS AI OS — schema v12 (slice K): sector records imported for the sector models. One table for the six sector
-- datasets; the dataset fixes the sector workspace. Records carry the same provenance as positions and are immutable:
-- a correction is a new record with a later as_of date.

CREATE TABLE sector_records (
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id   uuid NOT NULL REFERENCES institutions(id),
  dataset          text NOT NULL CHECK (dataset IN ('utility_assets','shipments','counterparty_exposures',
                                                    'supplier_tiers','project_milestones','insured_exposures')),
  key              text NOT NULL,
  sector_key       text NOT NULL CHECK (sector_key IN
                     ('energy','utilities','capital','supply_chain','banking','manufacturing','real_estate','insurance')),
  attributes       jsonb NOT NULL,
  as_of            date NOT NULL,
  source_id        uuid NOT NULL REFERENCES sources(id),
  source_record_id text NOT NULL,
  record_mode      text NOT NULL CHECK (record_mode IN ('live','imported','synthetic','sample','manual')),
  classification   text NOT NULL CHECK (classification IN ('internal','restricted','confidential')),
  mapping_version  text NOT NULL,
  quality_status   text NOT NULL DEFAULT 'valid' CHECK (quality_status IN ('valid','warning','quarantined')),
  connector_id     uuid REFERENCES connectors(id),
  run_id           uuid REFERENCES connector_runs(id),
  ingested_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (institution_id, dataset, key, as_of)
);
CREATE INDEX sector_records_sector_idx ON sector_records (institution_id, sector_key, dataset);

ALTER TABLE sector_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE sector_records FORCE ROW LEVEL SECURITY;
CREATE POLICY sector_records_scope ON sector_records USING (institution_id = app_institution_id())
  WITH CHECK (institution_id = app_institution_id());

GRANT SELECT, INSERT ON sector_records TO tigeris_app;
