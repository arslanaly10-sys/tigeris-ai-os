import {
  SERVICE_LEVELS,
  SERVICE_LEVELS_BASIS,
  dueState,
  holdsAuthority,
  type AttentionItem,
  type CommandCentre,
  type DataMode,
  type OverdueItem,
  type PendingApprovals,
  type ServiceLevelKey,
  type Urgency,
} from '@tigeris/shared';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { withInstitution, type Tx } from '../db/client';
import { cases, handoffs, recommendations, signals } from '../db/schema';
import { listCases } from './cases';
import { ctxOf, requireSession, type AppDeps, type RequestContext } from './context';
import { caseReadable } from './scope';
import { listSources } from './sources';

const URGENCY_RANK: Record<Urgency, number> = { critical: 0, elevated: 1, routine: 2 };

const CASE_REASON: Record<string, string> = {
  detected: 'New case awaiting triage.',
  triaged: 'Triaged; analysis not yet started.',
  analysis: 'Analysis in progress; evidence has open questions.',
  scenario: 'Scenario comparison in progress.',
  review: 'Awaiting mandatory expert review before any decision.',
  decision: 'Awaiting a decision from the named authority.',
  handoff: 'Approved; follow-through not yet recorded.',
};

/**
 * Attention queue (FR, App Flow step 2): what needs attention and why, scoped to the institution.
 * Items whose next step belongs to one of the caller's roles are marked `forYou` and ranked first.
 */
/**
 * Governed steps past their service level (slice I): reviews, decisions, handoff acknowledgement and completion.
 * Case-scoped like every other read; operations owners see every handoff because the work is assigned to them (D-65).
 */
async function overdueSteps(tx: Tx, ctx: RequestContext, now = new Date()): Promise<OverdueItem[]> {
  const recs = await tx
    .select({ r: recommendations, caseKey: cases.key, title: cases.title })
    .from(recommendations)
    .innerJoin(cases, eq(cases.id, recommendations.caseId))
    .where(
      and(
        inArray(recommendations.status, ['in_review', 'endorsed', 'awaiting_second_approval']),
        caseReadable(ctx.scope),
      ),
    );
  const assigned = ctx.roles.includes('operations_owner');
  const hos = await tx
    .select({ h: handoffs, caseKey: cases.key, title: cases.title })
    .from(handoffs)
    .innerJoin(cases, eq(cases.id, handoffs.caseId))
    .where(
      and(
        inArray(handoffs.status, ['awaiting_acknowledgement', 'acknowledged', 'in_progress']),
        assigned ? undefined : caseReadable(ctx.scope),
      ),
    );
  const item = (kind: ServiceLevelKey, ref: string, caseKey: string, title: string, since: Date) => {
    const d = dueState(kind, since, now);
    if (!d.overdue) return [];
    const sl = SERVICE_LEVELS[kind];
    return [
      {
        kind,
        label: sl.label,
        ref,
        caseKey,
        title,
        role: sl.role,
        dueAt: d.dueAt.toISOString(),
        overdueHours: d.overdueHours,
        forYou: holdsAuthority(ctx.roles, sl.role),
      },
    ];
  };
  return [
    ...recs.flatMap(({ r, caseKey, title }) =>
      item(r.status === 'in_review' ? 'review' : 'decision', r.key, caseKey, title, r.updatedAt),
    ),
    ...hos.flatMap(({ h, caseKey, title }) =>
      h.status === 'awaiting_acknowledgement'
        ? item('acknowledge', h.key, caseKey, title, h.createdAt)
        : item('complete', h.key, caseKey, title, h.acknowledgedAt ?? h.createdAt),
    ),
  ].sort((a, b) => Number(b.forYou) - Number(a.forYou) || b.overdueHours - a.overdueHours);
}

export async function buildCommandCentre(tx: Tx, ctx: RequestContext): Promise<CommandCentre> {
  const [caseList, sourceList, newSignals] = await Promise.all([
    listCases(tx, ctx.scope),
    listSources(tx),
    tx.select().from(signals).where(eq(signals.disposition, 'new')).orderBy(desc(signals.detectedAt)),
  ]);
  const openCases = caseList.filter((c) => c.state !== 'closed');
  const mine = (role: AttentionItem['nextStepRole']) => role !== null && ctx.roles.includes(role);

  const attention: AttentionItem[] = [
    ...newSignals.map((s): AttentionItem => ({
      kind: 'signal',
      id: s.id,
      ref: s.key,
      title: s.title,
      reason: `New signal (${s.domain}). ${s.summary}`,
      urgency: s.urgency as Urgency,
      dataMode: s.dataMode as DataMode,
      updatedAt: s.detectedAt.toISOString(),
      nextStep: 'Validate: corroborate, monitor, dismiss or open a case',
      nextStepRole: 'analyst',
      forYou: mine('analyst'),
    })),
    ...openCases.map((c): AttentionItem => ({
      kind: 'case',
      id: c.id,
      ref: c.key,
      title: c.title,
      reason: CASE_REASON[c.state] ?? '',
      urgency: c.urgency,
      dataMode: c.dataMode,
      updatedAt: c.updatedAt,
      nextStep: c.nextStep,
      nextStepRole: c.nextStepRole,
      forYou: mine(c.nextStepRole),
    })),
    ...sourceList
      .filter((s) => s.freshness === 'stale' || s.approvalStatus === 'pending')
      .map((s): AttentionItem => ({
        kind: 'source',
        id: s.id,
        ref: s.key,
        title: s.title,
        reason:
          s.freshness === 'stale'
            ? `Past its ${s.freshnessLimitHours}-hour freshness limit; dependent views show a staleness warning.`
            : 'Registered but not yet approved; cannot be used as decision evidence.',
        urgency: 'routine',
        dataMode: s.sourceClass === 'synthetic' ? 'synthetic_demo' : 'snapshot',
        updatedAt: s.lastRetrievedAt,
        nextStep: s.freshness === 'stale' ? 'Refresh or acknowledge staleness' : 'Approve terms and owner',
        nextStepRole: 'administrator',
        forYou: mine('administrator'),
      })),
  ].sort(
    (a, b) =>
      Number(b.forYou) - Number(a.forYou) ||
      URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency] ||
      (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''),
  );

  return {
    attention,
    overdue: await overdueSteps(tx, ctx),
    serviceLevelsBasis: SERVICE_LEVELS_BASIS,
    counts: {
      openCases: openCases.length,
      awaitingReview: openCases.filter((c) => c.state === 'review').length,
      awaitingDecision: openCases.filter((c) => c.state === 'decision').length,
      staleSources: sourceList.filter((s) => s.freshness === 'stale').length,
    },
    sourceHealth: sourceList,
  };
}

export async function commandCentreRoutes(app: FastifyInstance, deps: AppDeps) {
  app.get(
    '/api/command-centre',
    { preHandler: requireSession(deps) },
    async (request): Promise<CommandCentre> => {
      const ctx = ctxOf(request);
      return withInstitution(deps.db, ctx.institutionId, (tx) => buildCommandCentre(tx, ctx));
    },
  );

  /** Items awaiting the signed-in role (header 'Approval required' badge). */
  app.get(
    '/api/approvals/pending',
    { preHandler: requireSession(deps) },
    async (request): Promise<PendingApprovals> => {
      const ctx = ctxOf(request);
      const cc = await withInstitution(deps.db, ctx.institutionId, (tx) => buildCommandCentre(tx, ctx));
      const items = cc.attention.filter((a) => a.forYou);
      return { count: items.length, items };
    },
  );
}
