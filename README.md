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

| Path                | Purpose                                                     |
| ------------------- | ----------------------------------------------------------- |
| `apps/web`          | React + Vite client (Command Centre, case workspace)        |
| `apps/api`          | Fastify API, SQL migrations, seed fixtures, isolation tests |
| `packages/shared`   | Truth vocabulary, case lifecycle, API types                 |
| `docs/decisions.md` | Product and technical decisions                             |
| `CLAUDE.md`         | Rules for AI-assisted development                           |

## Phase status

- **Phase 1 — Foundation**: monorepo, CI, schema v1 with row-level security, demo roles, app shell,
  Command Centre, MSC Aries case, lineage drawer, hash-chained audit.
- **Phase 2 — Evidence and graph**: sovereign dark redesign; offline Gulf map (MapLibre + deck.gl, Natural
  Earth) with illustrative replay; Signal Review with triage (corroborate / challenge / monitor / dismiss /
  open case); temporal intelligence graph with labelled links and bounded traversal; case Impact Graph and
  Timeline; snapshot ingestion with validation rules v1 and quarantine; institution-scoped search.
- Phase 3 — Reasoning and scenarios · Phase 4 — Governance and decisions · Phase 5 — Complete cases and UX ·
  Phase 6 — Release candidate.
