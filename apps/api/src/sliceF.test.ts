// Slices F/G: agentic case analysis on the deterministic stub, scenario sensitivity, and reviewer notes with
// recorded disagreement that the decider must acknowledge. Runs as tigeris_app through the API, on its own case.
import type {
  AgentRunItem,
  AnalysisRunItem,
  CaseGovernance,
  DemoPrincipal,
  SensitivityPayload,
} from '@tigeris/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { config } from './config';
import { createDb, resolveInstitutionId, withInstitution } from './db/client';
import { cases, caseEntities, entities, reviewNotes } from './db/schema';

const { db, close } = createDb(config.DATABASE_APP_URL, 3);
const app = await buildApp({ db, sessionSecret: config.SESSION_SECRET, demoInstitutionKey: 'gsia-demo' });
const CASE = `ANA-${Date.now().toString(36).toUpperCase()}`;
const why = 'Recorded for the slice F/G integration test with enough words.';
let principals: DemoPrincipal[];
let gsia: string;
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
const get = async <T>(role: string, url: string) =>
  (await app.inject({ method: 'GET', url, headers: await as(role) })).json() as T;
const post = async (role: string, url: string, payload: object = {}) =>
  app.inject({ method: 'POST', url, headers: await as(role), payload });
type AnalysisPayload = {
  canRun: boolean;
  runs: AnalysisRunItem[];
  gateway: { active: string; external: { enabled: boolean } };
};

beforeAll(async () => {
  principals = (await app.inject({ method: 'GET', url: '/api/auth/demo-principals' })).json().principals;
  gsia = (await resolveInstitutionId(db, 'gsia-demo'))!;
  await withInstitution(db, gsia, async (tx) => {
    const [c] = await tx
      .insert(cases)
      .values({
        institutionId: gsia,
        key: CASE,
        title: 'Analysis test: utility exposure under a Hormuz shock (synthetic)',
        state: 'review',
        domain: 'Sovereign capital',
        sectorKey: 'capital',
        sensitivity: 'confidential',
        urgency: 'routine',
        dataMode: 'synthetic_demo',
        ownerPrincipalId: who('analyst').id,
        objective: 'Exercise case analysis, sensitivity and recorded disagreement.',
        summary: 'Synthetic test case.',
        whyItMatters: 'Slice F/G integration test.',
        unresolvedQuestions: [],
        confidence: { band: 'low', factors: [] },
        version: 1,
      })
      .returning({ id: cases.id });
    const [lng] = await tx.select().from(entities).where(eq(entities.key, 'com-lng'));
    await tx
      .insert(caseEntities)
      .values({ institutionId: gsia, caseId: c!.id, entityId: lng!.id, role: 'origin' });
  });
});
afterAll(async () => {
  await app.close();
  await close();
});

describe('case analysis (slice F, FR-34)', () => {
  it('reports gaps instead of answers where the case has no evidence or scenario', async () => {
    expect((await post('analyst', `/api/cases/${CASE}/analysis`)).statusCode).toBe(201);
    const { runs } = await get<AnalysisPayload>('analyst', `/api/cases/${CASE}/analysis`);
    const step = (k: string) => runs[0]!.steps.find((s) => s.agentKey === k)!;
    expect(runs[0]!.steps).toHaveLength(8);
    expect(step('evidence-retriever').status).toBe('gap');
    expect(step('evidence-retriever').text).toContain('no evidence is linked');
    expect(step('scenario-analyst').status).toBe('gap');
    expect(step('impact-tracer').status).toBe('completed');
    expect(step('impact-tracer').findings.join(' ')).toContain('Desalination plant');
  });

  it('answers every step from the latest scenario run, with every number cited', async () => {
    const run = await post('analyst', '/api/scenarios', {
      caseKey: CASE,
      drivers: { durationDays: 21, capacityLostPct: 50, bypassMbd: 2.6, oilPriceShockPct: 30 },
    });
    expect(run.statusCode).toBe(201);
    expect((await post('analyst', `/api/cases/${CASE}/analysis`)).statusCode).toBe(201);
    const { runs, gateway } = await get<AnalysisPayload>('analyst', `/api/cases/${CASE}/analysis`);
    const latest = runs[0]!;
    expect(latest.scenarioKey).toBe(run.json().key);
    expect(latest.steps.every((s) => s.grounding.passed && s.modelId === 'tigeris-stub')).toBe(true);
    const red = latest.steps.find((s) => s.agentKey === 'red-team-critic')!;
    expect(red.status).toBe('completed');
    expect(red.text).toContain('Valuation');
    expect(latest.steps.find((s) => s.agentKey === 'option-drafter')!.findings.length).toBeGreaterThan(1);
    expect(gateway.active).toBe('tigeris-stub');
    expect(gateway.external.enabled).toBe(false);

    const agentRuns = await get<AgentRunItem[]>('analyst', '/api/agent-runs');
    expect(agentRuns.filter((r) => r.task.startsWith(`Case analysis ${latest.key}`))).toHaveLength(8);
  });

  it('lets only analysts and experts start a run, and keeps runs within read scope', async () => {
    expect((await post('approver', `/api/cases/${CASE}/analysis`)).statusCode).toBe(403);
    expect((await post('operations_owner', `/api/cases/${CASE}/analysis`)).statusCode).toBe(404);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/cases/${CASE}/analysis`,
          headers: await as('operations_owner'),
        })
      ).statusCode,
    ).toBe(404);
    const opsRuns = await get<AgentRunItem[]>('operations_owner', '/api/agent-runs');
    expect(opsRuns.some((r) => r.caseKey === CASE)).toBe(false);
  });
});

describe('scenario sensitivity (slice G, FR-24)', () => {
  it('recomputes a stored run one input at a time, ordered by swing', async () => {
    const { runs } = await get<AnalysisPayload>('analyst', `/api/cases/${CASE}/analysis`);
    const s = await get<SensitivityPayload>('analyst', `/api/scenarios/${runs[0]!.scenarioKey}/sensitivity`);
    expect(s.metric.key).toBe('nav_at_risk_peak');
    expect(s.result.rows[0]!.ref).toBe('assumption:valuation_elasticity');
    expect(s.result.rows[0]!.label).not.toBe('valuation_elasticity');
    const fuel = await get<SensitivityPayload>(
      'analyst',
      `/api/scenarios/${runs[0]!.scenarioKey}/sensitivity?metric=utility_fuel_cost&horizon=y1`,
    );
    expect(fuel.result.rows[0]!.ref).toMatch(/fuel_cost_passthrough|oilPriceShockPct|durationDays/);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/scenarios/${runs[0]!.scenarioKey}/sensitivity`,
          headers: await as('operations_owner'),
        })
      ).statusCode,
    ).toBe(404);
  });
});

