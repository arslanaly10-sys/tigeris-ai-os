// Phase 5E: desks, validation tasking and roll-up. A finding is put to desks and people with a due date; only those
// assigned answer, never the requester; answers keep their assumptions; the roll-up counts without averaging; overdue
// requests reach the intervention inbox; requests follow the scope of their case. Runs as tigeris_app.
import type {
  DemoPrincipal,
  DivisionItem,
  InterventionInbox,
  ValidationBatch,
  ValidationRequestItem,
} from '@tigeris/shared';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { config } from './config';
import { createDb, resolveInstitutionId, withInstitution } from './db/client';
import { createDb as ownerDb } from './db/client';

const { db, close } = createDb(config.DATABASE_APP_URL, 3);
const app = await buildApp({ db, sessionSecret: config.SESSION_SECRET, demoInstitutionKey: 'gsia-demo' });
let principals: DemoPrincipal[];
const headers: Record<string, Record<string, string>> = {};
const who = (role: string) => principals.find((p) => p.roles.includes(role as never))!;
async function as(role: string) {
  if (headers[role]) return headers[role];
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/demo-session',
    payload: { principalId: who(role).id },
  });
  const c = res.cookies.find((x) => x.name === 'tigeris_session')!;
  return (headers[role] = { cookie: `tigeris_session=${c.value}` });
}
const get = async (role: string, url: string) => app.inject({ method: 'GET', url, headers: await as(role) });
const post = async (role: string, url: string, payload: object = {}) =>
  app.inject({ method: 'POST', url, headers: await as(role), payload });
const inFuture = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const CASE = 'HMZ-2024-0413';
let batch: { batchKey: string; keys: string[] };

beforeAll(async () => {
  principals = (await app.inject({ method: 'GET', url: '/api/auth/demo-principals' })).json().principals;
});
afterAll(async () => {
  await app.close();
  await close();
});

describe('desks', () => {
  it('lists the Executive Office, the Investment Committee and five desks under it, with members', async () => {
    const desks = (await get('analyst', '/api/desks')).json() as DivisionItem[];
    expect(desks.map((d) => d.key)).toEqual(
      expect.arrayContaining(['EXEC', 'IC', 'PUB', 'PE', 'INFRA', 'RE', 'CREDIT']),
    );
    expect(desks.find((d) => d.key === 'IC')!.parentKey).toBe('EXEC');
    expect(desks.filter((d) => d.kind === 'desk').every((d) => d.parentKey === 'IC')).toBe(true);
    expect(desks.find((d) => d.key === 'INFRA')!.members.length).toBeGreaterThan(0);
  });
});

