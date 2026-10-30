// Phase 5C: decision guardrails. A guardrail recorded from an approved decision is enforced by decision-policy 1.2.0
// on later approvals of the same action class; it is lifted, never edited, by another executive with a reason.
import type { CaseGovernance, DemoPrincipal, GuardrailItem } from '@tigeris/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { config } from './config';
import { createDb, resolveInstitutionId, withInstitution } from './db/client';
import { cases } from './db/schema';

const { db, close } = createDb(config.DATABASE_APP_URL, 3);
const app = await buildApp({ db, sessionSecret: config.SESSION_SECRET, demoInstitutionKey: 'gsia-demo' });
const tag = Date.now().toString(36).toUpperCase();
const why = 'Hedge the energy exposure while the strait is disrupted (test rationale).';
let principals: DemoPrincipal[];
const headers: Record<string, Record<string, string>> = {};
const who = (role: string) => principals.find((p) => p.roles.includes(role as never))!;
async function as(role: string) {
  if (headers[role]) return headers[role];
  const res = await app.inject({ method: 'POST', url: '/api/auth/demo-session', payload: { principalId: who(role).id } });
  const c = res.cookies.find((x) => x.name === 'tigeris_session')!;
  return (headers[role] = { cookie: `tigeris_session=${c.value}` });
}
const post = async (role: string, url: string, payload: object = {}) =>
  app.inject({ method: 'POST', url, headers: await as(role), payload });
const get = async (role: string, url: string) => app.inject({ method: 'GET', url, headers: await as(role) });
const governance = async (role: string, key: string) =>
  (await get(role, `/api/cases/${key}/governance`)).json() as CaseGovernance;

async function newCase(key: string) {
  const gsia = (await resolveInstitutionId(db, 'gsia-demo'))!;
  await withInstitution(db, gsia, (tx) =>
    tx.insert(cases).values({
      institutionId: gsia,
      key,
      title: 'Guardrail test: capital response under a Hormuz shock (synthetic)',
      state: 'review',
      domain: 'Sovereign capital',
      sensitivity: 'confidential',
      urgency: 'routine',
      dataMode: 'synthetic_demo',
      ownerPrincipalId: who('analyst').id,
      objective: 'Exercise decision guardrails end to end.',
      summary: 'Synthetic test case.',
      whyItMatters: 'Guardrail integration test.',
      unresolvedQuestions: [],
      confidence: { band: 'low', factors: [] },
      version: 1,
    }),
  );
}

/** Runs a scenario, recommends the hedge and has it endorsed; returns the recommendation key. */
async function endorsedHedge(key: string) {
  await newCase(key);
  const run = await post('analyst', '/api/scenarios', {
    caseKey: key,
    drivers: { durationDays: 21, capacityLostPct: 50, bypassMbd: 2.6, oilPriceShockPct: 30 },
  });
  expect(run.statusCode).toBe(201);
  const g = await governance('analyst', key);
  const hedge = g.candidateOptions.find((o) => o.actionClass === 'Hedge exposure')!;
  const rec = await post('analyst', `/api/cases/${key}/recommendations`, { optionId: hedge.id, rationale: why });
  expect(rec.statusCode).toBe(201);
  const recKey: string = rec.json().key;
  expect(
    (await post('domain_expert', `/api/recommendations/${recKey}/reviews`, { verdict: 'endorse', rationale: why }))
      .statusCode,
  ).toBe(201);
  return recKey;
}

const FIRST = `GR1-${tag}`;
const SECOND = `GR2-${tag}`;
let approverDecision: string;
let executiveDecision: string;

beforeAll(async () => {
  principals = (await app.inject({ method: 'GET', url: '/api/auth/demo-principals' })).json().principals;
  const recKey = await endorsedHedge(FIRST);
  const a = await post('approver', `/api/recommendations/${recKey}/decisions`, { outcome: 'approve', rationale: why });
  expect(a.statusCode).toBe(201);
  approverDecision = a.json().key;
  const e = await post('executive', `/api/recommendations/${recKey}/decisions`, { outcome: 'approve', rationale: why });
  expect(e.statusCode).toBe(201);
  executiveDecision = e.json().key;
});
afterAll(async () => {
  await app.close();
  await close();
});

