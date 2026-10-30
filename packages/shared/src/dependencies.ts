/**
 * Dependency reading of the shared graph (slice E, FR-16). A relationship's predicate says which side relies on the
 * other: "Ras Tanura exports via Hormuz" means the terminal depends on the strait; "LNG fuels the utility" means the
 * utility depends on LNG. Predicates that state a location, an event or an alternative are context, never a
 * dependency. Unknown predicates are treated as context, so a dependency is never invented.
 */
import { SECTORS, type SectorKey } from './sectors';

export type DependencyReading = 'subject_depends' | 'object_depends' | 'context' | 'alternative';

export const PREDICATE_READING: Record<string, DependencyReading> = {
  'exports via': 'subject_depends',
  'ocean access via': 'subject_depends',
  'depends on': 'subject_depends',
  holds: 'subject_depends',
  carries: 'object_depends',
  fuels: 'object_depends',
  powers: 'object_depends',
  supplies: 'object_depends',
  'prices affect': 'object_depends',
  'seized in': 'context',
  'occurred near': 'context',
  'alternative to': 'alternative',
};

export const readingOf = (predicate: string): DependencyReading => PREDICATE_READING[predicate] ?? 'context';

export interface DependencyEdgeInput {
  id: string;
  source: string;
  target: string;
  predicate: string;
}

/** Provider → dependent pair for an edge, or null when the edge is context or an alternative. */
export function dependencyPair(e: DependencyEdgeInput): { provider: string; dependent: string } | null {
  const r = readingOf(e.predicate);
  if (r === 'subject_depends') return { provider: e.target, dependent: e.source };
  if (r === 'object_depends') return { provider: e.source, dependent: e.target };
  return null;
}

export interface DependencyReach {
  /** Entity reached. */
  id: string;
  /** Steps from the origin (1 = direct). */
  hop: number;
  /** Edge that reached it, from the entity one step nearer the origin. */
  edgeId: string;
  /** Entity one step nearer the origin. */
  via: string;
}

/**
 * Directed breadth-first walk. `upstream` follows what the origin relies on (its providers, then theirs);
 * `downstream` follows what relies on the origin, i.e. what is exposed if it is disrupted. Depth is capped, each
 * entity is reached once at its shortest distance, and cycles cannot recurse.
 */
export function dependencyWalk(
  originId: string,
  edges: DependencyEdgeInput[],
  direction: 'upstream' | 'downstream',
  maxHops = 4,
): DependencyReach[] {
  const pairs = edges.flatMap((e) => {
    const p = dependencyPair(e);
    return p ? [{ ...p, edgeId: e.id }] : [];
  });
  const seen = new Set([originId]);
  const out: DependencyReach[] = [];
  let frontier = [originId];
  for (let hop = 1; hop <= maxHops && frontier.length; hop++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const p of pairs) {
        const from = direction === 'upstream' ? p.dependent : p.provider;
        const to = direction === 'upstream' ? p.provider : p.dependent;
        if (from !== id || seen.has(to)) continue;
        seen.add(to);
        next.push(to);
        out.push({ id: to, hop, edgeId: p.edgeId, via: id });
      }
    }
    frontier = next;
  }
  return out;
}

/** Sector workspaces whose configuration includes this entity. */
export const sectorsOfEntity = (key: string): SectorKey[] =>
  SECTORS.filter((s) => s.entityKeys.includes(key)).map((s) => s.key);
