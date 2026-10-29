import type {
  AgentRunItem,
  DemoPrincipal,
  ScenarioRunDetail,
  ScenarioRunSummary,
  ScenarioSetup,
} from '@tigeris/shared';
import { METRICS, SCENARIO_HORIZONS } from '@tigeris/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { config } from './config';
import { createDb, resolveInstitutionId, withInstitution } from './db/client';
import { agentRuns, assumptions, draftOptions, scenarioRuns } from './db/schema';
import { draft, groundingCheck } from './modules/gateway';

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

const drivers = { durationDays: 21, capacityLostPct: 50, bypassMbd: 2.6, oilPriceShockPct: 30 };

async function runScenario(
  headers: Record<string, string>,
  body: unknown = { caseKey: 'HMZ-2024-0413', drivers },
) {
  return app.inject({ method: 'POST', url: '/api/scenarios', headers, payload: body as object });
}

let runKey: string;

beforeAll(async () => {
  principals = (await app.inject({ method: 'GET', url: '/api/auth/demo-principals' })).json().principals;
  const res = await runScenario(await signIn('analyst'));
  expect(res.statusCode).toBe(201);
  runKey = res.json().key;
});
afterAll(async () => {
  await app.close();
  await close();
});

describe('scenario setup', () => {
  it('offers the Hormuz template, four drivers and the labelled assumption register', async () => {
    const setup: ScenarioSetup = (
      await app.inject({ method: 'GET', url: '/api/scenarios/setup', headers: await signIn('analyst') })
    ).json();
    expect(setup.template.key).toBe('hormuz-disruption');
    expect(setup.drivers.map((d) => d.key)).toEqual([
      'durationDays',
      'capacityLostPct',
      'bypassMbd',
      'oilPriceShockPct',
    ]);
    expect(setup.assumptions).toHaveLength(8);
    expect(
      setup.assumptions.every((a) => a.claimClass === 'assumed' && a.low <= a.central && a.central <= a.high),
    ).toBe(true);
    expect(setup.canRun).toBe(true);
  });

  it('tells non-analysts they cannot run scenarios', async () => {
    const setup: ScenarioSetup = (
      await app.inject({ method: 'GET', url: '/api/scenarios/setup', headers: await signIn('executive') })
    ).json();
    expect(setup.canRun).toBe(false);
  });
});

