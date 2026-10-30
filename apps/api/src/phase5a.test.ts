// Phase 5A: semantic registry. Definitions and codified rules are versioned and approved by a second person; approved
// rules are evaluated deterministically with lineage; the approved registry exports as JSON-LD. Runs as tigeris_app.
import type { DemoPrincipal, ScenarioRunDetail, SemanticRegistry } from '@tigeris/shared';
import { sql } from 'drizzle-orm';
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
const registry = async (role = 'analyst') => (await get(role, '/api/semantic')).json() as SemanticRegistry;

beforeAll(async () => {
  demo = (await app.inject({ method: 'GET', url: '/api/auth/demo-principals' })).json().principals;
});
afterAll(async () => {
  await app.close();
  await close();
});

describe('semantic registry', () => {
  it('lists system definitions with their engine version and the seeded codified mandate rules', async () => {
    const reg = await registry();
    expect(reg.version).toBe('semantic-rules 1.0.0');
    const fuel = reg.definitions.find((d) => d.key === 'situation:fuel_buffer_days')!;
    expect(fuel.origin).toBe('system');
    expect(fuel.version).toBeTruthy();
    expect(reg.definitions.find((d) => d.key === 'sector:utility_assets:min_fuel_buffer')?.unit).toBeTruthy();
    const keys = reg.rules.filter((r) => r.status === 'approved').map((r) => r.key);
    expect(keys).toEqual(
      expect.arrayContaining(['M-RISK-02', 'M-RISK-03', 'M-RES-04', 'UTIL-FUEL-01', 'CPTY-LIMIT-01']),
    );
    expect(reg.rules.every((r) => r.claimClass === 'synthetic')).toBe(true);
  });

  it('evaluates approved rules with the value, its source and the records that produced it', async () => {
    const reg = await registry();
    const util = reg.rules.find((r) => r.key === 'UTIL-FUEL-01')!;
    expect(util.evaluation).not.toBeNull();
    expect(util.evaluation!.observedFrom).toContain('Sector models');
    if (util.evaluation!.status !== 'not_evaluable')
      expect(util.evaluation!.inputKeys.length).toBeGreaterThan(0);
    for (const r of reg.rules.filter((x) => x.evaluation && x.evaluation.status !== 'not_evaluable')) {
      expect(r.evaluation!.value).not.toBeNull();
      expect(r.evaluation!.version).toBe('semantic-rules 1.0.0');
      expect(r.evaluation!.observedFrom).toBeTruthy();
    }
  });

  it("evaluates situation rules from the latest scenario run, agreeing with that run's mandate checks", async () => {
    const run = await post('analyst', '/api/scenarios', {
      caseKey: 'HMZ-2024-0413',
      drivers: { durationDays: 21, capacityLostPct: 50, bypassMbd: 2.6, oilPriceShockPct: 30 },
    });
    expect(run.statusCode).toBe(201);
    const reg = await registry();
    for (const key of ['M-RISK-02', 'M-RISK-03']) {
      const rule = reg.rules.find((r) => r.key === key && r.status === 'approved')!;
      const ev = rule.evaluation!;
      expect(ev.status).not.toBe('not_evaluable');
      const runKey = ev.inputKeys[0]!;
      expect(ev.observedFrom).toBe(`Scenario run ${runKey}`);
      const detail: ScenarioRunDetail = (await get('analyst', `/api/scenarios/${runKey}`)).json();
      const check = detail.options[0]!.mandateChecks.find((m) => m.mandateKey === key)!;
      expect(check.status).toBe(ev.status === 'breach' ? 'breach' : 'within');
    }
  });

  it('refuses authoring by roles without authority and keys reserved for system definitions', async () => {
    const def = {
      key: 'term:essential_plant',
      kind: 'term',
      label: 'Essential plant',
      description: 'A power or water plant serving a population centre with no alternative supply.',
      ownerRole: 'domain_expert',
    };
    expect((await post('operations_owner', '/api/semantic/definitions', def)).statusCode).toBe(403);
    expect(
      (await post('analyst', '/api/semantic/definitions', { ...def, key: 'sector:x:y' })).statusCode,
    ).toBe(409);
    expect(
      (await post('analyst', '/api/semantic/definitions', { ...def, description: 'short' })).statusCode,
    ).toBe(400);
  });

  it('versions a rule: a draft by one person, approved by another, retiring the previous version', async () => {
    const body = {
      key: 'M-RISK-03',
      label: 'Energy and shipping concentration (tighter)',
      subject: 'situation:exposed_nav_share_pct',
      operator: '<=',
      threshold: 18,
      attentionMargin: 0.1,
      mandateKey: 'M-RISK-03',
      rationale: 'Proposed tighter cap following the concentration review (test).',
      claimClass: 'synthetic',
    };
    const draft = await post('analyst', '/api/semantic/rules', body);
    expect(draft.statusCode).toBe(201);
    const { version } = draft.json() as { version: number };
    expect(version).toBe(2);

    // Drafts are not evaluated and do not replace the approved version.
    let reg = await registry();
    const v2 = reg.rules.find((r) => r.key === 'M-RISK-03' && r.version === 2)!;
    expect(v2.status).toBe('draft');
    expect(v2.evaluation).toBeNull();
    expect(v2.unit).toBe('% of NAV');

    expect((await post('analyst', `/api/semantic/rules/M-RISK-03/${version}/approve`)).statusCode).toBe(403);
    const ok = await post('domain_expert', `/api/semantic/rules/M-RISK-03/${version}/approve`);
    expect(ok.statusCode).toBe(200);
    reg = await registry();
    const versions = reg.rules.filter((r) => r.key === 'M-RISK-03');
    expect(versions.find((r) => r.version === 1)!.status).toBe('retired');
    const approved = versions.find((r) => r.version === 2)!;
    expect(approved.status).toBe('approved');
    expect(approved.approvedBy).toBeTruthy();
    expect(approved.createdBy).not.toBe(approved.approvedBy);
    expect((await post('domain_expert', `/api/semantic/rules/M-RISK-03/${version}/approve`)).statusCode).toBe(
      409,
    );
  });

  it('never lets the author approve their own version', async () => {
    const res = await post('domain_expert', '/api/semantic/definitions', {
      key: 'term:essential_plant',
      kind: 'term',
      label: 'Essential plant',
      description: 'A power or water plant serving a population centre with no alternative supply.',
      ownerRole: 'domain_expert',
      jurisdiction: 'Demo jurisdiction A',
    });
    expect(res.statusCode).toBe(201);
    const self = await post('domain_expert', '/api/semantic/definitions/term:essential_plant/1/approve');
    expect(self.statusCode).toBe(403);
    expect(self.json().error).toBe('self_approval');
    expect(
      (await post('executive', '/api/semantic/definitions/term:essential_plant/1/approve')).statusCode,
    ).toBe(200);
  });

  it('only lets a rule judge a known metric', async () => {
    const res = await post('analyst', '/api/semantic/rules', {
      key: 'TEST-UNKNOWN',
      label: 'Unknown subject',
      subject: 'term:essential_plant',
      operator: '<=',
      threshold: 1,
      rationale: 'A term is not a measure and cannot be judged.',
    });
    expect(res.statusCode).toBe(422);
  });

  it('exports approved content as JSON-LD with the published vocabulary, and audits the export', async () => {
    expect((await get('operations_owner', '/api/semantic/export')).statusCode).toBe(403);
    const res = await get('auditor', '/api/semantic/export');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/ld+json');
    const doc = res.json();
    expect(doc['@context'].tg).toBe('urn:tigeris:vocab:');
    expect(doc.rules.every((r: { status: string }) => r.status === 'approved')).toBe(true);
    expect(JSON.stringify(doc)).not.toContain('approvedBy');
    const audit = (await get('auditor', '/api/audit?action=semantic.exported')).json();
    expect(JSON.stringify(audit)).toContain('semantic.exported');
    const vocab = (await get('analyst', '/api/semantic/vocab')).json();
    expect(vocab['@context'].skos).toContain('skos');
  });

  it('keeps each institution to its own registry', async () => {
    // The registry query runs under row-level security; a second institution has no seeded semantic rows.
    // Without app.institution_id set, forced RLS returns nothing to tigeris_app.
    const [row] = await db.execute<{ n: number }>(sql`select count(*)::int as n from semantic_rules`);
    expect(row!.n).toBe(0);
  });
});
