// Slice K: sector datasets imported through the connector framework feed versioned, deterministic sector indicators,
// each naming the records it used, within the reader's clearance. Runs as tigeris_app through the API.
import type { DemoPrincipal, SectorDetail } from '@tigeris/shared';
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
async function upload(connector: string, dataset: string, csv: string) {
  const boundary = `----tigeris${Math.random().toString(16).slice(2)}`;
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="dataset"\r\n\r\n${dataset}\r\n`),
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${dataset}.csv"\r\nContent-Type: text/csv\r\n\r\n`,
    ),
    Buffer.from(csv),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return app.inject({
    method: 'POST',
    url: `/api/connectors/${connector}/uploads`,
    headers: { ...(await as('administrator')), 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload,
  });
}
async function connector(name: string, classification: string, datasets: string[]) {
  const res = await post('administrator', '/api/connectors', {
    provider: 'Utility operations system (test)',
    name,
    connectionType: 'file',
    authType: 'none',
    datasets,
    classification,
    sourceClass: 'client',
  });
  expect(res.statusCode).toBe(201);
  const key: string = res.json().key;
  expect((await post('administrator', `/api/sources/${key.toLowerCase()}/approve`)).statusCode).toBe(200);
  return key;
}
const indicator = (s: SectorDetail, key: string) =>
  s.models.flatMap((m) => m.indicators).find((i) => i.key === key)!;
const tag = Date.now().toString(36).toUpperCase();

beforeAll(async () => {
  demo = (await app.inject({ method: 'GET', url: '/api/auth/demo-principals' })).json().principals;
});
afterAll(async () => {
  await app.close();
  await close();
});

describe('sector datasets and models (slice K)', () => {
  it('offers a template per sector dataset and computes the labelled samples, marked as samples (D-98)', async () => {
    const tpl = await get('administrator', '/api/templates/supplier_tiers');
    expect(tpl.statusCode).toBe(200);
    expect(tpl.body.split('\n')[0]).toBe('key,supplier,tier,critical_input,single_source,share_pct,as_of');
    const s: SectorDetail = (await get('analyst', '/api/sectors/manufacturing')).json();
    const m = s.models.find((x) => x.dataset === 'supplier_tiers')!;
    expect(m.version).toBe('sector-models 1.0.0');
    expect(m.modes).toEqual(['sample']);
    expect(indicator(s, 'single_source_inputs')).toMatchObject({
      value: 2,
      drivingKeys: ['SUP-S01', 'SUP-S03'],
    });
    expect(indicator(s, 'tier1_concentration')).toMatchObject({ value: 72, drivingKeys: ['SUP-S01'] });
  });

  it('imports sector records with provenance and computes indicators naming their records', async () => {
    const key = await connector(`Utility assets (test ${tag})`, 'restricted', ['utility_assets']);
    const csv = [
      'key,name,asset_type,capacity_mw,fuel_buffer_days,gas_dependent,as_of',
      `UA-${tag}-1,Coastal power (test),power,700,9,true,2026-09-30`,
      `UA-${tag}-2,Desalination A (test),desalination,300,4,true,2026-09-30`,
      `UA-${tag}-3,Solar park (test),power,1000,0,false,2026-09-30`,
      `UA-${tag}-4,Broken row (test),reactor,10,1,true,2026-09-30`,
    ].join('\n');
    const res = await upload(key, 'utility_assets', csv);
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ status: 'partial', rowsAccepted: 3, rowsRejected: 1 });

    const s: SectorDetail = (await get('analyst', '/api/sectors/utilities')).json();
    const min = indicator(s, 'min_fuel_buffer');
    expect(min.value).toBeLessThanOrEqual(4);
    expect(min.drivingKeys.length).toBeGreaterThan(0);
    expect(min.inputKeys).toEqual(expect.arrayContaining([`UA-${tag}-1`, `UA-${tag}-2`, `UA-${tag}-3`]));
    const m = s.models.find((x) => x.dataset === 'utility_assets')!;
    expect(m.records).toBeGreaterThanOrEqual(3);
    expect(m.modes).toContain('imported');
  });

  it('computes only from records the reader is cleared to see', async () => {
    const key = await connector(`Counterparties (test ${tag})`, 'confidential', ['counterparty_exposures']);
    const csv = [
      'key,counterparty,country,exposure_usd,limit_usd,as_of',
      `CP-${tag}-1,Bank A (test),AE,60,50,2026-09-30`,
      `CP-${tag}-2,Bank B (test),SA,40,50,2026-09-30`,
    ].join('\n');
    expect((await upload(key, 'counterparty_exposures', csv)).json().rowsAccepted).toBe(2);
    const analyst: SectorDetail = (await get('analyst', '/api/sectors/banking')).json();
    expect(indicator(analyst, 'over_limit').drivingKeys).toContain(`CP-${tag}-1`);
    const ops: SectorDetail = (await get('operations_owner', '/api/sectors/banking')).json();
    expect(indicator(ops, 'over_limit').inputKeys).not.toContain(`CP-${tag}-1`);
  });

  it('keeps sector records immutable: the same key and date is refused, a later date is a new record', async () => {
    const key = await connector(`Utility assets again (test ${tag})`, 'restricted', ['utility_assets']);
    const head = 'key,name,asset_type,capacity_mw,fuel_buffer_days,gas_dependent,as_of';
    const dup = await upload(
      key,
      'utility_assets',
      `${head}\nUA-${tag}-1,Coastal power (test),power,700,9,true,2026-09-30`,
    );
    expect(dup.json()).toMatchObject({ rowsAccepted: 0, rowsRejected: 1 });
    const later = await upload(
      key,
      'utility_assets',
      `${head}\nUA-${tag}-1,Coastal power (test),power,700,6,true,2026-10-15`,
    );
    expect(later.json().rowsAccepted).toBe(1);
  });
});
