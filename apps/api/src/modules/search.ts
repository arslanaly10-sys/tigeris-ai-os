import type { SearchResult } from '@tigeris/shared';
import { and, ilike, or } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withInstitution } from '../db/client';
import { cases, entities, signals } from '../db/schema';
import { ctxOf, requireSession, type AppDeps } from './context';
import { caseReadable } from './scope';

const escapeLike = (q: string) => q.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Institution-scoped search across cases, signals and graph entities. */
export async function searchRoutes(app: FastifyInstance, deps: AppDeps) {
  app.get('/api/search', { preHandler: requireSession(deps) }, async (request): Promise<SearchResult[]> => {
    const parsed = z.object({ q: z.string().trim().min(2).max(100) }).safeParse(request.query);
    if (!parsed.success) return [];
    const pattern = `%${escapeLike(parsed.data.q)}%`;
    const ctx = ctxOf(request);
    return withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const [c, s, e] = await Promise.all([
        tx
          .select()
          .from(cases)
          .where(and(or(ilike(cases.title, pattern), ilike(cases.key, pattern)), caseReadable(ctx.scope)))
          .limit(5),
        tx
          .select()
          .from(signals)
          .where(or(ilike(signals.title, pattern), ilike(signals.key, pattern)))
          .limit(5),
        tx.select().from(entities).where(ilike(entities.name, pattern)).limit(5),
      ]);
      return [
        ...c.map((x) => ({
          kind: 'case' as const,
          ref: x.key,
          title: x.title,
          detail: x.domain,
          href: `/cases/${x.key}`,
        })),
        ...s.map((x) => ({
          kind: 'signal' as const,
          ref: x.key,
          title: x.title,
          detail: x.domain,
          href: `/signals?selected=${x.key}`,
        })),
        ...e.map((x) => ({
          kind: 'entity' as const,
          ref: x.key,
          title: x.name,
          detail: x.entityType,
          href: `/graph?focus=${x.key}`,
        })),
      ];
    });
  });
}
