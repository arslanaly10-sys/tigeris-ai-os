/**
 * Canonical portfolio records (slice B): positions, managers and due diligence, each with its provenance.
 * Reads are filtered on the server by the person's clearance (record classification) and sector workspaces.
 */
import {
  SECTOR_KEYS,
  type ManagerItem,
  type PositionItem,
  type PositionsPayload,
  type QualityStatus,
  type ReadScope,
  type RecordMode,
  type RecordProvenance,
  type SectorKey,
  type Sensitivity,
} from '@tigeris/shared';
import { and, asc, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withInstitution } from '../db/client';
import { ddRecords, managers, positions, sources } from '../db/schema';
import { ctxOf, requireSession, type AppDeps } from './context';

/** Classification and workspace filter for any canonical table with `classification` and `sector_key`. */
function recordReadable(scope: ReadScope, classification: PgColumn, sectorKey: PgColumn): SQL {
  if (!scope.sensitivities.length) return sql`false`;
  const clearance = inArray(classification, scope.sensitivities);
  if (!scope.sectors) return clearance;
  return and(clearance, or(isNull(sectorKey), inArray(sectorKey, scope.sectors)))!;
}

function provenanceOf(
  r: {
    sourceRecordId: string;
    recordMode: string;
    classification: string;
    mappingVersion: string;
    qualityStatus: string;
    ingestedAt: Date;
  },
  s: { key: string; publisher: string },
): RecordProvenance {
  return {
    sourceKey: s.key,
    sourcePublisher: s.publisher,
    sourceRecordId: r.sourceRecordId,
    recordMode: r.recordMode as RecordMode,
    classification: r.classification as Sensitivity,
    mappingVersion: r.mappingVersion,
    qualityStatus: r.qualityStatus as QualityStatus,
    ingestedAt: r.ingestedAt.toISOString(),
  };
}

const round = (n: number) => Math.round(n * 100) / 100;

export async function portfolioRoutes(app: FastifyInstance, deps: AppDeps) {
  const guard = { preHandler: requireSession(deps) };

  app.get('/api/positions', guard, async (request): Promise<PositionsPayload> => {
    const ctx = ctxOf(request);
    const q = z.object({ sector: z.enum(SECTOR_KEYS).optional() }).safeParse(request.query);
    const sector = q.success ? q.data.sector : undefined;
    return withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const rows = await tx
        .select({ p: positions, s: { key: sources.key, publisher: sources.publisher } })
        .from(positions)
        .innerJoin(sources, eq(sources.id, positions.sourceId))
        .where(
          and(
            recordReadable(ctx.scope, positions.classification, positions.sectorKey),
            sector ? eq(positions.sectorKey, sector) : undefined,
          ),
        )
        .orderBy(asc(positions.key));
      const items = rows.map(({ p, s }): PositionItem => ({
        id: p.id,
        key: p.key,
        name: p.name,
        assetClass: p.assetClass,
        sectorKey: (p.sectorKey as SectorKey | null) ?? null,
        country: p.country,
        currency: p.currency,
        marketValue: Number(p.marketValue),
        navSharePct: Number(p.navSharePct),
        routeDependent: p.routeDependent,
        asOf: p.asOf,
        provenance: provenanceOf(p, s),
      }));
      const route = items.filter((x) => x.routeDependent);
      return {
        positions: items,
        totals: {
          navSharePct: round(items.reduce((a, x) => a + x.navSharePct, 0)),
          routeDependentNavSharePct: round(route.reduce((a, x) => a + x.navSharePct, 0)),
          routeDependentCount: route.length,
          rows: items.length,
        },
      };
    });
  });

  app.get('/api/managers', guard, async (request): Promise<ManagerItem[]> => {
    const ctx = ctxOf(request);
    return withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const rows = await tx
        .select({ m: managers, s: { key: sources.key, publisher: sources.publisher } })
        .from(managers)
        .innerJoin(sources, eq(sources.id, managers.sourceId))
        .where(recordReadable(ctx.scope, managers.classification, managers.sectorKey))
        .orderBy(asc(managers.key));
      const dd = rows.length
        ? await tx
            .select()
            .from(ddRecords)
            .where(
              and(
                inArray(
                  ddRecords.managerId,
                  rows.map((r) => r.m.id),
                ),
                inArray(
                  ddRecords.classification,
                  ctx.scope.sensitivities.length ? ctx.scope.sensitivities : ['__none__'],
                ),
              ),
            )
            .orderBy(asc(ddRecords.key))
        : [];
      return rows.map(({ m, s }) => ({
        id: m.id,
        key: m.key,
        name: m.name,
        strategy: m.strategy,
        domicile: m.domicile,
        sectorKey: (m.sectorKey as SectorKey | null) ?? null,
        dueDiligence: dd
          .filter((d) => d.managerId === m.id)
          .map((d) => ({
            key: d.key,
            reviewType: d.reviewType,
            status: d.status as ManagerItem['dueDiligence'][number]['status'],
            openIssues: d.openIssues,
            summary: d.summary,
            reviewedOn: d.reviewedOn,
          })),
        provenance: provenanceOf(m, s),
      }));
    });
  });
}
