import { describe, expect, it } from 'vitest';
import { canTransition, CASE_TRANSITIONS } from './case-lifecycle';
import { CASE_STATES } from './vocabulary';

describe('case lifecycle', () => {
  it('defines transitions for every state', () => {
    expect(Object.keys(CASE_TRANSITIONS).sort()).toEqual([...CASE_STATES].sort());
  });

  it('never allows decision without passing review', () => {
    const reachDecision = CASE_STATES.filter((s) => canTransition(s, 'decision'));
    expect(reachDecision).toEqual(['review']);
  });

  it('returns requested-evidence work to analysis', () => {
    expect(canTransition('review', 'analysis')).toBe(true);
    expect(canTransition('decision', 'analysis')).toBe(true);
  });

  it('treats closed as terminal', () => {
    expect(CASE_TRANSITIONS.closed).toHaveLength(0);
  });
});
