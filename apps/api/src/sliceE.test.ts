// Slice E: entity and dependency explorer across sector workspaces. Entities are the shared graph; the positions and
// cases attached to them stay within each reader's clearance and workspaces. Runs as tigeris_app through the API.
import type { DemoPrincipal, EntityDetail, EntityListItem } from '@tigeris/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { config } from './config';
import { createDb, resolveInstitutionId, withInstitution } from './db/client';
import { principalRoles, principals, principalWorkspaces } from './db/schema';

const { db, close } = createDb(config.DATABASE_APP_URL, 3);
const app = await buildApp({ db, sessionSecret: config.SESSION_SECRET, demoInstitutionKey: 'gsia-demo' });
let demo: DemoPrincipal[];
let utilitiesAnalyst: Record<string, string>;

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

beforeAll(async () => {
  const gsia = (await resolveInstitutionId(db, 'gsia-demo'))!;
  demo = (await app.inject({ method: 'GET', url: '/api/auth/demo-principals' })).json().principals;
  const id = await withInstitution(db, gsia, async (tx) => {
    const [p] = await tx
      .insert(principals)
      .values({
        institutionId: gsia,
        displayName: 'Workspace-scoped analyst (slice E test)',
        title: 'Utilities analyst',
        idpIssuer: 'urn:tigeris:test',
        idpSubject: `test:sliceE:${Date.now().toString(36)}`,
        isDemo: false,
      })
      .returning({ id: principals.id });
    await tx.insert(principalRoles).values({ institutionId: gsia, principalId: p!.id, role: 'analyst' });
    await tx
      .insert(principalWorkspaces)
      .values({ institutionId: gsia, principalId: p!.id, sectorKey: 'utilities' });
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

describe('entity explorer (slice E)', () => {
  it('lists entities with their sector workspaces and dependency counts, and filters them', async () => {
    const analyst = await as('analyst');
    expect(await status({}, '/api/entities')).toBe(401);
    const all = await get<EntityListItem[]>(analyst, '/api/entities');
    const hormuz = all.find((e) => e.key === 'cp-hormuz')!;
    expect(hormuz.sectors).toEqual(expect.arrayContaining(['energy', 'supply_chain', 'utilities']));
    expect(hormuz.dependents).toBeGreaterThanOrEqual(5);
    const supply = await get<EntityListItem[]>(analyst, '/api/entities?sector=supply_chain');
    expect(supply.map((e) => e.key)).toContain('hold-logistics');
    expect(supply.map((e) => e.key)).not.toContain('term-ras-tanura');
    const ports = await get<EntityListItem[]>(analyst, '/api/entities?type=port&q=jebel');
    expect(ports.map((e) => e.key)).toEqual(['port-jebel-ali']);
  });

  it('walks what is exposed downstream of a chokepoint, keeping context links apart', async () => {
    const d = await get<EntityDetail>(await as('analyst'), '/api/entities/cp-hormuz');
    const hop = Object.fromEntries(d.downstream.map((s) => [s.node.key, s.hop]));
    expect(hop['term-ras-tanura']).toBe(1);
    expect(hop['com-lng']).toBe(1);
    expect(hop['hold-utility']).toBe(2);
    expect(hop['asset-desal']).toBe(3);
    expect(hop['svc-water']).toBe(4);
    expect(d.downstream.find((s) => s.node.key === 'hold-utility')).toMatchObject({ viaKey: 'com-lng' });
    expect(d.downstream.map((s) => s.node.key)).not.toContain('evt-msc-aries-seizure');
    expect(d.related.map((r) => r.node.key)).toContain('evt-msc-aries-seizure');
    expect(d.downstream.every((s) => s.edge.relationshipClass && s.edge.confidenceBand)).toBe(true);
  });

  it('walks upstream to what a holding relies on and lists its positions within clearance', async () => {
    const d = await get<EntityDetail>(await as('analyst'), '/api/entities/hold-utility');
    expect(d.upstream.map((s) => s.node.key)).toEqual(expect.arrayContaining(['com-lng', 'cp-hormuz']));
    expect(d.positions.positions.length).toBeGreaterThan(0);
    expect(d.positions.totals.rows).toBe(d.positions.positions.length);
  });

  it('keeps positions and cases on an entity within clearance and workspaces', async () => {
    const analystView = await get<EntityDetail>(await as('analyst'), '/api/entities/pf-gsia');
    expect(analystView.cases.map((c) => c.key)).toEqual(
      expect.arrayContaining(['HMZ-2024-0413', 'CAP-ALLOC-01']),
    );

    const ops = await get<EntityDetail>(await as('operations_owner'), '/api/entities/pf-gsia');
    expect(ops.cases.map((c) => c.key)).not.toContain('CAP-ALLOC-01');
    expect(ops.positions.positions.every((p) => p.provenance.classification !== 'confidential')).toBe(true);

    const scoped = await get<EntityDetail>(utilitiesAnalyst, '/api/entities/pf-gsia');
    expect(scoped.cases.map((c) => c.key)).not.toContain('HMZ-2024-0413');
    expect(scoped.positions.positions.every((p) => p.sectorKey === 'utilities' || p.sectorKey === null)).toBe(
      true,
    );
    expect(scoped.positions.positions.length).toBeLessThan(analystView.positions.positions.length);
  });

  it('answers 404 for unknown or malformed keys', async () => {
    const analyst = await as('analyst');
    expect(await status(analyst, '/api/entities/no-such-entity')).toBe(404);
    expect(await status(analyst, '/api/entities/DROP%20TABLE')).toBe(404);
  });
});
