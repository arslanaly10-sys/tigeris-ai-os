# TIGERIS AI OS — Product Requirements (PRD)

Status: working draft v1.0, 29 Oct 2026. Written by the product engineering lead (acting CTO) from the owner's
platform brief, the decisions log (`docs/decisions.md`) and the implemented code, because the original PRD/TRD text
is not in this repository (D-49). Requirement IDs already referenced in code and tests (FR-01, FR-04, FR-08, FR-09,
FR-14..FR-18, FR-40, FR-42, TR-001..TR-011, TR-021, TR-042, TR-044, AC-01, AC-03, AC-04) keep their meaning.

Status words used throughout: **Implemented** (works in this repository, tested), **Simulated** (works on synthetic or
dated snapshot data and is labelled so), **Planned** (designed, not built), **Blocked** (needs something outside the
repository, named).

---

## 1. Product

**TIGERIS AI OS** is an institution-owned, case-first intelligence and decision layer that sits above the
institution's existing systems. It connects authorized data, mandates, assets, external signals, analysis, decisions
and outcomes in one governed environment, so authorized people can answer:

1. What changed?
2. Which assets, portfolios, organizations, services, sectors or national objectives could be affected?
3. What evidence supports that assessment?
4. What assumptions, uncertainties and data gaps remain?
5. Which response options are allowed by mandate and policy?
6. Who has the authority to approve an action?
7. What happened after the decision?

**What it is not.** Not a chatbot, not a dashboard collection, not a portfolio or trading system, not a SaaS data
vendor. TIGERIS never trades, moves capital or executes an external action. Any write-back to an external system needs
a separately approved integration, explicit authorization, server-side checks, audit and human approval (§9).

**Customers.** Sovereign wealth funds, national investment and development entities, central agencies, state-owned
enterprises and large institutional investors. Named organizations are prospects only: TIGERIS never presents PIF,
Mubadala, ADIA, Aramco or any other organization as a customer. The demonstration institution is the fictional
"Gulf Sovereign Investment Authority (Demo)".

## 2. Principles (non-negotiable)

| #   | Principle                | Requirement                                                                                                                                                          |
| --- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | Case-first               | Signals, evidence, graph, scenarios, recommendations, decisions and memory attach to one case.                                                                       |
| P2  | Lineage for every number | A displayed number resolves to a source record, a versioned calculation with input IDs, or a labelled assumption. Otherwise it is suppressed or labelled UNVERIFIED. |
| P3  | Truth labels             | SourceClass, ClaimClass and DataMode vocabularies everywhere; status never by colour alone.                                                                          |
| P4  | No false liveness        | Nothing is called live until a connector has authenticated and fetched. Movement is "Illustrative simulation".                                                       |
| P5  | Confidence with basis    | Bands (high, moderate, low, insufficient) with their factors; never a bare percentage.                                                                               |
| P6  | Human authority          | Approval is a named human transition. Expert review is mandatory. Authors never decide their own recommendations.                                                    |
| P7  | Models are not truth     | Deterministic, versioned code computes quantities. Models summarize, compare and draft from cited evidence, and refuse when evidence is thin.                        |
| P8  | Institution isolation    | Every institutional row carries `institution_id`; row-level security under a non-owner application role; scope set per transaction.                                  |
| P9  | Sovereign deployability  | Self-hostable, no runtime CDN, replaceable models, no telemetry; air-gapped operation is a deployment target, not a claim.                                           |
| P10 | Honest claims            | No compliance, certification, "tamper-proof", "air-gapped" or "production-secure" claims without evidence.                                                           |

## 3. Users and roles

