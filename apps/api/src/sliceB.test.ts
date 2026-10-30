// Slice B: read scope (clearance by classification, sector workspaces), canonical records with provenance,
// and synthetic delegated limits in the decision policy. Runs as tigeris_app through the API.
import type {
  AuthorityRuleItem,
  CaseGovernance,
  CaseSummary,
  DemoPrincipal,
  ManagerItem,
  PositionsPayload,
  SearchResult,
} from '@tigeris/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { config } from './config';
import { createDb, resolveInstitutionId, withInstitution } from './db/client';
import { cases, principalRoles, principals, principalWorkspaces } from './db/schema';

const { db, close } = createDb(config.DATABASE_APP_URL, 3);
const app = await buildApp({ db, sessionSecret: config.SESSION_SECRET, demoInstitutionKey: 'gsia-demo' });
let gsia: string;
let demo: DemoPrincipal[];
let utilitiesAnalyst: Record<string, string>;
const CASE = `LIM-${Date.now().toString(36).toUpperCase()}`;
const why = 'Recorded for the slice B integration test with enough words.';

const sessions: Record<string, Record<string, string>> = {};
async function as(role: string) {
  if (sessions[role]) return sessions[role];
  const p = demo.find((x) => x.roles.includes(role as never))!;
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/demo-session',
    payload: { principalId: p.id },
  });
  const c = res.cookies.find((x) => x.name === 'tigeris_session')!;
  return (sessions[role] = { cookie: `tigeris_session=${c.value}` });
}
const get = async <T>(headers: Record<string, string>, url: string) =>
  (await app.inject({ method: 'GET', url, headers })).json() as T;
const status = async (headers: Record<string, string>, url: string) =>
  (await app.inject({ method: 'GET', url, headers })).statusCode;
const post = async (role: string, url: string, payload: object) =>
  app.inject({ method: 'POST', url, headers: await as(role), payload });

beforeAll(async () => {
  gsia = (await resolveInstitutionId(db, 'gsia-demo'))!;
  demo = (await app.inject({ method: 'GET', url: '/api/auth/demo-principals' })).json().principals;
  // A non-demo analyst limited to the utilities workspace. Signed in with a session cookie the way the identity
  // provider would issue it, so the seven demo roles stay untouched.
  const id = await withInstitution(db, gsia, async (tx) => {
    const [p] = await tx
      .insert(principals)
      .values({
        institutionId: gsia,
        displayName: 'Workspace-scoped analyst (test)',
        title: 'Utilities analyst',
        idpIssuer: 'urn:tigeris:test',
        idpSubject: `test:${CASE}`,
        isDemo: false,
      })
      .returning({ id: principals.id });
    await tx.insert(principalRoles).values({ institutionId: gsia, principalId: p!.id, role: 'analyst' });
    await tx
      .insert(principalWorkspaces)
      .values({ institutionId: gsia, principalId: p!.id, sectorKey: 'utilities' });
    await tx.insert(cases).values({
      institutionId: gsia,
      key: CASE,
      title: 'Limit test: reallocation above delegated authority (synthetic)',
      state: 'review',
      domain: 'Sovereign capital',
      sectorKey: 'capital',
      sensitivity: 'confidential',
      urgency: 'routine',
      dataMode: 'synthetic_demo',
      ownerPrincipalId: demo.find((x) => x.roles.includes('analyst'))!.id,
      objective: 'Exercise delegated limits.',
      summary: 'Synthetic test case.',
      whyItMatters: 'Slice B integration test.',
      unresolvedQuestions: [],
      confidence: { band: 'low', factors: [] },
      version: 1,
    });
    return p!.id;
  });
  utilitiesAnalyst = {
    cookie: `tigeris_session=${app.signCookie(JSON.stringify({ institutionId: gsia, principalId: id }))}`,
  };
});
afterAll(async () => {
  await app.close();
  await close();
});

describe('read scope: sector workspaces (TR-050)', () => {
  it('limits a workspace-scoped analyst to that workspace, everywhere case data is read', async () => {
    const list = await get<CaseSummary[]>(utilitiesAnalyst, '/api/cases');
    expect(list.map((c) => c.key)).toContain('RES-EW-01');
    expect(list.map((c) => c.key)).not.toContain('HMZ-2024-0413');
    expect(await status(utilitiesAnalyst, '/api/cases/HMZ-2024-0413')).toBe(404);
    expect(await status(utilitiesAnalyst, '/api/cases/HMZ-2024-0413/graph')).toBe(404);
    expect(await status(utilitiesAnalyst, '/api/cases/HMZ-2024-0413/governance')).toBe(404);
    const found = await get<SearchResult[]>(utilitiesAnalyst, '/api/search?q=aries');
    expect(found.filter((r) => r.kind === 'case')).toHaveLength(0);
    const pos = await get<PositionsPayload>(utilitiesAnalyst, '/api/positions');
    expect(pos.positions.length).toBeGreaterThan(0);
    expect(pos.positions.every((p) => p.sectorKey === 'utilities')).toBe(true);
  });
});

