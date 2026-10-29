import type {
  ClaimClass,
  ConfidenceBand,
  EntityType,
  GraphEdge,
  GraphNode,
  GraphPayload,
  MapLayers,
  MovementTrack,
  RelationshipClass,
} from '@tigeris/shared';
import { asc, eq, inArray, ne } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withInstitution, type Tx } from '../db/client';
import {
  caseEntities,
  cases,
  entities,
  entityRelationships,
  evidenceObjects,
  movementTracks,
  relationshipEvidence,
  sources,
} from '../db/schema';
import { ctxOf, requireSession, type AppDeps } from './context';
import { toSource } from './mappers';

export const MAX_HOPS = 4;

type EntityRow = typeof entities.$inferSelect;

function toNode(e: EntityRow, hop?: number): GraphNode {
  return {
    id: e.id,
    key: e.key,
    type: e.entityType as EntityType,
    name: e.name,
    description: e.description,
    claimClass: e.claimClass as ClaimClass,
    ...(hop === undefined ? {} : { hop }),
    lon: e.lon,
    lat: e.lat,
    geoPrecision: e.geoPrecision as GraphNode['geoPrecision'],
  };
}

async function loadEdges(tx: Tx): Promise<GraphEdge[]> {
  const rels = await tx.select().from(entityRelationships).where(ne(entityRelationships.status, 'retired'));
  const ev = await tx
    .select({
      relationshipId: relationshipEvidence.relationshipId,
      evidenceId: relationshipEvidence.evidenceId,
      stance: relationshipEvidence.stance,
      title: evidenceObjects.title,
    })
    .from(relationshipEvidence)
    .innerJoin(evidenceObjects, eq(evidenceObjects.id, relationshipEvidence.evidenceId));
  return rels.map((r) => ({
    id: r.id,
    source: r.subjectId,
    target: r.objectId,
    predicate: r.predicate,
    relationshipClass: r.relationshipClass as RelationshipClass,
    confidenceBand: r.confidenceBand as ConfidenceBand,
    rationale: r.rationale,
    status: r.status as GraphEdge['status'],
    evidence: ev
      .filter((e) => e.relationshipId === r.id)
      .map((e) => ({
        evidenceId: e.evidenceId,
        title: e.title,
        stance: e.stance as GraphEdge['evidence'][number]['stance'],
      })),
  }));
}

/**
 * Bounded breadth-first traversal from origin entities (FR-16, TR-021, TR-037). Reachability ignores
 * direction — impact can travel up a dependency (a terminal that exports via a chokepoint is affected by
 * it) — but each edge keeps its stated direction for display. Depth is capped and cycles cannot recurse.
 */
export function traverse(originIds: string[], edges: GraphEdge[], maxHops = MAX_HOPS) {
  const hop = new Map<string, number>(originIds.map((id) => [id, 0]));
  let frontier = [...originIds];
  for (let depth = 1; depth <= maxHops && frontier.length > 0; depth++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const e of edges) {
        const other = e.source === id ? e.target : e.target === id ? e.source : null;
        if (other && !hop.has(other)) {
          hop.set(other, depth);
          next.push(other);
        }
      }
    }
    frontier = next;
  }
  const included = edges.filter((e) => hop.has(e.source) && hop.has(e.target));
  return { hop, edges: included };
}

export async function caseGraph(tx: Tx, caseKey: string): Promise<GraphPayload | null> {
  const [c] = await tx.select({ id: cases.id }).from(cases).where(eq(cases.key, caseKey));
  if (!c) return null;
  const linked = await tx.select().from(caseEntities).where(eq(caseEntities.caseId, c.id));
  const origins = linked.filter((r) => r.role === 'origin').map((r) => r.entityId);
  const edges = await loadEdges(tx);
  const { hop, edges: included } = traverse(origins.length ? origins : linked.map((r) => r.entityId), edges);
  const ids = [...hop.keys()];
  const rows = ids.length ? await tx.select().from(entities).where(inArray(entities.id, ids)) : [];
  return { nodes: rows.map((e) => toNode(e, hop.get(e.id))), edges: included, maxHops: MAX_HOPS };
}

export async function graphRoutes(app: FastifyInstance, deps: AppDeps) {
  const guard = { preHandler: requireSession(deps) };

  app.get('/api/graph', guard, async (request): Promise<GraphPayload> => {
    const ctx = ctxOf(request);
    return withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const rows = await tx.select().from(entities).orderBy(asc(entities.name));
      return { nodes: rows.map((e) => toNode(e)), edges: await loadEdges(tx), maxHops: MAX_HOPS };
    });
  });

  app.get('/api/cases/:key/graph', guard, async (request, reply) => {
    const params = z.object({ key: z.string().regex(/^[A-Z0-9-]{3,40}$/) }).safeParse(request.params);
    if (!params.success) return reply.code(404).send({ error: 'not_found' });
    const ctx = ctxOf(request);
    const g = await withInstitution(deps.db, ctx.institutionId, (tx) => caseGraph(tx, params.data.key));
    if (!g) return reply.code(404).send({ error: 'not_found' });
    return g;
  });

  /** Map layers: located entities, edges between them and illustrative movement (never live). */
  app.get('/api/map/layers', guard, async (request): Promise<MapLayers> => {
    const ctx = ctxOf(request);
    return withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const rows = await tx.select().from(entities);
      const located = rows.filter((e) => e.lon !== null);
      const ids = new Set(located.map((e) => e.id));
      const edges = (await loadEdges(tx)).filter((e) => ids.has(e.source) && ids.has(e.target));
      const tracks = await tx.select().from(movementTracks).orderBy(asc(movementTracks.key));
      const trackList: MovementTrack[] = tracks.map((t) => ({
        id: t.id,
        key: t.key,
        kind: t.kind as MovementTrack['kind'],
        label: t.label,
        dataMode: t.dataMode as MovementTrack['dataMode'],
        claimClass: t.claimClass as MovementTrack['claimClass'],
        points: t.points,
      }));
      const duration = Math.max(0, ...trackList.flatMap((t) => t.points.map((p) => p[2])));
      const sourceId = tracks[0]?.sourceId;
      let movementSource = null;
      if (sourceId) {
        const [s] = await tx.select().from(sources).where(eq(sources.id, sourceId));
        const [latest] = await tx
          .select({ retrievedAt: evidenceObjects.retrievedAt })
          .from(evidenceObjects)
          .where(eq(evidenceObjects.sourceId, sourceId));
        movementSource = s ? toSource(s, latest?.retrievedAt ?? null) : null;
      }
      return {
        entities: located.map((e) => toNode(e)),
        edges,
        tracks: trackList,
        durationSeconds: duration,
        movementSource,
      };
    });
  });
}