describe('scenario runs (FR-14..FR-18)', () => {
  it('only analysts can run a scenario', async () => {
    for (const role of ['executive', 'approver', 'auditor', 'domain_expert']) {
      expect((await runScenario(await signIn(role))).statusCode).toBe(403);
    }
  });

  it('rejects drivers outside their declared ranges', async () => {
    const res = await runScenario(await signIn('analyst'), {
      caseKey: 'HMZ-2024-0413',
      drivers: { ...drivers, capacityLostPct: 140 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns ranges for every metric and horizon, with lineage to inputs', async () => {
    const d: ScenarioRunDetail = (
      await app.inject({ method: 'GET', url: `/api/scenarios/${runKey}`, headers: await signIn('executive') })
    ).json();
    expect(d.dataMode).toBe('scenario');
    expect(d.caseKey).toBe('HMZ-2024-0413');
    expect(d.result.metrics).toHaveLength(METRICS.length);
    for (const m of d.result.metrics)
      for (const h of SCENARIO_HORIZONS) {
        const v = m.values[h.key];
        expect(v.low).toBeLessThanOrEqual(v.central);
        expect(v.central).toBeLessThanOrEqual(v.high);
      }
    // Every input reference a metric declares resolves to a stored input.
    const refs = new Set(d.inputs.map((i) => i.ref));
    for (const def of d.metricDefs) for (const ref of def.inputs) expect(refs.has(ref)).toBe(true);
    const eia = d.inputs.find((i) => i.ref === 'fact:hormuz_oil_flow')!;
    expect(eia.kind === 'evidence_fact' && eia.validationStatus).toBe('unverified');
    expect(d.warnings.some((w) => w.includes('unverified'))).toBe(true);
  });

  it('is reproducible from its stored inputs', async () => {
    const d: ScenarioRunDetail = (
      await app.inject({ method: 'GET', url: `/api/scenarios/${runKey}`, headers: await signIn('auditor') })
    ).json();
    expect(d.reproducible).toBe(true);
    expect(d.inputHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('drafts four ranked options for expert review, never approved', async () => {
    const d: ScenarioRunDetail = (
      await app.inject({ method: 'GET', url: `/api/scenarios/${runKey}`, headers: await signIn('approver') })
    ).json();
    expect(d.options.map((o) => o.rank)).toEqual([1, 2, 3, 4]);
    for (const o of d.options) {
      expect(o.status).toBe('draft');
      expect(o.authority?.requiresExpertReview).toBe(true);
      expect(o.authority?.selfApprovalBlocked).toBe(true);
      expect(['high', 'moderate', 'low', 'insufficient']).toContain(o.confidence.band);
      expect(o.summary).toMatch(/not a recommendation until reviewed/);
      expect(o.mandateChecks.find((m) => m.mandateKey === 'M-GOV-05')?.status).toBe('attention');
    }
  });

  it('records grounded specialist drafts made only by the internal stub', async () => {
    const d: ScenarioRunDetail = (
      await app.inject({ method: 'GET', url: `/api/scenarios/${runKey}`, headers: await signIn('analyst') })
    ).json();
    expect(d.agentRuns.length).toBe(9);
    for (const r of d.agentRuns) {
      expect(r.modelId).toBe('tigeris-stub');
      expect(r.external).toBe(false);
      expect(r.grounding.passed).toBe(true);
      expect(r.status).toBe('completed');
    }
    const all: AgentRunItem[] = (
      await app.inject({ method: 'GET', url: '/api/agent-runs', headers: await signIn('executive') })
    ).json();
    expect(all.some((r) => r.scenarioKey === runKey && r.agentKey === 'energy-impact')).toBe(true);
  });

  it('lists runs for a case and records the run on the case timeline', async () => {
    const headers = await signIn('analyst');
    const list: ScenarioRunSummary[] = (
      await app.inject({ method: 'GET', url: '/api/scenarios?case=HMZ-2024-0413', headers })
    ).json();
    expect(list.some((r) => r.key === runKey)).toBe(true);
    const kase = (await app.inject({ method: 'GET', url: '/api/cases/HMZ-2024-0413', headers })).json();
    expect(kase.events.some((e: { eventType: string }) => e.eventType === 'scenario.run_recorded')).toBe(
      true,
    );
    const stability = kase.confidence.factors.find(
      (f: { factor: string }) => f.factor === 'scenario_stability',
    );
    expect(stability.note).toContain(runKey);
  });

  it('keeps runs, options and agent runs append-only and assumptions read-only', async () => {
    const gsia = (await resolveInstitutionId(db, 'gsia-demo'))!;
    await expect(
      withInstitution(db, gsia, (tx) => tx.update(scenarioRuns).set({ title: 'x' })),
    ).rejects.toThrow(/permission denied/);
    await expect(withInstitution(db, gsia, (tx) => tx.delete(draftOptions))).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      withInstitution(db, gsia, (tx) => tx.update(agentRuns).set({ outputText: 'x' })),
    ).rejects.toThrow(/permission denied/);
    await expect(
      withInstitution(db, gsia, (tx) => tx.update(assumptions).set({ central: '9' })),
    ).rejects.toThrow(/permission denied/);
  });

  it('never shows one institution’s runs to another', async () => {
    const nri = (await resolveInstitutionId(db, 'nri-test'))!;
    const rows = await withInstitution(db, nri, (tx) => tx.select().from(scenarioRuns));
    expect(rows).toHaveLength(0);
  });

  it('refuses to record an external model call at the database', async () => {
    const gsia = (await resolveInstitutionId(db, 'gsia-demo'))!;
    const [existing] = await withInstitution(db, gsia, (tx) => tx.select().from(agentRuns).limit(1));
    const { id: _id, ...row } = existing!;
    await expect(
      withInstitution(db, gsia, (tx) => tx.insert(agentRuns).values({ ...row, external: true })),
    ).rejects.toThrow();
  });
});

describe('model gateway (D-14)', () => {
  it('refuses any model other than the internal stub', () => {
    const r = draft({
      templateKey: 'mandate-summary',
      citations: [{ ref: 'mandates:summary', label: 'x', display: 'ok' }],
      model: 'gpt-x',
    });
    expect(r.status).toBe('refused');
    expect(r.text).toBe('');
  });

  it('flags numbers that are not in the cited inputs', () => {
    const cited = [{ ref: 'a', label: 'a', display: '20.9 million b/d' }];
    expect(groundingCheck('Flow is 20.9 million b/d.', cited).passed).toBe(true);
    expect(groundingCheck('Flow is 21 million b/d.', cited).passed).toBe(false);
    expect(groundingCheck('Mandate M-RISK-02 applies.', cited).passed).toBe(true);
  });
});
