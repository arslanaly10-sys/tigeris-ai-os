import { describe, expect, it } from 'vitest';
import { dependencyPair, dependencyWalk, readingOf, sectorsOfEntity } from './dependencies';

const edges = [
  { id: 'e1', source: 'term', target: 'strait', predicate: 'exports via' },
  { id: 'e2', source: 'strait', target: 'lng', predicate: 'carries' },
  { id: 'e3', source: 'lng', target: 'utility', predicate: 'fuels' },
  { id: 'e4', source: 'utility', target: 'desal', predicate: 'powers' },
  { id: 'e5', source: 'alt', target: 'port', predicate: 'alternative to' },
  { id: 'e6', source: 'event', target: 'strait', predicate: 'occurred near' },
  { id: 'e7', source: 'desal', target: 'utility', predicate: 'depends on' },
];

describe('dependency reading', () => {
  it('reads the dependent side from the predicate', () => {
    expect(dependencyPair(edges[0]!)).toEqual({ provider: 'strait', dependent: 'term' });
    expect(dependencyPair(edges[2]!)).toEqual({ provider: 'lng', dependent: 'utility' });
  });

  it('never turns context, alternatives or unknown predicates into dependencies', () => {
    expect(dependencyPair(edges[4]!)).toBeNull();
    expect(dependencyPair(edges[5]!)).toBeNull();
    expect(readingOf('mentioned with')).toBe('context');
  });

  it('walks downstream to what is exposed, at shortest distance, through cycles', () => {
    const down = dependencyWalk('strait', edges, 'downstream');
    expect(down.map((r) => [r.id, r.hop])).toEqual([
      ['term', 1],
      ['lng', 1],
      ['utility', 2],
      ['desal', 3],
    ]);
    expect(down.find((r) => r.id === 'desal')).toMatchObject({ via: 'utility', edgeId: 'e4' });
  });

  it('walks upstream to what an entity relies on and respects the hop cap', () => {
    expect(dependencyWalk('desal', edges, 'upstream').map((r) => r.id)).toEqual(['utility', 'lng', 'strait']);
    expect(dependencyWalk('desal', edges, 'upstream', 2).map((r) => r.id)).toEqual(['utility', 'lng']);
  });

  it('maps entities to the sector workspaces that configure them', () => {
    expect(sectorsOfEntity('cp-hormuz')).toContain('energy');
    expect(sectorsOfEntity('unknown-entity')).toEqual([]);
  });
});