describe('validation requests', () => {
  it('asks two desks about a case; refuses unknown findings, past dates and self-assignment', async () => {
    const body = {
      subjectType: 'case',
      subjectKey: CASE,
      question: 'Does the bypass ramp-up assumption still hold for your book?',
      dueOn: inFuture(7),
      deskKeys: ['INFRA', 'CREDIT'],
    };
    expect((await post('operations_owner', '/api/validation', body)).statusCode).toBe(403);
    expect((await post('approver', '/api/validation', { ...body, subjectKey: 'NOPE-0000' })).statusCode).toBe(
      404,
    );
    expect((await post('approver', '/api/validation', { ...body, dueOn: '2020-01-01' })).statusCode).toBe(
      400,
    );
    expect(
      (
        await post('approver', '/api/validation', {
          ...body,
          deskKeys: [],
          principalIds: [who('approver').id],
        })
      ).json().error,
    ).toBe('self_assigned');
    const res = await post('approver', '/api/validation', body);
    expect(res.statusCode).toBe(201);
    batch = res.json();
    expect(batch.keys).toHaveLength(2);
  });

  it('only desk members answer, never the requester, and answers keep their assumptions', async () => {
    const mine = (await get('domain_expert', '/api/validation')).json().requests as ValidationRequestItem[];
    const infra = mine.find((r) => r.batchKey === batch.batchKey && r.assignee.key === 'INFRA')!;
    expect(infra.canAnswer).toBe(true);
    expect(infra.state).toBe('open');
    const answer = {
      verdict: 'disputed',
      response: 'Pipeline bypass ramps slower than assumed for our assets; see the operator notice.',
      assumptions: [
        { label: 'Bypass ramp-up', value: '21 days', basis: 'Operator maintenance notice (synthetic).' },
      ],
    };
    expect((await post('executive', `/api/validation/${infra.key}/answer`, answer)).json().error).toBe(
      'not_assigned',
    );
    expect(
      (await post('domain_expert', `/api/validation/${infra.key}/answer`, { ...answer, response: 'no' }))
        .statusCode,
    ).toBe(400);
    expect((await post('domain_expert', `/api/validation/${infra.key}/answer`, answer)).statusCode).toBe(200);
    expect((await post('domain_expert', `/api/validation/${infra.key}/answer`, answer)).statusCode).toBe(409);

    const credit = (await get('analyst', '/api/validation'))
      .json()
      .requests.find(
        (r: ValidationRequestItem) => r.batchKey === batch.batchKey && r.assignee.key === 'CREDIT',
      ) as ValidationRequestItem;
    await post('analyst', `/api/validation/${credit.key}/answer`, {
      verdict: 'confirmed',
      response: 'Counterparty exposure moves within the assumed range for our book.',
      assumptions: [],
    });
  });

  it('rolls answers up side by side with counts and never an average', async () => {
    const rollup = (await get('executive', '/api/validation/rollup')).json() as ValidationBatch[];
    const b = rollup.find((x) => x.batchKey === batch.batchKey)!;
    expect(b.counts).toMatchObject({ confirmed: 1, disputed: 1, pending: 0 });
    expect(b.counts.summary).toContain('Answers differ');
    const infra = b.requests.find((r) => r.assignee.key === 'INFRA')!;
    expect(infra.assumptions[0]).toMatchObject({ label: 'Bypass ramp-up', value: '21 days' });
    expect(infra.answeredBy).toBeTruthy();
  });

  it('the requester may withdraw an open request with a reason; nobody else may', async () => {
    const res = await post('approver', '/api/validation', {
      subjectType: 'case',
      subjectKey: CASE,
      question: 'Is the real estate exposure to the corridor material?',
      dueOn: inFuture(3),
      deskKeys: ['RE'],
    });
    const key = res.json().keys[0] as string;
    expect(
      (await post('executive', `/api/validation/${key}/withdraw`, { reason: 'Not needed any more (test).' }))
        .statusCode,
    ).toBe(403);
    expect(
      (
        await post('approver', `/api/validation/${key}/withdraw`, {
          reason: 'Superseded by the committee paper (test).',
        })
      ).statusCode,
    ).toBe(200);
  });

  it('an overdue request reaches the intervention inbox through W-VALIDATION', async () => {
    const res = await post('approver', '/api/validation', {
      subjectType: 'case',
      subjectKey: CASE,
      question: 'Does private equity see second-order effects on portfolio companies?',
      dueOn: inFuture(1),
      deskKeys: ['PE'],
    });
    const key = res.json().keys[0] as string;
    // Move the due date into the past directly (owner connection), as time passing would.
    const owner = ownerDb(config.DATABASE_OWNER_URL, 1);
    const gsia = (await resolveInstitutionId(owner.db, 'gsia-demo'))!;
    await withInstitution(owner.db, gsia, (tx) =>
      tx.execute(sql`update validation_requests set due_on = current_date - 2 where key = ${key}`),
    );
    await owner.close();
    await post('analyst', '/api/interventions/sweep');
    const inbox = (await get('executive', '/api/interventions')).json() as InterventionInbox;
    const item = inbox.items.find((i) => i.subjectRef === `validation:${key}`)!;
    expect(item.ruleKey).toBe('W-VALIDATION');
    expect(item.title).toContain('overdue by 2 days');
    const listed = (await get('approver', '/api/validation'))
      .json()
      .requests.find((r: ValidationRequestItem) => r.key === key);
    expect(listed.state).toBe('overdue');
  });

  it('keeps requests about a confidential case from readers without that clearance', async () => {
    const res = await post('approver', '/api/validation', {
      subjectType: 'case',
      subjectKey: 'CAP-ALLOC-01',
      question: 'Is the reallocation within the credit desk appetite?',
      dueOn: inFuture(5),
      deskKeys: ['CREDIT'],
    });
    expect(res.statusCode).toBe(201);
    const confidential = res.json().batchKey as string;
    const ops = (await get('operations_owner', '/api/validation?mine=false')).json()
      .requests as ValidationRequestItem[];
    expect(ops.find((r) => r.batchKey === confidential)).toBeUndefined();
    expect(ops.find((r) => r.batchKey === batch.batchKey)).toBeDefined(); // restricted case: within clearance
    const exec = (await get('executive', '/api/validation?mine=false')).json()
      .requests as ValidationRequestItem[];
    expect(exec.find((r) => r.batchKey === confidential)).toBeDefined();
  });
});
