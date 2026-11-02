# TIGERIS AI OS — completion report (platform brief A–K and Phase 5)

Date: 2 November 2026. Branch: `main`. This report states what is built, how to run and configure it, what was
verified, and what is not done. Requirement IDs refer to `docs/prd.md`; decisions to `docs/decisions.md` (D-01..D-126).

## 1. What the platform does

A case-first sovereign intelligence and decision workspace for one fictional institution, "Gulf Sovereign Investment
Authority (Demo)", built around a Strait of Hormuz disruption and an oil-price shock. Every number has a source record,
a versioned calculation or a labelled assumption; every status is words plus an icon; nothing is called live; no code
path executes an external action; models draft prose from cited records only and code computes every quantity.

The flagship journey runs end to end in the browser and is covered by tests: a public signal becomes a case; affected
routes, assets and holdings are traced; a deterministic scenario models impacts with ranges and visible assumptions;
options are ranked and checked against codified mandate rules and delegated limits; a recommendation passes mandatory
expert review and a policy-checked decision; it is handed to operations; its outcome is compared with what was
expected; and a miss proposes better assumptions for a domain expert to approve.

## 2. Built, by slice

| Slice | Delivered                                                                                                                                                                                                          | Decision     |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ |
| A–K   | PRD, canonical model and read scope, connectors and ingestion, entity explorer, case analysis, sensitivity and dissent, outcome review, audit and administration, reports, competitive intelligence, sector models | D-69..D-102  |
| 5A    | Semantic registry: system and institution definitions, codified rules with live evaluation and lineage, JSON-LD export                                                                                             | D-115        |
| 5B    | Intervention engine and inbox: versioned watch rules, sweep, routing by role within read scope, human closure                                                                                                      | D-116        |
| 5C    | Decision guardrails enforced by `decision-policy 1.2.0`; post-decision drift monitoring                                                                                                                            | D-117        |
| 5D    | Learning loop: missed outcomes propose assumption versions; domain-expert approval; calibration counts                                                                                                             | D-118        |
| 5E    | Validation tasking to five asset-class desks under the Investment Committee; roll-up by counts, never averages                                                                                                     | D-119        |
| 5F    | Oil-price-shock template on the portfolio; declarative templates; scenario room for up to four runs                                                                                                                | D-120        |
| 5G    | Ask TIGERIS with quoted citations; Teams and email alert channels, off until configured                                                                                                                            | D-121        |
| 5H    | OIDC sign-in (Entra ID), S3-compatible evidence store, backups with a restore test, readiness, packaging                                                                                                           | D-122        |
| 5I    | Claude through the gateway (Ask TIGERIS and case analysis), budget hard stop, cost per call, case and decision                                                                                                     | D-123, D-124 |
| Pilot | Security review fixes; data retention for two operational data classes, set and run by an administrator; load test                                                                                                 | D-125, D-126 |

## 3. Where things are

- Database: 21 forward-only migrations in `apps/api/db/migrations`. Every institutional table has `institution_id`,
  forced row-level security and the non-owner `tigeris_app` role.
- API modules (`apps/api/src/modules`): auth (demo and OIDC), cases, signals, graph, sectors, scenarios, scenario room,
  analysis, governance, guardrails, oversight, retention, reports, connectors, portfolio, ci, command-centre, search, semantic,
  interventions, validation, learning, ask, notify, claude (model use), gateway.
- Shared, unit-tested logic (`packages/shared/src`): vocabulary, lifecycle, scenario engine and sensitivity, options
  ranker, decision policy, read scope, connectors, dependencies, analysis roster, outcome review, service levels, sector
  models, semantic rules, intervention engine, learning loop, validation, oil shock.
- Screens: Sovereign Overview, Sector Command Centres, Intervention Inbox (inbox, validation, desk roll-up, watch rules
  and alert channels), Signals, Cases and the case workspace, AI Command (Ask TIGERIS, model use and budget), Foresight &
  Scenarios (Hormuz runs, oil price shock, scenario room), Mandates & Authority (register, codified rules, definitions,
  guardrails, export), Decisions & Approvals, Governed Execution, Institutional Memory (decisions and learning), Data &
  Integrations, Competitive Intelligence, Audit & Administration (audit log, access, data retention).
- Deployment: `deploy/Dockerfile`, `deploy/compose.yml`, `deploy/helm/tigeris`; `scripts/db-setup.sh`,
  `scripts/backup.sh`, `scripts/restore-test.sh`, `scripts/load-test.mjs`. Project skill: `.claude/skills/hallmark` (vendored, MIT).

## 4. How to run it

```bash
pnpm install
pnpm db:reset    # roles, database, migrations 0001–0021, seed (local PostgreSQL 16)
pnpm dev         # API :4000, web :5173
pnpm lint && pnpm typecheck && pnpm test
pnpm test:e2e    # Playwright, desktop and mobile, axe WCAG 2.2 AA on every screen visited
```