| Role                     | Can                                                                                                                   | Cannot                                               |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Intelligence Analyst     | Triage signals, open cases, curate evidence, trace impact paths, run scenarios, recommend one option for review       | Review or decide anything they recommended           |
| Domain Expert            | Review models, assumptions and evidence; endorse or request changes; record disagreement; challenge signals and links | Approve the recommendation they reviewed             |
| Expert Approver          | Decide within delegated authority and limits: approve, reject, defer, request evidence                                | Decide above limits; decide their own recommendation |
| Executive / Governor     | Everything an approver can; senior authority for Reallocate; second approver of two-person actions (D-51)             | Act as both approvals of a two-person decision       |
| Operations Owner         | Acknowledge approved handoffs, record progress and outcomes                                                           | Change a decision; mark anything executed by TIGERIS |
| Governance Administrator | Register sources and connectors, import data, approve crawl domains, run crawls, manage users and configuration       | Decide cases                                         |
| Auditor (read-only)      | Read permitted records, the decision log and the audit trail; export where permitted                                  | Change anything                                      |

Authorization considers institution, role, workspace (sector), record classification, requested action and approval
limits, and is enforced on the server (TR-050).

## 4. The flagship journey: Strait of Hormuz early warning to recorded decision

The demo takes one event through the whole decision process on synthetic portfolio data and dated public snapshots,
labelled as such, never implying a live institution or the ability to move capital.

| Step | What the user sees                                                                                                      | Status                                                   |
| ---- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 1    | The incoming signal (MSC Aries seizure, 13 Apr 2024) with its publisher, event and retrieval time, freshness and labels | Implemented (dated public snapshot)                      |
| 2    | Affected routes, assets, sectors and investment exposures on the Gulf map and the impact graph (2nd and 3rd order)      | Implemented (synthetic exposures)                        |
| 3    | Modelled impacts over 72 h, 90 d, 1 y and 5 y with low / central / high ranges and every assumption visible             | Implemented (hormuz-disruption 1.0.0, illustrative)      |
| 4    | Ranked response options checked against the mandate register and authority matrix                                       | Implemented (options-ranker 1.0.0)                       |
| 5    | Recommendation, mandatory expert review, policy-checked approval (two-person where required)                            | Implemented (decision-policy 1.1.0)                      |
| 6    | Recorded decision, handoff and outcome; expected-versus-observed review kept as institutional memory                    | Implemented (narrative); figure-by-figure Planned (D-60) |

## 5. Functional requirements

### 5.1 Entry, identity and context

- **FR-01** Institution identification first (code or work-email domain); unknown institutions are refused. _Implemented._
- **FR-02** Production identity through the institution's IdP (OIDC/SAML, MFA enforced by the IdP). _Planned — integration capability, adapter boundary exists._
- **FR-03** Workspace (sector) selection and a persistent context bar: institution, role, environment, data modes. _Implemented._
- **FR-04** Labelled demonstration roles, no password fields. _Implemented._
- **FR-05** Demonstration disclosure always visible. _Implemented (D-42)._

### 5.2 Data, sources and connectors

- **FR-06** Connector registry: provider, connector, institution scope, connection type, auth type (no plaintext secrets), schedule, last success, last error and retry, datasets, schema and mapping version, classification, status (sample, configured, connected, paused, failed, retired). _Implemented (slice C)._
- **FR-07** Adapter interface so a provider is added without touching the rest of the system: REST, webhooks, relational databases, SFTP, CSV/XLSX/JSON, PDF/office documents, scheduled batch, event streams where justified. Read-only first. _Implemented: file, document, REST and RSS adapters; webhook, SQL, SFTP and stream are declared boundaries that refuse to run (D-70)._
- **FR-08** Lineage: every figure opens its source record, fact, transformation and timestamps. _Implemented._
- **FR-09** Ingestion with validation and quarantine: hashed, idempotent packages; per-record checks (TR-001..TR-011). _Implemented (JSON packages)._
- **FR-10** File import: CSV, XLSX, JSON and document uploads with row-level validation errors, ingestion status and a normalized record browser. _Implemented (slice C)._
- **FR-11** Data quality and freshness: per-source freshness limits, stale warnings in dependent views, quality status per record. _Implemented (slice D)._
- **FR-12** Provenance on every record: source system and record ID, owner, connector or method, source and ingestion timestamps, licence notes, classification and access scope, transformation, freshness, and whether live, imported, synthetic, sample or manual. _Implemented (slices B/C)._
- **FR-13** Public-feed connectors (RSS/JSON advisories) that stay "configured, not connected" until a fetch succeeds (D-59). _Implemented: the seeded EIA feed stays configured until its source is approved and a fetch succeeds (D-73)._

