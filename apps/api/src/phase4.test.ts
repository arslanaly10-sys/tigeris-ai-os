// Phase 4 governance: recommendation → mandatory expert review → policy-checked decision → manual handoff →
// institutional memory. Runs as tigeris_app through the API, plus direct writes that the database must refuse.
import type { CaseGovernance, DecisionLogItem, DemoPrincipal, MemoryItem } from '@tigeris/shared';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { config } from './config';
import { createDb, resolveInstitutionId, withInstitution } from './db/client';
import {
  auditEvents,
  cases,
  decisions,
  expertReviews,
  handoffs,
  memoryEntries,
  recommendations,
} from './db/schema';

const { db, close } = createDb(config.DATABASE_APP_URL, 3);
const app = await buildApp({ db, sessionSecret: config.SESSION_SECRET, demoInstitutionKey: 'gsia-demo' });
// Its own case, so this file never changes the seeded cases other test files assert on.
const CASE = `GOV-${Date.now().toString(36).toUpperCase()}`;
let principals: DemoPrincipal[];
let gsia: string;
let nri: string;
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

const governance = async (role = 'analyst'): Promise<CaseGovernance> =>
  (await app.inject({ method: 'GET', url: `/api/cases/${CASE}/governance`, headers: await as(role) })).json();

const post = async (role: string, url: string, payload: object) =>
  app.inject({ method: 'POST', url, headers: await as(role), payload });

const why = 'Recorded for the governance integration test with enough words.';
let recKey: string;
let handoffKey: string;

beforeAll(async () => {
  principals = (await app.inject({ method: 'GET', url: '/api/auth/demo-principals' })).json().principals;
  gsia = (await resolveInstitutionId(db, 'gsia-demo'))!;
  nri = (await resolveInstitutionId(db, 'nri-test'))!;
  await withInstitution(db, gsia, (tx) =>
    tx.insert(cases).values({
      institutionId: gsia,
      key: CASE,
      title: 'Governance test: capital response under a Hormuz shock (synthetic)',
      state: 'review',
      domain: 'Sovereign capital',
      sensitivity: 'confidential',
      urgency: 'routine',
      dataMode: 'synthetic_demo',
      ownerPrincipalId: who('analyst').id,
      objective: 'Exercise the Phase 4 governance path end to end.',
      summary: 'Synthetic test case.',
      whyItMatters: 'Governance integration test.',
      unresolvedQuestions: [],
      confidence: { band: 'low', factors: [] },
      version: 1,
    }),
  );
});
afterAll(async () => {
  await app.close();
  await close();
});

describe('recommendation (analyst)', () => {
  it('needs a recorded scenario run before anything can be recommended', async () => {
    const g = await governance();
    expect(g.caseState).toBe('review');
    expect(g.canRecommend.allowed).toBe(false);
    expect(g.canRecommend.reason).toContain('Run a scenario first');
  });

  it('puts one option from the latest run forward for review, and only one at a time', async () => {
    const run = await post('analyst', '/api/scenarios', {
      caseKey: CASE,
      drivers: { durationDays: 21, capacityLostPct: 50, bypassMbd: 2.6, oilPriceShockPct: 30 },
    });
    expect(run.statusCode).toBe(201);
    const g = await governance();
    expect(g.canRecommend.allowed).toBe(true);
    const hedge = g.candidateOptions.find((o) => o.actionClass === 'Hedge exposure')!;
    expect(hedge.authority?.twoPerson).toBe(true);

    expect(
      (await post('approver', `/api/cases/${CASE}/recommendations`, { optionId: hedge.id, rationale: why }))
        .statusCode,
    ).toBe(403);
    expect(
      (
        await post('analyst', `/api/cases/${CASE}/recommendations`, {
          optionId: hedge.id,
          rationale: 'short',
        })
      ).statusCode,
    ).toBe(400);

    const res = await post('analyst', `/api/cases/${CASE}/recommendations`, {
      optionId: hedge.id,
      rationale: why,
    });
    expect(res.statusCode).toBe(201);
    recKey = res.json().key;
    expect(recKey).toMatch(/^REC-\d{8}-\d{2}$/);

    const again = await post('analyst', `/api/cases/${CASE}/recommendations`, {
      optionId: hedge.id,
      rationale: why,
    });
    expect(again.statusCode).toBe(409);

    const after = await governance();
    expect(after.caseState).toBe('review');
    expect(after.open?.key).toBe(recKey);
    expect(after.open?.status).toBe('in_review');
    expect(after.decisionPreview).toBeNull();
  });
});

