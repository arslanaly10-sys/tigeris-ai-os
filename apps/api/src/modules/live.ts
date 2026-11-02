/**
 * Live data (D-127). Lists each observation connector with its source, its last fetch and its series. The Live,
 * Snapshot or Stale label is computed by the shared rule from the connector's real status and fetch time; the
 * observation date and fetch time are always returned with every value.
 */
import {
  OBSERVATION_FORMAT_LABEL,
  cronIntervalMs,
  freshness,
  type ConnectorStatus,
  type LiveFeedItem,
  type ObservationFormat,
  type ReferenceObservation,
  type SectorKey,
} from '@tigeris/shared';
import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { withInstitution, type Tx } from '../db/client';
import { connectorRuns, connectors, observations, sources } from '../db/schema';
import { ctxOf, requireSession, type AppDeps } from './context';

export async function liveRoutes(app: FastifyInstance, deps: AppDeps) {
  app.get('/api/live', { preHandler: requireSession(deps) }, async (request): Promise<LiveFeedItem[]> => {
    const ctx = ctxOf(request);
    return withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const sens = ctx.scope.sensitivities;
      const feeds = await tx
        .select({ c: connectors, s: sources })
        .from(connectors)
        .innerJoin(sources, eq(sources.id, connectors.sourceId))
        .where(
          and(
            isNotNull(connectors.observationFormat),
            sens.length ? inArray(connectors.classification, sens) : sql`false`,
          ),
        )
        .orderBy(connectors.key);
      if (!feeds.length) return [];
      const rows = await tx
        .select({ o: observations, runKey: connectorRuns.key })
        .from(observations)
        .innerJoin(connectorRuns, eq(connectorRuns.id, observations.runId))
        .where(
          inArray(
            observations.connectorId,
            feeds.map((f) => f.c.id),
          ),
        )
        .orderBy(observations.seriesKey, desc(observations.observedOn));
      const now = new Date();
      return feeds.map(({ c, s }) => {
        const mine = rows.filter((r) => r.o.connectorId === c.id);
        const keys = [...new Set(mine.map((r) => r.o.seriesKey))];
        return {
          connectorKey: c.key,
          name: c.name,
          provider: c.provider,
          format: c.observationFormat as ObservationFormat,
          formatLabel: OBSERVATION_FORMAT_LABEL[c.observationFormat as ObservationFormat],
          sectorKey: (c.sectorKey as SectorKey | null) ?? null,
          status: c.status as ConnectorStatus,
          schedule: c.schedule,
          lastSuccessAt: c.lastSuccessAt?.toISOString() ?? null,
          lastError: c.lastError,
          source: { key: s.key, title: s.title, publisher: s.publisher, terms: s.termsRef, url: s.url },
          freshness: c.lastSuccessAt
            ? freshness({
                connectorStatus: c.status as ConnectorStatus,
                fetchedAt: c.lastSuccessAt,
                scheduleIntervalMs: cronIntervalMs(c.schedule),
                now,
              })
            : null,
          needsCredential: c.authRef && !process.env[c.authRef] ? c.authRef : null,
          series: keys.map((k) => {
            const pts = mine.filter((r) => r.o.seriesKey === k);
            const top = pts[0]!;
            return {
              seriesKey: k,
              unit: top.o.unit,
              latest: {
                observedOn: top.o.observedOn,
                value: Number(top.o.value),
                fetchedAt: top.o.fetchedAt.toISOString(),
                revised: top.o.revised,
                runKey: top.runKey,
              },
              recent: pts.slice(0, 30).map((p) => ({ observedOn: p.o.observedOn, value: Number(p.o.value) })),
              count: pts.length,
            };
          }),
        };
      });
    });
  });
}

/**
 * The latest fetched value of a series from a connector whose last fetch succeeded, with its lineage and its label at
 * this moment (D-127). Null when nothing usable was fetched: callers fall back to their labelled assumptions.
 */
export async function referenceObservation(
  tx: Tx,
  seriesKey: string,
  now = new Date(),
): Promise<ReferenceObservation | null> {
  const [r] = await tx
    .select({ o: observations, c: connectors, s: sources, runKey: connectorRuns.key })
    .from(observations)
    .innerJoin(connectors, eq(connectors.id, observations.connectorId))
    .innerJoin(sources, eq(sources.id, connectors.sourceId))
    .innerJoin(connectorRuns, eq(connectorRuns.id, observations.runId))
    .where(and(eq(observations.seriesKey, seriesKey), isNotNull(connectors.lastSuccessAt)))
    .orderBy(desc(observations.observedOn), desc(observations.fetchedAt))
    .limit(1);
  if (!r) return null;
  return {
    seriesKey,
    value: Number(r.o.value),
    unit: r.o.unit,
    observedOn: r.o.observedOn,
    fetchedAt: r.o.fetchedAt.toISOString(),
    runKey: r.runKey,
    connectorKey: r.c.key,
    source: `${r.s.publisher}: ${r.s.title}`,
    freshness: freshness({
      connectorStatus: r.c.status as ConnectorStatus,
      fetchedAt: r.o.fetchedAt,
      scheduleIntervalMs: cronIntervalMs(r.c.schedule),
      now,
    }),
  };
}
