/**
 * Governance (Phase 4): recommendation → mandatory expert review → policy-checked decision → manual handoff →
 * institutional memory. Every step is a named human action, recorded as a case event and a hash-chained audit
 * entry. TIGERIS never executes an external action: a handoff only records what the operations owner did.
 */
import {
  canTransition,
  checkReview,
  DECIDING_ROLES,
  DECISION_OUTCOMES,
  evaluatePolicy,
  formatScenarioValue,
  HANDOFF_ACTIONS,
  HANDOFF_ROLES,
  HANDOFF_TRANSITIONS,
  METRICS,
  OPEN_RECOMMENDATION_STATUSES,
  OUTCOME_CASE_STATE,
  OUTCOME_STATUS,
  POLICY_VERSION,
  RECOMMEND_FROM_STATES,
  RECOMMEND_ROLES,
  REVIEW_VERDICTS,
  type CaseGovernance,
  type CaseState,
  type DecisionItem,
  type DecisionLogItem,
  type DecisionOutcome,
  type DraftOptionItem,
  type EngineResult,
  type ExpectedFigure,
  type GovernanceCheck,
  type HandoffItem,
  type HandoffStatus,
  type MemoryItem,
  type PersonRef,
  type PolicyEvaluation,
  type PolicyReason,
  type RecommendationItem,
  type RecommendationStatus,
  type ReviewVerdict,
  type Role,
} from '@tigeris/shared';
import { and, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { appendAudit } from '../audit/audit';
import { withInstitution, type Tx } from '../db/client';
import {
  authorityLimits,
  caseEvents,
  cases,
  decisions,
  draftOptions,
  expertReviews,
  handoffs,
  memoryEntries,
  principals,
  recommendations,
  scenarioRuns,
} from '../db/schema';
import { ctxOf, requireSession, type AppDeps, type RequestContext } from './context';
import { caseReadable } from './scope';
import { toDraftOption } from './scenarios';

type CaseRow = typeof cases.$inferSelect;
type HandoffRow = typeof handoffs.$inferSelect;
type MemoryRow = typeof memoryEntries.$inferSelect;

const KEY = /^[A-Z0-9-]{3,40}$/;
const rationale = z.string().trim().min(10).max(2000);

/** Figures a memory entry quotes from the recommended scenario run (central, 90 days, with the range). */
const EXPECTED_METRICS = [
  'net_disrupted_flow',
  'nav_at_risk_peak',
  'desal_reduced_output_days',
  'utility_fuel_cost',
];

// ───────────────────────────── Loading ─────────────────────────────

async function people(tx: Tx, ids: (string | null | undefined)[]): Promise<Map<string, PersonRef>> {
  const wanted = [...new Set(ids.filter((x): x is string => !!x))];
  if (!wanted.length) return new Map();
  const rows = await tx.select().from(principals).where(inArray(principals.id, wanted));
  return new Map(rows.map((p) => [p.id, { id: p.id, name: p.displayName, title: p.title }]));
}

async function nextKey(
  tx: Tx,
  table: typeof recommendations | typeof decisions | typeof handoffs | typeof memoryEntries,
  prefix: string,
  now: Date,
): Promise<string> {
  const day = now.toISOString().slice(0, 10).replace(/-/g, '');
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(table)
    .where(sql`${table.key} like ${`${prefix}-${day}-%`}`);
  return `${prefix}-${day}-${String((row?.n ?? 0) + 1).padStart(2, '0')}`;
}

function toDecision(d: typeof decisions.$inferSelect, who: Map<string, PersonRef>): DecisionItem {
  return {
    id: d.id,
    key: d.key,
    approver: who.get(d.approverId)!,
    outcome: d.outcome as DecisionOutcome,
    rationale: d.rationale,
    policyResult: d.policyResult as 'pass' | 'hold',
    policyVersion: d.policyVersion,
    reasons: d.policyReasons as PolicyReason[],
    completes: d.completes,
    createdAt: d.createdAt.toISOString(),
  };
}

async function loadRecommendations(tx: Tx, where: SQL | undefined): Promise<RecommendationItem[]> {
  const rows = await tx
    .select({ r: recommendations, o: draftOptions, c: cases, runKey: scenarioRuns.key })
    .from(recommendations)
    .innerJoin(draftOptions, eq(draftOptions.id, recommendations.optionId))
    .innerJoin(cases, eq(cases.id, recommendations.caseId))
    .innerJoin(scenarioRuns, eq(scenarioRuns.id, recommendations.scenarioRunId))
    .where(where)
    .orderBy(desc(recommendations.createdAt));
  if (!rows.length) return [];
  const ids = rows.map((x) => x.r.id);
  const [reviews, decs] = await Promise.all([
    tx
      .select()
      .from(expertReviews)
      .where(inArray(expertReviews.recommendationId, ids))
      .orderBy(expertReviews.createdAt),
    tx.select().from(decisions).where(inArray(decisions.recommendationId, ids)).orderBy(decisions.createdAt),
  ]);
  const who = await people(tx, [
    ...rows.flatMap((x) => [x.r.createdBy, x.o.createdBy]),
    ...reviews.map((v) => v.reviewerId),
    ...decs.map((d) => d.approverId),
  ]);
  return rows.map(({ r, o, c, runKey }) => ({
    id: r.id,
    key: r.key,
    caseKey: c.key,
    caseTitle: c.title,
    status: r.status as RecommendationStatus,
    rationale: r.rationale,
    createdBy: who.get(r.createdBy)!,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    scenarioRunKey: runKey,
    option: toDraftOption(o, who.get(o.createdBy)?.name ?? 'Unknown'),
    reviews: reviews
      .filter((v) => v.recommendationId === r.id)
      .map((v) => ({
        id: v.id,
        reviewer: who.get(v.reviewerId)!,
        verdict: v.verdict as ReviewVerdict,
        rationale: v.rationale,
        createdAt: v.createdAt.toISOString(),
      })),
    decisions: decs.filter((d) => d.recommendationId === r.id).map((d) => toDecision(d, who)),
  }));
}

async function loadHandoffs(tx: Tx, where: SQL | undefined): Promise<HandoffItem[]> {
  const rows = await tx
    .select({ h: handoffs, c: cases, d: decisions, r: recommendations, o: draftOptions })
    .from(handoffs)
    .innerJoin(cases, eq(cases.id, handoffs.caseId))
    .innerJoin(decisions, eq(decisions.id, handoffs.decisionId))
    .innerJoin(recommendations, eq(recommendations.id, decisions.recommendationId))
    .innerJoin(draftOptions, eq(draftOptions.id, recommendations.optionId))
    .where(where)
    .orderBy(desc(handoffs.createdAt));
  const who = await people(
    tx,
    rows.flatMap(({ h }) => [h.acknowledgedBy, h.startedBy, h.completedBy]),
  );
  const ref = (id: string | null) => (id ? (who.get(id) ?? null) : null);
  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  return rows.map(({ h, c, d, r, o }) => ({
    id: h.id,
    key: h.key,
    caseKey: c.key,
    caseTitle: c.title,
    decisionKey: d.key,
    recommendationKey: r.key,
    actionClass: o.actionClass,
    scope: h.scope,
    status: h.status as HandoffStatus,
    acknowledgedBy: ref(h.acknowledgedBy),
    acknowledgedAt: iso(h.acknowledgedAt),
    startedBy: ref(h.startedBy),
    startedAt: iso(h.startedAt),
    statusNote: h.statusNote,
    outcomeText: h.outcomeText,
    completedBy: ref(h.completedBy),
    completedAt: iso(h.completedAt),
    createdAt: h.createdAt.toISOString(),
  }));
}

async function loadMemory(tx: Tx, where: SQL | undefined): Promise<MemoryItem[]> {
  const rows = await tx
    .select({ m: memoryEntries, c: cases, recKey: recommendations.key })
    .from(memoryEntries)
    .innerJoin(cases, eq(cases.id, memoryEntries.caseId))
    .innerJoin(recommendations, eq(recommendations.id, memoryEntries.recommendationId))
    .where(where)
    .orderBy(desc(memoryEntries.createdAt));
  const who = await people(
    tx,
    rows.map((x) => x.m.recordedBy),
  );
  return rows.map(({ m, c, recKey }) => toMemory(m, c.key, c.title, recKey, who));
}

function toMemory(
  m: MemoryRow,
  caseKey: string,
  caseTitle: string,
  recommendationKey: string,
  who: Map<string, PersonRef>,
): MemoryItem {
  return {
    id: m.id,
    key: m.key,
    caseKey,
    caseTitle,
    recommendationKey,
    title: m.title,
    actionClass: m.actionClass,
    decisionRationale: m.decisionRationale,
    expected: m.expected as ExpectedFigure[],
    outcome: m.outcome,
    lesson: m.lesson,
    approvedBy: m.approvedBy as MemoryItem['approvedBy'],
    recordedBy: who.get(m.recordedBy)!,
    createdAt: m.createdAt.toISOString(),
  };
}

// ───────────────────────────── Rules applied to stored records ─────────────────────────────

type Limit = { value: number; unit: string; basis: string } | null;

/** The actor's delegated limit for an action class: the highest limit among their roles, or null when none. */
async function limitFor(tx: Tx, actionClass: string, roles: readonly Role[]): Promise<Limit> {
  const rows = await tx
    .select()
    .from(authorityLimits)
    .where(and(eq(authorityLimits.actionClass, actionClass), inArray(authorityLimits.role, [...roles])));
  if (!rows.length) return null;
  const best = rows.reduce((a, b) => (Number(b.limitValue) > Number(a.limitValue) ? b : a));
  return { value: Number(best.limitValue), unit: best.limitUnit, basis: best.basis };
}

function policyFor(
  rec: RecommendationItem,
  ctx: RequestContext,
  outcome: DecisionOutcome,
  limit: Limit,
): PolicyEvaluation {
  return evaluatePolicy({
    outcome,
    actor: { id: ctx.principalId, roles: ctx.roles },
    recommendation: { createdBy: rec.createdBy.id, status: rec.status },
    reviews: rec.reviews.map((v) => ({ reviewerId: v.reviewer.id, verdict: v.verdict })),
    priorApprovals: rec.decisions
      .filter((d) => d.outcome === 'approve')
      .map((d) => ({ approverId: d.approver.id })),
    authority: rec.option.authority
      ? { requiredRole: rec.option.authority.requiredRole, twoPerson: rec.option.authority.twoPerson }
      : null,
    mandateChecks: rec.option.mandateChecks,
    magnitude: rec.option.magnitude,
    limit,
  });
}

function recommendCheck(
  ctx: RequestContext,
  state: CaseState,
  open: RecommendationItem | null,
  candidates: DraftOptionItem[],
): GovernanceCheck {
  if (!RECOMMEND_ROLES.some((r) => ctx.roles.includes(r)))
    return { allowed: false, reason: 'Only an Intelligence Analyst puts an option forward.' };
  if (open) return { allowed: false, reason: `${open.key} is already open for this case.` };
  if (!RECOMMEND_FROM_STATES.includes(state))
    return {
      allowed: false,
      reason: 'A recommendation can be recorded during analysis, scenario or review.',
    };
  if (!candidates.length)
    return { allowed: false, reason: 'Run a scenario first; options come from a recorded run.' };
  return { allowed: true, reason: 'Choose one option from the latest scenario run.' };
}

/** Whether the case a governance record belongs to is within the person's read scope. */
async function readableCase(tx: Tx, caseId: string, ctx: RequestContext): Promise<boolean> {
  const [row] = await tx
    .select({ id: cases.id })
    .from(cases)
    .where(and(eq(cases.id, caseId), caseReadable(ctx.scope)));
  return !!row;
}

async function moveCase(
  tx: Tx,
  ctx: RequestContext,
  kase: CaseRow,
  to: CaseState,
  eventType: string,
  why: string,
  now: Date,
): Promise<CaseRow> {
  const from = kase.state as CaseState;
  if (!canTransition(from, to)) throw new Error(`governance: case ${kase.key} cannot move ${from} → ${to}`);
  const [updated] = await tx
    .update(cases)
    .set({ state: to, version: kase.version + 1, updatedAt: now })
    .where(eq(cases.id, kase.id))
    .returning();
  await tx.insert(caseEvents).values({
    institutionId: ctx.institutionId,
    caseId: kase.id,
    actorPrincipalId: ctx.principalId,
    eventType,
    fromState: from,
    toState: to,
    rationale: why,
    occurredAt: now,
  });
  return updated!;
}

function expectedFigures(outputs: unknown, runKey: string): ExpectedFigure[] {
  const result = (outputs as { result?: EngineResult }).result;
  if (!result) return [];
  return EXPECTED_METRICS.flatMap((key) => {
    const m = result.metrics.find((x) => x.key === key);
    const def = METRICS.find((x) => x.key === key);
    if (!m || !def) return [];
    const v = m.values.d90;
    const f = (n: number) => formatScenarioValue(n, def.unit, def.decimals);
    return [
      {
        ref: `scenario:${runKey}:metric:${key}:d90`,
        label: `${def.label} (90 days)`,
        display:
          f(v.low) === f(v.high) ? f(v.central) : `${f(v.central)} (range ${f(v.low)} to ${f(v.high)})`,
        scenarioRunKey: runKey,
      },
    ];
  });
}

// ───────────────────────────── Routes ─────────────────────────────

export async function governanceRoutes(app: FastifyInstance, deps: AppDeps) {
  const guard = { preHandler: requireSession(deps) };
  const keyParam = z.object({ key: z.string().regex(KEY) });

  app.get('/api/cases/:key/governance', guard, async (request, reply) => {
    const params = keyParam.safeParse(request.params);
    if (!params.success) return reply.code(404).send({ error: 'not_found' });
    const ctx = ctxOf(request);
    const out = await withInstitution(
      deps.db,
      ctx.institutionId,
      async (tx): Promise<CaseGovernance | null> => {
        const [kase] = await tx
          .select()
          .from(cases)
          .where(and(eq(cases.key, params.data.key), caseReadable(ctx.scope)));
        if (!kase) return null;
        const [latest] = await tx
          .select()
          .from(scenarioRuns)
          .where(eq(scenarioRuns.caseId, kase.id))
          .orderBy(desc(scenarioRuns.createdAt))
          .limit(1);
        const optionRows = latest
          ? await tx
              .select({ o: draftOptions, by: principals.displayName })
              .from(draftOptions)
              .innerJoin(principals, eq(principals.id, draftOptions.createdBy))
              .where(eq(draftOptions.scenarioRunId, latest.id))
              .orderBy(draftOptions.rank)
          : [];
        const candidateOptions = optionRows.map((x) => toDraftOption(x.o, x.by));
        const recs = await loadRecommendations(tx, eq(recommendations.caseId, kase.id));
        const open = recs.find((r) => OPEN_RECOMMENDATION_STATUSES.includes(r.status)) ?? null;
        const decidable = open && (open.status === 'endorsed' || open.status === 'awaiting_second_approval');
        const openLimit = decidable ? await limitFor(tx, open.option.actionClass, ctx.roles) : null;
        const [handoff] = await loadHandoffs(tx, eq(handoffs.caseId, kase.id));
        const [memory] = await loadMemory(tx, eq(memoryEntries.caseId, kase.id));
        return {
          caseKey: kase.key,
          caseState: kase.state as CaseState,
          latestRunKey: latest?.key ?? null,
          candidateOptions,
          canRecommend: recommendCheck(ctx, kase.state as CaseState, open, candidateOptions),
          recommendations: recs,
          open,
          canReview: open
            ? checkReview(
                { id: ctx.principalId, roles: ctx.roles },
                { createdBy: open.createdBy.id, status: open.status },
              )
            : { allowed: false, reason: 'No recommendation is awaiting review.' },
          decisionPreview: decidable
            ? (Object.fromEntries(
                DECISION_OUTCOMES.map((o) => [o, policyFor(open, ctx, o, openLimit)]),
              ) as Record<DecisionOutcome, PolicyEvaluation>)
            : null,
          handoff: handoff ?? null,
          memory: memory ?? null,
        };
      },
    );
    if (!out) return reply.code(404).send({ error: 'not_found' });
    return out;
  });

  /** Analyst puts one draft option forward for mandatory expert review. */
  app.post('/api/cases/:key/recommendations', guard, async (request, reply) => {
    const params = keyParam.safeParse(request.params);
    const body = z.object({ optionId: z.string().uuid(), rationale }).safeParse(request.body);
    if (!params.success) return reply.code(404).send({ error: 'not_found' });
    if (!body.success) return reply.code(400).send({ error: 'rationale_required' });
    const ctx = ctxOf(request);
    if (!RECOMMEND_ROLES.some((r) => ctx.roles.includes(r)))
      return reply.code(403).send({ error: 'not_permitted' });

    const result = await withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const [kase] = await tx
        .select()
        .from(cases)
        .where(and(eq(cases.key, params.data.key), caseReadable(ctx.scope)))
        .for('update');
      if (!kase) return { status: 404 as const, error: 'not_found' };
      const [option] = await tx
        .select()
        .from(draftOptions)
        .where(and(eq(draftOptions.id, body.data.optionId), eq(draftOptions.caseId, kase.id)));
      if (!option) return { status: 404 as const, error: 'option_not_found' };
      const existing = await loadRecommendations(tx, eq(recommendations.caseId, kase.id));
      const open = existing.find((r) => OPEN_RECOMMENDATION_STATUSES.includes(r.status)) ?? null;
      const check = recommendCheck(ctx, kase.state as CaseState, open, [toDraftOption(option, '')]);
      if (!check.allowed) return { status: 409 as const, error: 'not_recommendable', reason: check.reason };

      const now = new Date();
      const key = await nextKey(tx, recommendations, 'REC', now);
      const [rec] = await tx
        .insert(recommendations)
        .values({
          institutionId: ctx.institutionId,
          key,
          caseId: kase.id,
          optionId: option.id,
          scenarioRunId: option.scenarioRunId,
          rationale: body.data.rationale,
          policyVersion: POLICY_VERSION,
          createdBy: ctx.principalId,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: recommendations.id });
      let current = kase;
      if (current.state === 'analysis')
        current = await moveCase(
          tx,
          ctx,
          current,
          'scenario',
          'case.scenario_compared',
          `Scenario options compared for ${key}.`,
          now,
        );
      if (current.state === 'scenario')
        current = await moveCase(
          tx,
          ctx,
          current,
          'review',
          'case.routed_for_review',
          `${key}: ${option.title}. ${body.data.rationale}`,
          now,
        );
      else
        await tx.insert(caseEvents).values({
          institutionId: ctx.institutionId,
          caseId: kase.id,
          actorPrincipalId: ctx.principalId,
          eventType: 'recommendation.recorded',
          fromState: null,
          toState: null,
          rationale: `${key}: ${option.title}. ${body.data.rationale}`,
          occurredAt: now,
        });
      await appendAudit(tx, {
        institutionId: ctx.institutionId,
        actorPrincipalId: ctx.principalId,
        actorType: 'human',
        action: 'recommendation.recorded',
        objectType: 'recommendation',
        objectId: rec!.id,
        caseId: kase.id,
        payload: { key, option: option.key, actionClass: option.actionClass, policyVersion: POLICY_VERSION },
      });
      return { status: 201 as const, key };
    });
    if (result.status !== 201)
      return reply
        .code(result.status)
        .send({ error: result.error, ...('reason' in result ? { reason: result.reason } : {}) });
    return reply.code(201).send({ key: result.key });
  });

  /** Mandatory expert review: endorse (on to decision) or request changes (back to analysis). */
  app.post('/api/recommendations/:key/reviews', guard, async (request, reply) => {
    const params = keyParam.safeParse(request.params);
    const body = z.object({ verdict: z.enum(REVIEW_VERDICTS), rationale }).safeParse(request.body);
    if (!params.success) return reply.code(404).send({ error: 'not_found' });
    if (!body.success) return reply.code(400).send({ error: 'rationale_required' });
    const ctx = ctxOf(request);

    const result = await withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const [row] = await tx
        .select()
        .from(recommendations)
        .where(eq(recommendations.key, params.data.key))
        .for('update');
      if (!row || !(await readableCase(tx, row.caseId, ctx)))
        return { status: 404 as const, error: 'not_found' };
      const check = checkReview(
        { id: ctx.principalId, roles: ctx.roles },
        { createdBy: row.createdBy, status: row.status as RecommendationStatus },
      );
      if (!check.allowed)
        return {
          status: ctx.roles.includes('domain_expert') ? (409 as const) : (403 as const),
          error: 'not_permitted',
          reason: check.reason,
        };
      const [kase] = await tx.select().from(cases).where(eq(cases.id, row.caseId)).for('update');
      const now = new Date();
      const endorse = body.data.verdict === 'endorse';
      const [review] = await tx
        .insert(expertReviews)
        .values({
          institutionId: ctx.institutionId,
          recommendationId: row.id,
          reviewerId: ctx.principalId,
          verdict: body.data.verdict,
          rationale: body.data.rationale,
          createdAt: now,
        })
        .returning({ id: expertReviews.id });
      await tx
        .update(recommendations)
        .set({ status: endorse ? 'endorsed' : 'changes_requested', updatedAt: now })
        .where(eq(recommendations.id, row.id));
      await moveCase(
        tx,
        ctx,
        kase!,
        endorse ? 'decision' : 'analysis',
        endorse ? 'review.endorsed' : 'review.changes_requested',
        `${row.key}: ${body.data.rationale}`,
        now,
      );
      await appendAudit(tx, {
        institutionId: ctx.institutionId,
        actorPrincipalId: ctx.principalId,
        actorType: 'human',
        action: endorse ? 'review.endorsed' : 'review.changes_requested',
        objectType: 'expert_review',
        objectId: review!.id,
        caseId: row.caseId,
        payload: { recommendation: row.key, verdict: body.data.verdict },
      });
      return { status: 201 as const };
    });
    if (result.status !== 201)
      return reply
        .code(result.status)
        .send({ error: result.error, ...('reason' in result ? { reason: result.reason } : {}) });
    return reply.code(201).send({ ok: true });
  });

  /** A decision by a named authority, checked by the versioned policy. Blocked attempts are audited, not stored. */
  app.post('/api/recommendations/:key/decisions', guard, async (request, reply) => {
    const params = keyParam.safeParse(request.params);
    const body = z.object({ outcome: z.enum(DECISION_OUTCOMES), rationale }).safeParse(request.body);
    if (!params.success) return reply.code(404).send({ error: 'not_found' });
    if (!body.success) return reply.code(400).send({ error: 'rationale_required' });
    const ctx = ctxOf(request);
    if (!DECIDING_ROLES.some((r) => ctx.roles.includes(r)))
      return reply.code(403).send({ error: 'not_permitted' });

    const result = await withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const [row] = await tx
        .select()
        .from(recommendations)
        .where(eq(recommendations.key, params.data.key))
        .for('update');
      if (!row || !(await readableCase(tx, row.caseId, ctx)))
        return { status: 404 as const, error: 'not_found' };
      const [rec] = await loadRecommendations(tx, eq(recommendations.id, row.id));
      const limit = await limitFor(tx, rec!.option.actionClass, ctx.roles);
      const evaluation = policyFor(rec!, ctx, body.data.outcome, limit);
      const now = new Date();
      if (evaluation.result === 'block') {
        await appendAudit(tx, {
          institutionId: ctx.institutionId,
          actorPrincipalId: ctx.principalId,
          actorType: 'human',
          action: 'decision.blocked',
          objectType: 'recommendation',
          objectId: row.id,
          caseId: row.caseId,
          payload: {
            recommendation: row.key,
            outcome: body.data.outcome,
            policyVersion: evaluation.version,
            blockedBy: evaluation.reasons.filter((r) => r.result === 'block').map((r) => r.code),
          },
        });
        return { status: 409 as const, error: 'policy_blocked', evaluation };
      }

      const [kase] = await tx.select().from(cases).where(eq(cases.id, row.caseId)).for('update');
      if (kase!.state !== 'decision')
        return { status: 409 as const, error: 'case_not_awaiting_decision', evaluation };
      const key = await nextKey(tx, decisions, 'DEC', now);
      const [decision] = await tx
        .insert(decisions)
        .values({
          institutionId: ctx.institutionId,
          key,
          recommendationId: row.id,
          caseId: row.caseId,
          approverId: ctx.principalId,
          outcome: body.data.outcome,
          rationale: body.data.rationale,
          policyResult: evaluation.result,
          policyVersion: evaluation.version,
          policyReasons: evaluation.reasons,
          completes: evaluation.completes,
          createdAt: now,
        })
        .returning({ id: decisions.id });

      let handoffKey: string | null = null;
      if (!evaluation.completes) {
        await tx
          .update(recommendations)
          .set({ status: 'awaiting_second_approval', updatedAt: now })
          .where(eq(recommendations.id, row.id));
        await tx.insert(caseEvents).values({
          institutionId: ctx.institutionId,
          caseId: row.caseId,
          actorPrincipalId: ctx.principalId,
          eventType: 'decision.first_approval',
          fromState: null,
          toState: null,
          rationale: `${key}: first of two approvals for ${row.key}. ${body.data.rationale}`,
          occurredAt: now,
        });
      } else {
        const outcome = body.data.outcome;
        await tx
          .update(recommendations)
          .set({ status: OUTCOME_STATUS[outcome], updatedAt: now })
          .where(eq(recommendations.id, row.id));
        await moveCase(
          tx,
          ctx,
          kase!,
          OUTCOME_CASE_STATE[outcome],
          `decision.${outcome}`,
          `${key}: ${body.data.rationale}`,
          now,
        );
        if (outcome === 'approve') {
          handoffKey = await nextKey(tx, handoffs, 'HO', now);
          const authority = rec!.option.authority;
          await tx.insert(handoffs).values({
            institutionId: ctx.institutionId,
            key: handoffKey,
            decisionId: decision!.id,
            caseId: row.caseId,
            scope:
              `${rec!.option.title}. ${authority ? `${authority.thresholdText}. ` : ''}` +
              "Carried out through the institution's own processes; TIGERIS records acknowledgement, progress and outcome only.",
            createdAt: now,
          });
        }
      }
      await appendAudit(tx, {
        institutionId: ctx.institutionId,
        actorPrincipalId: ctx.principalId,
        actorType: 'human',
        action: evaluation.completes ? `decision.${body.data.outcome}` : 'decision.first_approval',
        objectType: 'decision',
        objectId: decision!.id,
        caseId: row.caseId,
        payload: {
          key,
          recommendation: row.key,
          outcome: body.data.outcome,
          policyResult: evaluation.result,
          policyVersion: evaluation.version,
          handoff: handoffKey,
        },
      });
      return { status: 201 as const, key, evaluation, handoffKey };
    });
    if (result.status !== 201)
      return reply
        .code(result.status)
        .send({ error: result.error, ...('evaluation' in result ? { evaluation: result.evaluation } : {}) });
    return reply
      .code(201)
      .send({ key: result.key, evaluation: result.evaluation, handoffKey: result.handoffKey });
  });

  app.get('/api/decisions', guard, async (request): Promise<DecisionLogItem[]> => {
    const ctx = ctxOf(request);
    return withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const rows = await tx
        .select({
          d: decisions,
          c: cases,
          recKey: recommendations.key,
          actionClass: draftOptions.actionClass,
        })
        .from(decisions)
        .innerJoin(cases, eq(cases.id, decisions.caseId))
        .innerJoin(recommendations, eq(recommendations.id, decisions.recommendationId))
        .innerJoin(draftOptions, eq(draftOptions.id, recommendations.optionId))
        .where(caseReadable(ctx.scope))
        .orderBy(desc(decisions.createdAt))
        .limit(50);
      const who = await people(
        tx,
        rows.map((x) => x.d.approverId),
      );
      return rows.map(({ d, c, recKey, actionClass }) => ({
        ...toDecision(d, who),
        caseKey: c.key,
        caseTitle: c.title,
        recommendationKey: recKey,
        actionClass,
      }));
    });
  });

  /** Recommendations awaiting review or decision across the institution. */
  app.get('/api/recommendations', guard, async (request): Promise<RecommendationItem[]> => {
    const ctx = ctxOf(request);
    return withInstitution(deps.db, ctx.institutionId, (tx) =>
      loadRecommendations(
        tx,
        and(inArray(recommendations.status, [...OPEN_RECOMMENDATION_STATUSES]), caseReadable(ctx.scope)),
      ),
    );
  });

  app.get('/api/handoffs', guard, async (request): Promise<HandoffItem[]> => {
    const ctx = ctxOf(request);
    // Assigned work is need-to-know: operations owners see every handoff; others only within their read scope.
    const assigned = HANDOFF_ROLES.some((r) => ctx.roles.includes(r));
    return withInstitution(deps.db, ctx.institutionId, (tx) =>
      loadHandoffs(tx, assigned ? undefined : caseReadable(ctx.scope)),
    );
  });

  /** The operations owner's record of a manual handoff. Nothing here acts on an external system. */
  app.post('/api/handoffs/:key/actions', guard, async (request, reply) => {
    const params = keyParam.safeParse(request.params);
    const body = z
      .object({
        action: z.enum(HANDOFF_ACTIONS),
        note: z.string().trim().max(2000).optional(),
        outcome: z.string().trim().min(10).max(4000).optional(),
        lesson: z.string().trim().min(10).max(2000).optional(),
      })
      .safeParse(request.body);
    if (!params.success) return reply.code(404).send({ error: 'not_found' });
    if (!body.success) return reply.code(400).send({ error: 'invalid_request' });
    const ctx = ctxOf(request);
    if (!HANDOFF_ROLES.some((r: Role) => ctx.roles.includes(r)))
      return reply.code(403).send({ error: 'not_permitted' });
    const { action, note, outcome, lesson } = body.data;
    if (action === 'record_outcome' && (!outcome || !lesson))
      return reply.code(400).send({ error: 'outcome_and_lesson_required' });

    const result = await withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const [h] = await tx.select().from(handoffs).where(eq(handoffs.key, params.data.key)).for('update');
      if (!h) return { status: 404 as const, error: 'not_found' };
      const step = HANDOFF_TRANSITIONS[action];
      if (h.status !== step.from) return { status: 409 as const, error: 'wrong_status' };
      const now = new Date();
      const patch: Partial<HandoffRow> = { status: step.to };
      if (action === 'acknowledge')
        Object.assign(patch, { acknowledgedBy: ctx.principalId, acknowledgedAt: now });
      if (action === 'start')
        Object.assign(patch, { startedBy: ctx.principalId, startedAt: now, statusNote: note ?? null });
      if (action === 'record_outcome')
        Object.assign(patch, { outcomeText: outcome, completedBy: ctx.principalId, completedAt: now });
      await tx.update(handoffs).set(patch).where(eq(handoffs.id, h.id));

      const [kase] = await tx.select().from(cases).where(eq(cases.id, h.caseId)).for('update');
      let memoryKey: string | null = null;
      if (action === 'record_outcome') {
        const [d] = await tx.select().from(decisions).where(eq(decisions.id, h.decisionId));
        const [rec] = await loadRecommendations(tx, eq(recommendations.id, d!.recommendationId));
        const [run] = await tx.select().from(scenarioRuns).where(eq(scenarioRuns.key, rec!.scenarioRunKey));
        const approvals = rec!.decisions.filter((x) => x.outcome === 'approve');
        memoryKey = await nextKey(tx, memoryEntries, 'MEM', now);
        await tx.insert(memoryEntries).values({
          institutionId: ctx.institutionId,
          key: memoryKey,
          caseId: h.caseId,
          recommendationId: rec!.id,
          handoffId: h.id,
          title: `${rec!.option.title}: ${kase!.title}`,
          actionClass: rec!.option.actionClass,
          decisionRationale: approvals.map((x) => x.rationale).join(' '),
          expected: expectedFigures(run?.outputs, rec!.scenarioRunKey),
          outcome: outcome!,
          lesson: lesson!,
          approvedBy: approvals.map((x) => ({
            name: x.approver.name,
            title: x.approver.title,
            at: x.createdAt,
          })),
          recordedBy: ctx.principalId,
          createdAt: now,
        });
        await moveCase(tx, ctx, kase!, 'closed', 'handoff.completed', `${h.key}: ${outcome}`, now);
      } else {
        await tx.insert(caseEvents).values({
          institutionId: ctx.institutionId,
          caseId: h.caseId,
          actorPrincipalId: ctx.principalId,
          eventType: `handoff.${action === 'acknowledge' ? 'acknowledged' : 'started'}`,
          fromState: null,
          toState: null,
          rationale: `${h.key}${note ? `: ${note}` : ''}`,
          occurredAt: now,
        });
      }
      await appendAudit(tx, {
        institutionId: ctx.institutionId,
        actorPrincipalId: ctx.principalId,
        actorType: 'human',
        action: `handoff.${action}`,
        objectType: 'handoff',
        objectId: h.id,
        caseId: h.caseId,
        payload: { key: h.key, from: step.from, to: step.to, memory: memoryKey },
      });
      return { status: 200 as const, status_: step.to, memoryKey };
    });
    if (result.status !== 200) return reply.code(result.status).send({ error: result.error });
    return { status: result.status_, memoryKey: result.memoryKey };
  });

  /** Institutional memory: approved decisions with recorded outcomes, searchable within this institution only. */
  app.get('/api/memory', guard, async (request): Promise<MemoryItem[]> => {
    const ctx = ctxOf(request);
    const q = z.object({ q: z.string().trim().max(200).optional() }).safeParse(request.query);
    const term = q.success ? (q.data.q ?? '') : '';
    return withInstitution(deps.db, ctx.institutionId, (tx) =>
      loadMemory(
        tx,
        and(
          caseReadable(ctx.scope),
          term.length >= 2
            ? sql`(memory_entries.search @@ plainto_tsquery('simple', ${term}) or ${memoryEntries.title} ilike ${'%' + term + '%'})`
            : undefined,
        ),
      ),
    );
  });
}
