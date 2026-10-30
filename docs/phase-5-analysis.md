# Phase 5 analysis: TIGERIS against "The AI operating system" (QuantumBlack, AI by McKinsey, Oct 2026)

Prepared as acting CTO, 30 October 2026. Inputs: the 12-page paper the owner supplied, `docs/prd.md` (FR-01..FR-51),
`docs/decisions.md` (D-01..D-102) and the system as built at commit `main` (slices A–K plus approvals).

## 1. What the paper says, read critically

**Thesis.** An "AI operating system" is a continuously operating management layer, a "second brain", that keeps
enterprise context, reasons across functions, recommends or executes decisions, and learns from outcomes. It connects
the CEO, the C-suite, functional leaders and the front line. Value comes less from adopting AI than from changing how
the enterprise is managed.

**Architecture (sidebar, p. 5).** Two tiers:

| Tier            | Element                  | Paper's position                                                                                 |
| --------------- | ------------------------ | ------------------------------------------------------------------------------------------------ |
| Existing estate | Infrastructure           | Start on what exists; target state is the company's own cloud or on premises                     |
| Existing estate | Storage and data         | Leave data where it is; add data products; connect virtually to the semantic layer               |
| Existing estate | LLMs                     | Several providers including open-weight; never let a provider train on your data                 |
| AI OS           | Semantic layer           | Ontologies and knowledge graphs: entities, relationships, definitions, policies, business logic  |
| AI OS           | Analytics and models     | Deterministic ML and analytical tools, called by agents as tools, for high-trust work            |
| AI OS           | Agents and orchestration | Declarative, reusable agents; choose the model per problem; optimise cost and performance        |
| AI OS           | Experience layer         | Bring insight, decisions and execution to where people work, including conversational interfaces |

**Management shifts (pp. 9–10).** Manage by intervention (signals, thresholds and exceptions) rather than by the
calendar; manage continuously rather than through checkpoints; manage for judgment rather than information flow; manage
through direct connections rather than layers.

**First actions (p. 12).** Focus on three to five high-value domains; set rules for the AI OS (how many, who governs the
semantic layer, reuse standards); fund the shared AI OS rather than use cases; redesign decision rights and management
rhythms.

**Strength of the evidence.** The paper is a practitioner thought-leadership piece, not research.

- The adoption gap (40% of large companies "scaling" agents, 6% attributing at least 5% of EBIT to AI) comes from the
  firm's own survey, with "scaling" defined loosely (agents in one or more functions). It is a credible framing, not a
  causal finding.
- The headline benefits ("up to ten times" faster planning, first value in "about 12 weeks", "50 percent" faster ROI,
  "40 percent" productivity, "up to 90 percent" cycle-time reduction) are stated from "our experience" with no sample,
  baseline or method. They are upper bounds from selected engagements and should not be quoted as expected outcomes.
- The case studies are anonymised; the manufacturer's USD 140–180 million is an "opportunity", not realised value.
- What the paper omits: model risk management, evaluation of agent quality, auditability, security, regulatory duties,
  accountability when an agent errs, the cost of keeping an ontology current, and failure modes such as automation
  bias. For a sovereign institution these are first-order concerns, not footnotes.

**Where the paper conflicts with TIGERIS's rules.** The paper's AI OS "recommends or executes decisions", "connects to
live systems", offers a "real-time view", and assumes agents act "within defined guardrails". TIGERIS deliberately
never executes an external action, never calls anything live until a connector proves it, keeps human authority with
mandatory expert review, and treats models as drafters, not sources of truth (CLAUDE.md rules 2–7). The analysis
below keeps those rules. Where the paper's ideas are adopted, they are adopted inside TIGERIS's governance, not instead
of it.

## 2. TIGERIS against the paper: capability map

