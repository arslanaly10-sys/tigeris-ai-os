import type { SourceSummary } from '@tigeris/shared';
import { asc, eq, max } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { withInstitution, type Tx } from '../db/client';
import { evidenceObjects, sources } from '../db/schema';
import { ctxOf, requireSession, type AppDeps } from './context';
import { toSource } from './mappers';

/** Source registry with freshness derived from the latest retrieval of each source's evidence. */
export async function listSources(tx: Tx): Promise<SourceSummary[]> {
  const rows = await tx
    .select({ source: sources, lastRetrievedAt: max(evidenceObjects.retrievedAt) })
    .from(sources)
    .leftJoin(evidenceObjects, eq(evidenceObjects.sourceId, sources.id))
    .groupBy(sources.id)
    .orderBy(asc(sources.publisher), asc(sources.title));
  return rows.map((r) => toSource(r.source, r.lastRetrievedAt));
}

export async function sourceRoutes(app: FastifyInstance, deps: AppDeps) {
  app.get('/api/sources', { preHandler: requireSession(deps) }, async (request) => {
    const ctx = ctxOf(request);
    return withInstitution(deps.db, ctx.institutionId, listSources);
  });
}
