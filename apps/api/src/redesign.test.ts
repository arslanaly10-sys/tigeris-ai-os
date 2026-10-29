import type { DemoPrincipal, PendingApprovals, SectorDetail, SectorSummary } from '@tigeris/shared';
import { SECTORS } from '@tigeris/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { config } from './config';
import { createDb, resolveInstitutionId, withInstitution } from './db/client';
import { authorityRules } from './db/schema';

const { db, close } = createDb(config.DATABASE_APP_URL, 3);
const app = await buildApp({ db, sessionSecret: config.SESSION_SECRET, demoInstitutionKey: 'gsia-demo' });
let principals: DemoPrincipal[];

async function signIn(role: string) {
  const p = principals.find((x) => x.roles.includes(role as never))!;
  const res = await app.inject({ method: 'POST', url: '/api/auth/demo-session', payload: { principalId: p.id } });
  const cookie = res.cookies.find((c) => c.name === 'tigeris_session')!;
  return { cookie: `tigeris_session=${cookie.value}` };
}

beforeAll(async () => {
  principals = (await app.inject({ method: 'GET', url: '/api/auth/demo-principals' })).json().principals;
});
afterAll(async () => {
  await app.close();
  await close();
});

describe('institution identification at sign-in', () => {
  it('resolves the demonstration code or email domain, case-insensitively', async () => {
    for (const identifier of ['GSIA-DEMO', 'gsia-demo', 'analyst@gsia-demo.example']) {
      const res = await app.inject({ method: 'POST', url: '/api/auth/resolve-institution', payload: { identifier } });
      expect(res.statusCode).toBe(200);
      expect(res.json().institution.name).toBe('Gulf Sovereign Investment Authority (Demo)');
    }
  });

  it('says any other institution is not connected', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/resolve-institution',
      payload: { identifier: 'someone@example.gov' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('institution_not_connected');
  });
});

describe('sectors', () => {
  it('lists all eight sectors with demo depth on the four seeded ones', async () => {
    const headers = await signIn('executive');
    const list: SectorSummary[] = (await app.inject({ method: 'GET', url: '/api/sectors', headers })).json();
    expect(list.map((s) => s.key)).toEqual(SECTORS.map((s) => s.key));
    expect(list.filter((s) => s.depth === 'demo').map((s) => s.key)).toEqual([
      'energy',
      'utilities',
      'capital',
      'supply_chain',
    ]);
  });

  it('binds KPIs to evidence with lineage, and leaves unbound KPIs unconnected', async () => {
    const headers = await signIn('analyst');
    const energy: SectorDetail = (await app.inject({ method: 'GET', url: '/api/sectors/energy', headers })).json();
    const flow = energy.kpis.find((k) => k.key === 'hormuz-oil-flow')!;
    expect(flow.value).toMatchObject({ valueNum: 20.9, unit: 'million b/d', claimClass: 'sourced' });
    expect(flow.value!.evidenceId).toMatch(/[0-9a-f-]{36}/);
    expect(energy.kpis.find((k) => k.key === 'tanker-transits')!.value).toBeNull();
    expect(energy.cases.map((c) => c.key)).toContain('HMZ-2024-0413');
  });

  it('shows a shell sector with no invented values', async () => {
    const headers = await signIn('analyst');
    const re: SectorDetail = (await app.inject({ method: 'GET', url: '/api/sectors/real_estate', headers })).json();
    expect(re.depth).toBe('shell');
    expect(re.kpis.every((k) => k.value === null)).toBe(true);
    expect(re.cases).toEqual([]);
  });

  it('answers 404 for an unknown sector', async () => {
    const headers = await signIn('analyst');
    expect((await app.inject({ method: 'GET', url: '/api/sectors/space', headers })).statusCode).toBe(404);
  });
});

describe('mandates and authority', () => {
  it('returns the synthetic register and an authority matrix that always requires expert review', async () => {
    const headers = await signIn('auditor');
    const body = (await app.inject({ method: 'GET', url: '/api/mandates', headers })).json();
    expect(body.mandates.length).toBeGreaterThan(0);
    expect(body.mandates.every((m: { claimClass: string }) => m.claimClass === 'synthetic')).toBe(true);
    expect(
      body.authority.every(
        (r: { requiresExpertReview: boolean; selfApprovalBlocked: boolean }) =>
          r.requiresExpertReview && r.selfApprovalBlocked,
      ),
    ).toBe(true);
  });

  it('is read-only for the application role', async () => {
    const gsia = (await resolveInstitutionId(db, 'gsia-demo'))!;
    await expect(
      withInstitution(db, gsia, (tx) => tx.update(authorityRules).set({ twoPerson: false })),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('pending approvals badge', () => {
  it('counts only items whose next step belongs to the caller', async () => {
    const expert: PendingApprovals = (
      await app.inject({ method: 'GET', url: '/api/approvals/pending', headers: await signIn('domain_expert') })
    ).json();
    expect(expert.count).toBe(expert.items.length);
    expect(expert.items.every((i) => i.forYou)).toBe(true);
    expect(expert.items.map((i) => i.ref)).toContain('CAP-ALLOC-01');
    const auditor: PendingApprovals = (
      await app.inject({ method: 'GET', url: '/api/approvals/pending', headers: await signIn('auditor') })
    ).json();
    expect(auditor.count).toBe(0);
  });
});
