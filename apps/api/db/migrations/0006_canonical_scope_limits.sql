-- TIGERIS AI OS — schema v6 (slice B): canonical model gaps, read scope, delegated limits.
--   * Sector workspace on cases and per-person workspace assignment (read scope, TR-050).
--   * Delegated numeric approval limits per role and action class (D-52), synthetic in the demonstration.
--   * The size of each draft option, so a decision can be checked against a limit.
--   * Portfolio positions, managers and due-diligence records with full provenance (FR-12).

ALTER TABLE cases ADD COLUMN sector_key text CHECK (sector_key IN
  ('energy','utilities','capital','supply_chain','banking','manufacturing','real_estate','insurance'));

-- No rows means every workspace. Rows limit the person to those workspaces.
CREATE TABLE principal_workspaces (
  institution_id uuid NOT NULL REFERENCES institutions(id),
  principal_id   uuid NOT NULL REFERENCES principals(id),
  sector_key     text NOT NULL CHECK (sector_key IN
                   ('energy','utilities','capital','supply_chain','banking','manufacturing','real_estate','insurance')),
  granted_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (principal_id, sector_key)
);

CREATE TABLE authority_limits (
  id             uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id),
  action_class   text NOT NULL,
  role           text NOT NULL CHECK (role IN
                   ('executive','analyst','domain_expert','approver','operations_owner','administrator','auditor')),
  limit_value    numeric NOT NULL CHECK (limit_value >= 0),
  limit_unit     text NOT NULL,
  basis          text NOT NULL,
  claim_class    text NOT NULL CHECK (claim_class IN ('observed','sourced','inferred','assumed','synthetic','illustrative')),
  PRIMARY KEY (id),
  UNIQUE (institution_id, action_class, role)
);

-- Draft options stay immutable; options drafted before this migration simply have no size.
ALTER TABLE draft_options ADD COLUMN magnitude jsonb;

-- ───────────────────────────── Canonical records with provenance ─────────────────────────────
-- Shared provenance columns: where the record came from, how, when, under what classification and quality.

CREATE TABLE positions (
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id   uuid NOT NULL REFERENCES institutions(id),
  key              text NOT NULL,
  portfolio_entity_id uuid REFERENCES entities(id),
  holding_entity_id   uuid REFERENCES entities(id),
  name             text NOT NULL,
  asset_class      text NOT NULL,
  sector_key       text CHECK (sector_key IN
                     ('energy','utilities','capital','supply_chain','banking','manufacturing','real_estate','insurance')),
  country          text,
  currency         text NOT NULL,
  market_value     numeric NOT NULL,
  nav_share_pct    numeric NOT NULL CHECK (nav_share_pct >= 0 AND nav_share_pct <= 100),
  route_dependent  boolean NOT NULL DEFAULT false,
  as_of            date NOT NULL,
  source_id        uuid NOT NULL REFERENCES sources(id),
  source_record_id text NOT NULL,
  record_mode      text NOT NULL CHECK (record_mode IN ('live','imported','synthetic','sample','manual')),
  classification   text NOT NULL CHECK (classification IN ('internal','restricted','confidential')),
  mapping_version  text NOT NULL,
  quality_status   text NOT NULL DEFAULT 'valid' CHECK (quality_status IN ('valid','warning','quarantined')),
  quality_notes    jsonb NOT NULL DEFAULT '[]',
  ingested_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (institution_id, key)
);

CREATE TABLE managers (
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id   uuid NOT NULL REFERENCES institutions(id),
  key              text NOT NULL,
  name             text NOT NULL,
  strategy         text NOT NULL,
  domicile         text,
  sector_key       text CHECK (sector_key IN
                     ('energy','utilities','capital','supply_chain','banking','manufacturing','real_estate','insurance')),
  source_id        uuid NOT NULL REFERENCES sources(id),
  source_record_id text NOT NULL,
  record_mode      text NOT NULL CHECK (record_mode IN ('live','imported','synthetic','sample','manual')),
  classification   text NOT NULL CHECK (classification IN ('internal','restricted','confidential')),
  mapping_version  text NOT NULL,
  quality_status   text NOT NULL DEFAULT 'valid' CHECK (quality_status IN ('valid','warning','quarantined')),
  ingested_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (institution_id, key)
);

CREATE TABLE dd_records (
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id   uuid NOT NULL REFERENCES institutions(id),
  key              text NOT NULL,
  manager_id       uuid NOT NULL REFERENCES managers(id),
  review_type      text NOT NULL,
  status           text NOT NULL CHECK (status IN ('not_started','in_progress','completed','escalated')),
  open_issues      integer NOT NULL DEFAULT 0 CHECK (open_issues >= 0),
  summary          text NOT NULL,
  reviewed_on      date,
  source_id        uuid NOT NULL REFERENCES sources(id),
  source_record_id text NOT NULL,
  record_mode      text NOT NULL CHECK (record_mode IN ('live','imported','synthetic','sample','manual')),
  classification   text NOT NULL CHECK (classification IN ('internal','restricted','confidential')),
  mapping_version  text NOT NULL,
  quality_status   text NOT NULL DEFAULT 'valid' CHECK (quality_status IN ('valid','warning','quarantined')),
  ingested_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (institution_id, key)
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['principal_workspaces','authority_limits','positions','managers','dd_records']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I USING (institution_id = app_institution_id())
                    WITH CHECK (institution_id = app_institution_id())', t || '_scope', t);
  END LOOP;
END $$;

GRANT SELECT ON authority_limits TO tigeris_app;
GRANT SELECT, INSERT, DELETE ON principal_workspaces TO tigeris_app;
-- Imported records are replaced by new imports, never edited in place (slice C adds the import path).
GRANT SELECT, INSERT ON positions, managers, dd_records TO tigeris_app;