### 5.3 Entities, graph and exposure

- **FR-14** Shared entity model with typed relationships (observed, sourced, inferred, assumed, synthetic). _Implemented._
- **FR-15** Dependency paths to second and third order from a case origin, and from any entity in the entity explorer (what it relies on, what is exposed if it is disrupted). _Implemented (slice E)._
- **FR-16** Every link opens its rationale, evidence and confidence. _Implemented._
- **FR-17** Exposures from holdings and commitments to routes, assets and services. _Implemented: positions link to holding and portfolio entities and are listed on each entity within the reader's scope (slices B, E)._
- **FR-18** Scenarios with explicit assumptions, values, units, horizons, ranges and reproducible runs. _Implemented._
- **FR-19** Signal inbox: triage (corroborate, challenge, monitor, dismiss, open case) with rationale. _Implemented._

### 5.4 Cases and analysis

- **FR-20** Reusable case workflow: detected → triaged → analysis → scenario → review → decision → handoff → closed. _Implemented._
- **FR-21** Evidence linked to cases, with disputed and unverified values flagged. _Implemented._
- **FR-22** Timeline of case events and decisions. _Implemented._
- **FR-23** Unresolved questions, assumptions and data gaps listed per case. _Implemented._
- **FR-24** Sensitivity comparison across assumptions; reviewer notes and recorded disagreement. _Implemented (slice G): one-at-a-time sensitivity per metric and horizon on every scenario run; append-only notes, agreement and disagreement on recommendations; approving over a recorded disagreement requires the decider's acknowledgement (decision-policy 1.1.0)._

### 5.5 Governance, decisions and outcomes

- **FR-25** Options ranked by a published rule and checked against mandates. _Implemented._
- **FR-26** One recommendation per case at a time, by an analyst, with rationale. _Implemented._
- **FR-27** Mandatory expert review: endorse or request changes. _Implemented._
- **FR-28** Versioned decision policy with reasons (pass, hold, block), previewed before deciding; blocked attempts audited. _Implemented._
- **FR-29** Two-person approvals and synthetic numeric limits per delegated authority (D-52). _Two-person Implemented; limits Planned (slice B)._
- **FR-30** Manual handoff to the operations owner: acknowledge, start, record outcome. _Implemented._
- **FR-31** Expected-versus-observed outcome review per scenario figure, with variance and verdict (D-60). _Implemented (slice H): observed value, date and source per figure; variance and range verdict computed on the server; append-only._
- **FR-32** Institutional memory: only approved decisions with outcomes; searchable within the institution. _Implemented._

### 5.6 AI, agents and advanced analytics

- **FR-33** Model gateway with policy: approved models only, external calls off unless policy allows; every run records model and version, template version, inputs, citations, grounding result. _Implemented (deterministic stub)._
- **FR-34** Agentic case analysis (D-53): a planner decomposes the question, then specialist agents run with scoped tools and the case's authorized evidence only. Each agent's output cites evidence; a grounding check rejects any number that is not in a cited display; thin evidence produces a stated gap, not an answer. _Implemented (slice F) on the deterministic stub._ Agent roster:

  | Agent              | Does                                                                        | Tools (read-only)                                   |
  | ------------------ | --------------------------------------------------------------------------- | --------------------------------------------------- |
  | Planner            | Breaks "what does this event mean for us?" into steps and assigns agents    | Case, mandate register                              |
  | Evidence retriever | Finds authorized evidence and facts for each step; reports gaps             | Evidence store, sources, freshness                  |
  | Impact tracer      | Walks dependency paths and lists affected entities with path and confidence | Graph                                               |
  | Scenario analyst   | Chooses drivers, runs the deterministic engine, explains ranges             | Scenario engine (deterministic)                     |
  | Option drafter     | Drafts response options from the ranked set                                 | Options ranker                                      |
  | Mandate checker    | Explains mandate and authority implications per option                      | Mandates, authority matrix, decision policy preview |
  | Red-team critic    | Argues against the leading option; lists what would change the conclusion   | All of the above, read-only                         |
  | Memory scout       | Finds similar past decisions and their outcomes as precedent                | Institutional memory (same institution only)        |