describe('expert review (mandatory)', () => {
  it('refuses a decision before any expert review, and audits the blocked attempt', async () => {
    const res = await post('approver', `/api/recommendations/${recKey}/decisions`, {
      outcome: 'approve',
      rationale: why,
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('policy_blocked');
    const blockedBy = res
      .json()
      .evaluation.reasons.filter((r: { result: string }) => r.result === 'block')
      .map((r: { code: string }) => r.code);
    expect(blockedBy).toEqual(expect.arrayContaining(['state', 'review']));
    const audited = await withInstitution(db, gsia, (tx) =>
      tx.select().from(auditEvents).where(eq(auditEvents.action, 'decision.blocked')),
    );
    expect(audited.length).toBeGreaterThan(0);
  });

  it('is only for a domain expert who is not the author', async () => {
    expect(
      (
        await post('analyst', `/api/recommendations/${recKey}/reviews`, {
          verdict: 'endorse',
          rationale: why,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await post('approver', `/api/recommendations/${recKey}/reviews`, {
          verdict: 'endorse',
          rationale: why,
        })
      ).statusCode,
    ).toBe(403);
    const g = await governance('domain_expert');
    expect(g.canReview.allowed).toBe(true);
  });

  it('endorsing moves the case to decision', async () => {
    const res = await post('domain_expert', `/api/recommendations/${recKey}/reviews`, {
      verdict: 'endorse',
      rationale: why,
    });
    expect(res.statusCode).toBe(201);
    const g = await governance('approver');
    expect(g.caseState).toBe('decision');
    expect(g.open?.status).toBe('endorsed');
    expect(g.decisionPreview?.approve.result).toBe('hold');
    expect(g.decisionPreview?.approve.reasons.map((r) => r.code)).toContain('two_person');
  });
});

describe('database guards (enforced below the API)', () => {
  it('refuses a decision by the author or an approval by the reviewer, even written directly', async () => {
    const [rec] = await withInstitution(db, gsia, (tx) =>
      tx.select().from(recommendations).where(eq(recommendations.key, recKey)),
    );
    const attempt = (approverId: string) =>
      withInstitution(db, gsia, (tx) =>
        tx.insert(decisions).values({
          institutionId: gsia,
          key: `DEC-TEST-${approverId.slice(0, 4)}`,
          recommendationId: rec!.id,
          caseId: rec!.caseId,
          approverId,
          outcome: 'approve',
          rationale: why,
          policyResult: 'pass',
          policyVersion: 'test',
          policyReasons: [],
          completes: true,
        }),
      );
    await expect(attempt(who('analyst').id)).rejects.toThrow(/never decide/);
    await expect(attempt(who('domain_expert').id)).rejects.toThrow(/reviewer cannot also approve/);
  });

  it('refuses a self-review and keeps reviews and decisions append-only', async () => {
    const [rec] = await withInstitution(db, gsia, (tx) =>
      tx.select().from(recommendations).where(eq(recommendations.key, recKey)),
    );
    await expect(
      withInstitution(db, gsia, (tx) =>
        tx.insert(expertReviews).values({
          institutionId: gsia,
          recommendationId: rec!.id,
          reviewerId: who('analyst').id,
          verdict: 'endorse',
          rationale: why,
        }),
      ),
    ).rejects.toThrow(/cannot review/);
    await expect(
      withInstitution(db, gsia, (tx) => tx.update(expertReviews).set({ verdict: 'request_changes' })),
    ).rejects.toThrow(/permission denied/);
    await expect(
      withInstitution(db, gsia, (tx) =>
        tx.update(recommendations).set({ rationale: 'rewritten after the fact' }),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('decision (two-person rule)', () => {
  it('records the first approval and waits for a different second approver', async () => {
    const first = await post('approver', `/api/recommendations/${recKey}/decisions`, {
      outcome: 'approve',
      rationale: why,
    });
    expect(first.statusCode).toBe(201);
    expect(first.json().evaluation.result).toBe('hold');
    expect(first.json().handoffKey).toBeNull();
    const g = await governance('approver');
    expect(g.caseState).toBe('decision');
    expect(g.open?.status).toBe('awaiting_second_approval');

    const same = await post('approver', `/api/recommendations/${recKey}/decisions`, {
      outcome: 'approve',
      rationale: why,
    });
    expect(same.statusCode).toBe(409);
    expect(same.json().evaluation.reasons.map((r: { code: string }) => r.code)).toContain('two_person_same');
  });

  it('completes on the executive, creates the handoff and moves the case to handoff', async () => {
    const second = await post('executive', `/api/recommendations/${recKey}/decisions`, {
      outcome: 'approve',
      rationale: why,
    });
    expect(second.statusCode).toBe(201);
    expect(second.json().evaluation.result).toBe('pass');
    handoffKey = second.json().handoffKey;
    expect(handoffKey).toMatch(/^HO-\d{8}-\d{2}$/);
    const g = await governance();
    expect(g.caseState).toBe('handoff');
    expect(g.open).toBeNull();
    expect(g.recommendations[0]!.status).toBe('approved');
    expect(g.handoff?.status).toBe('awaiting_acknowledgement');
    expect(g.handoff?.scope).toContain("institution's own processes");

    const log: DecisionLogItem[] = (
      await app.inject({ method: 'GET', url: '/api/decisions', headers: await as('auditor') })
    ).json();
    const mine = log.filter((d) => d.recommendationKey === recKey);
    expect(mine.map((d) => d.policyResult).sort()).toEqual(['hold', 'pass']);
    expect(mine.every((d) => d.policyVersion === 'decision-policy 1.1.0')).toBe(true);
  });
});

describe('handoff and memory', () => {
  it('never lets TIGERIS mark an action as executed', async () => {
    await expect(
      withInstitution(db, gsia, (tx) => tx.execute(sql`update handoffs set executed_by_tigeris = true`)),
    ).rejects.toThrow(/permission denied/);
  });

  it('refuses memory before an outcome, and a handoff for an approval that did not complete', async () => {
    const [h] = await withInstitution(db, gsia, (tx) =>
      tx.select().from(handoffs).where(eq(handoffs.key, handoffKey)),
    );
    const [rec] = await withInstitution(db, gsia, (tx) =>
      tx.select().from(recommendations).where(eq(recommendations.key, recKey)),
    );
    await expect(
      withInstitution(db, gsia, (tx) =>
        tx.insert(memoryEntries).values({
          institutionId: gsia,
          key: 'MEM-TEST-01',
          caseId: h!.caseId,
          recommendationId: rec!.id,
          handoffId: h!.id,
          title: 'Premature',
          actionClass: 'Hedge exposure',
          decisionRationale: why,
          expected: [],
          outcome: why,
          lesson: why,
          approvedBy: [],
          recordedBy: who('operations_owner').id,
        }),
      ),
    ).rejects.toThrow(/only an approved decision with a recorded outcome/);
    const [held] = await withInstitution(db, gsia, (tx) =>
      tx.select().from(decisions).where(eq(decisions.policyResult, 'hold')),
    );
    await expect(
      withInstitution(db, gsia, (tx) =>
        tx.insert(handoffs).values({
          institutionId: gsia,
          key: 'HO-TEST-01',
          decisionId: held!.id,
          caseId: held!.caseId,
          scope: 'Should never exist',
        }),
      ),
    ).rejects.toThrow(/only for a completed approval/);
  });

  it('is walked by the operations owner one step at a time', async () => {
    const url = `/api/handoffs/${handoffKey}/actions`;
    expect((await post('analyst', url, { action: 'acknowledge' })).statusCode).toBe(403);
    expect(
      (await post('operations_owner', url, { action: 'record_outcome', outcome: why, lesson: why }))
        .statusCode,
    ).toBe(409);
    expect((await post('operations_owner', url, { action: 'acknowledge' })).statusCode).toBe(200);
    expect(
      (
        await post('operations_owner', url, {
          action: 'start',
          note: 'Hedge placed through the treasury desk.',
        })
      ).statusCode,
    ).toBe(200);
    expect((await post('operations_owner', url, { action: 'record_outcome', outcome: why })).statusCode).toBe(
      400,
    );

    const done = await post('operations_owner', url, {
      action: 'record_outcome',
      outcome: 'Hedge placed within the synthetic budget; exposure reduced as planned.',
      lesson: 'Two-person approval took one working day; pre-agree hedge budgets before a disruption.',
    });
    expect(done.statusCode).toBe(200);
    expect(done.json().memoryKey).toMatch(/^MEM-\d{8}-\d{2}$/);
    const g = await governance();
    expect(g.caseState).toBe('closed');
    expect(g.handoff?.status).toBe('completed');
    expect(g.memory?.lesson).toContain('pre-agree hedge budgets');
  });

  it('keeps approved decisions with outcomes as searchable memory, cited back to the scenario run', async () => {
    const found: MemoryItem[] = (
      await app.inject({
        method: 'GET',
        url: '/api/memory?q=hedge%20budgets',
        headers: await as('executive'),
      })
    ).json();
    const entry = found.find((m) => m.caseKey === CASE)!;
    expect(entry).toBeTruthy();
    expect(entry.approvedBy.map((a) => a.name)).toEqual([
      who('approver').displayName,
      who('executive').displayName,
    ]);
    expect(entry.expected.length).toBeGreaterThan(0);
    expect(entry.expected.every((e) => e.ref.startsWith(`scenario:${e.scenarioRunKey}:metric:`))).toBe(true);
    const none: MemoryItem[] = (
      await app.inject({
        method: 'GET',
        url: '/api/memory?q=zzqx-no-such-term',
        headers: await as('executive'),
      })
    ).json();
    expect(none).toHaveLength(0);
  });

  it('never shows decisions or memory to another institution', async () => {
    expect(await withInstitution(db, nri, (tx) => tx.select().from(memoryEntries))).toHaveLength(0);
    expect(await withInstitution(db, nri, (tx) => tx.select().from(decisions))).toHaveLength(0);
    expect(await withInstitution(db, nri, (tx) => tx.select().from(recommendations))).toHaveLength(0);
  });
});