describe('read scope: clearance by classification', () => {
  it('keeps confidential cases and positions from roles cleared only to restricted', async () => {
    const ops = await as('operations_owner');
    const list = await get<CaseSummary[]>(ops, '/api/cases');
    expect(list.map((c) => c.key)).not.toContain('CAP-ALLOC-01');
    expect(list.map((c) => c.key)).toContain('HMZ-2024-0413');
    expect(await status(ops, '/api/cases/CAP-ALLOC-01')).toBe(404);
    expect((await get<PositionsPayload>(ops, '/api/positions')).positions).toHaveLength(0);
    // Managers are classified restricted, so they remain readable.
    expect((await get<ManagerItem[]>(ops, '/api/managers')).length).toBeGreaterThan(0);
  });
});

describe('canonical records with provenance (FR-12)', () => {
  it('agree with the cited exposure register and carry their provenance', async () => {
    const pos = await get<PositionsPayload>(await as('executive'), '/api/positions');
    expect(pos.totals.routeDependentCount).toBe(11);
    expect(pos.totals.routeDependentNavSharePct).toBe(18);
    const p = pos.positions[0]!;
    expect(p.provenance).toMatchObject({
      sourceKey: 'gsia-exposure-register',
      recordMode: 'synthetic',
      classification: 'confidential',
      mappingVersion: 'gsia-synthetic.v1',
      qualityStatus: 'valid',
    });
    expect(p.provenance.sourceRecordId).toBe(`gsia-demo:positions:${p.key}`);
  });

  it('lists managers with their due-diligence records', async () => {
    const m = await get<ManagerItem[]>(await as('analyst'), '/api/managers');
    const escalated = m.find((x) => x.key === 'MGR-02')!;
    expect(escalated.dueDiligence[0]).toMatchObject({ status: 'escalated', openIssues: 2 });
    expect(escalated.provenance.recordMode).toBe('synthetic');
  });
});

describe('delegated limits (D-52)', () => {
  it('publishes the synthetic limits with the authority matrix', async () => {
    const { authority } = await get<{ authority: AuthorityRuleItem[] }>(await as('auditor'), '/api/mandates');
    const hedge = authority.find((a) => a.actionClass === 'Hedge exposure')!;
    expect(hedge.limits.map((l) => [l.role, l.value, l.unit]).sort()).toEqual([
      ['approver', 20, '% of NAV'],
      ['executive', 40, '% of NAV'],
    ]);
  });

  it("blocks an approval above the decider's limit and says to escalate", async () => {
    const run = await post('analyst', '/api/scenarios', {
      caseKey: CASE,
      drivers: { durationDays: 21, capacityLostPct: 50, bypassMbd: 2.6, oilPriceShockPct: 30 },
    });
    expect(run.statusCode).toBe(201);
    const g = await get<CaseGovernance>(await as('analyst'), `/api/cases/${CASE}/governance`);
    const reallocate = g.candidateOptions.find((o) => o.actionClass === 'Reallocate')!;
    expect(reallocate.magnitude).toMatchObject({ value: 18, unit: '% of NAV' });
    const rec = await post('analyst', `/api/cases/${CASE}/recommendations`, {
      optionId: reallocate.id,
      rationale: why,
    });
    expect(rec.statusCode).toBe(201);
    const recKey = rec.json().key as string;
    expect(
      (
        await post('domain_expert', `/api/recommendations/${recKey}/reviews`, {
          verdict: 'endorse',
          rationale: why,
        })
      ).statusCode,
    ).toBe(201);

    const preview = await get<CaseGovernance>(await as('executive'), `/api/cases/${CASE}/governance`);
    const limit = preview.decisionPreview!.approve.reasons.find((r) => r.code === 'limit')!;
    expect(limit.result).toBe('block');
    expect(limit.text).toContain('exceeds your delegated limit of 10 % of NAV');

    const attempt = await post('executive', `/api/recommendations/${recKey}/decisions`, {
      outcome: 'approve',
      rationale: why,
    });
    expect(attempt.statusCode).toBe(409);
    expect(attempt.json().evaluation.reasons.map((r: { code: string }) => r.code)).toContain('limit');
    // Rejecting is never limited.
    expect(
      (
        await post('executive', `/api/recommendations/${recKey}/decisions`, {
          outcome: 'reject',
          rationale: why,
        })
      ).statusCode,
    ).toBe(201);
  });
});
