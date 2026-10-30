// Phase 5B: intervention engine and inbox. Approved watch rules raise interventions with their rule, inputs and
// lineage; a repeat sweep refreshes rather than duplicates; routing, read scope and human closure are enforced.
import type { DemoPrincipal, InterventionInbox, InterventionItem } from '@tigeris/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { config } from './config';
import { createDb } from './db/client';

const { db, close } = createDb(config.DATABASE_APP_URL, 3);
const app = await buildApp({ db, sessionSecret: config.SESSION_SECRET, demoInstitutionKey: 'gsia-demo' });
let demo: DemoPrincipal[];
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
const get = async (role: string, url: string) => app.inject({ method: 'GET', url, headers: await as(role) });
const post = async (role: string, url: string, payload: object = {}) =>
  app.inject({ method: 'POST', url, headers: await as(role), payload });
const inbox = async (role: string, query = '') =>
  (await get(role, `/api/interventions${query}`)).json() as InterventionInbox;

beforeAll(async () => {
  demo = (await app.inject({ method: 'GET', url: '/api/auth/demo-principals' })).json().principals;
});
afterAll(async () => {
  await app.close();
  await close();
});

describe('intervention engine', () => {
  it('the seeded sweep raised interventions naming their rule, version and inputs', async () => {
    const all = await inbox('executive', '?mine=false');
    expect(all.engine).toBe('intervention-engine 1.0.0');
    expect(all.lastSweepAt).not.toBeNull();
    const cpty = all.items.find((i) => i.subjectRef === 'rule:CPTY-LIMIT-01')!;
    expect(cpty.severity).toBe('breach');
    expect(cpty.ruleKey).toBe('W-RULES');
    expect(cpty.inputs.map((i) => i.ref)).toContain('rule:CPTY-LIMIT-01:v1');
    expect(cpty.inputs.map((i) => i.ref)).toContain('CP-S01');
    // The within rule raises nothing.
    expect(all.items.find((i) => i.subjectRef === 'rule:UTIL-FUEL-01')).toBeUndefined();
  });

  it('routes interventions to roles: the analyst sees untriaged signals, not rule breaches, by default', async () => {
    const mine = await inbox('analyst');
    expect(mine.items.every((i) => i.routedToMe)).toBe(true);
    expect(mine.items.some((i) => i.ruleKey === 'W-SIGNALS')).toBe(true);
    expect(mine.items.some((i) => i.ruleKey === 'W-RULES')).toBe(false);
  });

  it('a repeat sweep refreshes instead of duplicating', async () => {
    // Other test files may change what is observed, so settle once, then compare two back-to-back sweeps.
    await post('analyst', '/api/interventions/sweep');
    const before = (await inbox('executive', '?mine=false&status=all')).items.length;
    const res = await post('analyst', '/api/interventions/sweep');
    expect(res.statusCode).toBe(200);
    const r = res.json();
    expect(r.raised).toBe(0);
    expect(r.refreshed).toBeGreaterThan(0);
    expect((await inbox('executive', '?mine=false&status=all')).items.length).toBe(before);
  });

  it('keeps restricted-clearance readers out of confidential interventions', async () => {
    const ops = await inbox('operations_owner', '?mine=false&status=all');
    expect(ops.items.every((i) => i.classification !== 'confidential')).toBe(true);
  });

  it('only routed roles act; closing needs a reason; closed interventions cannot be reopened', async () => {
    const item: InterventionItem = (await inbox('executive')).items.find(
      (i) => i.subjectRef === 'rule:CPTY-LIMIT-01',
    )!;
    expect(
      (await post('analyst', `/api/interventions/${item.key}/act`, { action: 'acknowledge' })).statusCode,
    ).toBe(403);
    expect(
      (await post('executive', `/api/interventions/${item.key}/act`, { action: 'acknowledge' })).statusCode,
    ).toBe(200);
    expect(
      (await post('executive', `/api/interventions/${item.key}/act`, { action: 'resolve', reason: 'ok' }))
        .statusCode,
    ).toBe(400);
    const done = await post('executive', `/api/interventions/${item.key}/act`, {
      action: 'resolve',
      reason: 'Counterparty limit raised by the risk committee (test).',
    });
    expect(done.statusCode).toBe(200);
    const after = (await inbox('executive', '?mine=false&status=all')).items.find((i) => i.key === item.key)!;
    expect(after.status).toBe('resolved');
    expect(after.acknowledgedBy).toBeTruthy();
    expect(after.closedBy).toBeTruthy();
    expect(
      (
        await post('executive', `/api/interventions/${item.key}/act`, {
          action: 'dismiss',
          reason: 'Not needed now.',
        })
      ).statusCode,
    ).toBe(409);

    // The condition still holds, so the next sweep raises a new intervention rather than reopening the closed one.
    const r = (await post('analyst', '/api/interventions/sweep')).json();
    expect(r.raised).toBeGreaterThanOrEqual(1);
    const live = (await inbox('executive')).items.filter((i) => i.subjectRef === 'rule:CPTY-LIMIT-01');
    expect(live).toHaveLength(1);
    expect(live[0]!.key).not.toBe(item.key);
    const audit = JSON.stringify((await get('auditor', '/api/audit?action=intervention.resolved')).json());
    expect(audit).toContain(item.key);
  });
});

describe('watch rules', () => {
  it('lists the seeded rules and enforces drafting, parameters and second-person approval', async () => {
    const list = (await get('analyst', '/api/watch-rules')).json();
    expect(list.rules.map((r: { key: string }) => r.key)).toEqual(
      expect.arrayContaining(['W-RULES', 'W-SIGNALS', 'W-CONNECTORS', 'W-DRIFT', 'W-MONITOR']),
    );
    const body = {
      key: 'W-SIGNALS',
      label: 'Critical and elevated signals not triaged within 12 hours',
      kind: 'signal_untriaged',
      params: { urgencies: ['critical', 'elevated'], maxHours: 12 },
      severity: 'attention',
      routeRoles: ['analyst'],
      rationale: 'Tighter triage window proposed after the drill (test).',
    };
    expect((await post('operations_owner', '/api/watch-rules', body)).statusCode).toBe(403);
    expect(
      (await post('analyst', '/api/watch-rules', { ...body, params: { maxHours: -1 } })).statusCode,
    ).toBe(400);
    expect((await post('analyst', '/api/watch-rules', { ...body, params: { unknown: 1 } })).statusCode).toBe(
      400,
    );
    const draft = await post('domain_expert', '/api/watch-rules', body);
    expect(draft.statusCode).toBe(201);
    const v = draft.json().version;
    expect((await post('domain_expert', `/api/watch-rules/W-SIGNALS/${v}/approve`)).json().error).toBe(
      'self_approval',
    );
    expect((await post('executive', `/api/watch-rules/W-SIGNALS/${v}/approve`)).statusCode).toBe(200);
    const rules = (await get('analyst', '/api/watch-rules')).json().rules as {
      key: string;
      version: number;
      status: string;
    }[];
    expect(rules.find((r) => r.key === 'W-SIGNALS' && r.version === 1)!.status).toBe('retired');
    expect(rules.find((r) => r.key === 'W-SIGNALS' && r.version === v)!.status).toBe('approved');
    // Live interventions of the rule carry over to the new version (one per rule key and subject).
    const r = (await post('analyst', '/api/interventions/sweep')).json();
    const signalsLive = (await inbox('analyst')).items.filter((i) => i.ruleKey === 'W-SIGNALS');
    expect(new Set(signalsLive.map((i) => i.subjectRef)).size).toBe(signalsLive.length);
    expect(r.rules).toBe(5);
  });
});