describe('guardrails', () => {
  it('only the executive or the decision approver records one, and only from an approval', async () => {
    const body = {
      effect: 'require_role',
      requiredRole: 'executive',
      statement: 'No further hedging without the Executive while the strait is disrupted.',
    };
    expect((await post('analyst', `/api/decisions/${executiveDecision}/guardrails`, body)).statusCode).toBe(403);
    expect(
      (await post('executive', `/api/decisions/${executiveDecision}/guardrails`, { ...body, requiredRole: undefined }))
        .statusCode,
    ).toBe(400);
    const res = await post('executive', `/api/decisions/${executiveDecision}/guardrails`, body);
    expect(res.statusCode).toBe(201);
    expect(res.json().actionClass).toBe('Hedge exposure');
  });

  it('decision-policy 1.2.0 enforces the guardrail on a later decision of the same action class', async () => {
    const recKey = await endorsedHedge(SECOND);
    const g = await governance('approver', SECOND);
    const approve = g.decisionPreview!.approve;
    expect(approve.version).toBe('decision-policy 1.2.0');
    const reason = approve.reasons.find((r) => r.code === 'guardrail')!;
    expect(reason.result).toBe('block');
    expect(reason.text).toContain('requires the Executive / Governor');
    const blocked = await post('approver', `/api/recommendations/${recKey}/decisions`, {
      outcome: 'approve',
      rationale: why,
    });
    expect(blocked.statusCode).toBe(409);
    const ex = (await governance('executive', SECOND)).decisionPreview!.approve;
    expect(ex.reasons.find((r) => r.code === 'guardrail')!.result).toBe('pass');
  });

  it('lists guardrails with their source, and only another executive lifts one, with a reason', async () => {
    const mine = await post('approver', `/api/decisions/${approverDecision}/guardrails`, {
      effect: 'block',
      thresholdValue: 1_000_000_000,
      thresholdUnit: 'USD',
      statement: 'No hedge above USD 1 billion until the review closes.',
      expiresOn: '2099-12-31',
    });
    expect(mine.statusCode).toBe(201);
    const key: string = mine.json().key;
    const list = (await get('auditor', '/api/guardrails')).json() as { guardrails: GuardrailItem[] };
    const g = list.guardrails.find((x) => x.key === key)!;
    expect(g.status).toBe('active');
    expect(g.decisionKey).toBe(approverDecision);
    expect(g.threshold).toEqual({ value: 1_000_000_000, unit: 'USD' });

    expect((await post('approver', `/api/guardrails/${key}/lift`, { reason: 'Review closed (test).' })).statusCode).toBe(
      403,
    );
    expect((await post('executive', `/api/guardrails/${key}/lift`, { reason: 'short' })).statusCode).toBe(400);
    expect(
      (await post('executive', `/api/guardrails/${key}/lift`, { reason: 'Review closed; limit no longer needed (test).' }))
        .statusCode,
    ).toBe(200);
    const after = ((await get('auditor', '/api/guardrails')).json() as { guardrails: GuardrailItem[] }).guardrails.find(
      (x) => x.key === key,
    )!;
    expect(after.status).toBe('lifted');
    expect(after.liftReason).toContain('Review closed');
    // The executive cannot lift the guardrail they recorded themselves.
    const own = ((await get('auditor', '/api/guardrails')).json() as { guardrails: GuardrailItem[] }).guardrails.find(
      (x) => x.decisionKey === executiveDecision,
    )!;
    expect((await post('executive', `/api/guardrails/${own.key}/lift`, { reason: 'Lifting my own guardrail (test).' })).json().error).toBe(
      'self_lift',
    );
  });
});
