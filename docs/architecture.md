# TIGERIS AI OS — Architecture

Status: 29 Oct 2026. Describes what is built, how the remaining platform fits on it, and why. Requirements are in
`docs/prd.md`, decisions in `docs/decisions.md`, the build order in `docs/implementation-plan.md`.

## 1. Stack (unchanged, and why)

| Layer        | Choice                                                                     | Why                                                                                     |
| ------------ | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Web          | React 19, Vite, TypeScript, Tailwind v4 tokens, Radix, TanStack Query      | Owned components, self-hosted assets (air-gap ready), lazy screens per route            |
| API          | Fastify 5 modular monolith (TypeScript), zod validation                    | One deployable, clear module seams; no microservices until load or ownership demands it |
| Data         | PostgreSQL 16, Drizzle ORM over postgres.js, plain numbered SQL migrations | One relational source of truth; row-level security; triggers for governance invariants  |
| Shared       | `packages/shared`: vocabulary, lifecycle, engines, policy, API types       | Pure deterministic code used by both the API (enforcement) and the web (preview)        |
| Jobs         | pg-boss (planned, D-58)                                                    | Background crawls and syncs without new infrastructure                                  |
| Files        | Local storage folder + Postgres metadata (planned, D-57); MinIO later      | Works on one machine and offline; S3-compatible storage is a configuration change       |
| Maps / graph | MapLibre + deck.gl with bundled Natural Earth; React Flow                  | No tile CDN; the graph is a relational model rendered on demand                         |

No graph database: entities and typed relationships live in Postgres (`entities`, `entity_relationships`,
`relationship_evidence`) and traversal is bounded by hop count. A separate graph store would be justified only by
traversal volumes the relational model cannot serve.

## 2. Isolation and authorization

- Every institutional table has `institution_id`, row-level security **forced**, and a policy
  `institution_id = app_institution_id()`. The API connects as `tigeris_app` (no owner rights, no BYPASSRLS) and sets
  `app.institution_id` per transaction (`withInstitution`). Migrations and seed use the owner connection only.
- Authorization happens on the server in each route: role checks from shared rule tables (`signal-triage`,
  `governance`), then state checks inside the locked transaction. The web shows the same rules as previews but never
  enforces them.
- Governance invariants are enforced a second time in the database (migration 0005): the author never reviews or
  decides, the reviewer never approves, a handoff only for a completed approval, memory only for a completed handoff,
  `executed_by_tigeris` can never be true. Append-only tables grant only SELECT/INSERT; mutable records grant UPDATE on
  status columns only.
- Every sensitive action appends to a hash-chained audit log (`audit_events`) inside the same transaction; if the
  audit write fails the action rolls back.
- Planned (slice B): workspace (sector) and classification scope on records, with role-by-classification read rules,
  and synthetic numeric limits on delegated authority (D-52).

