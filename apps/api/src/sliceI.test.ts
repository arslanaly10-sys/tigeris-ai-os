// Slice I: overdue governed steps on the command centre, and the governance-ready case report with export
// authorization and audit. Runs as tigeris_app through the API, on its own case.
import { createHash } from 'node:crypto';
import type { AuditPage, CaseGovernance, CaseReport, CommandCentre, DemoPrincipal } from '@tigeris/shared';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { canonicalJson } from './audit/audit';
import { config } from './config';
import { createDb, resolveInstitutionId, withInstitution } from './db/client';
import { cases, recommendations } from './db/schema';

const { db, close } = createDb(config.DATABASE_APP_URL, 3);
const owner = createDb(config.DATABASE_OWNER_URL, 1);
const app = await buildApp({ db, sessionSecret: config.SESSION_SECRET, demoInstitutionKey: 'gsia-demo' });
const CASE = `RPT-${Date.now().toString(36).toUpperCase()}`;
const why = 'Recorded for the slice I integration test with enough words.';
let principals: DemoPrincipal[];
let recKey: string;
const headers: Record<string, Record<string, string>> = {};

const who = (role: string) => principals.find((p) => p.roles.includes(role as never))!;
async function as(role: string) {
  if (headers[role]) return headers[role];
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/demo-session',
    payload: { principalId: who(role).id },
  });
  const cookie = res.cookies.find((c) => c.name === 'tigeris_session')!;
  return (headers[role] = { cookie: `tigeris_session=${cookie.value}` });
}
const get = async (role: string, url: string) => app.inject({ method: 'GET', url, headers: await as(role) });
const post = async (role: string, url: string, payload: object = {}) =>
  app.inject({ method: 'POST', url, headers: await as(role), payload });

beforeAll(async () => {
  principals = (await app.inject({ method: 'GET', url: '/api/auth/demo-principals' })).json().principals;
  const gsia = (await resolveInstitutionId(db, 'gsia-demo'))!;
  await withInstitution(db, gsia, (tx) =>
    tx.insert(cases).values({
      institutionId: gsia,
      key: CASE,
      title: 'Report test: capital response under a Hormuz shock (synthetic)',
      state: 'review',
      domain: 'Sovereign capital',
      sectorKey: 'capital',
      sensitivity: 'confidential',
      urgency: 'routine',
      dataMode: 'synthetic_demo',
      ownerPrincipalId: who('analyst').id,
      objective: 'Exercise overdue steps and the case report.',
      summary: 'Synthetic test case.',
      whyItMatters: 'Slice I integration test.',
      unresolvedQuestions: ['Is the bypass ramp assumption realistic?'],
      confidence: { band: 'low', factors: [] },
      version: 1,
    }),
  );
  await post('analyst', '/api/scenarios', {
    caseKey: CASE,
    drivers: { durationDays: 21, capacityLostPct: 50, bypassMbd: 2.6, oilPriceShockPct: 30 },
  });
  const g: CaseGovernance = (await get('analyst', `/api/cases/${CASE}/governance`)).json();
  recKey = (
    await post('analyst', `/api/cases/${CASE}/recommendations`, {
      optionId: g.candidateOptions[0]!.id,
      rationale: why,
    })
  ).json().key;
  await post('auditor', `/api/recommendations/${recKey}/notes`, {
    stance: 'disagree',
    body: 'The valuation elasticity is assumed, not observed.',
  });
  // Only the owner role can move time: backdate the recommendation so its expert review is past due.
  await owner.db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.institution_id', ${gsia}, true)`);
    await tx
      .update(recommendations)
      .set({ updatedAt: sql`now() - interval '3 days'` })
      .where(eq(recommendations.key, recKey));
  });
});
afterAll(async () => {
  await app.close();
  await close();
  await owner.close();
});

describe('overdue governed steps on the command centre', () => {
  it('lists a review past its service level, for the expert first, within read scope', async () => {
    const expert: CommandCentre = (await get('domain_expert', '/api/command-centre')).json();
    const item = expert.overdue.find((o) => o.ref === recKey)!;
    expect(item).toMatchObject({ kind: 'review', caseKey: CASE, role: 'domain_expert', forYou: true });
    expect(item.overdueHours).toBeGreaterThanOrEqual(23);
    expect(expert.serviceLevelsBasis).toContain('Synthetic');

    const analyst: CommandCentre = (await get('analyst', '/api/command-centre')).json();
    expect(analyst.overdue.find((o) => o.ref === recKey)?.forYou).toBe(false);
    const ops: CommandCentre = (await get('operations_owner', '/api/command-centre')).json();
    expect(ops.overdue.some((o) => o.caseKey === CASE)).toBe(false);
  });
});

describe('case report and evidence pack (FR-38, FR-39)', () => {
  it('assembles the case, graph, scenario, governance and notes the reader may see, with a content hash', async () => {
    const res = await get('analyst', `/api/cases/${CASE}/report`);
    expect(res.statusCode).toBe(200);
    const r: CaseReport = res.json();
    expect(r.version).toBe('case-report 1.0.0');
    expect(r.label).toContain('Demonstration');
    expect(r.institution.isSynthetic).toBe(true);
    expect(r.case.unresolvedQuestions).toContain('Is the bypass ramp assumption realistic?');
    expect(r.scenario?.key).toBe(r.governance.latestRunKey);
    expect(r.governance.recommendations.map((x) => x.key)).toContain(recKey);
    expect(r.governance.notes.some((n) => n.stance === 'disagree')).toBe(true);
    expect(r).not.toHaveProperty('governance.decisionPreview');
    const { contentHash, ...body } = r;
    expect(createHash('sha256').update(canonicalJson(body)).digest('hex')).toBe(contentHash);
  });

  it('offers a download and audits every export', async () => {
    const res = await get('auditor', `/api/cases/${CASE}/report?format=json&download=true`);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="RPT-.*-evidence-pack-/);
    const log: AuditPage = (await get('auditor', `/api/audit?action=report.&caseKey=${CASE}`)).json();
    expect(log.events.length).toBeGreaterThanOrEqual(2);
    expect(log.events[0]!.payload).toMatchObject({ case: CASE, version: 'case-report 1.0.0' });
  });

  it('refuses roles without export rights and cases outside scope', async () => {
    expect((await get('administrator', `/api/cases/${CASE}/report`)).statusCode).toBe(403);
    expect((await get('operations_owner', `/api/cases/${CASE}/report`)).statusCode).toBe(403);
    expect((await get('analyst', '/api/cases/NRI-TEST-01/report')).statusCode).toBe(404);
    expect((await get('analyst', '/api/cases/NO-SUCH-CASE/report')).statusCode).toBe(404);
  });
});
