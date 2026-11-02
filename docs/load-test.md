# Load test (pilot readiness)

Date: 2 November 2026. Script: `scripts/load-test.mjs` (no dependencies). It signs in the seven demo principals, then
runs N virtual users, each looping without pause over eight API routes: Sovereign Overview, the case list, one case,
signals, sectors, the intervention inbox, the decision log and one Ask TIGERIS question. Every request goes through the
session check, the `tigeris_app` role and row-level security, exactly as in use.

```bash
node scripts/load-test.mjs http://127.0.0.1:4000 25 60   # base URL, users, seconds; needs demo sign-in on
```

## Results

One API process (database pool of 10) and PostgreSQL 16 on the same 4-CPU container, with the load generator on that
same container. Demonstration dataset after `pnpm db:reset`. Times in milliseconds.

| Users | Requests | Server errors | Throughput | p50 (range over routes) | p95 (range) | p99 (range) |
| ----- | -------- | ------------- | ---------- | ----------------------- | ----------- | ----------- |
| 25    | 16,416   | 0             | 271 req/s  | 75–105                  | 110–149     | 125–204     |
| 100   | 17,600   | 0             | 282 req/s  | 269–408                 | 347–567     | 402–696     |

Slowest at 100 users: the overview and Ask TIGERIS (p95 about 560 ms); fastest: the decision log (p95 347 ms).

## What this shows, and what it does not

- No request failed and no connection was refused at four times a pilot-sized team running without pauses. Real
  users pause between actions, so this is a heavier load than the same number of people would produce.
- Throughput levels off near 280 requests a second, so beyond that point extra users wait longer rather than fail.
  The limit here is one Node process sharing four CPUs with the database and the load generator. The Helm chart can
  run more API replicas; that was not measured.
- Not measured: a production-sized dataset, a separate database host, uploads and imports, case analysis and scenario
  runs (writes), Claude-drafted answers (off here; a model call adds its own latency and is capped by the monthly
  budget), and sustained runs longer than a minute.
