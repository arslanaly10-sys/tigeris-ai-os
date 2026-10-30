// Phase 5D: learning loop. A missed outcome review proposes new versions of the assumptions behind the figure; a
// domain expert who did not record the review approves or rejects; approval appends a version; stale proposals are
// refused; calibration counts held and missed reviews. Runs as tigeris_app through the API.
import {
  assumptionsBehind,
  type CaseGovernance,
  type DemoPrincipal,
  type LearningOverview,
  type OutcomeReviewPayload,
} from '@tigeris/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { config } from './config';
import { createDb, resolveInstitutionId, withInstitution } from './db/client';
import { cases } from './db/schema';

const { db, close } = createDb(config.DATABASE_APP_URL, 3);
const app = await buildApp({ db, sessionSecret: config.SESSION_SECRET, demoInstitutionKey: 'gsia-demo' });
const CASE = `LRN-${Date.now().toString(36).toUpperCase()}`;
const why = 'Defer new route-dependent commitments while transit is uncertain (test rationale).';
let principals: DemoPrincipal[];
const headers: Record<string, Record<string, string>> = {};
const who = (role: string) => principals.find((p) => p.roles.includes(role as never))!;
async function as(role: string) {
  if (headers[role]) return headers[role];
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/demo-session',
    payload: { principalId: who(role).id },
  });
  const c = res.cookies.find((x) => x.name === 'tigeris_session')!;
  return (headers[role] = { cookie: `tigeris_session=${c.value}` });
}
const get = async (role: string, url: string) => app.inject({ method: 'GET', url, headers: await as(role) });
const post = async (role: string, url: string, payload: object = {}) =>
  app.inject({ method: 'POST', url, headers: await as(role), payload });
const learning = async (role = 'domain_expert') =>
  (await get(role, '/api/learning')).json() as LearningOverview;

let memoryKey: string;
let figure: OutcomeReviewPayload['figures'][number];

beforeAll(async () => {
  principals = (await app.inject({ method: 'GET', url: '/api/auth/demo-principals' })).json().principals;
  const gsia = (await resolveInstitutionId(db, 'gsia-demo'))!;
  await withInstitution(db, gsia, (tx) =>
    tx.insert(cases).values({
      institutionId: gsia,
      key: CASE,
      title: 'Learning test: deferred commitments under a Hormuz shock (synthetic)',
      state: 'review',
      domain: 'Sovereign capital',
      sectorKey: 'capital',
      sensitivity: 'confidential',
      urgency: 'routine',
      dataMode: 'synthetic_demo',
      ownerPrincipalId: who('analyst').id,
      objective: 'Exercise the learning loop after a completed handoff.',
      summary: 'Synthetic test case.',
      whyItMatters: 'Phase 5D integration test.',
      unresolvedQuestions: [],
      confidence: { band: 'low', factors: [] },
      version: 1,
    }),
  );
  await post('analyst', '/api/scenarios', {
    caseKey: CASE,
    drivers: { durationDays: 21, capacityLostPct: 50, bypassMbd: 2.6, oilPriceShockPct: 30 },
  });
  const g: CaseGovernance = (await get('analyst', `/api/cases/${CASE}/governance`)).json();
  const option = g.candidateOptions.find(
    (o) => o.authority && !o.authority.twoPerson && o.authority.requiredRole === 'approver',
  )!;
  const rec = (
    await post('analyst', `/api/cases/${CASE}/recommendations`, { optionId: option.id, rationale: why })
  ).json().key;
  await post('domain_expert', `/api/recommendations/${rec}/reviews`, { verdict: 'endorse', rationale: why });
  const ho = (
    await post('approver', `/api/recommendations/${rec}/decisions`, { outcome: 'approve', rationale: why })
  ).json().handoffKey as string;
  await post('operations_owner', `/api/handoffs/${ho}/actions`, { action: 'acknowledge' });
  await post('operations_owner', `/api/handoffs/${ho}/actions`, { action: 'start' });
  await post('operations_owner', `/api/handoffs/${ho}/actions`, {
    action: 'record_outcome',
    outcome: 'New route-dependent commitments were deferred for the quarter.',
    lesson: 'Deferral bought time at little cost; revisit when transit data firm up.',
  });
  memoryKey = ((await get('analyst', `/api/cases/${CASE}/governance`)).json() as CaseGovernance).memory!.key;
  const p: OutcomeReviewPayload = (await get('analyst', `/api/memory/${memoryKey}/outcomes`)).json();
  figure = p.figures.find((f) => assumptionsBehind(f.ref).length > 0)!;
  expect(figure).toBeTruthy();
});
afterAll(async () => {
  await app.close();
  await close();
});