- **FR-35** Model-provider adapter (local OpenAI-compatible endpoint or hosted provider) configured per institution, off by default. _Implemented as a boundary: `MODEL_PROVIDER_URL` is shown as configured and never called while D-14 holds._
- **FR-36** Early-warning indicators: deterministic, versioned indicator rules (e.g. transit restriction duration, war-risk premium multiple, freshness of corroboration) that raise a signal's urgency with the rule shown. _Planned._
- **FR-37** Change detection: "what changed since the last review" for a case, a source or a vendor page, from stored versions. _Planned._

### 5.7 Reports and exports

- **FR-38** Governance-ready case report (printable HTML) and JSON evidence pack: executive summary, what changed and when, affected entities and paths, evidence and timestamps, assumptions and gaps, scenario impacts with method and version, options, mandate and policy checks, reviews and disagreements, decision with authority and time, actions and outcome. _Planned (slice I)._
- **FR-39** Export authorization: only readable records, demonstration label, every export audited. _Planned (slice I)._

### 5.8 Audit, administration and isolation

- **FR-40** Hash-chained, append-only audit of sensitive reads, exports, edits, approvals, rejections and configuration changes. _Implemented._
- **FR-41** Audit log viewer with filters and chain verification. _Implemented (slice H): Audit & Administration; case events outside the reader's clearance are withheld and counted; verification recomputes the chain from genesis and is itself audited._
- **FR-42** Institution isolation under row-level security. _Implemented._
- **FR-43** User, role and institution administration (demo directory; production from IdP groups). _Implemented (slice H): provision people from the IdP (no passwords), grant and revoke roles and sector workspaces with a reason, never your own access; production group sync Planned with FR-02._
- **FR-44** Model and analysis configuration screen (registry, templates, policy versions). _Partial (AI Command)._

### 5.9 Competitive intelligence (separate from institutional data)

- **FR-45** Domain registry for the five seed vendors (Palantir, BlackRock Aladdin section only, AlternativeSoft, Dasseti, V7) with administrator approval for any additional domain. _Planned (slice J)._
- **FR-46** Polite crawler: robots.txt, sitemaps and RSS first, internal links only, per-domain rate limits, scheduled or manual runs. _Planned; Blocked on network access until the owner allows the domains (D-54)._
- **FR-47** Page store: vendor, category, requested and canonical URL, title, relevant text, publication date, retrieval time, content hash, version history, crawl status and errors. _Planned._
- **FR-48** Claims: paraphrase, supporting passage, clickable source URL, retrieval date, "vendor-published" unless verified by a person (D-55). _Planned._
- **FR-49** Vendor profiles and a change feed from page versions. _Planned._
- **FR-50** Competitive-intelligence report, separate from decision reports, with citations only to vendor-public sources. _Planned._

## 6. Technical requirements (selected)

- **TR-001..TR-011** Ingestion checks: source approved, schema, data class, integrity hash, timestamps, duplicates, freshness, quarantine reasons, idempotent packages, rule-set version, append-only runs. _Implemented._
- **TR-021** Graph layout by hop distance with barycentric ordering; readable zoom by default. _Implemented._
- **TR-030** Deterministic engines are pure, versioned and reproducible: a stored run re-computes to the same output hash. _Implemented._
- **TR-031** Grounding check: model output may only contain numbers that appear in cited display strings. _Implemented._
- **TR-042** Audit chain with per-institution advisory lock; verification function. _Implemented._
- **TR-044** Isolation tests under the application role. _Implemented._
- **TR-050** Authorization on the server for every read, write and export; the UI only mirrors it. _Implemented for current routes; extended in slice B._
- **TR-051** Governance rules also enforced in the database (triggers, CHECKs, column-level grants). _Implemented (D-45)._
- **TR-060** Secrets only from the environment or a secret store; never in code, prompts, browser code, logs or reports. _Implemented (no secrets in repo)._
- **TR-061** Uploaded files: size and type limits, content hashing, stored outside the web root, never executed. _Planned._
- **TR-070** Jobs on pg-boss with retries, backoff and history (D-58). _Planned._
- **TR-080** Self-hosted fonts and assets; works offline. _Implemented._
- **TR-090** WCAG 2.2 AA (axe in e2e), keyboard operable, RTL correct. _Implemented for current screens._