Identity: demo sessions are signed cookies for seeded demo principals (`modules/auth/identity.ts` is the adapter
boundary). Production identity (OIDC/SAML through the institution's IdP, MFA at the IdP) plugs in behind the same
interface; it is **not implemented**.

## 3. Module map (API)

| Module           | Owns                                                                                         |
| ---------------- | -------------------------------------------------------------------------------------------- |
| `auth`           | Institution resolution, demo principals, sessions, context                                   |
| `command-centre` | Attention queue and pending approvals                                                        |
| `cases`          | Case list and detail, evidence, lineage, case-view audit                                     |
| `signals`        | Signal inbox and triage actions                                                              |
| `graph`          | Institution and case graphs, map layers                                                      |
| `sources`        | Source registry and freshness                                                                |
| `ingestion`      | Package ingestion, validation rules, quarantine (`src/ingestion`)                            |
| `sectors`        | Eight sector workspaces, evidence-bound KPIs, mandates and authority                         |
| `scenarios`      | Scenario setup, runs (deterministic engine), draft options, agent runs                       |
| `gateway`        | Model policy, versioned templates, grounding check (deterministic stub)                      |
| `governance`     | Recommendations, expert reviews, decisions (policy), handoffs, memory                        |
| planned          | `connectors`, `uploads`, `records`, `reports`, `admin`, `audit-log`, `agents`, `competitive` |

## 4. Canonical model

Stable UUID ids, human keys per institution (`HMZ-2024-0413`, `REC-…`), explicit foreign keys, timestamps and
provenance. Mapping of the brief's entities to tables:

| Brief entity                         | Table(s)                                                                | Status                                   |
| ------------------------------------ | ----------------------------------------------------------------------- | ---------------------------------------- |
| Institution                          | `institutions`, `divisions`                                             | Built                                    |
| User, role, permission               | `principals`, `principal_roles`; rule tables in shared                  | Built                                    |
| Sector workspace                     | `SECTORS` (shared) + `sector_key` on records                            | Built (config); record scoping planned   |
| Data source, connector               | `sources`; `connectors`, `connector_runs`                               | Sources built; connectors planned        |
| Source record, evidence item         | `evidence_objects`, `evidence_facts`; `source_records` for imports      | Evidence built; imported records planned |
| Country, region, jurisdiction        | `entities` (`region`, planned `jurisdiction`)                           | Partial                                  |
| Organization, counterparty           | `entities` (`organization`, `institution`, `holding`)                   | Partial                                  |
| Asset, critical service              | `entities` (`asset`, `terminal`, `port`, `service`)                     | Built                                    |
| Portfolio, holding, commitment       | `entities` (`portfolio`, `holding`) + planned `positions` with amounts  | Partial                                  |
| Manager, due-diligence record        | planned `managers`, `dd_records` (import target for Dasseti-style data) | Planned                                  |
| Mandate, policy, delegated authority | `mandates`, `authority_rules` (+ planned limits)                        | Built                                    |
| Event, signal, observation           | `signals`, `signal_events`, `movement_tracks`                           | Built                                    |
| Dependency, exposure                 | `entity_relationships` with class, confidence, evidence                 | Built                                    |
| Scenario, assumption                 | `scenario_runs`, `assumptions`                                          | Built                                    |
| Case, investigation                  | `cases`, `case_events`, `case_evidence`, `case_entities`                | Built                                    |
| Recommendation, response option      | `draft_options`, `recommendations`                                      | Built                                    |
| Decision, approval                   | `expert_reviews`, `decisions`                                           | Built                                    |
| Action task, owner                   | `handoffs`                                                              | Built                                    |
| Outcome, review                      | `handoffs.outcome_text`, `memory_entries`; planned `outcome_reviews`    | Partial                                  |
| Audit event                          | `audit_events` (hash chain)                                             | Built                                    |

Provenance fields every imported record will carry (FR-12): source system, source record id, owner, connector or
method, source timestamp, ingestion timestamp, licence notes, classification and access scope, transformation
(mapping version), freshness and quality status, and record mode (live, imported, synthetic, sample, manual).

Entity explorer (slice E): `GET /api/entities` and `GET /api/entities/:key` read the shared graph as dependencies.
`packages/shared/src/dependencies.ts` maps each predicate to which side relies on the other (`PREDICATE_READING`);
unknown predicates count as context, never as dependencies. The walk is directed, bounded at four steps and
cycle-safe. Positions held through an entity reuse `readPositions`, and linked cases reuse `caseReadable`, so the
explorer never widens anyone's read scope.

## 5. Connector framework (slices C/D)

```
Connector (registry row) ──▶ Adapter (code, by type) ──▶ Raw batch (hashed) ──▶ Validation rules ──▶ Normalized records
     status, schedule,          rest | webhook | sql |       stored with          versioned rule set,      in canonical tables,
     auth reference,            sftp | file | rss |           provenance           row-level issues,         institution + sector
     datasets, mapping v.       document                                           quarantine                 scoped
```

- An adapter implements `describe()`, `test()`, `fetch(cursor)` and returns raw items; mapping to canonical records is
  a separate, versioned mapping so a provider can change without touching validation or the rest of TIGERIS.
- Secrets are referenced, never stored in plaintext: `auth_ref` names an environment variable or secret-store key.
- Status moves `sample → configured → connected` only after a successful authenticated fetch; `failed` keeps the last
  error and retry time; `paused` and `retired` stop scheduling.
- Read-only first. Write-back needs a configured destination, server authorization, audit and human approval (PRD §9).

As built (D-69..D-75):

- Registry and runs: `connectors`, `connector_runs`, `row_issues`, `uploaded_files`, `documents` (migration 0007);
  canonical rows carry `connector_id` and `run_id`. Routes in `apps/api/src/modules/connectors.ts`; writes are
  administrator-only and audited.
- Adapters: `apps/api/src/connectors/adapters.ts` (`ADAPTERS` keyed by connection type). File and document uploads go
  through `parse.ts` (magic-byte sniffing, CSV/XLSX/JSON parsing, PDF/DOCX text) and `ingest.ts`; feeds through
  `sync.ts`. Field rules and mapping versions live in `packages/shared/src/connectors.ts` (`DATASET_FIELDS`,
  `validateRows`) so the import screen and the API agree.
- Jobs: `apps/api/src/jobs.ts` runs pg-boss queues `connector-sync` and `ci-crawl` on the schema created by migration 0008.
- Data quality: `GET /api/data-quality`, shown on Data & Sources → Data quality.

How to add a provider: add an adapter to `ADAPTERS` (implementing `test` and `fetch`), add or version a dataset mapping in
`packages/shared/src/connectors.ts`, register the connector in Data & Sources, approve its source, run Test, then
schedule. Portfolio systems, ERP, market data, document management, public data and sector operations systems all follow
the same path.

Sector datasets (slice K): six further tabular datasets (`packages/shared/src/sector-models.ts`) use the same
connector, validation and run machinery and land in `sector_records` (migration 0012) with full provenance; the
dataset fixes the sector workspace. `GET /api/sectors/:key` returns `models`: the latest version of each readable
record run through `sector-models 1.0.0`, two indicators per dataset, each with its method, input keys and the keys
that determine it.

## 6. AI and agents

- **Gateway** (`modules/gateway.ts`): approved-model policy, versioned templates, grounding check that rejects any
  number not present in a cited display string. Today only `tigeris-stub 1.0.0` (deterministic) is permitted (D-14).
- **Agents** (slice F, `modules/analysis.ts`): `POST /api/cases/:key/analysis` runs a fixed plan of eight read-only
  agents (roster in `packages/shared/src/analysis.ts`). Each reads the case's records through the same scope filters as
  the rest of the API, gathers citations and drafts through the gateway; a step without enough records drafts a stated
  gap. The run is stored in `analysis_runs` and each step as an `agent_runs` row with model, template, citations and
  grounding. Agents never write to a case. `/api/agent-runs` lists only runs on cases the reader may open.
- **Sensitivity** (slice G): `GET /api/scenarios/:key/sensitivity` recomputes a stored run one input at a time
  (`packages/shared/src/scenario-sensitivity.ts`); the red-team agent cites its top row.
- **Provider adapter**: `MODEL_PROVIDER_URL` names a local OpenAI-compatible endpoint or hosted provider.
  `GET /api/model-gateway` reports it as configured and switched off; nothing calls it until a decision entry lifts
  D-14 and a migration lifts `agent_runs CHECK (NOT external)`.

## 7. Competitive intelligence (planned, slice J)

Separate tables (`ci_domains`, `ci_crawls`, `ci_pages`, `ci_page_versions`, `ci_claims`) with no foreign keys into
institutional case, portfolio or decision tables. A polite crawler (robots.txt, sitemaps and RSS first, internal links,
per-domain rate limit) runs on pg-boss. A domain shows "collected" only after a successful crawl. In this cloud
environment the five domains are currently refused by the network policy, which the module reports as the real error.

## 8. Deployment

Local: Node 22, pnpm, PostgreSQL 16 (or `docker compose up -d postgres`). Production targets (private cloud,
on-premises, air-gapped) need: the IdP adapter, a secret store, TLS termination, backups, monitoring, and a security
review. None of these is claimed as done.
