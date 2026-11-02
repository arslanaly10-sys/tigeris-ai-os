// Phase 5F: oil-price-shock template and scenario room. Runs attach to a case, use the positions the analyst may
// read and the oil assumptions in the register, are reproducible and kept apart from Hormuz runs; the room compares
// runs side by side; position detail follows the reader's scope. Runs as tigeris_app through the API.
import type { DemoPrincipal, ScenarioRoomPayload, TemplateRunDetail } from '@tigeris/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { config } from './config';
import { createDb } from './db/client';

const { db, close } = createDb(config.DATABASE_APP_URL, 3);
const app = await buildApp({ db, sessionSecret: config.SESSION_SECRET, demoInstitutionKey: 'gsia-demo' });
let principals: DemoPrincipal[];
const headers: Record<string, Record<string, string>> = {};
async function as(role: string) {
  if (headers[role]) return headers[role];
  const p = principals.find((x) => x.roles.includes(role as never))!;
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/demo-session',
    payload: { principalId: p.id },
  });
  const c = res.cookies.find((x) => x.name === 'tigeris_session')!;
  return (headers[role] = { cookie: `tigeris_session=${c.value}` });
}
const get = async (role: string, url: string) => app.inject({ method: 'GET', url, headers: await as(role) });
const post = async (role: string, url: string, payload: object = {}) =>
  app.inject({ method: 'POST', url, headers: await as(role), payload });
const CASE = 'HMZ-2024-0413';
let up: string;
let down: string;
let hormuz: string;

beforeAll(async () => {
  principals = (await app.inject({ method: 'GET', url: '/api/auth/demo-principals' })).json().principals;
});
afterAll(async () => {
  await app.close();
  await close();
});

describe('scenario templates', () => {
  it('describes both templates declaratively, with the oil assumptions from the register', async () => {
    const t = (await get('analyst', '/api/templates')).json();
    expect(t.templates.map((x: { key: string }) => x.key)).toEqual(['hormuz-disruption', 'oil-price-shock']);
    expect(t.canRun).toBe(true);
    const beta = t.oilAssumptions.find((a: { key: string }) => a.key === 'oil_beta_energy');
    expect(beta).toMatchObject({ central: 0.55, claimClass: 'assumed', version: 1 });
    // The Hormuz setup still lists only its own eight assumptions.
    expect((await get('analyst', '/api/scenarios/setup')).json().assumptions).toHaveLength(8);
  });

  it('only analysts run it, with drivers inside the template ranges, on a case they may read', async () => {
    const body = { caseKey: CASE, drivers: { oilPriceChangePct: 40, horizonMonths: 6 } };
    expect((await post('executive', '/api/templates/oil-price-shock/runs', body)).statusCode).toBe(403);
    expect(
      (
        await post('analyst', '/api/templates/oil-price-shock/runs', {
          ...body,
          drivers: { oilPriceChangePct: 900, horizonMonths: 6 },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await post('analyst', '/api/templates/oil-price-shock/runs', { ...body, caseKey: 'NOPE-01' }))
        .statusCode,
    ).toBe(404);
    const res = await post('analyst', '/api/templates/oil-price-shock/runs', body);
    expect(res.statusCode).toBe(201);
    up = res.json().key;
    down = (
      await post('analyst', '/api/templates/oil-price-shock/runs', {
        ...body,
        drivers: { oilPriceChangePct: -40, horizonMonths: 6 },
      })
    ).json().key;
  });

  it('records lineage: positions, assumption versions, engine version and intact hashes', async () => {
    const d = (await get('executive', `/api/templates/runs/${up}`)).json() as TemplateRunDetail;
    expect(d.engineVersion).toBe('oil-shock 1.0.0');
    expect(d.dataMode).toBe('scenario');
    expect(d.intact).toBe(true);
    expect(d.result.positions.length).toBeGreaterThan(0);
    expect(d.result.assumptionVersions.oil_beta_energy).toBe(1);
    expect(d.result.navImpactPct.low).toBeLessThanOrEqual(d.result.navImpactPct.central);
    expect(d.result.navImpactPct.central).toBeLessThanOrEqual(d.result.navImpactPct.high);
    expect(d.result.method).toContain('not a probability interval');
    const dn = (await get('executive', `/api/templates/runs/${down}`)).json() as TemplateRunDetail;
    expect(Math.sign(dn.result.navImpactPct.central)).toBe(-Math.sign(d.result.navImpactPct.central));
  });

  it('hides position rows a reader may not read, but keeps the totals', async () => {
    const full = (await get('executive', `/api/templates/runs/${up}`)).json() as TemplateRunDetail;
    const ops = await get('operations_owner', `/api/templates/runs/${up}`);
    if (ops.statusCode === 200) {
      const limited = ops.json() as TemplateRunDetail;
      expect(limited.result.navImpactPct).toEqual(full.result.navImpactPct);
      expect(limited.result.positions.length + limited.result.hiddenPositions).toBe(
        full.result.positions.length,
      );
    } else {
      expect(ops.statusCode).toBe(404); // The case itself is outside their scope.
    }
  });

  it('never mixes oil runs into the Hormuz run list or the governance path', async () => {
    const list = (await get('analyst', '/api/scenarios')).json() as { key: string }[];
    expect(list.some((r) => r.key === up)).toBe(false);
    const g = (await get('analyst', `/api/cases/${CASE}/governance`)).json();
    expect(String(g.latestRunKey ?? '')).not.toContain('TR-');
  });
});

describe('scenario room', () => {
  it('compares up to four runs side by side with ranges and engine versions', async () => {
    hormuz = (
      await post('analyst', '/api/scenarios', {
        caseKey: CASE,
        drivers: { durationDays: 21, capacityLostPct: 50, bypassMbd: 2.6, oilPriceShockPct: 30 },
      })
    ).json().key;
    const room = (
      await get('executive', `/api/scenario-room?keys=${up},${down},${hormuz},BAD-KEY`)
    ).json() as ScenarioRoomPayload;
    expect(room.runs.map((r) => r.key)).toEqual([up, down, hormuz]);
    const oil = room.runs[0]!;
    expect(oil.figures.find((f) => f.key === 'nav_impact_pct')).toBeTruthy();
    expect(oil.drivers.oilPriceChangePct).toBe(40);
    const h = room.runs[2]!;
    expect(h.templateKey).toBe('hormuz-disruption');
    expect(h.figures.find((f) => f.key === 'nav_at_risk_peak')!.low).toBeLessThanOrEqual(
      h.figures.find((f) => f.key === 'nav_at_risk_peak')!.high,
    );
    expect(room.available.some((a) => a.key === up)).toBe(true);
  });
});
