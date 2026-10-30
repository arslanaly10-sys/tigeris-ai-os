/**
 * Canonical portfolio records (slice B): positions, managers and due diligence, each with its provenance.
 * Reads are filtered on the server by the person's clearance (record classification) and sector workspaces.
 */
import {
  SECTOR_KEYS,
  type DocumentItem,
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
import { and, asc, desc, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withInstitution, type Tx } from '../db/client';
import {
  connectorRuns,
  connectors,
  ddRecords,
  documents,
  managers,
  positions,
  sources,
  uploadedFiles,
} from '../db/schema';
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
  link: { connectorKey: string | null; runKey: string | null } = { connectorKey: null, runKey: null },
): RecordProvenance {
  return {
    connectorKey: link.connectorKey,
    runKey: link.runKey,
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
const KEY = /^[A-Z0-9-]{2,40}$/;

/** Positions within the reader's scope, with provenance and totals over the listed rows only. */
export async function readPositions(tx: Tx, scope: ReadScope, where?: SQL): Promise<PositionsPayload> {
  const rows = await tx
    .select({
      p: positions,
      s: { key: sources.key, publisher: sources.publisher },
      connectorKey: connectors.key,
      runKey: connectorRuns.key,
    })
    .from(positions)
    .innerJoin(sources, eq(sources.id, positions.sourceId))
    .leftJoin(connectors, eq(connectors.id, positions.connectorId))
    .leftJoin(connectorRuns, eq(connectorRuns.id, positions.runId))
    .where(and(recordReadable(scope, positions.classification, positions.sectorKey), where))
    .orderBy(asc(positions.key), desc(positions.asOf));
  const items = rows.map(({ p, s, connectorKey, runKey }): PositionItem => ({
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
    provenance: provenanceOf(p, s, { connectorKey, runKey }),
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
}

export async function portfolioRoutes(app: FastifyInstance, deps: AppDeps) {
  const guard = { preHandler: requireSession(deps) };
  const links = { connectorKey: connectors.key, runKey: connectorRuns.key };

  app.get('/api/positions', guard, async (request): Promise<PositionsPayload> => {
    const ctx = ctxOf(request);
    const q = z
      .object({ sector: z.enum(SECTOR_KEYS).optional(), connector: z.string().regex(KEY).optional() })
      .safeParse(request.query);
    const sector = q.success ? q.data.sector : undefined;
    const connector = q.success ? q.data.connector : undefined;
    return withInstitution(deps.db, ctx.institutionId, (tx) =>
      readPositions(
        tx,
        ctx.scope,
        and(
          sector ? eq(positions.sectorKey, sector) : undefined,
          connector ? eq(connectors.key, connector) : undefined,
        ),
      ),
    );
  });

  app.get('/api/managers', guard, async (request): Promise<ManagerItem[]> => {
    const ctx = ctxOf(request);
    const q = z.object({ connector: z.string().regex(KEY).optional() }).safeParse(request.query);
    const connector = q.success ? q.data.connector : undefined;
    return withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const rows = await tx
        .select({ m: managers, s: { key: sources.key, publisher: sources.publisher }, ...links })
        .from(managers)
        .innerJoin(sources, eq(sources.id, managers.sourceId))
        .leftJoin(connectors, eq(connectors.id, managers.connectorId))
        .leftJoin(connectorRuns, eq(connectorRuns.id, managers.runId))
        .where(
          and(
            recordReadable(ctx.scope, managers.classification, managers.sectorKey),
            connector ? eq(connectors.key, connector) : undefined,
          ),
        )
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
                ctx.scope.sensitivities.length
                  ? inArray(ddRecords.classification, ctx.scope.sensitivities)
                  : sql`false`,
              ),
            )
            .orderBy(asc(ddRecords.key))
        : [];
      return rows.map(({ m, s, connectorKey, runKey }) => ({
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
        provenance: provenanceOf(m, s, { connectorKey, runKey }),
      }));
    });
  });

  app.get('/api/documents', guard, async (request): Promise<DocumentItem[]> => {
    const ctx = ctxOf(request);
    return withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const rows = await tx
        .select({
          d: documents,
          f: uploadedFiles,
          s: { key: sources.key, publisher: sources.publisher },
          ...links,
        })
        .from(documents)
        .innerJoin(uploadedFiles, eq(uploadedFiles.id, documents.fileId))
        .innerJoin(sources, eq(sources.id, documents.sourceId))
        .leftJoin(connectors, eq(connectors.id, documents.connectorId))
        .leftJoin(connectorRuns, eq(connectorRuns.id, documents.runId))
        .where(recordReadable(ctx.scope, documents.classification, documents.sectorKey))
        .orderBy(desc(documents.ingestedAt));
      return rows.map(({ d, f, s, connectorKey, runKey }) => ({
        id: d.id,
        key: d.key,
        title: d.title,
        pageCount: d.pageCount,
        charCount: d.charCount,
        excerpt: d.excerpt,
        sectorKey: (d.sectorKey as SectorKey | null) ?? null,
        file: { name: f.originalName, mediaType: f.mediaType, sizeBytes: f.sizeBytes, sha256: f.sha256 },
        provenance: provenanceOf(d, s, { connectorKey, runKey }),
      }));
    });
  });
}
