# TIGERIS AI OS — decision log

Decisions taken with the product owner on 29 October 2026, resolving conflicts across the PRD, TRD,
App Flow, UI/UX brief, schema design, implementation plan, map spec, data-source register and foundation pack.

| #    | Area             | Decision                                                                                                | Notes                                            |
| ---- | ---------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| D-01 | Environment      | Cloud Claude Code environment approved for client material                                              | Product owner approval                           |
| D-02 | Delivery         | 12-week MVP baseline; optional W13–16 hardening                                                         | Implementation Plan supersedes 8-week references |
| D-03 | Working mode     | Phase by phase with check-ins and screenshots                                                           |                                                  |
| D-04 | Repository       | Private `tigeris-ai-os`, personal GitHub account, pnpm monorepo                                         |                                                  |
| D-05 | Visual           | Navy-led: midnight navy structure, ivory/white reading surfaces, emerald/teal verified, restrained gold | Supersedes Foundation ivory direction            |
| D-06 | Typography       | Source Serif 4 headings, Inter UI, both self-hosted                                                     |                                                  |
| D-07 | Navigation       | PRD 11 items; home is "Command Centre"                                                                  |                                                  |
| D-08 | Language         | English first; RTL-ready layouts (logical CSS) from day one                                             |                                                  |
| D-09 | Naming           | Map labels the waterway "Arabian Gulf"                                                                  |                                                  |
| D-10 | Frontend         | React + Vite, Tailwind + shadcn/ui-style owned components                                               |                                                  |
| D-11 | Backend          | TypeScript Fastify modular monolith; Drizzle ORM; PostgreSQL + RLS                                      |                                                  |
| D-12 | Jobs / storage   | pg-boss; MinIO (S3-compatible) for evidence objects                                                     | Later phases                                     |
| D-13 | Policy           | Versioned TypeScript rules returning PASS / HOLD / BLOCK                                                |                                                  |
| D-14 | AI               | Model gateway with deterministic stub first; no external model calls                                    |                                                  |
| D-15 | Map              | MapLibre GL + deck.gl; Natural Earth packaged basemap                                                   |                                                  |
| D-16 | Graph view       | React Flow                                                                                              |                                                  |
| D-17 | Packaging        | Docker Compose; demo profile blocks outbound network                                                    |                                                  |
| D-18 | Sign-in          | Labelled demo role picker (7 roles) + OIDC adapter seam                                                 |                                                  |
| D-19 | Confidence       | Band (high/moderate/low/insufficient) + factor basis                                                    | No bare percentages                              |
| D-20 | Governance       | Expert review mandatory for all cases; self-approval always blocked                                     |                                                  |
| D-21 | Demo institution | Fictional "Gulf Sovereign Investment Authority (Demo)"                                                  |                                                  |
| D-22 | Hormuz case      | 2024 MSC Aries seizure (13 April 2024)                                                                  | Thin for early-warning lead time; extend later   |
| D-23 | Resilience case  | Energy–water dependency (fuel/LNG → power → desalination → water)                                       |                                                  |
| D-24 | Capital slice    | Hold / Defer / Hedge / Reallocate, synthetic                                                            |                                                  |
| D-25 | Movement         | Synthetic replay labelled "Illustrative simulation"                                                     |                                                  |
| D-26 | Public snapshots | EIA/JODI, GCC-Stat + national portals, IMF/World Bank, sanctions lists                                  | Terms review before mirroring                    |
| D-27 | CI gates         | Lint, typecheck, unit + integration, Playwright e2e + a11y, tenant isolation                            |                                                  |

## Truth vocabulary (resolves four competing label schemes)

Three separate fields, never merged:

- **SourceClass** (where it came from): public, third_party, licensed, client, synthetic
- **ClaimClass** (how it is known): observed, sourced, inferred, assumed, synthetic, illustrative
- **DataMode** (what time it shows): live, snapshot, replay, scenario, synthetic_demo

## Open client items (not blocking Phase 1)

- Patent-pending architecture blueprint (NDA)
- Final brand lockup/logo and tagline approval
- Hormuz source pack sign-off and factual acceptance owner
- Local model choice and licensing
- Approval thresholds, audit retention, memory retention
- Team capacity, budget, investor/demo date
