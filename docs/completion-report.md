# TIGERIS AI OS — completion report for the platform brief (slices A–K)

Date: 30 October 2026. Branch: `main`. This report states what was built against the owner's brief (sections 1–15),
how to run it, how it is configured, and what is not done. Requirement IDs refer to `docs/prd.md`; decisions to
`docs/decisions.md` (D-01..D-97).

## 1. What the platform does

A case-first sovereign intelligence and decision workspace for one fictional institution, "Gulf Sovereign Investment
Authority (Demo)", built around a Strait of Hormuz disruption. Every number has a source record, a versioned
calculation or a labelled assumption; every status is words plus an icon; nothing is called live; no code path
executes an external action.

The flagship journey runs end to end in the browser and is covered by tests:

1. A public signal is triaged into a case (Signals & Early Warning).
2. Affected routes, assets, sectors and holdings are traced on the Gulf map, the impact graph and the entity
   explorer (what an entity relies on, what is exposed if it is disrupted).
3. A deterministic scenario models impacts with every assumption visible, a range, and a sensitivity table.
4. Options are ranked by a published rule and checked against mandates and synthetic delegated limits.
5. A recommendation passes mandatory expert review; reviewers can record disagreement; a named authority decides
   under `decision-policy 1.1.0` (two-person where required, limits, acknowledged dissent).
6. The decision is handed to operations, its outcome and lesson are kept as institutional memory, and the
   expected figures are later compared with what was observed.

## 2. Built, by slice

| Slice | Delivered                                                                                                                                                                                      | Commit      |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| A     | PRD with FR/TR/AC IDs and statuses, architecture note, implementation plan                                                                                                                     | `874ebb5`   |
| B     | Server-side read scope (clearance by classification, sector workspaces; out-of-scope answers 404), canonical positions, managers and due diligence with provenance, synthetic delegated limits | `89356de`   |
| C/D   | Connector registry (read-only, credentials by reference), file/document/REST/RSS adapters, CSV/XLSX/JSON/PDF/DOCX import with row-level issues, pg-boss jobs, data-quality view                | `624cce7`   |
| E     | Entity and dependency explorer, sector "records in this workspace"                                                                                                                             | `be4ff25`   |
| F/G   | Agentic case analysis (eight read-only agents on the deterministic stub, gaps stated), model-provider boundary (off), scenario sensitivity, reviewer notes and recorded disagreement           | `2dd8123`   |
| H     | Expected-versus-observed outcome review, audit log viewer with chain verification, role and workspace administration with separation of duties                                                 | `0f45387`   |
| I     | Governance case report (print view and content-hashed JSON evidence pack, audited exports), overdue actions on the Sovereign Overview, drafted Arabic for new screens                          | `c752068`   |
| J     | Competitive intelligence: domain registry with approval, polite crawler, page versions and change feed, curated vendor claims, CI report                                                       | `7ad0158`   |
| K     | Sector datasets for the six sectors without data and versioned sector models with lineage                                                                                                      | this commit |

Earlier phases (P1–P4, the Sovereign Light design system, motion pass and audits) are described in `docs/decisions.md`.

## 3. Where things are

- Database: 12 forward-only migrations in `apps/api/db/migrations` (0001 foundation … 0012 sector records). Every
  institutional table has `institution_id`, forced row-level security and the non-owner `tigeris_app` role.
- API modules (`apps/api/src/modules`): auth, cases, signals, graph (entities), sectors, scenarios, analysis, governance,
  oversight (outcomes, audit, administration), reports, connectors, portfolio, ci, command-centre, search, gateway.
- Crawler: `apps/api/src/ci/crawl-lib.ts` (pure rules) and `crawler.ts` (network). Connectors: `apps/api/src/connectors`.
- Shared, unit-tested logic (`packages/shared/src`): vocabulary, case lifecycle, scenario engine and sensitivity, options
  ranker, decision policy, read scope, connectors and validation, dependency reading, analysis roster, outcome review,
  service levels, sector models.
- Screens (`apps/web/src/pages`): Sovereign Overview, Sector Command Centres, Signals, Cases and case workspace (overview,
  evidence, impact graph, timeline, scenarios, options, analysis, decision and memory), case report, Intelligence Graph
  and entity explorer, AI Command, Foresight & Scenarios, Mandates, Decisions & Approvals, Governed Execution,
  Institutional Memory and outcome review, Data & Integrations, Competitive Intelligence, Audit & Administration.