## 7. Acceptance criteria

| ID    | Criterion                                                                                                        | Status                                        |
| ----- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| AC-01 | Enter a clearly labelled demo institution with a named role; no password field                                   | Implemented                                   |
| AC-02 | An administrator registers a source and imports a sample dataset                                                 | Implemented                                   |
| AC-03 | Any figure traces to its source record and timestamp                                                             | Implemented                                   |
| AC-04 | Disputed and unverified values are visibly distinct and cannot be the sole basis of a decision                   | Implemented                                   |
| AC-05 | Validation reports row-level issues and retains provenance                                                       | Implemented                                   |
| AC-06 | Imported records appear in the right institution and sector workspace                                            | Implemented                                   |
| AC-07 | A user opens a case, inspects evidence and sees which records support it                                         | Implemented                                   |
| AC-08 | An illustrative scenario shows assumptions, ranges and dependencies                                              | Implemented                                   |
| AC-09 | A permitted user submits an option; an authorized approver approves, rejects or requests changes                 | Implemented                                   |
| AC-10 | The decision and an accountable action are recorded; case and approval history are inspectable                   | Implemented                                   |
| AC-11 | Sample data is visibly distinct from connected data                                                              | Implemented                                   |
| AC-12 | Server-side authorization on reads, writes and exports                                                           | Implemented for reads/writes; exports Planned |
| AC-13 | Errors, stale sources, missing data and empty states are explicit                                                | Implemented                                   |
| AC-14 | An administrator configures the five CI domains, runs or schedules a crawl, sees status and source-linked claims | Planned; crawling Blocked on network policy   |
| AC-15 | Competitive intelligence stays separate from portfolio and operational data                                      | Planned                                       |
| AC-16 | No connector or website is described as live until collection has succeeded                                      | Implemented (sources and connectors)          |

## 8. Competitive landscape (context, unverified)

The five seed vendors are where institutions already get adjacent capability. The notes below are general background
from public knowledge, **not yet checked against the vendors' pages**; they will be replaced by cited,
vendor-published claims from the crawler (FR-45..FR-50) once the domains are reachable.

| Vendor (domain)                           | Commonly known for                                                                | TIGERIS position                                                                                            |
| ----------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Palantir (palantir.com)                   | Data integration and operational decision platforms for government and enterprise | Institution-owned, case-first decision governance with mandate and authority built in; sovereign deployment |
| BlackRock Aladdin (blackrock.com/aladdin) | Investment and risk-management platform for asset owners and managers             | Sits above portfolio systems; reads exposures, does not replace the book of record or trade                 |
| AlternativeSoft (alternativesoft.com)     | Fund selection and manager research analytics                                     | Manager and due-diligence records feed exposure and case analysis; not a fund-selection tool                |
| Dasseti (dasseti.com)                     | Due-diligence and data-collection workflows for allocators                        | Imports due-diligence records with provenance into cases                                                    |
| V7 (v7labs.com)                           | AI document processing and agents for extracting data from documents              | Document ingestion with provenance; models stay replaceable and never the source of truth                   |

## 9. Write-back and execution boundary

TIGERIS records decisions and handoffs. It does not place trades, instruct transfers or change external systems. A
future write-back integration must have: an explicitly configured destination, server-side authorization, a recorded
human approval for each action, full audit, a decision entry and a migration that lifts the `executed_by_tigeris`
constraint (D-45). Until then the constraint makes execution impossible at the database level.

## 10. Out of scope for the demonstration build

Live market or vessel feeds, real client data, real credentials, production SSO, multi-region deployment, mobile
native apps, and any automated action on external systems.
