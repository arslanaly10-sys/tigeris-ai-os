// Live data (D-127, slice L1). The network is stubbed with short bodies in each provider's documented format, so this
// tests the pipeline (fetch, parse, store, label), not the providers. Nothing here is presented as real data.
import type { DemoPrincipal, LiveFeedItem } from '@tigeris/shared';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from './app';
import { config } from './config';
import { createDb } from './db/client';

const { db, close } = createDb(config.DATABASE_APP_URL, 2);
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
const live = async (role = 'analyst') =>
  (await app.inject({ method: 'GET', url: '/api/live', headers: await as(role) })).json() as LiveFeedItem[];
const sync = async (key: string, role = 'administrator') =>
  app.inject({ method: 'POST', url: `/api/connectors/${key}/sync`, headers: await as(role), payload: {} });
const respond = (body: string, status = 200) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(body, { status })),
  );

beforeAll(async () => {
  demo = (await app.inject({ method: 'GET', url: '/api/auth/demo-principals' })).json().principals;
});
afterEach(() => vi.unstubAllGlobals());
afterAll(async () => {
  await app.close();
  await close();
});

describe('live data (D-127)', () => {
  it('lists the public feeds as configured, with nothing labelled Live before a fetch', async () => {
    const feeds = await live();
    const keys = feeds.map((f) => f.connectorKey);
    expect(keys).toEqual(
      expect.arrayContaining([
        'CON-FRED-OIL',
        'CON-PORTWATCH-HORMUZ',
        'CON-EIA-SPOT',
        'CON-ECB-FX',
        'CON-WB-ENERGY',
      ]),
    );
    const eia = feeds.find((f) => f.connectorKey === 'CON-EIA-SPOT')!;
    if (!process.env.EIA_API_KEY) expect(eia.needsCredential).toBe('EIA_API_KEY');
    for (const f of feeds.filter((x) => !x.lastSuccessAt)) {
      expect(f.freshness).toBeNull();
      expect(f.series).toEqual([]);
    }
  });

  it('stores fetched values with observation date, fetch time and run, and labels them Live', async () => {
    expect((await sync('CON-FRED-OIL', 'analyst')).statusCode).toBe(403);
    respond('observation_date,DCOILBRENTEU,DCOILWTICO\n2026-10-30,70.1,66.2\n2026-10-31,.,66.9\n');
    const res = await sync('CON-FRED-OIL');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'succeeded', fetched: 3, created: 3 });
    const fred = (await live()).find((f) => f.connectorKey === 'CON-FRED-OIL')!;
    expect(fred.status).toBe('connected');
    expect(fred.freshness).toBe('live');
    const brent = fred.series.find((s) => s.seriesKey === 'DCOILBRENTEU')!;
    expect(brent.latest).toMatchObject({ observedOn: '2026-10-30', value: 70.1, revised: false });
    expect(brent.latest.runKey).toMatch(/^RUN-/);
    expect(brent.unit).toBe('USD per barrel');
    const wti = fred.series.find((s) => s.seriesKey === 'DCOILWTICO')!;
    expect(wti.latest.observedOn).toBe('2026-10-31');
    expect(wti.count).toBe(2);
  });

  it('records a provider revision instead of duplicating the date', async () => {
    respond('observation_date,DCOILBRENTEU\n2026-10-30,70.4\n');
    expect((await sync('CON-FRED-OIL')).json()).toMatchObject({ status: 'succeeded', created: 0 });
    const brent = (await live())
      .find((f) => f.connectorKey === 'CON-FRED-OIL')!
      .series.find((s) => s.seriesKey === 'DCOILBRENTEU')!;
    expect(brent.latest).toMatchObject({ value: 70.4, revised: true });
    expect(brent.count).toBe(1);
  });

  it('fails clearly, and is never Live, when the response is not what the connector declares', async () => {
    respond(JSON.stringify({ features: [{ attributes: { date: Date.UTC(2026, 9, 31), portname: 'X' } }] }));
    const res = await sync('CON-PORTWATCH-HORMUZ');
    expect(res.json()).toMatchObject({ status: 'failed' });
    expect(res.json().error).toContain('ArcGIS response has no field(s)');
    const pw = (await live()).find((f) => f.connectorKey === 'CON-PORTWATCH-HORMUZ')!;
    expect(pw.status).toBe('failed');
    expect(pw.freshness).toBeNull();
    expect(pw.series).toEqual([]);
  });

  it('reports a blocked host as a failed fetch, not as data', async () => {
    respond('<html>denied</html>', 403);
    const res = await sync('CON-ECB-FX');
    expect(res.json()).toMatchObject({ status: 'failed' });
    expect(res.json().error).toContain('HTTP 403');
  });

  it('refuses the EIA feed until its key is set, without calling the provider', async () => {
    if (process.env.EIA_API_KEY) return;
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const res = await sync('CON-EIA-SPOT');
    expect(res.json()).toMatchObject({ status: 'failed' });
    expect(res.json().error).toContain('EIA_API_KEY');
    expect(f).not.toHaveBeenCalled();
  });
});