## 4. How to run it

```bash
pnpm install
pnpm db:reset    # roles, database, migrations 0001–0012, seed (local PostgreSQL 16)
pnpm dev         # API :4000 (with NODE_USE_ENV_PROXY=1), web :5173
pnpm lint && pnpm typecheck && pnpm test
pnpm test:e2e    # Playwright, desktop and mobile, axe WCAG 2.2 AA on every screen visited
```

Tests need a freshly reset database. At this commit: shared 69, web 3 and API 145 tests pass; the browser suite passes 91
and skips 11 by design (journeys that change data run once, on desktop), with axe accessibility checks throughout.

## 5. Configuration (`.env.example`)

| Variable                                  | Purpose                                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `DATABASE_OWNER_URL` / `DATABASE_APP_URL` | Owner role for migrations and seed only; the API always uses the non-owner `tigeris_app` role           |
| `SESSION_SECRET`                          | Signs the demonstration session cookie; replace outside local development                               |
| `DEMO_INSTITUTION_KEY`                    | Seeded demonstration institution                                                                        |
| `UPLOAD_DIR`                              | Where uploaded files are stored, named by SHA-256                                                       |
| `JOBS_ENABLED`                            | pg-boss background jobs (scheduled syncs, queued crawls)                                                |
| `MODEL_PROVIDER_URL`                      | Optional model provider; shown as configured and never called while external model calls are off (D-14) |

Connector credentials are never stored: a connector names an environment variable (`auth_ref`). The API start scripts
set `NODE_USE_ENV_PROXY=1` so outbound requests use the environment's proxy (D-94).

## 6. Limitations and what is not done

Stated plainly, so nothing here is mistaken for a claim:

- **Competitive-intelligence crawling is blocked.** The environment's network policy refuses `www.palantir.com`,
  `www.blackrock.com`, `www.alternativesoft.com`, `www.dasseti.com` and `www.v7labs.com`. Real crawl attempts are
  recorded as "blocked" with the proxy's error and no vendor is shown as collected. Allowing those hosts in the
  environment's network settings is all that is needed; nothing about vendors has been collected or invented.
- **No live data.** Every source is a dated snapshot, a synthetic fixture or an import. The seeded EIA feed connector
  stays "configured" until its source is approved and a fetch succeeds. Public figures from secondary summaries are
  marked unverified until the primary page is captured.
- **Identity is a demonstration directory.** Production sign-in through the institution's identity provider (FR-02)
  is an adapter boundary, not built. People can be provisioned and given roles, but they cannot sign in until an
  identity provider is connected.
- **Models.** Prose is drafted only by the internal deterministic stub; external model calls are disabled by policy
  and by a database constraint. Agent "analysis" is deterministic retrieval and templated drafting, not a language
  model.
- **One scenario template.** The engine models a Hormuz disruption only; other sector scenarios are listed as "not yet
  modelled". The six sector datasets and models compute indicators from imported records; they are not scenario
  engines and no sector data is seeded.
- **Arabic** covers interface titles, tabs and buttons on new screens as a draft pending terminology review;
  explanatory text and several older case tabs remain English; English text inside the RTL layout shows its full stop
  on the left.
- **Not built:** early-warning indicator rules (FR-36), case and source change views (FR-37, partial), a full model
  configuration screen (FR-44, partial), MinIO evidence storage, MapLibre/deck.gl and React Flow upgrades beyond the
  current map and graph, production deployment, backups and monitoring.
- **No certification claims.** Nothing here is described as compliant, certified, air-gapped, tamper-proof or
  production-secure. The audit chain is tamper-evident (verification detects edits); it is not tamper-proof.

## 7. Owner actions that unblock the next step

1. Allow the five vendor hosts in the environment's network access settings, then use "Crawl now" in Competitive
   Intelligence.
2. Approve the EIA feed source in Data & Sources to let the public-feed connector fetch (subject to network access).
3. Provide or approve sector data files (or labelled samples) for the sectors you want populated.
4. Review the drafted Arabic terminology and the synthetic delegated limits and service levels.
5. Choose the production identity provider and model provider before any deployment beyond demonstration.