Legend: **Strong** (built and tested), **Partial**, **Missing**, **By design not** (excluded by TIGERIS's rules).

| Paper capability                                                           | TIGERIS today                                                                                                                           | Status                           |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Own the context, open architecture, swap the technology                    | Institution-owned database with RLS, deterministic engines in shared code, model gateway with a provider boundary, no vendor lock-in    | Strong                           |
| Infrastructure on own cloud or on premises                                 | Self-hosted fonts, no CDN, Postgres, pg-boss; no deployment packaging yet                                                               | Partial                          |
| Leave data where it is; connect virtually                                  | Connectors copy data in (file, document, REST, RSS); SQL, SFTP, webhook and stream are boundaries only; no federated query              | Partial                          |
| Several model providers, no training on our data                           | Gateway and provider boundary exist; providers chosen (D-101); none connected; stub only                                                | Partial                          |
| Semantic layer: entities and relationships                                 | Shared graph with typed, labelled relationships, dependency reading, entity explorer                                                    | Strong                           |
| Semantic layer: definitions, policies, business logic                      | Mandates are text with a few checks; authority matrix and limits; no metric-definition or business-rule registry; no versioned ontology | Missing                          |
| Ontology reuse across business problems (Exhibit 2)                        | One Hormuz template; sector datasets reuse the connector framework; no explicit ontology "slices"                                       | Partial                          |
| Deterministic analytics as agent tools                                     | Scenario engine, options ranker, sensitivity, decision policy, sector models, dependency walk: all deterministic, versioned, tested     | Strong                           |
| Declarative, reusable agents                                               | Eight analysis agents with fixed roles and templates; not declarative or configurable                                                   | Partial                          |
| Model choice per task, cost optimisation                                   | Not applicable while the stub is the only model; no cost metering                                                                       | Missing                          |
| Experience layer, conversational                                           | Screens per role, Arabic draft, search; no "ask the system" interface; no notifications outside the app                                 | Partial                          |
| Anticipate outcomes, surface options                                       | Scenarios with ranges, ranked options, red-team critic                                                                                  | Strong                           |
| Always-on sensing; test and interrogate                                    | Signals inbox, early-warning triage; no continuous monitoring rules (FR-36); no live feeds                                              | Partial                          |
| Insights to decisions to coordinated execution, results fed back           | Recommendation → review → policy-checked decision → handoff → outcome; execution is human-only                                          | Strong (execution by design not) |
| Continuous learning from outcomes                                          | Expected-versus-observed reviews and memory exist, but nothing feeds back into assumptions, rankings or agents                          | Partial                          |
| Track execution, outcomes and value                                        | Handoffs, outcomes, overdue actions; no value or benefit ledger                                                                         | Partial                          |
| Shared intelligence from CEO to front line and back                        | Seven roles, sector workspaces, read scope; no organisational hierarchy (divisions exist in the schema but are unused); no roll-up      | Partial                          |
| Reusable context, models, agents, workflows                                | Connector framework, sector datasets, agents and engines are reusable in code, not by configuration                                     | Partial                          |
| Manage by intervention: signals, thresholds, exceptions                    | Overdue actions only; no threshold or exception rules, no watchlists, no intervention inbox                                             | Missing                          |
| Guardrails recorded from decisions ("no withdrawals without CEO approval") | Decision policy and limits are fixed rules; a decision cannot create a new standing guardrail                                           | Missing                          |
| Post-decision drift alerts ("alerts line heads before breach")             | Outcome review is retrospective; no monitoring of approved decisions                                                                    | Missing                          |
| Validation routed to business-unit leaders with a deadline                 | Expert review and reviewer notes on recommendations only; no general request-for-validation tasking                                     | Missing                          |
| Decision rights matrix: what agents may do                                 | Authority matrix for humans; agents are read-only and have no decision rights                                                           | Strong (by design)               |
| AI economics in decisions                                                  | Missing (no model costs yet)                                                                                                            | Missing                          |
| Agents execute within guardrails                                           | Not permitted                                                                                                                           | By design not                    |
| Real-time "live" cockpit                                                   | Not permitted until a connector proves a live feed                                                                                      | By design not                    |

**Where TIGERIS is ahead of the paper.** Every number has lineage; truth labels are everywhere; confidence is a band
with its basis; expert review is mandatory; the creator cannot approve; two-person rules and delegated limits are
enforced in code and in the database; recorded disagreement must be acknowledged; the audit chain is tamper-evident
and verifiable; read scope is enforced on the server; exports are audited; competitive intelligence is kept apart.
The paper gives none of this, and for sovereign institutions it is the precondition for trust. That trust also answers
the paper's own open question: how to stop organisations "re-creating layers of approval" (p. 10).

## 3. What is missing, prioritised

Ranked by value to a sovereign institution and by how much each closes the paper's "second brain" gap without
breaking TIGERIS's rules.

1. **Intervention engine** (manage by intervention, FR-36). Versioned watch rules on signals, sources, sector
   indicators, positions and scenario metrics; thresholds and exceptions; an intervention inbox per role; each alert
   with its rule, inputs and lineage. This is the single biggest management-model gap.
2. **Guardrails from decisions and post-decision monitoring.** A decision can record standing guardrails (for example
   "no reallocation above X without the Executive"); the policy engine enforces them later; approved decisions are
   monitored against their expected figures, with an alert before drift becomes breach.
3. **Semantic layer: definitions and business rules registry.** Versioned metric definitions (formula, unit, owner,
   source), codified mandate rules (scope, formula, threshold) replacing free-text checks, jurisdiction-specific
   definitions reconciled side by side (the paper's "regulators define margin differently"), and an exportable,
   open-format ontology (portability).
4. **Learning loop.** Outcome reviews that missed propose versioned changes to assumptions (low, central, high), which
   need human approval; a calibration view per assumption and per model; option-ranking hit rates over time.
5. **Validation tasking and roll-up.** Request validation of any finding from a named person or workspace with a due
   date; divisions or business units as an organisational level; a roll-up view in which each unit's answer and
   assumptions are visible to the executive.
6. **Scenario room.** Several runs side by side; a declarative scenario-template framework; a second template
   grounded in available data (for example an LNG supply shock for utilities, which the owner's EIA snapshot and the
   sector samples already touch).
7. **Experience layer.** "Ask TIGERIS": grounded questions over cases, graph, memory and sector models, answered from
   deterministic retrieval with citations, drafted by the model only when policy allows; notifications outside the
   app (email or Teams) for interventions.
8. **AI economics.** Once a model provider is connected: tokens and cost per agent run, per case and per decision,
   budgets per institution, and model choice per task recorded with its reason.
9. **Production foundations.** OIDC sign-in (D-100), secrets management, MinIO evidence store, backups and restore
   tests, observability, container and on-premises packaging, load and security testing, retention policies. Without
   these, no pilot can start.
10. **Remaining PRD items.** Change detection for cases and sources (FR-37), model and analysis configuration screen
    (FR-44), virtual (federated) data connections through the SQL adapter.

## 4. Proposed Phase 5: "From case workspace to institutional second brain"

Sequenced so each slice is runnable, tested and committed, as in Phases 1–4 and slices A–K.

| Slice | Scope                                                                                                                                                           | Depends on |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 5A    | Semantic registry: metric definitions, codified mandate and business rules (versioned, owned, tested), jurisdiction variants, ontology export in an open format | —          |
| 5B    | Intervention engine: watch rules and thresholds over signals, sources, sector indicators, positions and scenario metrics; intervention inbox; FR-36             | 5A         |
| 5C    | Decision guardrails and post-decision monitoring with drift alerts                                                                                              | 5A, 5B     |
| 5D    | Learning loop: assumption calibration proposals from outcome reviews, approval, calibration view                                                                | —          |
| 5E    | Validation tasking, divisions, executive roll-up                                                                                                                | —          |
| 5F    | Scenario room: side-by-side runs, declarative templates, second template                                                                                        | 5A         |
| 5G    | Experience layer: Ask TIGERIS (grounded, cited), notifications                                                                                                  | 5B         |
| 5H    | Production foundations: OIDC, secrets, MinIO, backups, observability, packaging                                                                                 | —          |
| 5I    | AI economics and model configuration (FR-44), once a provider is connected                                                                                      | 5H, D-101  |

What Phase 5 will not do, unless the owner decides otherwise: execute external actions, describe anything as live
without a proven connector, let agents decide, or remove human review.
