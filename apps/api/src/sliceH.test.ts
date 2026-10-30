// Slice H: expected-versus-observed outcome review, the audit log viewer with chain verification, and role and
// workspace administration with separation of duties. Runs as tigeris_app through the API, on its own case.
import type {
  AdminOverview,
  AuditPage,
  AuditVerification,
  CaseGovernance,
  DemoPrincipal,
  OutcomeReviewPayload,
} from '@tigeris/shared';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { config } from './config';
import { createDb, resolveInstitutionId, withInstitution } from './db/client';
import { cases, outcomeReviews } from './db/schema';

const { db, close } = createDb(config.DATABASE_APP_URL, 3);
const app = await buildApp({ db, sessionSecret: config.SESSION_SECRET, demoInstitutionKey: 'gsia-demo' });
const CASE = `OUT-${Date.now().toString(36).toUpperCase()}`;
const why = 'Recorded for the slice H integration test with enough words.';
let principals: DemoPrincipal[];
let gsia: string;
let memoryKey: string;
const headers: Record<string, Record<string, string>> = {};

const who = (role: string) => principals.find((p) => p.roles.includes(role as never))!;
async function as(role: string) {
  if (headers[role]) return headers[role];
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/demo-session',
    payload: { principalId: who(role).id },
  });
  const cookie = res.cookies.find((c) => c.name === 'tigeris_session')!;
  return (headers[role] = { cookie: `tigeris_session=${cookie.value}` });
}
const get = async (role: string, url: string) => app.inject({ method: 'GET', url, headers: await as(role) });
const post = async (role: string, url: string, payload: object = {}) =>
  app.inject({ method: 'POST', url, headers: await as(role), payload });

beforeAll(async () => {
  principals = (await app.inject({ method: 'GET', url: '/api/auth/demo-principals' })).json().principals;
  gsia = (await resolveInstitutionId(db, 'gsia-demo'))!;
  await withInstitution(db, gsia, (tx) =>
    tx.insert(cases).values({
      institutionId: gsia,
      key: CASE,
      title: 'Outcome test: deferred commitments under a Hormuz shock (synthetic)',
      state: 'review',
      domain: 'Sovereign capital',
      sectorKey: 'capital',
      sensitivity: 'confidential',
      urgency: 'routine',
      dataMode: 'synthetic_demo',
      ownerPrincipalId: who('analyst').id,
      objective: 'Exercise outcome review after a completed handoff.',
      summary: 'Synthetic test case.',
      whyItMatters: 'Slice H integration test.',
      unresolvedQuestions: [],
      confidence: { band: 'low', factors: [] },
      version: 1,
    }),
  );
  // Scenario → recommendation → review → decision → handoff → memory.
  expect(
    (
      await post('analyst', '/api/scenarios', {
        caseKey: CASE,
        drivers: { durationDays: 21, capacityLostPct: 50, bypassMbd: 2.6, oilPriceShockPct: 30 },
      })
    ).statusCode,
  ).toBe(201);
  const g: CaseGovernance = (await get('analyst', `/api/cases/${CASE}/governance`)).json();
  const option = g.candidateOptions.find(
    (o) => o.authority && !o.authority.twoPerson && o.authority.requiredRole === 'approver',
  )!;
  const rec = (
    await post('analyst', `/api/cases/${CASE}/recommendations`, { optionId: option.id, rationale: why })
  ).json().key;
  await post('domain_expert', `/api/recommendations/${rec}/reviews`, { verdict: 'endorse', rationale: why });
  const decided = await post('approver', `/api/recommendations/${rec}/decisions`, {
    outcome: 'approve',
    rationale: why,
  });
  expect(decided.statusCode).toBe(201);
  const ho = decided.json().handoffKey as string;
  await post('operations_owner', `/api/handoffs/${ho}/actions`, { action: 'acknowledge' });
  await post('operations_owner', `/api/handoffs/${ho}/actions`, { action: 'start' });
  const done = await post('operations_owner', `/api/handoffs/${ho}/actions`, {
    action: 'record_outcome',
    outcome: 'New route-dependent commitments were deferred for the quarter.',
    lesson: 'Deferral bought time at little cost; revisit when transit data firm up.',
  });
  expect(done.statusCode).toBe(200);
  memoryKey = ((await get('analyst', `/api/cases/${CASE}/governance`)).json() as CaseGovernance).memory!.key;
});
afterAll(async () => {
  await app.close();
  await close();
});

