import type {
  CaseDetail,
  DemoPrincipal,
  GraphPayload,
  IngestionJobItem,
  MapLayers,
  SearchResult,
  SignalDetail,
  SignalSummary,
} from '@tigeris/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { verifyAuditChain } from './audit/audit';
import { config } from './config';
import { createDb, resolveInstitutionId, withInstitution } from './db/client';
import { evidenceObjects, signalEvents } from './db/schema';
import { migrate } from './db/migrate';
import { traverse } from './modules/graph';

const { db, close } = createDb(config.DATABASE_APP_URL, 3);
const app = await buildApp({ db, sessionSecret: config.SESSION_SECRET, demoInstitutionKey: 'gsia-demo' });
let principals: DemoPrincipal[];

async function signIn(role: string) {
  const p = principals.find((x) => x.roles.includes(role as never))!;
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/demo-session',
    payload: { principalId: p.id },
  });
  const cookie = res.cookies.find((c) => c.name === 'tigeris_session')!;
  return { cookie: `tigeris_session=${cookie.value}` };
}

beforeAll(async () => {
  // This suite mutates signals and cases; it expects a freshly seeded database (pnpm db:reset).
  await migrate();
  principals = (await app.inject({ method: 'GET', url: '/api/auth/demo-principals' })).json().principals;
});

afterAll(async () => {
  await app.close();
  await close();
});

describe('signals (App Flow step 3)', () => {
  it('lists real and illustrative signals with source, times and validation', async () => {
    const headers = await signIn('analyst');
    const list: SignalSummary[] = (await app.inject({ method: 'GET', url: '/api/signals', headers })).json();
    expect(list.length).toBeGreaterThanOrEqual(7);
    const real = list.find((s) => s.key === 'SIG-2024-0413-01')!;
    expect(real).toMatchObject({ dataMode: 'snapshot', caseKey: 'HMZ-2024-0413', signalType: 'maritime' });
    expect(real.primarySource?.publisher).toBe('gCaptain');
    expect(real.eventTime).toBe('2024-04-13T02:43:00.000Z');
    const synthetic = list.filter((s) => s.key.startsWith('SIG-SYN'));
    expect(
      synthetic.every((s) => s.dataMode === 'synthetic_demo' && s.title.startsWith('Illustrative:')),
    ).toBe(true);
  });

  it('offers triage actions by role and none on settled signals', async () => {
    const analyst: SignalDetail = (
      await app.inject({ method: 'GET', url: '/api/signals/SIG-SYN-0003', headers: await signIn('analyst') })
    ).json();
    expect(analyst.allowedActions).toEqual(['corroborate', 'challenge', 'monitor', 'dismiss', 'open_case']);
    const expert: SignalDetail = (
      await app.inject({
        method: 'GET',
        url: '/api/signals/SIG-SYN-0003',
        headers: await signIn('domain_expert'),
      })
    ).json();
    expect(expert.allowedActions).toEqual(['challenge']);
    const settled: SignalDetail = (
      await app.inject({
        method: 'GET',
        url: '/api/signals/SIG-2024-0413-01',
        headers: await signIn('analyst'),
      })
    ).json();
    expect(settled.allowedActions).toEqual([]);
  });

  it('refuses triage without a rationale or the right role', async () => {
    const analyst = await signIn('analyst');
    const noReason = await app.inject({
      method: 'POST',
      url: '/api/signals/SIG-SYN-0004/actions',
      headers: analyst,
      payload: { action: 'monitor', rationale: '' },
    });
    expect(noReason.statusCode).toBe(400);
    const auditor = await app.inject({
      method: 'POST',
      url: '/api/signals/SIG-SYN-0004/actions',
      headers: await signIn('auditor'),
      payload: { action: 'dismiss', rationale: 'Not relevant' },
    });
    expect(auditor.statusCode).toBe(403);
  });

  it('records a disposition with rationale in signal history and the audit chain', async () => {
    const headers = await signIn('analyst');
    const res = await app.inject({
      method: 'POST',
      url: '/api/signals/SIG-SYN-0004/actions',
      headers,
      payload: { action: 'monitor', rationale: 'Watch for a second convoy before escalating.' },
    });
    expect(res.statusCode).toBe(200);
    const detail: SignalDetail = res.json().signal;
    expect(detail.disposition).toBe('monitoring');
    expect(detail.events.at(-1)).toMatchObject({
      action: 'monitor',
      fromDisposition: 'new',
      toDisposition: 'monitoring',
    });
    const gsia = (await resolveInstitutionId(db, 'gsia-demo'))!;
    expect(await withInstitution(db, gsia, (tx) => verifyAuditChain(tx, gsia))).toBeNull();
    const update = withInstitution(db, gsia, (tx) => tx.update(signalEvents).set({ rationale: 'rewritten' }));
    await expect(update).rejects.toThrow(/permission denied/);
  });

  it('opens a case from a signal, carrying its evidence and entity', async () => {
    const headers = await signIn('analyst');
    const res = await app.inject({
      method: 'POST',
      url: '/api/signals/SIG-SYN-0006/actions',
      headers,
      payload: { action: 'open_case', rationale: 'Relevant to the energy–water resilience case.' },
    });
    expect(res.statusCode).toBe(200);
    const { caseKey, signal } = res.json();
    expect(caseKey).toMatch(/^CASE-\d{8}-\d{2}$/);
    expect(signal.disposition).toBe('case_opened');
    const c: CaseDetail = (await app.inject({ method: 'GET', url: `/api/cases/${caseKey}`, headers })).json();
    expect(c.state).toBe('triaged');
    expect(c.dataMode).toBe('synthetic_demo');
    expect(c.evidence).toHaveLength(1);
    const again = await app.inject({
      method: 'POST',
      url: '/api/signals/SIG-SYN-0006/actions',
      headers,
      payload: { action: 'dismiss', rationale: 'Second attempt' },
    });
    expect(again.statusCode).toBe(409);
  });
});

