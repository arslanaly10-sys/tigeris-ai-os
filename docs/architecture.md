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

## 5. Connector framework (planned, slice C)

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

How to add a provider: write an adapter (`apps/api/src/connectors/adapters/<type>.ts`), a mapping
(`mappings/<provider>.<dataset>.v1.ts`), register the connector in the UI, run `test`, then schedule. Portfolio
systems, ERP, market data, document management, public data and sector operations systems all follow the same path.

## 6. AI and agents

- **Gateway** (`modules/gateway.ts`): approved-model policy, versioned templates, grounding check that rejects any
  number not present in a cited display string. Today only `tigeris-stub 1.0.0` (deterministic) is permitted (D-14).
- **Agents** (planned, slice F): a planner and specialist agents (PRD FR-34) run as recorded `agent_runs` with model,
  template, inputs, citations, grounding and policy decision. Tools are read-only functions over the institution's
  authorized data; calculations always go through deterministic engines; thin evidence returns a stated gap.
- **Provider adapter** (planned): `ModelProvider` interface with a local OpenAI-compatible endpoint and a hosted
  provider; selected per institution, off until policy allows and a decision entry lifts D-14 for that use.

## 7. Competitive intelligence (planned, slice J)

Separate tables (`ci_domains`, `ci_crawls`, `ci_pages`, `ci_page_versions`, `ci_claims`) with no foreign keys into
institutional case, portfolio or decision tables. A polite crawler (robots.txt, sitemaps and RSS first, internal links,
per-domain rate limit) runs on pg-boss. A domain shows "collected" only after a successful crawl. In this cloud
environment the five domains are currently refused by the network policy, which the module reports as the real error.

## 8. Deployment

Local: Node 22, pnpm, PostgreSQL 16 (or `docker compose up -d postgres`). Production targets (private cloud,
on-premises, air-gapped) need: the IdP adapter, a secret store, TLS termination, backups, monitoring, and a security
review. None of these is claimed as done.
