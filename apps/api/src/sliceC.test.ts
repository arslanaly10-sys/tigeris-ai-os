// Slice C: connector registry, source approval, file and document ingestion with row-level validation and
// provenance, and honest connector status. Runs as tigeris_app through the API.
import type {
  ConnectorItem,
  ConnectorRunDetail,
  DataQualitySummary,
  DemoPrincipal,
  DocumentItem,
  ManagerItem,
  PositionsPayload,
} from '@tigeris/shared';
import ExcelJS from 'exceljs';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { config } from './config';
import { createDb } from './db/client';

const { db, close } = createDb(config.DATABASE_APP_URL, 3);
const app = await buildApp({ db, sessionSecret: config.SESSION_SECRET, demoInstitutionKey: 'gsia-demo' });
let demo: DemoPrincipal[];
const sessions: Record<string, Record<string, string>> = {};
// Unique keys per run so the file can be re-run against the same database.
const tag = Date.now().toString(36).toUpperCase().slice(-5);

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
const get = async <T>(role: string, url: string) =>
  (await app.inject({ method: 'GET', url, headers: await as(role) })).json() as T;
const post = async (role: string, url: string, payload: object = {}) =>
  app.inject({ method: 'POST', url, headers: await as(role), payload });

async function upload(role: string, connector: string, dataset: string, name: string, body: Buffer | string) {
  const boundary = `----tigeris${Math.random().toString(16).slice(2)}`;
  const file = typeof body === 'string' ? Buffer.from(body) : body;
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="dataset"\r\n\r\n${dataset}\r\n`),
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
    ),
    file,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return app.inject({
    method: 'POST',
    url: `/api/connectors/${connector}/uploads`,
    headers: { ...(await as(role)), 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload,
  });
}

let connector: string;
const register = {
  provider: 'Institution portfolio system (test)',
  name: 'Quarterly positions export',
  connectionType: 'file',
  authType: 'none',
  datasets: ['positions', 'managers', 'due_diligence', 'documents'],
  sectorKey: 'energy',
  classification: 'restricted',
  sourceClass: 'client',
};

beforeAll(async () => {
  demo = (await app.inject({ method: 'GET', url: '/api/auth/demo-principals' })).json().principals;
});
afterAll(async () => {
  await app.close();
  await close();
});

describe('connector registry (FR-06)', () => {
  it('lists connectors within clearance and never shows a seeded feed as connected', async () => {
    const analyst = await get<ConnectorItem[]>('analyst', '/api/connectors');
    expect(analyst.map((c) => c.key)).toEqual(expect.arrayContaining(['CON-SAMPLE-01', 'CON-EIA-RSS']));
    const feed = analyst.find((c) => c.key === 'CON-EIA-RSS')!;
    expect(feed.status).not.toBe('connected');
    // The owner approved the feed's source (D-98); it still never shows as connected until a fetch succeeds.
    expect(feed.source.approvalStatus).toBe('approved');
    expect(feed.status).toBe('configured');
    const ops = await get<ConnectorItem[]>('operations_owner', '/api/connectors');
    expect(ops.map((c) => c.key)).not.toContain('CON-SAMPLE-01');
  });

  it('lets only administrators register, and refuses secrets in place of a credential reference', async () => {
    expect((await post('analyst', '/api/connectors', register)).statusCode).toBe(403);
    const secret = await post('administrator', '/api/connectors', {
      ...register,
      connectionType: 'rest',
      authType: 'api_key',
      authRef: 'sk-live-123456',
      endpoint: 'https://example.org/api',
    });
    expect(secret.statusCode).toBe(400);
    expect(JSON.stringify(secret.json())).toContain('never a secret value');
    const res = await post('administrator', '/api/connectors', register);
    expect(res.statusCode).toBe(201);
    connector = res.json().key;
    expect(connector).toMatch(/^CON-\d{8}-\d{2}$/);
  });
});

describe('source approval gates ingestion (TR-001)', () => {
  it('refuses an import until the source is approved', async () => {
    const res = await upload('administrator', connector, 'positions', 'p.csv', 'key,name\n');
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe('source_not_approved');
    expect((await post('analyst', `/api/sources/${connector.toLowerCase()}/approve`)).statusCode).toBe(403);
    expect((await post('administrator', `/api/sources/${connector.toLowerCase()}/approve`)).statusCode).toBe(
      200,
    );
    expect((await post('administrator', `/api/sources/${connector.toLowerCase()}/approve`)).statusCode).toBe(
      409,
    );
  });
});

describe('file ingestion with row-level validation (FR-10, AC-02, AC-05)', () => {
  const header =
    'key,name,asset_class,sector,country,currency,market_value,nav_share_pct,route_dependent,as_of';
  let runKey: string;

  it('accepts valid rows, rejects bad ones with row numbers, and keeps provenance', async () => {
    const csv = [
      header,
      `T${tag}-1,Terminal stake (test),Infrastructure equity,energy,AE,USD,1200,1.2,true,2026-09-30`,
      `T${tag}-2,Overweight (test),Listed equity,energy,AE,USD,10,140,false,2026-09-30`,
      `T${tag}-1,Duplicate (test),Listed equity,energy,AE,USD,10,1,false,2026-09-30`,
    ].join('\n');
    const res = await upload('administrator', connector, 'positions', 'positions.csv', csv);
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ status: 'partial', rowsTotal: 3, rowsAccepted: 1, rowsRejected: 2 });
    runKey = res.json().runKey;

    const run = await get<ConnectorRunDetail>('auditor', `/api/connector-runs/${runKey}`);
    expect(run.file).toMatchObject({ name: 'positions.csv', mediaType: 'text/csv' });
    expect(run.file!.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(run.issues.map((i) => [i.row, i.field, i.code])).toEqual(
      expect.arrayContaining([
        [3, 'nav_share_pct', 'above_maximum'],
        [4, 'key', 'duplicate_in_file'],
      ]),
    );
    expect(run.acceptedKeys).toEqual([`T${tag}-1@2026-09-30`]);

    const pos = await get<PositionsPayload>('analyst', `/api/positions?connector=${connector}`);
    expect(pos.positions).toHaveLength(1);
    expect(pos.positions[0]!.provenance).toMatchObject({
      recordMode: 'imported',
      classification: 'restricted',
      connectorKey: connector,
      runKey,
      mappingVersion: 'positions.csv.v1',
      qualityStatus: 'valid',
    });
  });

  it('treats a re-import of the same rows as a failed run, never a silent overwrite', async () => {
    const csv = `${header}\nT${tag}-1,Terminal stake (test),Infrastructure equity,energy,AE,USD,1200,1.2,true,2026-09-30`;
    const res = await upload('administrator', connector, 'positions', 'again.csv', csv);
    expect(res.json()).toMatchObject({ status: 'failed', rowsAccepted: 0 });
    const run = await get<ConnectorRunDetail>('auditor', `/api/connector-runs/${res.json().runKey}`);
    expect(run.issues[0]).toMatchObject({ row: 2, code: 'already_imported' });
  });

  it('imports JSON and XLSX, and checks references across datasets', async () => {
    const managers = JSON.stringify([
      {
        key: `M${tag}`,
        name: 'Harbour Credit (test)',
        strategy: 'Maritime credit',
        domicile: 'LU',
        sector: 'supply_chain',
      },
    ]);
    expect(
      (await upload('administrator', connector, 'managers', 'managers.json', managers)).json(),
    ).toMatchObject({ status: 'succeeded', rowsAccepted: 1 });
    const m = await get<ManagerItem[]>('analyst', `/api/managers?connector=${connector}`);
    expect(m[0]!.provenance.mappingVersion).toBe('managers.csv.v1');

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('dd');
    ws.addRow(['key', 'manager_key', 'review_type', 'status', 'open_issues', 'summary', 'reviewed_on']);
    ws.addRow([
      `D${tag}-1`,
      `M${tag}`,
      'Operational due diligence',
      'completed',
      0,
      'Clean review (test).',
      '2026-08-01',
    ]);
    ws.addRow([`D${tag}-2`, 'NO-SUCH-MANAGER', 'Risk due diligence', 'in_progress', 1, 'Orphan (test).', '']);
    const xlsx = Buffer.from(await wb.xlsx.writeBuffer());
    const res = await upload('administrator', connector, 'due_diligence', 'dd.xlsx', xlsx);
    expect(res.json()).toMatchObject({ status: 'partial', rowsAccepted: 1, rowsRejected: 1 });
    const run = await get<ConnectorRunDetail>('auditor', `/api/connector-runs/${res.json().runKey}`);
    expect(run.issues.map((i) => i.code)).toContain('unknown_reference');
  });

  it('refuses a missing-column file as a whole and reports it at the header row', async () => {
    const res = await upload('administrator', connector, 'positions', 'thin.csv', 'key,name\nX1,n');
    expect(res.json()).toMatchObject({ status: 'failed', rowsAccepted: 0 });
    const run = await get<ConnectorRunDetail>('auditor', `/api/connector-runs/${res.json().runKey}`);
    expect(run.issues.find((i) => i.code === 'missing_columns')).toMatchObject({ row: 1, severity: 'error' });
  });
});

describe('documents and file safety (TR-061)', () => {
  it('extracts text from documents and keeps the file hash', async () => {
    const res = await upload(
      'administrator',
      connector,
      'documents',
      'Transit note.txt',
      'Hormuz transit note (test). Insurance premiums rose.',
    );
    expect(res.json()).toMatchObject({ status: 'succeeded', rowsAccepted: 1 });
    const docs = await get<DocumentItem[]>('analyst', '/api/documents');
    const d = docs.find((x) => x.provenance.runKey === res.json().runKey)!;
    expect(d).toMatchObject({
      title: 'Transit note',
      excerpt: expect.stringContaining('Insurance premiums'),
    });
    expect(d.file.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('extracts text and page count from a PDF', async () => {
    const pdf = await readFile(new URL('./connectors/__fixtures__/note.pdf', import.meta.url));
    const res = await upload('administrator', connector, 'documents', 'War-risk note.pdf', pdf);
    expect(res.json()).toMatchObject({ status: 'succeeded' });
    const d = (await get<DocumentItem[]>('analyst', '/api/documents')).find(
      (x) => x.provenance.runKey === res.json().runKey,
    )!;
    expect(d).toMatchObject({ pageCount: 1, file: { mediaType: 'application/pdf' } });
    expect(d.excerpt).toContain('Premiums for Gulf transits rose');
  });

  it('refuses unsupported types and files whose content does not match the extension', async () => {
    const exe = await upload('administrator', connector, 'documents', 'tool.exe', 'MZ');
    expect(exe.json().error).toBe('unsupported_type');
    const fakePdf = await upload('administrator', connector, 'documents', 'fake.pdf', 'just text');
    expect(fakePdf.json().error).toBe('content_mismatch');
    const wrong = await upload('administrator', connector, 'positions', 'note.txt', 'text');
    expect(wrong.json().error).toBe('wrong_kind');
  });

  it('lets only administrators import', async () => {
    expect((await upload('operations_owner', connector, 'documents', 'x.txt', 'x')).statusCode).toBe(403);
  });
});

describe('connector status is earned, not set (AC-16)', () => {
  it('marks an unreachable feed failed with the real error, and backs off', async () => {
    const res = await post('administrator', '/api/connectors', {
      ...register,
      name: 'Unreachable feed (test)',
      connectionType: 'rss',
      endpoint: 'https://127.0.0.1:9/feed.xml',
      datasets: ['signals'],
      classification: 'internal',
      sourceClass: 'public',
    });
    const key = res.json().key as string;
    const t = await post('administrator', `/api/connectors/${key}/test`);
    expect(t.json().status).toBe('failed');
    expect(t.json().message).toContain('Could not reach 127.0.0.1');
    const sync = await post('administrator', `/api/connectors/${key}/sync`);
    expect(sync.json()).toMatchObject({ status: 'failed', created: 0 });
    expect(sync.json().error).toContain('not approved');
    const c = (await get<ConnectorItem[]>('administrator', '/api/connectors')).find((x) => x.key === key)!;
    expect(c.status).toBe('failed');
    expect(c.retryCount).toBe(1);
    expect(c.nextRetryAt).not.toBeNull();
  });

  it('pauses and retires, and a retired connector stays retired', async () => {
    expect(
      (await post('administrator', `/api/connectors/${connector}/status`, { status: 'paused' })).statusCode,
    ).toBe(200);
    const paused = await upload('administrator', connector, 'documents', 'x.txt', 'x');
    expect(paused.json().error).toBe('connector_inactive');
    expect(
      (await post('administrator', `/api/connectors/${connector}/status`, { status: 'retired' })).statusCode,
    ).toBe(200);
    expect(
      (await post('administrator', `/api/connectors/${connector}/status`, { status: 'configured' }))
        .statusCode,
    ).toBe(409);
  });

  it('offers a sample template for each tabular dataset', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/templates/positions',
      headers: await as('analyst'),
    });
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.body.split('\n')[0]).toBe(
      'key,name,asset_class,sector,country,currency,market_value,nav_share_pct,route_dependent,as_of',
    );
  });
});

describe('data quality view (slice D)', () => {
  it('summarizes quality and mode per dataset within scope, problem runs and pending sources', async () => {
    const q = await get<DataQualitySummary>('auditor', '/api/data-quality');
    const pos = q.datasets.find((d) => d.dataset === 'positions')!;
    expect(pos.byMode.synthetic).toBe(16);
    expect(pos.byMode.imported ?? 0).toBeGreaterThan(0);
    expect(q.runs.partial + q.runs.failed).toBeGreaterThan(0);
    expect(q.recentProblemRuns.length).toBeGreaterThan(0);
    expect(q.sources.pending.map((s) => s.key)).not.toContain('con-eia-rss');
    const ops = await get<DataQualitySummary>('operations_owner', '/api/data-quality');
    expect(ops.datasets.find((d) => d.dataset === 'positions')!.byMode.synthetic ?? 0).toBe(0);
  });
});