describe('expected-versus-observed outcome review (FR-31)', () => {
  it('lists each expected figure with its numeric range from the scenario run', async () => {
    const p: OutcomeReviewPayload = (await get('analyst', `/api/memory/${memoryKey}/outcomes`)).json();
    expect(p.figures.length).toBeGreaterThan(0);
    const f = p.figures[0]!;
    expect(f.expected.low).toBeLessThanOrEqual(f.expected.central);
    expect(f.expected.central).toBeLessThanOrEqual(f.expected.high);
    expect(p.summary).toMatchObject({ reviewed: 0, total: p.figures.length });
    expect(p.canReview.allowed).toBe(true);
  });

  it('computes variance and verdict on the server, keeps every review, and shows the latest', async () => {
    const p: OutcomeReviewPayload = (await get('analyst', `/api/memory/${memoryKey}/outcomes`)).json();
    const f = p.figures[0]!;
    const body = {
      figureRef: f.ref,
      observedOn: '2026-10-01',
      source: 'Quarterly portfolio valuation (synthetic)',
      note: 'Observed after the corridor reopened; one quarter of data.',
    };
    const missed = await post('analyst', `/api/memory/${memoryKey}/outcomes`, {
      ...body,
      observedValue: f.expected.high + 1,
    });
    expect(missed.statusCode).toBe(201);
    expect(missed.json().comparison.verdict).toBe('missed');
    const held = await post('domain_expert', `/api/memory/${memoryKey}/outcomes`, {
      ...body,
      observedValue: f.expected.central,
    });
    expect(held.json().comparison).toMatchObject({ verdict: 'held', variance: 0, withinRange: true });

    const after: OutcomeReviewPayload = (await get('auditor', `/api/memory/${memoryKey}/outcomes`)).json();
    const fig = after.figures.find((x) => x.ref === f.ref)!;
    expect(fig.reviews).toHaveLength(2);
    expect(fig.reviews[0]!.verdict).toBe('held');
    expect(after.summary).toMatchObject({ reviewed: 1, held: 1, missed: 0 });
    expect(after.canReview.allowed).toBe(false);
  });

  it('refuses unknown figures, future dates, missing sources, other roles and other scopes', async () => {
    const p: OutcomeReviewPayload = (await get('analyst', `/api/memory/${memoryKey}/outcomes`)).json();
    const ok = {
      figureRef: p.figures[0]!.ref,
      observedValue: 1,
      observedOn: '2026-10-01',
      source: 'Quarterly portfolio valuation (synthetic)',
      note: 'A note long enough to be kept.',
    };
    const status = async (role: string, b: object) =>
      (await post(role, `/api/memory/${memoryKey}/outcomes`, b)).statusCode;
    expect(await status('analyst', { ...ok, figureRef: 'scenario:nope' })).toBe(400);
    expect(await status('analyst', { ...ok, observedOn: '2099-01-01' })).toBe(400);
    expect(await status('analyst', { ...ok, source: '' })).toBe(400);
    expect(await status('analyst', { ...ok, sourceUrl: 'http://insecure.example' })).toBe(400);
    expect(await status('approver', ok)).toBe(403);
    expect(await status('operations_owner', ok)).toBe(404);
    await expect(
      withInstitution(db, gsia, (tx) => tx.update(outcomeReviews).set({ verdict: 'held' })),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('audit log viewer and chain verification (FR-40)', () => {
  it('lets auditors, administrators and executives read, newest first, with paging and filters', async () => {
    expect((await get('analyst', '/api/audit')).statusCode).toBe(403);
    const page: AuditPage = (await get('auditor', '/api/audit?limit=5')).json();
    expect(page.events).toHaveLength(5);
    expect(page.events[0]!.seq).toBeGreaterThan(page.events[4]!.seq);
    const older: AuditPage = (await get('auditor', `/api/audit?limit=5&before=${page.nextBefore}`)).json();
    expect(older.events[0]!.seq).toBeLessThan(page.events[4]!.seq);
    const outcomes: AuditPage = (await get('auditor', '/api/audit?action=outcome.')).json();
    expect(outcomes.events.every((e) => e.action.startsWith('outcome.'))).toBe(true);
    expect(outcomes.events.length).toBeGreaterThanOrEqual(2);
  });

  it('withholds case events outside the reader’s clearance and says how many', async () => {
    const admin: AuditPage = (await get('administrator', `/api/audit?caseKey=${CASE}`)).json();
    expect(admin.events).toHaveLength(0);
    expect(admin.withheld).toBeGreaterThan(0);
    const auditor: AuditPage = (await get('auditor', `/api/audit?caseKey=${CASE}`)).json();
    expect(auditor.events.length).toBeGreaterThan(0);
    expect(auditor.withheld).toBe(0);
  });

  it('verifies the whole chain and records that it did', async () => {
    expect((await post('executive', '/api/audit/verify')).statusCode).toBe(403);
    const v: AuditVerification = (await post('auditor', '/api/audit/verify')).json();
    expect(v.valid).toBe(true);
    expect(v.checked).toBeGreaterThan(10);
    expect(v.brokenAt).toBeNull();
    const last: AuditPage = (await get('auditor', '/api/audit?limit=1')).json();
    expect(last.events[0]!.action).toBe('audit.verified');
  });

  it('detects a tampered event', async () => {
    // Only the owner role can alter audit rows; the app role cannot, so tampering is simulated in a rolled-back
    // owner transaction and the chain is verified inside it.
    const { createDb: owner } = await import('./db/client');
    const o = owner(config.DATABASE_OWNER_URL, 1);
    const { verifyChain } = await import('./modules/oversight');
    try {
      await o.db
        .transaction(async (tx) => {
          await tx.execute(sql`select set_config('app.institution_id', ${gsia}, true)`);
          await tx.execute(sql`alter table audit_events disable trigger user`);
          await tx.execute(
            sql`update audit_events set action = 'tampered' where seq = (select min(seq) + 1 from audit_events where institution_id = ${gsia})`,
          );
          const v = await verifyChain(tx, gsia);
          expect(v.checked).toBeGreaterThan(10);
          expect(v.valid).toBe(false);
          expect(v.reason).toContain('hash');
          throw new Error('rollback');
        })
        .catch((e: Error) => {
          if (e.message !== 'rollback') throw e;
        });
    } finally {
      await o.close();
    }
  });
});

describe('administration with separation of duties', () => {
  let newId: string;

  it('shows the institution and everyone’s access to administrators and auditors only', async () => {
    expect((await get('analyst', '/api/admin')).statusCode).toBe(403);
    const a: AdminOverview = (await get('administrator', '/api/admin')).json();
    expect(a.institution.name).toContain('Demo');
    expect(a.institution.isSynthetic).toBe(true);
    expect(a.canManage.allowed).toBe(true);
    expect((await get('auditor', '/api/admin')).json().canManage.allowed).toBe(false);
  });

  it('provisions a person without a password and changes their access with reasons, all audited', async () => {
    const created = await post('administrator', '/api/admin/principals', {
      displayName: 'Provisioned analyst (test)',
      title: 'Analyst',
      idpSubject: `test-${CASE.toLowerCase()}@institution.example`,
      role: 'analyst',
      reason: why,
    });
    expect(created.statusCode).toBe(201);
    newId = created.json().id;
    const url = `/api/admin/principals/${newId}/access`;
    expect(
      (await post('administrator', url, { kind: 'workspace', sectorKey: 'energy', grant: true, reason: why }))
        .statusCode,
    ).toBe(200);
    expect(
      (await post('administrator', url, { kind: 'role', role: 'domain_expert', grant: true, reason: why }))
        .statusCode,
    ).toBe(200);
    expect(
      (await post('administrator', url, { kind: 'role', role: 'domain_expert', grant: true, reason: why }))
        .statusCode,
    ).toBe(409);
    expect(
      (await post('administrator', url, { kind: 'role', role: 'analyst', grant: false, reason: 'short' }))
        .statusCode,
    ).toBe(400);
    expect(
      (await post('auditor', url, { kind: 'role', role: 'analyst', grant: false, reason: why })).statusCode,
    ).toBe(403);
    const a: AdminOverview = (await get('administrator', '/api/admin')).json();
    const p = a.principals.find((x) => x.id === newId)!;
    expect(p.roles.sort()).toEqual(['analyst', 'domain_expert']);
    expect(p.workspaces).toEqual(['energy']);
    const log: AuditPage = (await get('auditor', '/api/audit?action=admin.')).json();
    expect(log.events.map((e) => e.action)).toEqual(
      expect.arrayContaining([
        'admin.principal_provisioned',
        'admin.workspace_granted',
        'admin.role_granted',
      ]),
    );
  });

  it('never lets administrators change their own access, so one always remains', async () => {
    const me = who('administrator').id;
    const own = await post('administrator', `/api/admin/principals/${me}/access`, {
      kind: 'role',
      role: 'administrator',
      grant: false,
      reason: why,
    });
    expect(own.statusCode).toBe(409);
    expect(own.json().error).toBe('own_access');
    const url = `/api/admin/principals/${newId}/access`;
    expect(
      (await post('administrator', url, { kind: 'role', role: 'administrator', grant: true, reason: why }))
        .statusCode,
    ).toBe(200);
    expect(
      (await post('administrator', url, { kind: 'role', role: 'administrator', grant: false, reason: why }))
        .statusCode,
    ).toBe(200);
    const a: AdminOverview = (await get('administrator', '/api/admin')).json();
    expect(a.principals.filter((x) => x.roles.includes('administrator')).map((x) => x.id)).toEqual([me]);
  });
});
