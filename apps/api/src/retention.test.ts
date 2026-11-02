// Data retention (D-126): only an administrator sets a policy (30 days at least, with a reason) or purges; the purge
// removes only rows past their policy within the caller's institution, and both actions are audited.
import type { DemoPrincipal, RetentionOverview } from '@tigeris/shared';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { config } from './config';
import { createDb, resolveInstitutionId } from './db/client';

const { db, close } = createDb(config.DATABASE_APP_URL, 2);
const owner = createDb(config.DATABASE_OWNER_URL, 1);
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
const call = async (role: string, method: 'GET' | 'POST', url: string, payload?: object) =>
  app.inject({ method, url, headers: await as(role), payload });

/** As the owner, inside the institution's scope (RLS is forced on the owner too). */
async function asOwner<T>(fn: (tx: Parameters<Parameters<typeof owner.db.transaction>[0]>[0]) => Promise<T>) {
  const gsia = await resolveInstitutionId(db, 'gsia-demo');
  return owner.db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.institution_id', ${gsia}, true)`);
    return fn(tx);
  });
}

beforeAll(async () => {
  demo = (await app.inject({ method: 'GET', url: '/api/auth/demo-principals' })).json().principals;
});
afterAll(async () => {
  await app.close();
  await close();
  await owner.close();
});

describe('data retention', () => {
  it('only an administrator sets a policy, with a reason and at least 30 days', async () => {
    const body = { keepDays: 90, reason: 'Pilot: closed interventions kept one quarter.' };
    expect(
      (await call('analyst', 'POST', '/api/admin/retention/closed_interventions', body)).statusCode,
    ).toBe(403);
    expect(
      (
        await call('administrator', 'POST', '/api/admin/retention/closed_interventions', {
          ...body,
          keepDays: 7,
        })
      ).statusCode,
    ).toBe(400);
    expect((await call('administrator', 'POST', '/api/admin/retention/audit_events', body)).statusCode).toBe(
      404,
    );
    expect(
      (await call('administrator', 'POST', '/api/admin/retention/closed_interventions', body)).statusCode,
    ).toBe(200);
    const o = (await call('auditor', 'GET', '/api/admin/retention')).json() as RetentionOverview;
    const p = o.policies.find((x) => x.dataClass === 'closed_interventions')!;
    expect(p.keepDays).toBe(90);
    expect(o.canManage).toBe(false);
    expect(o.policies.find((x) => x.dataClass === 'import_row_issues')!.keepDays).toBeNull();
  });

  it('purges only closed interventions past the policy, and audits the purge', async () => {
    // Close one intervention 200 days ago (past the 90-day policy); open ones are never in scope.
    const old = await asOwner(async (tx) => {
      const [r] = await tx.execute<{ key: string }>(sql`
        update interventions set status = 'resolved', closed_at = now() - interval '200 days',
               closed_by = (select id from principals limit 1), close_reason = 'Fixture closed for the retention test.'
         where id = (select id from interventions order by key limit 1)
         returning key`);
      return r!.key;
    });
    const before = (await call('administrator', 'GET', '/api/admin/retention')).json() as RetentionOverview;
    const openBefore = await asOwner(
      async (tx) =>
        (
          await tx.execute<{ n: number }>(
            sql`select count(*)::int n from interventions where status in ('open','acknowledged')`,
          )
        )[0]!.n,
    );
    expect(before.policies.find((x) => x.dataClass === 'closed_interventions')!.eligibleNow).toBeGreaterThan(
      0,
    );

    expect(
      (await call('analyst', 'POST', '/api/admin/retention/purge', { reason: 'Quarterly retention run.' }))
        .statusCode,
    ).toBe(403);
    expect((await call('administrator', 'POST', '/api/admin/retention/purge', {})).statusCode).toBe(400);
    const res = await call('administrator', 'POST', '/api/admin/retention/purge', {
      reason: 'Quarterly retention run.',
    });
    expect(res.statusCode).toBe(200);
    const { purged } = res.json() as { purged: Record<string, number> };
    expect(purged.closed_interventions).toBeGreaterThan(0);
    expect(purged.import_row_issues).toBe(0); // no policy set for it

    const gone = await asOwner(
      async (tx) =>
        (
          await tx.execute<{ n: number }>(sql`select count(*)::int n from interventions where key = ${old}`)
        )[0]!.n,
    );
    expect(gone).toBe(0);
    const openAfter = await asOwner(
      async (tx) =>
        (
          await tx.execute<{ n: number }>(
            sql`select count(*)::int n from interventions where status in ('open','acknowledged')`,
          )
        )[0]!.n,
    );
    expect(openAfter).toBe(openBefore);
    const audit = JSON.stringify((await call('auditor', 'GET', '/api/audit?action=retention.purged')).json());
    expect(audit).toContain('Quarterly retention run.');
  });

  it('the application role cannot delete directly; only the purge function can', async () => {
    const gsia = await resolveInstitutionId(db, 'gsia-demo');
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.institution_id', ${gsia}, true)`);
        await tx.execute(sql`delete from interventions`);
      }),
    ).rejects.toThrow(/permission denied/);
  });
});