describe('intelligence graph (FR-13..FR-16, TR-021, TR-037)', () => {
  it('traces labelled first-, second- and third-order paths from the case origin', async () => {
    const headers = await signIn('analyst');
    const g: GraphPayload = (
      await app.inject({ method: 'GET', url: '/api/cases/HMZ-2024-0413/graph', headers })
    ).json();
    const byKey = new Map(g.nodes.map((n) => [n.key, n]));
    expect(byKey.get('evt-msc-aries-seizure')?.hop).toBe(0);
    expect(byKey.get('cp-hormuz')?.hop).toBe(1);
    expect(byKey.get('com-lng')?.hop).toBe(2);
    expect(byKey.get('hold-utility')?.hop).toBe(3);
    expect(Math.max(...g.nodes.map((n) => n.hop!))).toBeLessThanOrEqual(g.maxHops);
    expect(g.edges.every((e) => e.relationshipClass && e.rationale)).toBe(true);
    const sourced = g.edges.filter((e) => e.relationshipClass === 'sourced');
    expect(sourced.length).toBeGreaterThan(0);
    expect(sourced.every((e) => e.evidence.length > 0)).toBe(true);
  });

  it('terminates on cyclic graphs and respects the hop limit', () => {
    const edges = [
      { id: '1', source: 'a', target: 'b' },
      { id: '2', source: 'b', target: 'c' },
      { id: '3', source: 'c', target: 'a' },
      { id: '4', source: 'c', target: 'd' },
      { id: '5', source: 'd', target: 'e' },
    ] as never;
    const { hop } = traverse(['a'], edges, 2);
    expect(Object.fromEntries(hop)).toEqual({ a: 0, b: 1, c: 1, d: 2 });
  });

  it('never exposes quarantined evidence through cases', async () => {
    const gsia = (await resolveInstitutionId(db, 'gsia-demo'))!;
    const quarantined = await withInstitution(db, gsia, (tx) =>
      tx
        .select({ id: evidenceObjects.id })
        .from(evidenceObjects)
        .where(eq(evidenceObjects.validationStatus, 'quarantined')),
    );
    expect(quarantined.length).toBeGreaterThan(0);
    const headers = await signIn('analyst');
    for (const key of ['HMZ-2024-0413', 'RES-EW-01', 'CAP-ALLOC-01']) {
      const c: CaseDetail = (await app.inject({ method: 'GET', url: `/api/cases/${key}`, headers })).json();
      expect(c.evidence.some((e) => quarantined.some((q) => q.id === e.id))).toBe(false);
    }
  });
});

