import type { IngestionJobItem, ValidationOutcome } from '@tigeris/shared';
import { asc, desc, eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { withInstitution } from '../db/client';
import { ingestionJobs, principals, sources, validationRuns } from '../db/schema';
import { ingestPackage, sampleSyntheticPackage } from '../ingestion/service';
import { snapshotPackageSchema } from '../ingestion/rules';
import { ctxOf, requireSession, type AppDeps } from './context';

const INGEST_ROLES = ['administrator'] as const;

export async function ingestionRoutes(app: FastifyInstance, deps: AppDeps) {
  const guard = { preHandler: requireSession(deps) };

  app.get('/api/ingestion', guard, async (request): Promise<IngestionJobItem[]> => {
    const ctx = ctxOf(request);
    return withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const jobs = await tx
        .select({ j: ingestionJobs, source: sources.title, actor: principals.displayName })
        .from(ingestionJobs)
        .leftJoin(sources, eq(sources.id, ingestionJobs.sourceId))
        .leftJoin(principals, eq(principals.id, ingestionJobs.actorPrincipalId))
        .orderBy(desc(ingestionJobs.completedAt));
      const runs = jobs.length
        ? await tx
            .select()
            .from(validationRuns)
            .where(
              inArray(
                validationRuns.ingestionJobId,
                jobs.map((j) => j.j.id),
              ),
            )
            .orderBy(asc(validationRuns.occurredAt))
        : [];
      return jobs.map(({ j, source, actor }) => ({
        id: j.id,
        packageId: j.packageId,
        packageSha256: j.packageSha256,
        source,
        ruleSetVersion: j.ruleSetVersion,
        actor,
        status: j.status as IngestionJobItem['status'],
        counts: {
          accepted: j.acceptedCount,
          warned: j.warnedCount,
          quarantined: j.quarantinedCount,
          rejected: j.rejectedCount,
        },
        completedAt: j.completedAt.toISOString(),
        runs: runs
          .filter((r) => r.ingestionJobId === j.id)
          .map((r) => ({
            id: r.id,
            externalId: r.externalId,
            outcome: r.outcome as ValidationOutcome,
            rationale: r.rationale,
            checks: r.checks,
            evidenceId: r.evidenceId,
          })),
      }));
    });
  });

  /** Imports a snapshot package (administrators only). Validation runs before anything is admitted. */
  app.post('/api/ingestion', guard, async (request, reply) => {
    const ctx = ctxOf(request);
    if (!ctx.roles.some((r) => (INGEST_ROLES as readonly string[]).includes(r))) {
      return reply.code(403).send({ error: 'not_permitted' });
    }
    const pkg = snapshotPackageSchema.safeParse(request.body);
    if (!pkg.success) return reply.code(400).send({ error: 'invalid_package' });
    return withInstitution(deps.db, ctx.institutionId, (tx) =>
      ingestPackage(tx, ctx.institutionId, ctx.principalId, pkg.data),
    );
  });

  /** Runs a freshly generated synthetic sample package (one clean, one tampered record) for demonstration. */
  app.post('/api/ingestion/sample', guard, async (request, reply) => {
    const ctx = ctxOf(request);
    if (!ctx.roles.some((r) => (INGEST_ROLES as readonly string[]).includes(r))) {
      return reply.code(403).send({ error: 'not_permitted' });
    }
    return withInstitution(deps.db, ctx.institutionId, (tx) =>
      ingestPackage(tx, ctx.institutionId, ctx.principalId, sampleSyntheticPackage()),
    );
  });
}
