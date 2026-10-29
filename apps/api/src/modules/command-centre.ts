import type { AttentionItem, CommandCentre, DataMode, PendingApprovals, Urgency } from '@tigeris/shared';
import { desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { withInstitution, type Tx } from '../db/client';
import { signals } from '../db/schema';
import { listCases } from './cases';
import { ctxOf, requireSession, type AppDeps, type RequestContext } from './context';
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
export async function buildCommandCentre(tx: Tx, ctx: RequestContext): Promise<CommandCentre> {
  const [caseList, sourceList, newSignals] = await Promise.all([
    listCases(tx),
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
        nextStep:
          s.freshness === 'stale' ? 'Refresh or acknowledge staleness' : 'Approve terms and owner',
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
  app.get('/api/command-centre', { preHandler: requireSession(deps) }, async (request): Promise<CommandCentre> => {
    const ctx = ctxOf(request);
    return withInstitution(deps.db, ctx.institutionId, (tx) => buildCommandCentre(tx, ctx));
  });

  /** Items awaiting the signed-in role (header 'Approval required' badge). */
  app.get('/api/approvals/pending', { preHandler: requireSession(deps) }, async (request): Promise<PendingApprovals> => {
    const ctx = ctxOf(request);
    const cc = await withInstitution(deps.db, ctx.institutionId, (tx) => buildCommandCentre(tx, ctx));
    const items = cc.attention.filter((a) => a.forYou);
    return { count: items.length, items };
  });
}
