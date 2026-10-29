# TIGERIS AI OS — instructions for Claude Code

TIGERIS AI OS is an AI-Native Sovereign Intelligence Operating System: an institution-owned, case-first
intelligence and decision layer above existing systems. It is **not** a chatbot, a dashboard collection,
a portfolio system or a SaaS service. Full decisions: `docs/decisions.md`.

## Product rules (non-negotiable)

1. **Case-first.** Signals, evidence, graph, scenarios, recommendations, decisions and memory attach to one case.
2. **Every number has lineage.** A displayed number must resolve to a source record, a versioned calculation
   with input IDs, or an explicit labelled assumption. Missing lineage → suppress it or label it UNVERIFIED.
   Never invent a filler value.
3. **Truth labels everywhere.** Use the vocabulary in `packages/shared/src/vocabulary.ts` only:
   - `SourceClass`: public · third_party · licensed · client · synthetic
   - `ClaimClass`: observed · sourced · inferred · assumed · synthetic · illustrative
   - `DataMode`: live · snapshot · replay · scenario · synthetic_demo
     Status must never rely on colour alone (text + icon/shape).
4. **No live claims.** The MVP has no live feeds. Never label anything LIVE; movement is "Illustrative simulation".
5. **Confidence is a band plus its basis** (high/moderate/low/insufficient with factors). Never a bare percentage.
6. **Human authority.** No code path executes an external action. Approval is a named human state transition.
   Expert review is mandatory before decision. A creator can never approve their own recommendation.
7. **Models are not sources of truth.** Deterministic code computes quantities; models only draft prose
   from cited inputs. External model calls are disabled unless policy allows (MVP: deterministic stub only).
8. **Institution isolation.** Every institutional row has `institution_id`; the API uses the non-owner
   `tigeris_app` role with row-level security; scope is set per transaction (`app.institution_id`).
9. **Never present target organisations (PIF, Mubadala, ADIA, Aramco) as customers.** The demo institution is
   fictional: "Gulf Sovereign Investment Authority (Demo)".
10. **Naming:** product "TIGERIS AI OS"; home screen "Command Centre"; waterway "Arabian Gulf".

## Architecture

- `apps/web` — React + Vite + TypeScript, Tailwind v4, shadcn-style components (owned code, Radix primitives),
  TanStack Query, React Router. Logical CSS properties only (`ps-`, `me-`, `start-`, `end-`) for RTL readiness.
  Fonts self-hosted via `@fontsource` (no CDN — must work air-gapped).
- `apps/api` — Fastify modular monolith (TypeScript). Modules: `auth`, `command-centre`, `cases`, `evidence`,
  `sources`, `audit`. Drizzle ORM over postgres.js. SQL migrations in `apps/api/db/migrations` (plain SQL,
  numbered, forward-only).
- `packages/shared` — vocabulary, lifecycle rules and API types shared by web and api.
- Later phases: pg-boss jobs, MinIO evidence store, model gateway, policy engine, MapLibre + deck.gl, React Flow.

## Commands

```bash
pnpm install
pnpm db:reset          # create roles/db, migrate, seed (needs local PostgreSQL 16)
pnpm dev               # api :4000, web :5173
pnpm lint && pnpm typecheck && pnpm test
pnpm test:e2e          # Playwright (desktop + mobile, axe accessibility)
```

## Working rules

- Reference a requirement ID (FR-xx / TR-xxx / AC-xx from the PRD/TRD) in commit messages where one applies.
- Add or update tests with every behaviour change. Tenant isolation tests must keep passing.
- Never commit secrets, client data or real credentials. Fixtures are public-snapshot references or synthetic.
- Do not add navigation, sectors, live connectors or claims beyond the current phase without a decision entry.
- Migrations are reviewed by a human before they run anywhere but local/CI.
