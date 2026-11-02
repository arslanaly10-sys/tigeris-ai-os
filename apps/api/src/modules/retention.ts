/**
 * Data retention (pilot readiness, D-126). An administrator sets how long two kinds of operational data are kept;
 * anyone who may see administration can preview what a purge would remove; only an administrator runs it, and every
 * change and purge is in the audit chain. Nothing a number or decision cites is in scope (see migration 0021).
 */
import { RETENTION_CLASSES, type RetentionClass, type RetentionOverview } from '@tigeris/shared';
import { and, count, eq, inArray, lt, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { appendAudit } from '../audit/audit';
import { withInstitution, type Tx } from '../db/client';
import { connectorRuns, interventions, retentionPolicies, rowIssues } from '../db/schema';
import { ctxOf, requireSession, type AppDeps } from './context';

const DESCRIPTIONS: Record<RetentionClass, string> = {
  import_row_issues:
    'Raw rows an import rejected or warned about. They can hold client data; the import run keeps its counts.',
  closed_interventions:
    'Interventions resolved or dismissed. The audit chain keeps who closed each one and why.',
};

const cutoff = (days: number) => new Date(Date.now() - days * 86_400_000);

/** How many rows a purge would remove now under `days`. Same conditions as retention_purge(). */
async function eligible(tx: Tx, cls: RetentionClass, days: number): Promise<number> {
  if (cls === 'import_row_issues') {
    const [r] = await tx
      .select({ n: count() })
      .from(rowIssues)
      .innerJoin(connectorRuns, eq(connectorRuns.id, rowIssues.runId))
      .where(lt(connectorRuns.finishedAt, cutoff(days)));
    return r?.n ?? 0;
  }
  const [r] = await tx
    .select({ n: count() })
    .from(interventions)
    .where(and(inArray(interventions.status, ['resolved', 'dismissed']), lt(interventions.closedAt, cutoff(days))));
  return r?.n ?? 0;
}

export async function retentionRoutes(app: FastifyInstance, deps: AppDeps) {
  const guard = { preHandler: requireSession(deps) };

  app.get('/api/admin/retention', guard, async (request, reply): Promise<RetentionOverview | undefined> => {
    const ctx = ctxOf(request);
    if (!ctx.roles.includes('administrator') && !ctx.roles.includes('auditor'))
      return reply.code(403).send({ error: 'not_permitted' });
    return withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const rows = await tx.select().from(retentionPolicies);
      const policies = await Promise.all(
        RETENTION_CLASSES.map(async (cls) => {
          const p = rows.find((r) => r.dataClass === cls);
          return {
            dataClass: cls,
            description: DESCRIPTIONS[cls],
            keepDays: p?.keepDays ?? null,
            reason: p?.reason ?? null,
            setAt: p?.setAt.toISOString() ?? null,
            eligibleNow: p ? await eligible(tx, cls, p.keepDays) : null,
          };
        }),
      );
      return {
        policies,
        canManage: ctx.roles.includes('administrator'),
        note: 'Cases, evidence, sources, decisions, memory, the audit chain and model costs are never purged.',
      };
    });
  });

  app.put('/api/admin/retention/:dataClass', guard, async (request, reply) => {
    const p = z.object({ dataClass: z.enum(RETENTION_CLASSES) }).safeParse(request.params);
    const body = z
      .object({ keepDays: z.number().int().min(30).max(3650), reason: z.string().trim().min(10).max(500) })
      .safeParse(request.body);
    if (!p.success) return reply.code(404).send({ error: 'not_found' });
    if (!body.success) return reply.code(400).send({ error: 'bad_request' });
    const ctx = ctxOf(request);
    if (!ctx.roles.includes('administrator')) return reply.code(403).send({ error: 'not_permitted' });
    return withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const values = { keepDays: body.data.keepDays, reason: body.data.reason, setBy: ctx.principalId, setAt: new Date() };
      await tx
        .insert(retentionPolicies)
        .values({ institutionId: ctx.institutionId, dataClass: p.data.dataClass, ...values })
        .onConflictDoUpdate({ target: [retentionPolicies.institutionId, retentionPolicies.dataClass], set: values });
      await appendAudit(tx, {
        institutionId: ctx.institutionId,
        actorPrincipalId: ctx.principalId,
        actorType: 'human',
        action: 'retention.policy_set',
        objectType: 'retention_policy',
        objectId: null,
        payload: { dataClass: p.data.dataClass, keepDays: body.data.keepDays, reason: body.data.reason },
      });
      return { ok: true };
    });
  });

  app.post('/api/admin/retention/purge', guard, async (request, reply) => {
    const body = z.object({ reason: z.string().trim().min(10).max(500) }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'reason_required' });
    const ctx = ctxOf(request);
    if (!ctx.roles.includes('administrator')) return reply.code(403).send({ error: 'not_permitted' });
    return withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const purged: Partial<Record<RetentionClass, number>> = {};
      for (const cls of RETENTION_CLASSES) {
        const [r] = await tx.execute<{ n: number }>(sql`select retention_purge(${cls}) as n`);
        purged[cls] = Number(r?.n ?? 0);
      }
      await appendAudit(tx, {
        institutionId: ctx.institutionId,
        actorPrincipalId: ctx.principalId,
        actorType: 'human',
        action: 'retention.purged',
        objectType: 'retention_policy',
        objectId: null,
        payload: { purged, reason: body.data.reason },
      });
      return { purged };
    });
  });
}
