/**
 * Learning loop (Phase 5D, FR-55, D-108, D-118). A missed outcome review proposes a new version of each assumption
 * the missed figure depends on (computed by `learning-loop 1.0.0`); a domain expert who did not record that review
 * approves or rejects it. Approval appends a new assumption version that later scenario runs use; every version is
 * kept. The calibration view shows each assumption's versions with how often figures depending on it held.
 */
import {
  ASSUMPTION_KEYS,
  LEARNING_VERSION,
  assumptionsBehind,
  calibrate,
  proposeRange,
  type AssumptionProposalItem,
  type LearningOverview,
} from '@tigeris/shared';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { appendAudit } from '../audit/audit';
import { withInstitution, type Tx } from '../db/client';
import {
  assumptionProposals,
  assumptions,
  cases,
  outcomeReviews,
  principals,
  scenarioRuns,
} from '../db/schema';
import { ctxOf, requireSession, type AppDeps } from './context';
import { caseReadable } from './scope';

async function nextKey(tx: Tx, now: Date, offset: number): Promise<string> {
  const day = now.toISOString().slice(0, 10).replace(/-/g, '');
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(assumptionProposals)
    .where(sql`${assumptionProposals.key} like ${'AP-' + day + '-%'}`);
  return `AP-${day}-${String((row?.n ?? 0) + 1 + offset).padStart(2, '0')}`;
}

async function latestVersions(tx: Tx) {
  const rows = await tx.select().from(assumptions).orderBy(assumptions.key, desc(assumptions.version));
  const latest = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!latest.has(r.key)) latest.set(r.key, r);
  return { rows, latest };
}

/**
 * Proposes new assumption versions from missed outcome reviews that have none yet. Idempotent: one proposal per
 * assumption and review. Returns the keys created.
 */
export async function proposeFromMissed(
  tx: Tx,
  institutionId: string,
  reviewIds?: string[],
): Promise<string[]> {
  const missed = await tx
    .select()
    .from(outcomeReviews)
    .where(
      and(
        eq(outcomeReviews.verdict, 'missed'),
        reviewIds?.length ? inArray(outcomeReviews.id, reviewIds) : undefined,
      ),
    );
  if (!missed.length) return [];
  const existing = await tx
    .select({ a: assumptionProposals.assumptionKey, r: assumptionProposals.outcomeReviewId })
    .from(assumptionProposals)
    .where(
      inArray(
        assumptionProposals.outcomeReviewId,
        missed.map((m) => m.id),
      ),
    );
  const { latest } = await latestVersions(tx);
  const now = new Date();
  const created: string[] = [];
  for (const m of missed) {
    for (const k of assumptionsBehind(m.figureRef)) {
      if (existing.some((e) => e.a === k && e.r === m.id)) continue;
      const base = latest.get(k);
      if (!base) continue;
      const p = proposeRange(
        {
          key: k,
          version: base.version,
          low: Number(base.low),
          central: Number(base.central),
          high: Number(base.high),
        },
        {
          figureRef: m.figureRef,
          expectedLow: Number(m.expectedLow),
          expectedHigh: Number(m.expectedHigh),
          observedValue: Number(m.observedValue),
        },
      );
      if (!p) continue;
      const key = await nextKey(tx, now, 0);
      await tx.insert(assumptionProposals).values({
        institutionId,
        key,
        assumptionKey: k,
        baseVersion: base.version,
        outcomeReviewId: m.id,
        methodVersion: LEARNING_VERSION,
        low: String(p.low),
        central: String(p.central),
        high: String(p.high),
        basis: `${m.key} (${m.figureLabel}): ${p.basis}`,
        status: 'proposed',
        proposedFor: m.reviewerId,
        createdAt: now,
      });
      created.push(key);
    }
  }
  if (created.length)
    await appendAudit(tx, {
      institutionId,
      actorPrincipalId: null,
      actorType: 'service',
      action: 'learning.proposed',
      objectType: 'assumption_proposal',
      objectId: null,
      caseId: null,
      payload: { version: LEARNING_VERSION, proposals: created },
    });
  return created;
}

