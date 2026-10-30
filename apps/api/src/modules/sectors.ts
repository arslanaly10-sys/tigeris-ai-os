import {
  SECTOR_BY_KEY,
  SECTOR_KEYS,
  SECTORS,
  type AuthorityRuleItem,
  type ClaimClass,
  type MandateItem,
  type ReadScope,
  type Role,
  type SectorDef,
  type SectorDetail,
  type SectorKey,
  type SectorKpi,
  type SectorSummary,
  type ValidationStatus,
} from '@tigeris/shared';
import { asc, eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withInstitution, type Tx } from '../db/client';
import {
  authorityLimits,
  authorityRules,
  evidenceFacts,
  evidenceObjects,
  mandates,
  sources,
} from '../db/schema';
import { listCases } from './cases';
import { ctxOf, requireSession, type AppDeps } from './context';
import { listSignals } from './signals';

const inSector = (def: SectorDef, domain: string) =>
  def.domains.some((d) => d.toLowerCase() === domain.toLowerCase());

/**
 * Resolves sector KPIs through their evidence-fact bindings. Unbound KPIs, or bindings whose evidence is
 * missing or quarantined, return null and render as "Source not connected" — never a placeholder value.
 */
async function resolveKpis(tx: Tx, def: SectorDef): Promise<SectorKpi[]> {
  const ids = [...new Set(def.kpis.flatMap((k) => (k.binding ? [k.binding.externalId] : [])))];
  const rows = ids.length
    ? await tx
        .select({ e: evidenceObjects, f: evidenceFacts, publisher: sources.publisher })
        .from(evidenceObjects)
        .innerJoin(evidenceFacts, eq(evidenceFacts.evidenceId, evidenceObjects.id))
        .innerJoin(sources, eq(sources.id, evidenceObjects.sourceId))
        .where(inArray(evidenceObjects.externalId, ids))
    : [];
  return def.kpis.map((k) => {
    const hit = k.binding
      ? rows.find(
          (r) =>
            r.e.externalId === k.binding!.externalId &&
            r.f.predicate === k.binding!.predicate &&
            r.e.validationStatus !== 'quarantined',
        )
      : undefined;
    return {
      key: k.key,
      label: k.label,
      value: hit
        ? {
            valueNum: hit.f.valueNum === null ? null : Number(hit.f.valueNum),
            valueText: hit.f.valueText,
            unit: hit.f.unit,
            claimClass: hit.f.claimClass as ClaimClass,
            evidenceId: hit.e.id,
            validationStatus: hit.e.validationStatus as ValidationStatus,
            publisher: hit.publisher,
            retrievedAt: hit.e.retrievedAt?.toISOString() ?? null,
          }
        : null,
    };
  });
}

async function summaries(tx: Tx, scope: ReadScope): Promise<SectorSummary[]> {
  const [cases, signals] = await Promise.all([listCases(tx, scope), listSignals(tx)]);
  return SECTORS.map((def) => ({
    key: def.key,
    label: def.label,
    depth: def.depth,
    openCases: cases.filter((c) => c.state !== 'closed' && inSector(def, c.domain)).length,
    newSignals: signals.filter((s) => s.disposition === 'new' && inSector(def, s.domain)).length,
    kpisConnected: def.kpis.filter((k) => k.binding).length,
    kpisTotal: def.kpis.length,
  }));
}

export async function sectorRoutes(app: FastifyInstance, deps: AppDeps) {
  const guard = { preHandler: requireSession(deps) };

  app.get('/api/sectors', guard, async (request) => {
    const ctx = ctxOf(request);
    return withInstitution(deps.db, ctx.institutionId, (tx) => summaries(tx, ctx.scope));
  });

  app.get('/api/sectors/:key', guard, async (request, reply) => {
    const params = z.object({ key: z.enum(SECTOR_KEYS) }).safeParse(request.params);
    if (!params.success) return reply.code(404).send({ error: 'not_found' });
    const def = SECTOR_BY_KEY[params.data.key as SectorKey];
    const ctx = ctxOf(request);
    return withInstitution(deps.db, ctx.institutionId, async (tx): Promise<SectorDetail> => {
      const [all, kpis, cases, signals] = await Promise.all([
        summaries(tx, ctx.scope),
        resolveKpis(tx, def),
        listCases(tx, ctx.scope),
        listSignals(tx),
      ]);
      const mine = cases.filter((c) => inSector(def, c.domain));
      const kpiTimes = kpis.flatMap((k) => (k.value?.retrievedAt ? [k.value.retrievedAt] : []));
      const caseTimes = mine.map((c) => c.updatedAt);
      const lastUpdated = [...kpiTimes, ...caseTimes].sort().at(-1) ?? null;
      return {
        ...all.find((s) => s.key === def.key)!,
        kpisConnected: kpis.filter((k) => k.value).length,
        title: def.title,
        tagline: def.tagline,
        kpis,
        cases: mine.filter((c) => c.state !== 'closed'),
        signals: signals.filter((s) => inSector(def, s.domain)),
        reviewQueue: mine.filter((c) => c.state === 'review' || c.state === 'decision'),
        entityKeys: def.entityKeys,
        lastUpdated,
      };
    });
  });

  app.get('/api/mandates', guard, async (request) => {
    const ctx = ctxOf(request);
    return withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const [m, r, l] = await Promise.all([
        tx.select().from(mandates).orderBy(asc(mandates.key)),
        tx.select().from(authorityRules).orderBy(asc(authorityRules.sortOrder)),
        tx.select().from(authorityLimits),
      ]);
      return {
        mandates: m.map((x): MandateItem => ({
          id: x.id,
          key: x.key,
          title: x.title,
          description: x.description,
          category: x.category,
          limitText: x.limitText,
          ownerRole: x.ownerRole as Role,
          claimClass: x.claimClass as ClaimClass,
        })),
        authority: r.map((x): AuthorityRuleItem => ({
          id: x.id,
          actionClass: x.actionClass,
          description: x.description,
          requiredRole: x.requiredRole as Role,
          thresholdText: x.thresholdText,
          requiresExpertReview: x.requiresExpertReview,
          twoPerson: x.twoPerson,
          selfApprovalBlocked: x.selfApprovalBlocked,
          claimClass: x.claimClass as ClaimClass,
          limits: l
            .filter((y) => y.actionClass === x.actionClass)
            .map((y) => ({
              role: y.role as Role,
              value: Number(y.limitValue),
              unit: y.limitUnit,
              basis: y.basis,
              claimClass: y.claimClass as ClaimClass,
            })),
        })),
      };
    });
  });
}
