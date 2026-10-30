import type { AuthContext, CaseDetail, CommandCentre, DemoPrincipal } from '@tigeris/shared';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { verifyAuditChain } from './audit/audit';
import { config } from './config';
import { createDb, resolveInstitutionId, withInstitution } from './db/client';
import { auditEvents, evidenceObjects } from './db/schema';

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
  expect(res.statusCode).toBe(200);
  const cookie = res.cookies.find((c) => c.name === 'tigeris_session')!;
  return { principal: p, headers: { cookie: `tigeris_session=${cookie.value}` } };
}

beforeAll(async () => {
  const res = await app.inject({ method: 'GET', url: '/api/auth/demo-principals' });
  principals = res.json().principals;
});

afterAll(async () => {
  await app.close();
  await close();
});

describe('demo sign-in (FR-04, AC-01)', () => {
  it('lists the seven seeded demo roles of the fictional institution', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/demo-principals' });
    const body = res.json();
    expect(body.institution.name).toBe('Gulf Sovereign Investment Authority (Demo)');
    expect(body.principals.flatMap((p: DemoPrincipal) => p.roles).sort()).toEqual(
      [
        'administrator',
        'analyst',
        'approver',
        'auditor',
        'domain_expert',
        'executive',
        'operations_owner',
      ].sort(),
    );
  });

  it('rejects unauthenticated access to protected routes', async () => {
    for (const url of ['/api/auth/context', '/api/command-centre', '/api/cases', '/api/sources']) {
      expect((await app.inject({ method: 'GET', url })).statusCode).toBe(401);
    }
  });

  it('rejects a forged or tampered session cookie', async () => {
    const forged = {
      cookie: 'tigeris_session=' + encodeURIComponent('{"institutionId":"x","principalId":"y"}'),
    };
    expect((await app.inject({ method: 'GET', url: '/api/auth/context', headers: forged })).statusCode).toBe(
      401,
    );
  });

  it('refuses a principal from another institution', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/demo-session',
      payload: { principalId: '00000000-0000-4000-8000-000000000000' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns the persistent context: institution, role, environment and data modes', async () => {
    const { headers } = await signIn('approver');
    const ctx: AuthContext = (await app.inject({ method: 'GET', url: '/api/auth/context', headers })).json();
    expect(ctx.environment).toBe('demonstration');
    expect(ctx.principal.roles).toEqual(['approver']);
    expect(ctx.institution.isSynthetic).toBe(true);
    expect(ctx.dataModes).not.toContain('live');
  });
});

describe('command centre', () => {
  it('ranks items whose next step belongs to the caller first', async () => {
    const { headers } = await signIn('domain_expert');
    const cc: CommandCentre = (
      await app.inject({ method: 'GET', url: '/api/command-centre', headers })
    ).json();
    // Other test files add their own cases awaiting review in parallel, so assert the rule, not one position.
    expect(cc.attention.find((a) => a.ref === 'CAP-ALLOC-01')).toMatchObject({
      forYou: true,
      nextStepRole: 'domain_expert',
    });
    const firstOther = cc.attention.findIndex((a) => !a.forYou);
    const lastMine = cc.attention.map((a) => a.forYou).lastIndexOf(true);
    expect(firstOther === -1 || lastMine < firstOther).toBe(true);
    expect(cc.counts.awaitingReview).toBeGreaterThanOrEqual(1);
  });

  it('surfaces stale and unapproved sources with a reason', async () => {
    const { headers } = await signIn('administrator');
    const cc: CommandCentre = (
      await app.inject({ method: 'GET', url: '/api/command-centre', headers })
    ).json();
    expect(cc.counts.staleSources).toBe(1);
    const sources = cc.attention.filter((a) => a.kind === 'source');
    // Seeded stale or pending sources; other test files may add more. The EIA feed source is approved (D-98).
    expect(sources.map((s) => s.ref)).toEqual(
      expect.arrayContaining(['gcc-stat', 'ofac-sls', 'synthetic-movement']),
    );
    expect(sources.every((s) => s.forYou)).toBe(true);
  });

  it('never shows another institution', async () => {
    const { headers } = await signIn('analyst');
    const body = (await app.inject({ method: 'GET', url: '/api/command-centre', headers })).body;
    expect(body).not.toContain('NRI');
  });
});

describe('case workspace and lineage (FR-08, AC-03)', () => {
  it('returns the MSC Aries case with labelled, sourced evidence and a disputed crew count', async () => {
    const { headers } = await signIn('analyst');
    const res = await app.inject({ method: 'GET', url: '/api/cases/HMZ-2024-0413', headers });
    expect(res.statusCode).toBe(200);
    const c: CaseDetail = res.json();
    expect(c.state).toBe('analysis');
    expect(c.confidence.band).toBe('low');
    const facts = c.evidence.flatMap((e) => e.facts);
    expect(facts.every((f) => f.claimClass)).toBe(true);
    const crew = facts.filter((f) => f.predicate.startsWith('Crew aboard')).map((f) => f.valueNum);
    expect(crew.sort()).toEqual([24, 25]);
    expect(c.evidence.find((e) => e.validationStatus === 'disputed')).toBeTruthy();
    expect(c.evidence.every((e) => e.source.sourceClass && e.retrievedAt)).toBe(true);
  });

  it('answers 404 for a case that belongs to another institution', async () => {
    const { headers } = await signIn('analyst');
    expect((await app.inject({ method: 'GET', url: '/api/cases/NRI-TEST-01', headers })).statusCode).toBe(
      404,
    );
  });

  it('answers 404 for evidence that belongs to another institution', async () => {
    const nri = (await resolveInstitutionId(db, 'nri-test'))!;
    const [other] = await withInstitution(db, nri, (tx) =>
      tx.select({ id: evidenceObjects.id }).from(evidenceObjects),
    );
    const { headers } = await signIn('analyst');
    expect((await app.inject({ method: 'GET', url: `/api/evidence/${other!.id}`, headers })).statusCode).toBe(
      404,
    );
  });

  it('records case views in the verified audit chain', async () => {
    const { headers, principal } = await signIn('auditor');
    const c: CaseDetail = (await app.inject({ method: 'GET', url: '/api/cases/RES-EW-01', headers })).json();
    const gsia = (await resolveInstitutionId(db, 'gsia-demo'))!;
    const rows = await withInstitution(db, gsia, (tx) =>
      tx
        .select()
        .from(auditEvents)
        .where(and(eq(auditEvents.action, 'case.viewed'), eq(auditEvents.actorPrincipalId, principal.id))),
    );
    expect(rows.some((r) => r.objectId === c.id)).toBe(true);
    expect(await withInstitution(db, gsia, (tx) => verifyAuditChain(tx, gsia))).toBeNull();
  });
});

describe('command centre timestamps', () => {
  it('never invents a time for sources that were never retrieved', async () => {
    const { headers } = await signIn('administrator');
    const cc: CommandCentre = (
      await app.inject({ method: 'GET', url: '/api/command-centre', headers })
    ).json();
    const pending = cc.attention.filter((a) => a.ref === 'gcc-stat' || a.ref === 'ofac-sls');
    expect(pending.map((p) => p.updatedAt)).toEqual([null, null]);
  });
});