export async function learningRoutes(app: FastifyInstance, deps: AppDeps) {
  const guard = { preHandler: requireSession(deps) };

  app.get('/api/learning', guard, async (request): Promise<LearningOverview> => {
    const ctx = ctxOf(request);
    return withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const [{ rows, latest }, proposals, reviews, people, readable] = await Promise.all([
        latestVersions(tx),
        tx
          .select({
            p: assumptionProposals,
            reviewKey: outcomeReviews.key,
            caseId: outcomeReviews.caseId,
            caseKey: cases.key,
          })
          .from(assumptionProposals)
          .innerJoin(outcomeReviews, eq(outcomeReviews.id, assumptionProposals.outcomeReviewId))
          .innerJoin(cases, eq(cases.id, outcomeReviews.caseId))
          .orderBy(desc(assumptionProposals.createdAt)),
        tx
          .select({
            figureRef: outcomeReviews.figureRef,
            verdict: outcomeReviews.verdict,
            engine: scenarioRuns.engineVersion,
          })
          .from(outcomeReviews)
          .leftJoin(
            scenarioRuns,
            sql`${outcomeReviews.figureRef} like 'scenario:' || ${scenarioRuns.key} || ':%'`,
          ),
        tx.select({ id: principals.id, name: principals.displayName }).from(principals),
        tx.select({ id: cases.id }).from(cases).where(caseReadable(ctx.scope)),
      ]);
      const name = (id: string | null) => (id ? (people.find((p) => p.id === id)?.name ?? null) : null);
      const canRead = new Set(readable.map((r) => r.id));
      const calibration = calibrate(reviews, [...ASSUMPTION_KEYS]);
      const engines = [...new Set(reviews.map((r) => r.engine ?? 'unknown engine'))].sort();
      return {
        version: LEARNING_VERSION,
        canDecide: ctx.roles.includes('domain_expert'),
        assumptions: [...latest.values()].map((l) => {
          const c = calibration.find((x) => x.assumptionKey === l.key);
          return {
            key: l.key,
            label: l.label,
            unit: l.unit,
            calibration: { held: c?.held ?? 0, missed: c?.missed ?? 0, hitRate: c?.hitRate ?? null },
            versions: rows
              .filter((r) => r.key === l.key)
              .map((r) => ({
                version: r.version,
                low: Number(r.low),
                central: Number(r.central),
                high: Number(r.high),
                rationale: r.rationale,
                effectiveFrom: r.effectiveFrom.toISOString(),
              })),
          };
        }),
        models: engines.map((engine) => {
          const mine = reviews.filter(
            (r) => (r.engine ?? 'unknown engine') === engine && r.verdict !== 'not_comparable',
          );
          const held = mine.filter((r) => r.verdict === 'held').length;
          return { engine, held, missed: mine.length - held };
        }),
        proposals: proposals.map(({ p, reviewKey, caseId, caseKey }): AssumptionProposalItem => ({
          key: p.key,
          assumptionKey: p.assumptionKey,
          baseVersion: p.baseVersion,
          currentVersion: latest.get(p.assumptionKey)?.version ?? p.baseVersion,
          methodVersion: p.methodVersion,
          low: Number(p.low),
          central: Number(p.central),
          high: Number(p.high),
          basis: p.basis,
          status: p.status as AssumptionProposalItem['status'],
          outcomeReviewKey: reviewKey,
          caseKey: canRead.has(caseId) ? caseKey : null,
          proposedFor: name(p.proposedFor),
          decidedBy: name(p.decidedBy),
          decidedAt: p.decidedAt?.toISOString() ?? null,
          decisionNote: p.decisionNote,
          newVersion: p.newVersion,
          createdAt: p.createdAt.toISOString(),
          mine: p.proposedFor === ctx.principalId,
        })),
      };
    });
  });

  app.post('/api/learning/proposals/:key/:action', guard, async (request, reply) => {
    const ctx = ctxOf(request);
    const p = z
      .object({ key: z.string().regex(/^AP-[0-9]{8}-[0-9]{2,4}$/), action: z.enum(['approve', 'reject']) })
      .safeParse(request.params);
    const body = z.object({ note: z.string().trim().min(10).max(1000) }).safeParse(request.body);
    if (!p.success) return reply.code(404).send({ error: 'not_found' });
    if (!body.success) return reply.code(400).send({ error: 'note_required' });
    if (!ctx.roles.includes('domain_expert')) return reply.code(403).send({ error: 'not_permitted' });
    return withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const [row] = await tx
        .select()
        .from(assumptionProposals)
        .where(eq(assumptionProposals.key, p.data.key))
        .for('update');
      if (!row) return reply.code(404).send({ error: 'not_found' });
      if (row.status !== 'proposed') return reply.code(409).send({ error: 'decided' });
      if (row.proposedFor === ctx.principalId)
        return reply
          .code(403)
          .send({ error: 'own_review', message: 'You recorded the outcome review behind this proposal.' });
      const now = new Date();
      let newVersion: number | null = null;
      if (p.data.action === 'approve') {
        const { latest } = await latestVersions(tx);
        const base = latest.get(row.assumptionKey);
        if (!base || base.version !== row.baseVersion)
          return reply.code(409).send({
            error: 'stale',
            message: `The assumption has moved to version ${base?.version}; this proposal was made against version ${row.baseVersion}.`,
          });
        newVersion = base.version + 1;
        await tx.insert(assumptions).values({
          institutionId: ctx.institutionId,
          key: base.key,
          label: base.label,
          unit: base.unit,
          low: row.low,
          central: row.central,
          high: row.high,
          rationale: `${row.key} approved: ${body.data.note} Basis: ${row.basis}`,
          basisEvidenceId: base.basisEvidenceId,
          ownerRole: base.ownerRole,
          claimClass: 'assumed',
          version: newVersion,
          effectiveFrom: now,
        });
      }
      await tx
        .update(assumptionProposals)
        .set({
          status: p.data.action === 'approve' ? 'approved' : 'rejected',
          decidedBy: ctx.principalId,
          decidedAt: now,
          decisionNote: body.data.note,
          newVersion,
        })
        .where(eq(assumptionProposals.id, row.id));
      await appendAudit(tx, {
        institutionId: ctx.institutionId,
        actorPrincipalId: ctx.principalId,
        actorType: 'human',
        action: `learning.${p.data.action === 'approve' ? 'approved' : 'rejected'}`,
        objectType: 'assumption_proposal',
        objectId: row.id,
        caseId: null,
        payload: { key: row.key, assumption: row.assumptionKey, newVersion, note: body.data.note },
      });
      return { key: row.key, status: p.data.action === 'approve' ? 'approved' : 'rejected', newVersion };
    });
  });
}
