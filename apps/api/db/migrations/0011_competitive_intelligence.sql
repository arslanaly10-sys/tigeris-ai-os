-- TIGERIS AI OS — schema v11 (slice J): competitive intelligence. Kept apart from cases, portfolios and decisions:
-- no table here references a case, position or recommendation, and nothing here is cited by them (AC-15).
-- A domain is crawled only once approved; claims are the vendor's own words until a person verifies them (D-55).

CREATE TABLE ci_domains (
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id   uuid NOT NULL REFERENCES institutions(id),
  key              text NOT NULL,
  vendor           text NOT NULL,
  host             text NOT NULL CHECK (host ~ '^[a-z0-9.-]+\.[a-z]{2,}$'),
  path_prefix      text NOT NULL DEFAULT '/' CHECK (path_prefix ~ '^/'),
  category         text NOT NULL,
  status           text NOT NULL CHECK (status IN ('pending_approval','approved','paused')),
  approval_basis   text,
  approved_by      uuid REFERENCES principals(id),
  approved_at      timestamptz,
  last_crawl_at    timestamptz,
  last_success_at  timestamptz,
  last_error       text,
  created_by       uuid REFERENCES principals(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (institution_id, key),
  UNIQUE (institution_id, host, path_prefix)
);

CREATE TABLE ci_crawl_runs (
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id   uuid NOT NULL REFERENCES institutions(id),
  key              text NOT NULL,
  domain_id        uuid NOT NULL REFERENCES ci_domains(id),
  trigger          text NOT NULL CHECK (trigger IN ('manual','schedule')),
  status           text NOT NULL CHECK (status IN ('running','succeeded','partial','failed','blocked')),
  rules_version    text NOT NULL,
  robots_status    text,
  pages_seen       integer NOT NULL DEFAULT 0,
  pages_fetched    integer NOT NULL DEFAULT 0,
  pages_changed    integer NOT NULL DEFAULT 0,
  pages_skipped    integer NOT NULL DEFAULT 0,
  claims_proposed  integer NOT NULL DEFAULT 0,
  error            text,
  log              jsonb NOT NULL DEFAULT '[]',
  started_by       uuid REFERENCES principals(id),
  started_at       timestamptz NOT NULL DEFAULT now(),
  finished_at      timestamptz,
  PRIMARY KEY (id),
  UNIQUE (institution_id, key)
);

CREATE TABLE ci_pages (
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id   uuid NOT NULL REFERENCES institutions(id),
  domain_id        uuid NOT NULL REFERENCES ci_domains(id),
  url              text NOT NULL CHECK (url ~ '^https://'),
  first_seen_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (institution_id, url)
);

CREATE TABLE ci_page_versions (
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id   uuid NOT NULL REFERENCES institutions(id),
  page_id          uuid NOT NULL REFERENCES ci_pages(id),
  run_id           uuid NOT NULL REFERENCES ci_crawl_runs(id),
  version          integer NOT NULL CHECK (version > 0),
  canonical_url    text,
  title            text NOT NULL,
  published_at     timestamptz,
  retrieved_at     timestamptz NOT NULL,
  content_hash     text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  text             text NOT NULL,
  PRIMARY KEY (id),
  UNIQUE (page_id, version)
);

CREATE TABLE ci_claims (
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id   uuid NOT NULL REFERENCES institutions(id),
  key              text NOT NULL,
  domain_id        uuid NOT NULL REFERENCES ci_domains(id),
  page_version_id  uuid NOT NULL REFERENCES ci_page_versions(id),
  kind             text NOT NULL CHECK (kind IN ('capability','scale','customer','security','positioning')),
  passage          text NOT NULL,
  rule             text NOT NULL,
  status           text NOT NULL DEFAULT 'candidate' CHECK (status IN ('candidate','accepted','rejected')),
  verification     text NOT NULL DEFAULT 'vendor_published' CHECK (verification IN ('vendor_published','verified')),
  paraphrase       text,
  curation_note    text,
  curated_by       uuid REFERENCES principals(id),
  curated_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (institution_id, key)
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ci_domains','ci_crawl_runs','ci_pages','ci_page_versions','ci_claims']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I USING (institution_id = app_institution_id())
                    WITH CHECK (institution_id = app_institution_id())', t || '_scope', t);
  END LOOP;
END $$;

GRANT SELECT, INSERT ON ci_domains, ci_crawl_runs, ci_pages, ci_page_versions, ci_claims TO tigeris_app;
GRANT UPDATE (status, approval_basis, approved_by, approved_at, last_crawl_at, last_success_at, last_error)
  ON ci_domains TO tigeris_app;
GRANT UPDATE (status, robots_status, pages_seen, pages_fetched, pages_changed, pages_skipped, claims_proposed,
              error, log, finished_at)
  ON ci_crawl_runs TO tigeris_app;
GRANT UPDATE (status, verification, paraphrase, curation_note, curated_by, curated_at) ON ci_claims TO tigeris_app;