Deployment: copy `.env.example` to `deploy/.env` with real values, then
`docker compose -f deploy/compose.yml --env-file deploy/.env up -d`. On every start it creates the roles and database
if missing (never dropping anything) and applies new migrations. Backups: `scripts/backup.sh`, then
`scripts/restore-test.sh <file>` to prove the backup restores.

## 5. Verification at this commit

- Unit and API: shared 96, web 3, API 208 tests pass; lint and type checks are clean.
- Browser: see the latest full run recorded in section 8; each Phase 5 slice also passed its own full run when it
  landed (97 to 113 passed, the rest skipped by design: journeys that change data run once, on desktop).
- Packaging, in a container runtime: the API image builds, runs as non-root and serves `/api/ready` and data; the
  compose path (role setup, 20 migrations, API, restart keeps data) runs; the Helm chart lints and renders; the web build
  stage runs in a container.
- Sign-in: discovery and the PKCE redirect were exercised against a real Entra tenant; the ID-token verifier is
  unit-tested against forged, expired, replayed and wrong-audience tokens.
- Evidence store: the request signer reproduces the AWS SigV4 test vector.
- Load: 100 concurrent users looping without pause, 17,600 requests, no server errors, p95 under 0.6 s on one
  API process; see `docs/load-test.md` for the setup and what was not measured.
- Claude: the live Messages API accepted the request shape up to authentication; replies, fallbacks and budget
  behaviour are tested with a stand-in.

## 6. Configuration (`.env.example`)

| Area     | Settings                                                                                                                 | Default             |
| -------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------- |
| Database | `DATABASE_OWNER_URL` (migrations only), `DATABASE_APP_URL` (the API, non-owner role)                                     | local               |
| Sessions | `SESSION_SECRET`                                                                                                         | dev value; replace  |
| Sign-in  | `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_REDIRECT_URI`, `OIDC_INSTITUTION_KEY`                       | off                 |
| Evidence | `EVIDENCE_S3_ENDPOINT`, `_BUCKET`, `_REGION`, `_ACCESS_KEY_ID`, `_SECRET_ACCESS_KEY`; else `UPLOAD_DIR`                  | local disk          |
| Alerts   | `TEAMS_WEBHOOK_URL`; `EMAIL_RELAY_URL`, `EMAIL_RELAY_TOKEN`, `EMAIL_TO`; `APP_BASE_URL`                                  | off                 |
| Claude   | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `ANTHROPIC_PRICE_INPUT_PER_MTOK`, `_OUTPUT_PER_MTOK`, `MODEL_MONTHLY_BUDGET_USD` | off                 |
| Runtime  | `API_HOST`, `API_PORT`, `JOBS_ENABLED`                                                                                   | 127.0.0.1, 4000, on |

Credentials are never stored in the database or the code: connectors name an environment variable, and the chart reads
every setting from an existing Secret.

## 7. Limitations and what is not done

- **No live data.** Every source is a dated snapshot, a synthetic fixture or an import. Real crawls and the EIA feed are
  refused by this environment's network policy until the hosts are allowed.
- **Synthetic configuration.** Mandate limits, codified rules, watch rules, desk membership, oil sensitivities and service
  levels are synthetic and owner-approved for the demonstration only; replace them before any real use.
- **Owner actions to switch features on:** an Entra app registration (client ID, secret, redirect); an Anthropic key with
  your agreement's prices and a monthly budget; an S3 endpoint for evidence; Teams or mail relay addresses for alerts.
- **Not verified here:** the nginx web image (Docker Hub rate limit), a live S3 upload, and a real Claude reply.
- **Not built:** case and source change views (FR-37), full model configuration (FR-44, partial), early-warning indicators
  on live feeds (FR-36, partial), federated database reads, metrics and tracing, external security testing (penetration test), scheduled
  retention purges, load at production data volumes, MapLibre and React Flow upgrades. Scenario option drafts stay on the deterministic stub.
- **Arabic** covers titles, tabs and buttons as an owner-approved draft; much explanatory text on newer screens is English.
- **No certification claims.** Nothing is described as compliant, certified, air-gapped, tamper-proof or production-secure.
  The audit chain is tamper-evident (verification detects edits), not tamper-proof.

## 8. Latest full browser run

2 November 2026, after the security review fixes: 112 passed, 15 skipped by design, 1 timed out. The timeout was
the Phase 5A rule-approval journey (two people sign in and act in turn) at 31.1 s against a 30 s limit, with every
assertion holding. It now has the longer limit other long journeys use and passes on its own in 25.5 s. The
administration journey, now including data retention, passes on desktop and mobile with accessibility checks.
