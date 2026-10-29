# TIGERIS AI OS

**AI-Native Sovereign Intelligence Operating System** — _Intelligence into Capability. Capital into Sovereign Advantage._

An institution-owned, case-first intelligence and decision layer: validated evidence becomes governed,
traceable options for human authority. This repository holds the MVP build.

> Demonstration build. All institution, exposure and movement data is synthetic and labelled.
> Public facts reference dated sources and remain _unverified_ until the client's factual review.

## Quick start

Requirements: Node 22+, pnpm 10, PostgreSQL 16 (or Docker).

```bash
pnpm install
cp .env.example .env
pnpm db:reset      # roles, database, migrations, seed
pnpm dev           # web http://localhost:5173 · api http://localhost:4000
```

With Docker instead of a local Postgres:

```bash
docker compose up -d postgres
pnpm db:reset
```

## Checks

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e
```

## Layout

| Path                          | Purpose                                                        |
| ----------------------------- | -------------------------------------------------------------- |
| `apps/web`                    | React + Vite client (Overview, sector centres, case workspace) |
| `apps/api`                    | Fastify API, SQL migrations, seed fixtures, isolation tests    |
| `packages/shared`             | Truth vocabulary, case lifecycle, API types                    |
| `docs/prd.md`                 | Product requirements (FR/TR/AC) and status                     |
| `docs/architecture.md`        | Stack, isolation, modules, canonical model, connectors, AI     |
| `docs/implementation-plan.md` | Build slices A–K with status                                   |
| `docs/decisions.md`           | Product and technical decisions                                |
| `CLAUDE.md`                   | Rules for AI-assisted development                              |

## Phase status

- **Phase 1 — Foundation**: monorepo, CI, schema v1 with row-level security, demo roles, app shell,
  Command Centre, MSC Aries case, lineage drawer, hash-chained audit.
- **Phase 2 — Evidence and graph**: sovereign dark redesign; offline Gulf map (MapLibre + deck.gl, Natural
  Earth) with illustrative replay; Signal Review with triage (corroborate / challenge / monitor / dismiss /
  open case); temporal intelligence graph with labelled links and bounded traversal; case Impact Graph and
  Timeline; snapshot ingestion with validation rules v1 and quarantine; institution-scoped search.
- **Redesign — Sovereign Light**: ivory/emerald/gold theme with illustrated SVG scenes and palm mark;
  institution-code sign-in; nine-item navigation; Sovereign Overview; eight sector Command Centres with
  evidence-bound KPIs; AI Command registry; read-only Mandates & Authority; Decisions & Approvals queue with
  live approvals badge; Governed Execution (manual handoffs); drafted Arabic interface with RTL.
- **Phase 3 — Reasoning and scenarios**: deterministic `hormuz-disruption` engine with low/central/high
  ranges across 72h / 90d / 1y / 5y against a baseline; versioned assumption register; reproducible,
  append-only runs with calculation lineage; ranked draft options with mandate checks, authority and
  confidence basis; internal deterministic model gateway with grounding checks; AI Command run console.
- Phase 4 — Governance and decisions · Phase 5 — Complete cases and UX ·
  Phase 6 — Release candidate.
- **Phase 4 — Governance and memory**: recommendation from a scenario's draft options, mandatory expert
  review, versioned decision policy (pass / hold / block with reasons, two-person rule, author and reviewer
  separation) enforced in code and again in the database, manual handoff to the operations owner, and
  institution-scoped searchable memory of approved decisions with outcomes.