describe('reviewer notes and recorded disagreement (slice G, FR-24)', () => {
  let recKey: string;

  it('records notes append-only and lets authors add notes but not agree with themselves', async () => {
    const g = await get<CaseGovernance>('analyst', `/api/cases/${CASE}/governance`);
    const option = g.candidateOptions.find(
      (o) => o.authority && !o.authority.twoPerson && o.authority.requiredRole === 'approver',
    )!;
    const rec = await post('analyst', `/api/cases/${CASE}/recommendations`, {
      optionId: option.id,
      rationale: why,
    });
    expect(rec.statusCode).toBe(201);
    recKey = rec.json().key;

    expect(
      (await post('analyst', `/api/recommendations/${recKey}/notes`, { stance: 'agree', body: why }))
        .statusCode,
    ).toBe(409);
    expect(
      (await post('analyst', `/api/recommendations/${recKey}/notes`, { stance: 'note', body: why }))
        .statusCode,
    ).toBe(201);
    expect(
      (
        await post('domain_expert', `/api/recommendations/${recKey}/notes`, {
          stance: 'disagree',
          body: 'short',
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await post('administrator', `/api/recommendations/${recKey}/notes`, { stance: 'note', body: why }))
        .statusCode,
    ).toBe(404);
    const dissent = await post('auditor', `/api/recommendations/${recKey}/notes`, {
      stance: 'disagree',
      body: 'The valuation elasticity is assumed, not observed; the hedge size rests on it.',
    });
    expect(dissent.statusCode).toBe(201);

    await expect(
      withInstitution(db, gsia, (tx) => tx.update(reviewNotes).set({ body: 'Edited away after the fact.' })),
    ).rejects.toThrow(/permission denied/);
  });

  it('blocks approval until the decider acknowledges the disagreement, then records it', async () => {
    expect(
      (
        await post('domain_expert', `/api/recommendations/${recKey}/reviews`, {
          verdict: 'endorse',
          rationale: why,
        })
      ).statusCode,
    ).toBe(201);
    const g = await get<CaseGovernance>('approver', `/api/cases/${CASE}/governance`);
    expect(g.notes.filter((n) => n.stance === 'disagree')).toHaveLength(1);
    const dissentReason = g.decisionPreview!.approve.reasons.find((r) => r.code === 'dissent')!;
    expect(dissentReason.result).toBe('block');

    const blocked = await post('approver', `/api/recommendations/${recKey}/decisions`, {
      outcome: 'approve',
      rationale: why,
    });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().evaluation.reasons.map((r: { code: string }) => r.code)).toContain('dissent');

    const ok = await post('approver', `/api/recommendations/${recKey}/decisions`, {
      outcome: 'approve',
      rationale: why,
      acknowledgeDissent: true,
    });
    expect(ok.statusCode).toBe(201);
    const after = await get<CaseGovernance>('analyst', `/api/cases/${CASE}/governance`);
    const decision = after.recommendations.find((r) => r.key === recKey)!.decisions[0]!;
    expect(decision.reasons.find((r) => r.code === 'dissent')?.result).toBe('pass');
  });
});