const review = (role: string, observedValue: number) =>
  post(role, `/api/memory/${memoryKey}/outcomes`, {
    figureRef: figure.ref,
    observedValue,
    observedOn: '2026-10-01',
    source: 'Quarterly portfolio valuation (synthetic)',
    note: 'Observed after the corridor reopened; one quarter of data.',
  });

describe('learning loop', () => {
  it('a held outcome proposes nothing; a missed one proposes a version of each assumption behind the figure', async () => {
    const held = await review('analyst', figure.expected.central);
    expect(held.json().proposals).toEqual([]);
    const missed = await review(
      'analyst',
      figure.expected.high + (figure.expected.high - figure.expected.low),
    );
    expect(missed.statusCode).toBe(201);
    const keys: string[] = missed.json().proposals;
    expect(keys.length).toBe(assumptionsBehind(figure.ref).length);
    // A second miss before any decision: its proposals are made against the same versions.
    const again = await review(
      'analyst',
      figure.expected.high + 3 * (figure.expected.high - figure.expected.low),
    );
    expect(again.json().proposals.length).toBe(keys.length);
    const l = await learning();
    const p = l.proposals.find((x) => x.key === keys[0])!;
    expect(p.status).toBe('proposed');
    expect(p.methodVersion).toBe('learning-loop 1.0.0');
    expect(p.basis).toContain('widened');
    expect(p.caseKey).toBe(CASE);
    const a = l.assumptions.find((x) => x.key === p.assumptionKey)!;
    expect(a.calibration.missed).toBeGreaterThanOrEqual(1);
    expect(a.calibration.held).toBeGreaterThanOrEqual(1);
  });

  it('only a domain expert decides, with a note; approval appends a new assumption version', async () => {
    const l = await learning();
    const p = l.proposals.find((x) => x.status === 'proposed' && x.caseKey === CASE)!;
    expect(
      (await post('analyst', `/api/learning/proposals/${p.key}/approve`, { note: 'Looks right to me.' }))
        .statusCode,
    ).toBe(403);
    expect(
      (await post('domain_expert', `/api/learning/proposals/${p.key}/approve`, { note: 'short' })).statusCode,
    ).toBe(400);
    const ok = await post('domain_expert', `/api/learning/proposals/${p.key}/approve`, {
      note: 'The miss is consistent with a wider valuation response (test).',
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().newVersion).toBe(p.currentVersion + 1);
    const after = await learning();
    const a = after.assumptions.find((x) => x.key === p.assumptionKey)!;
    expect(a.versions[0]!.version).toBe(p.currentVersion + 1);
    expect(a.versions[0]!.high).toBe(p.high);
    expect(a.versions.length).toBeGreaterThanOrEqual(2);
    // The scenario setup now uses the new version.
    const setup = (await get('analyst', '/api/scenarios/setup')).json();
    expect(JSON.stringify(setup)).toContain(`"version":${p.currentVersion + 1}`);
  });

  it('refuses a proposal made against a version that has since changed', async () => {
    const l = await learning();
    const approved = l.proposals.find((x) => x.status === 'approved' && x.caseKey === CASE)!;
    const stale = l.proposals.find(
      (x) =>
        x.status === 'proposed' &&
        x.assumptionKey === approved.assumptionKey &&
        x.baseVersion < x.currentVersion,
    )!;
    expect(stale).toBeTruthy();
    const res = await post('domain_expert', `/api/learning/proposals/${stale.key}/approve`, {
      note: 'Approving an outdated proposal (test).',
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('stale');
    // It can still be rejected, with a note.
    expect(
      (
        await post('domain_expert', `/api/learning/proposals/${stale.key}/reject`, {
          note: 'Superseded by the approved version (test).',
        })
      ).statusCode,
    ).toBe(200);
  });

  it('never lets the person who recorded the review decide its proposals', async () => {
    const mine = await review(
      'domain_expert',
      figure.expected.low - 5 * (figure.expected.high - figure.expected.low),
    );
    const key = (mine.json().proposals as string[])[0]!;
    const res = await post('domain_expert', `/api/learning/proposals/${key}/reject`, {
      note: 'Rejecting my own (test).',
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('own_review');
    const audit = JSON.stringify((await get('auditor', '/api/audit?action=learning.approved')).json());
    expect(audit).toContain('learning.approved');
  });
});
