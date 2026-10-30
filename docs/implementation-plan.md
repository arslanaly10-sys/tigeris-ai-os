# TIGERIS AI OS — Implementation plan

Order follows the owner's brief (A→K, D-50). Each slice ends runnable, tested, committed and pushed (D-63).
Status words: Implemented · Simulated · Planned · Blocked.

| Slice | Scope                                                                                                                                                                                                                                     | Depends on | Status                                               |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------- |
| P1–P4 | Foundation, evidence and graph, scenarios, governance and memory                                                                                                                                                                          | —          | Implemented                                          |
| A     | PRD, architecture note, this plan                                                                                                                                                                                                         | —          | Implemented                                          |
| B     | Canonical model gaps (positions with amounts, managers and due diligence, jurisdictions, record classification and sector scope); synthetic numeric approval limits in the decision policy; server permission matrix incl. classification | A          | Implemented                                          |
| C     | Connector registry and adapter interface; local file upload (CSV, XLSX, JSON, PDF, DOCX) with row-level validation, provenance and a normalized record browser; pg-boss jobs                                                              | B          | Implemented                                          |
| D     | Data-quality view: per-record quality status, freshness, quarantine review, ingestion history                                                                                                                                             | C          | Implemented                                          |
| E     | Entity and dependency explorer across sector workspaces; imported records visible in their sector                                                                                                                                         | B, C       | Implemented                                          |
| F     | Agentic case analysis on the stub (planner, retriever, impact tracer, scenario analyst, option drafter, mandate checker, red-team critic, memory scout); model-provider adapter off by default                                            | E          | Implemented                                          |
| G     | Scenario sensitivity comparison; reviewer notes and recorded disagreement                                                                                                                                                                 | F          | Implemented                                          |
| H     | Expected-versus-observed outcome review; audit log viewer with chain verification; user, role and institution administration                                                                                                              | B          | Implemented                                          |
| I     | Governance-ready case report (print view) and JSON evidence pack with export authorization and audit; command centre overdue actions; Arabic for new screens                                                                              | H          | Implemented                                          |
| J     | Competitive intelligence: domain registry, polite crawler, page versions, claims with curation, vendor profiles, change feed, CI report                                                                                                   | C          | Implemented; real crawling Blocked by network policy |
| K     | Additional sector connectors and models; completion report                                                                                                                                                                                | C, E       | Implemented                                          |

## Not in this build (and why)

- Live market, vessel or advisory feeds: no licensed feed and no network access; dated snapshots and a public-feed
  connector that stays "configured, not connected" stand in (D-59).
- Production SSO, MFA, private deployment, air-gapped operation: deployment capabilities with an adapter boundary,
  not claims.
- Any action on an external system: impossible by database constraint until a separate approved integration exists.

## Phase 5: institutional second brain (D-103..D-114)

| Slice | Scope                                                                                                                     | Depends on | Status  |
| ----- | ------------------------------------------------------------------------------------------------------------------------- | ---------- | ------- |
| 5A    | Semantic registry: metric definitions, codified mandate and business rules, jurisdiction variants, JSON-LD export (FR-52) | —          | Planned |
| 5B    | Intervention engine and inbox (FR-53, FR-36)                                                                              | 5A         | Planned |
| 5C    | Decision guardrails and post-decision monitoring (FR-54)                                                                  | 5A, 5B     | Planned |
| 5D    | Learning loop: assumption calibration proposals (FR-55)                                                                   | —          | Planned |
| 5E    | Validation tasking, asset-class desks, roll-up (FR-56)                                                                    | —          | Planned |
| 5F    | Oil-price-shock template and scenario room (FR-57)                                                                        | 5A         | Planned |
| 5G    | Ask TIGERIS and notification adapters (FR-58)                                                                             | 5B         | Planned |
| 5H    | Production foundations (FR-59)                                                                                            | —          | Planned |
| 5I    | Claude adapter, AI economics, model configuration (FR-60)                                                                 | 5H         | Planned |
