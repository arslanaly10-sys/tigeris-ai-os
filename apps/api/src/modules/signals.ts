import {
  sectorForDomain,
  ACTION_RESULT,
  canTriage,
  OPEN_DISPOSITIONS,
  SIGNAL_ACTIONS,
  type ConfidenceBand,
  type DataMode,
  type SignalAction,
  type SignalDetail,
  type SignalDisposition,
  type SignalSummary,
  type SignalType,
  type Urgency,
} from '@tigeris/shared';
import { asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { appendAudit } from '../audit/audit';
import { withInstitution, type Tx } from '../db/client';
import {
  caseEntities,
  caseEvents,
  caseEvidence,
  cases,
  principals,
  signalEvents,
  signalEvidence,
  signals,
} from '../db/schema';
import { loadEvidence } from './cases';
import { ctxOf, requireSession, type AppDeps, type RequestContext } from './context';

type SignalRow = typeof signals.$inferSelect;

async function summarise(tx: Tx, rows: SignalRow[]): Promise<SignalSummary[]> {
  if (rows.length === 0) return [];
  const links = await tx
    .select({ signalId: signalEvidence.signalId, evidenceId: signalEvidence.evidenceId })
    .from(signalEvidence)
    .where(
      inArray(
        signalEvidence.signalId,
        rows.map((r) => r.id),
      ),
    );
  const evidence = await loadEvidence(tx, [...new Set(links.map((l) => l.evidenceId))]);
  const byId = new Map(evidence.map((e) => [e.id, e]));
  const caseIds = rows.flatMap((r) => (r.caseId ? [r.caseId] : []));
  const caseRows = caseIds.length
    ? await tx.select({ id: cases.id, key: cases.key }).from(cases).where(inArray(cases.id, caseIds))
    : [];
  const caseKey = new Map(caseRows.map((c) => [c.id, c.key]));

  return rows.map((s) => {
    const primary =
      links
        .filter((l) => l.signalId === s.id)
        .map((l) => byId.get(l.evidenceId))
        .find(Boolean) ?? null;
    return {
      id: s.id,
      key: s.key,
      title: s.title,
      summary: s.summary,
      signalType: s.signalType as SignalType,
      domain: s.domain,
      urgency: s.urgency as Urgency,
      dataMode: s.dataMode as DataMode,
      disposition: s.disposition as SignalDisposition,
      confidenceBand: s.confidenceBand as ConfidenceBand,
      locationLabel: s.locationLabel,
      detectedAt: s.detectedAt.toISOString(),
      eventTime: primary?.eventTime ?? null,
      retrievedAt: primary?.retrievedAt ?? null,
      primarySource: primary?.source ?? null,
      validationStatus: primary?.validationStatus ?? null,
      caseKey: s.caseId ? (caseKey.get(s.caseId) ?? null) : null,
    };
  });
}

export async function listSignals(tx: Tx): Promise<SignalSummary[]> {
  const rows = await tx.select().from(signals).orderBy(desc(signals.detectedAt));
  return summarise(tx, rows);
}

function allowedActions(ctx: RequestContext, disposition: SignalDisposition): SignalAction[] {
  if (!OPEN_DISPOSITIONS.includes(disposition)) return [];
  return SIGNAL_ACTIONS.filter((a) => canTriage(ctx.roles, a) && ACTION_RESULT[a] !== disposition);
}

async function loadSignal(tx: Tx, key: string, ctx: RequestContext): Promise<SignalDetail | null> {
  const [row] = await tx.select().from(signals).where(eq(signals.key, key));
  if (!row) return null;
  const [summary] = await summarise(tx, [row]);
  const links = await tx
    .select({ evidenceId: signalEvidence.evidenceId })
    .from(signalEvidence)
    .where(eq(signalEvidence.signalId, row.id));
  const evidence = await loadEvidence(
    tx,
    links.map((l) => l.evidenceId),
  );
  const events = await tx
    .select({ e: signalEvents, actor: principals.displayName })
    .from(signalEvents)
    .innerJoin(principals, eq(principals.id, signalEvents.actorPrincipalId))
    .where(eq(signalEvents.signalId, row.id))
    .orderBy(asc(signalEvents.occurredAt));
  return {
    ...summary!,
    evidence,
    events: events.map((r) => ({
      id: r.e.id,
      action: r.e.action as SignalAction,
      fromDisposition: r.e.fromDisposition as SignalDisposition,
      toDisposition: r.e.toDisposition as SignalDisposition,
      actor: r.actor,
      rationale: r.e.rationale,
      occurredAt: r.e.occurredAt.toISOString(),
    })),
    allowedActions: allowedActions(ctx, summary!.disposition),
  };
}

async function nextCaseKey(tx: Tx, now: Date): Promise<string> {
  const day = now.toISOString().slice(0, 10).replace(/-/g, '');
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(cases)
    .where(sql`${cases.key} like ${'CASE-' + day + '-%'}`);
  return `CASE-${day}-${String((row?.n ?? 0) + 1).padStart(2, '0')}`;
}

const actionBody = z.object({
  action: z.enum(SIGNAL_ACTIONS),
  rationale: z.string().trim().min(3).max(2000),
});

export async function signalRoutes(app: FastifyInstance, deps: AppDeps) {
  const guard = { preHandler: requireSession(deps) };

  app.get('/api/signals', guard, async (request) => {
    const ctx = ctxOf(request);
    return withInstitution(deps.db, ctx.institutionId, listSignals);
  });

  app.get('/api/signals/:key', guard, async (request, reply) => {
    const params = z.object({ key: z.string().regex(/^[A-Z0-9-]{3,40}$/) }).safeParse(request.params);
    if (!params.success) return reply.code(404).send({ error: 'not_found' });
    const ctx = ctxOf(request);
    const detail = await withInstitution(deps.db, ctx.institutionId, (tx) =>
      loadSignal(tx, params.data.key, ctx),
    );
    if (!detail) return reply.code(404).send({ error: 'not_found' });
    return detail;
  });

  /** Triage a signal (App Flow step 3): corroborate, challenge, monitor, dismiss or open a case — with rationale. */
  app.post('/api/signals/:key/actions', guard, async (request, reply) => {
    const params = z.object({ key: z.string().regex(/^[A-Z0-9-]{3,40}$/) }).safeParse(request.params);
    const body = actionBody.safeParse(request.body);
    if (!params.success) return reply.code(404).send({ error: 'not_found' });
    if (!body.success) return reply.code(400).send({ error: 'rationale_required' });
    const ctx = ctxOf(request);
    const { action, rationale } = body.data;
    if (!canTriage(ctx.roles, action)) return reply.code(403).send({ error: 'not_permitted' });

    const result = await withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const [row] = await tx.select().from(signals).where(eq(signals.key, params.data.key)).for('update');
      if (!row) return { status: 404 as const };
      const from = row.disposition as SignalDisposition;
      if (!OPEN_DISPOSITIONS.includes(from)) return { status: 409 as const };
      const to = ACTION_RESULT[action];
      const now = new Date();
      let caseKey: string | null = null;

      if (action === 'open_case') {
        caseKey = await nextCaseKey(tx, now);
        const [created] = await tx
          .insert(cases)
          .values({
            institutionId: ctx.institutionId,
            key: caseKey,
            title: row.title,
            state: 'triaged',
            domain: row.domain,
            sensitivity: 'restricted',
            sectorKey: sectorForDomain(row.domain),
            urgency: row.urgency,
            dataMode: row.dataMode,
            ownerPrincipalId: ctx.principalId,
            objective: `Assess signal ${row.key}: ${row.title}`,
            summary: row.summary,
            whyItMatters: rationale,
            unresolvedQuestions: ['Corroborate the signal with an independent source.'],
            confidence: {
              band: row.confidenceBand as ConfidenceBand,
              factors: [
                {
                  factor: 'source_quality',
                  band: row.confidenceBand as ConfidenceBand,
                  note: 'Carried from signal triage.',
                },
                { factor: 'graph_completeness', band: 'insufficient', note: 'Impact paths not yet traced.' },
                { factor: 'scenario_stability', band: 'insufficient', note: 'No scenario runs yet.' },
              ],
            },
            version: 2,
            createdAt: now,
            updatedAt: now,
          })
          .returning({ id: cases.id });
        const links = await tx.select().from(signalEvidence).where(eq(signalEvidence.signalId, row.id));
        for (const [i, l] of links.entries()) {
          await tx.insert(caseEvidence).values({
            institutionId: ctx.institutionId,
            caseId: created!.id,
            evidenceId: l.evidenceId,
            sortOrder: i,
          });
        }
        if (row.entityId) {
          await tx.insert(caseEntities).values({
            institutionId: ctx.institutionId,
            caseId: created!.id,
            entityId: row.entityId,
            role: 'origin',
          });
        }
        await tx.insert(caseEvents).values([
          {
            institutionId: ctx.institutionId,
            caseId: created!.id,
            actorPrincipalId: ctx.principalId,
            eventType: 'case.opened_from_signal',
            fromState: null,
            toState: 'detected',
            rationale: `Opened from signal ${row.key}.`,
            occurredAt: now,
          },
          {
            institutionId: ctx.institutionId,
            caseId: created!.id,
            actorPrincipalId: ctx.principalId,
            eventType: 'case.state_changed',
            fromState: 'detected',
            toState: 'triaged',
            rationale,
            occurredAt: now,
          },
        ]);
        await tx.update(signals).set({ disposition: to, caseId: created!.id }).where(eq(signals.id, row.id));
      } else {
        await tx.update(signals).set({ disposition: to }).where(eq(signals.id, row.id));
      }

      await tx.insert(signalEvents).values({
        institutionId: ctx.institutionId,
        signalId: row.id,
        actorPrincipalId: ctx.principalId,
        action,
        fromDisposition: from,
        toDisposition: to,
        rationale,
        occurredAt: now,
      });
      await appendAudit(tx, {
        institutionId: ctx.institutionId,
        actorPrincipalId: ctx.principalId,
        actorType: 'human',
        action: `signal.${action}`,
        objectType: 'signal',
        objectId: row.id,
        payload: { key: row.key, from, to, rationale, caseKey },
      });
      return { status: 200 as const, detail: await loadSignal(tx, row.key, ctx), caseKey };
    });

    if (result.status === 404) return reply.code(404).send({ error: 'not_found' });
    if (result.status === 409) return reply.code(409).send({ error: 'signal_settled' });
    return { signal: result.detail, caseKey: result.caseKey };
  });
}
