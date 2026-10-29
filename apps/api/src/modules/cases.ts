import type { CaseDetail, CaseEventItem, CaseState, CaseSummary, EvidenceItem } from '@tigeris/shared';
import { asc, desc, eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { appendAudit } from '../audit/audit';
import { withInstitution, type Tx } from '../db/client';
import { caseEvents, caseEvidence, cases, evidenceFacts, evidenceObjects, principals } from '../db/schema';
import { ctxOf, requireSession, type AppDeps } from './context';
import { toCaseSummary, toEvidence } from './mappers';
import { listSources } from './sources';

export async function listCases(tx: Tx): Promise<CaseSummary[]> {
  const rows = await tx
    .select({ c: cases, owner: principals.displayName })
    .from(cases)
    .innerJoin(principals, eq(principals.id, cases.ownerPrincipalId))
    .orderBy(desc(cases.updatedAt));
  return rows.map((r) => toCaseSummary(r.c, r.owner));
}

export async function loadEvidence(tx: Tx, evidenceIds: string[]): Promise<EvidenceItem[]> {
  if (evidenceIds.length === 0) return [];
  const [objects, facts, sourceList] = await Promise.all([
    tx.select().from(evidenceObjects).where(inArray(evidenceObjects.id, evidenceIds)),
    tx
      .select()
      .from(evidenceFacts)
      .where(inArray(evidenceFacts.evidenceId, evidenceIds))
      .orderBy(asc(evidenceFacts.sortOrder)),
    listSources(tx),
  ]);
  const sourceById = new Map(sourceList.map((s) => [s.id, s]));
  const byId = new Map(
    objects.map((e) => [
      e.id,
      toEvidence(
        e,
        sourceById.get(e.sourceId)!,
        facts.filter((f) => f.evidenceId === e.id),
      ),
    ]),
  );
  return evidenceIds.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
}

async function loadCase(tx: Tx, key: string): Promise<CaseDetail | null> {
  const [row] = await tx
    .select({ c: cases, owner: principals.displayName })
    .from(cases)
    .innerJoin(principals, eq(principals.id, cases.ownerPrincipalId))
    .where(eq(cases.key, key));
  if (!row) return null;
  const links = await tx
    .select({ evidenceId: caseEvidence.evidenceId })
    .from(caseEvidence)
    .where(eq(caseEvidence.caseId, row.c.id))
    .orderBy(asc(caseEvidence.sortOrder));
  const evidence = await loadEvidence(
    tx,
    links.map((l) => l.evidenceId),
  );
  const events = await tx
    .select({ e: caseEvents, actor: principals.displayName })
    .from(caseEvents)
    .leftJoin(principals, eq(principals.id, caseEvents.actorPrincipalId))
    .where(eq(caseEvents.caseId, row.c.id))
    .orderBy(asc(caseEvents.occurredAt));

  return {
    ...toCaseSummary(row.c, row.owner),
    objective: row.c.objective,
    summary: row.c.summary,
    whyItMatters: row.c.whyItMatters,
    unresolvedQuestions: row.c.unresolvedQuestions,
    confidence: row.c.confidence,
    createdAt: row.c.createdAt.toISOString(),
    version: row.c.version,
    evidence,
    events: events.map((r): CaseEventItem => ({
      id: r.e.id,
      eventType: r.e.eventType,
      fromState: r.e.fromState as CaseState | null,
      toState: r.e.toState as CaseState | null,
      actor: r.actor ?? 'TIGERIS service',
      rationale: r.e.rationale,
      occurredAt: r.e.occurredAt.toISOString(),
    })),
  };
}

export async function caseRoutes(app: FastifyInstance, deps: AppDeps) {
  const guard = { preHandler: requireSession(deps) };

  app.get('/api/cases', guard, async (request) => {
    const ctx = ctxOf(request);
    return withInstitution(deps.db, ctx.institutionId, listCases);
  });

  app.get('/api/cases/:key', guard, async (request, reply) => {
    const params = z.object({ key: z.string().regex(/^[A-Z0-9-]{3,40}$/) }).safeParse(request.params);
    if (!params.success) return reply.code(404).send({ error: 'not_found' });
    const ctx = ctxOf(request);
    const detail = await withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const found = await loadCase(tx, params.data.key);
      if (found) {
        await appendAudit(tx, {
          institutionId: ctx.institutionId,
          actorPrincipalId: ctx.principalId,
          actorType: 'human',
          action: 'case.viewed',
          objectType: 'case',
          objectId: found.id,
          caseId: found.id,
          payload: { key: found.key, version: found.version },
        });
      }
      return found;
    });
    // Same response for "missing" and "other institution": never reveal existence across boundaries.
    if (!detail) return reply.code(404).send({ error: 'not_found' });
    return detail;
  });

  app.get('/api/evidence/:id', guard, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(404).send({ error: 'not_found' });
    const ctx = ctxOf(request);
    const item = await withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const [found] = await loadEvidence(tx, [params.data.id]);
      if (found) {
        await appendAudit(tx, {
          institutionId: ctx.institutionId,
          actorPrincipalId: ctx.principalId,
          actorType: 'human',
          action: 'evidence.lineage_viewed',
          objectType: 'evidence',
          objectId: found.id,
        });
      }
      return found ?? null;
    });
    if (!item) return reply.code(404).send({ error: 'not_found' });
    return item;
  });
}