describe('map layers', () => {
  it('returns located entities and illustrative tracks — never live', async () => {
    const headers = await signIn('executive');
    const m: MapLayers = (await app.inject({ method: 'GET', url: '/api/map/layers', headers })).json();
    expect(m.entities.every((e) => e.lon !== null && e.geoPrecision)).toBe(true);
    expect(m.tracks.length).toBeGreaterThan(0);
    expect(m.tracks.every((t) => t.dataMode !== 'live' && t.claimClass === 'illustrative')).toBe(true);
    expect(m.durationSeconds).toBeGreaterThan(0);
    expect(m.movementSource?.sourceClass).toBe('synthetic');
  });
});

describe('ingestion (FR-09, TR-001..TR-011)', () => {
  it('shows validation runs with checks for every record', async () => {
    const headers = await signIn('auditor');
    const jobs: IngestionJobItem[] = (
      await app.inject({ method: 'GET', url: '/api/ingestion', headers })
    ).json();
    const rejected = jobs.find((j) => j.packageId === 'gcc-stat-trial-extract')!;
    expect(rejected.status).toBe('rejected');
    expect(rejected.runs[0]?.checks[0]?.rule).toBe('source_approved');
    const sample = jobs.find((j) => j.packageId.startsWith('demo-sample-'))!;
    expect(sample.counts).toMatchObject({ accepted: 1, quarantined: 1 });
    expect(
      sample.runs
        .find((r) => r.outcome === 'quarantined')
        ?.checks.some((c) => c.rule === 'integrity' && c.result === 'fail'),
    ).toBe(true);
  });

  it('lets only administrators import, and is idempotent per package', async () => {
    const analyst = await app.inject({
      method: 'POST',
      url: '/api/ingestion/sample',
      headers: await signIn('analyst'),
    });
    expect(analyst.statusCode).toBe(403);
    const admin = await signIn('administrator');
    const first = await app.inject({ method: 'POST', url: '/api/ingestion/sample', headers: admin });
    expect(first.json()).toMatchObject({ status: 'completed', counts: { accepted: 1, quarantined: 1 } });
    const pkg = {
      packageId: 'idempotency-check',
      sourceKey: 'synthetic-signals',
      createdAt: '2026-10-29T00:00:00Z',
      records: [{ externalId: 'x' }],
    };
    const a = await app.inject({ method: 'POST', url: '/api/ingestion', headers: admin, payload: pkg });
    const b = await app.inject({ method: 'POST', url: '/api/ingestion', headers: admin, payload: pkg });
    expect(a.json().duplicatePackage).toBe(false);
    expect(b.json()).toMatchObject({ duplicatePackage: true, jobId: a.json().jobId });
  });
});

describe('search', () => {
  it('finds cases, signals and entities within the institution only', async () => {
    const headers = await signIn('analyst');
    const r: SearchResult[] = (
      await app.inject({ method: 'GET', url: '/api/search?q=hormuz', headers })
    ).json();
    expect(r.map((x) => x.kind)).toEqual(expect.arrayContaining(['case', 'entity']));
    const nri: SearchResult[] = (
      await app.inject({ method: 'GET', url: '/api/search?q=NRI', headers })
    ).json();
    expect(nri).toEqual([]);
  });
});
