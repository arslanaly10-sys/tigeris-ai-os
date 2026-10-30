import { describe, expect, it } from 'vitest';
import { compareOutcome } from './outcome-review';

describe('expected-versus-observed comparison', () => {
  const expected = { low: 1.86, central: 3.57, high: 6.51 };

  it('holds when the observation falls inside the range, inclusive of the ends', () => {
    expect(compareOutcome(expected, 2.4)).toMatchObject({
      withinRange: true,
      verdict: 'held',
      variance: -1.17,
    });
    expect(compareOutcome(expected, 6.51).verdict).toBe('held');
  });

  it('misses outside the range and reports the variance against the central estimate', () => {
    const c = compareOutcome(expected, 8);
    expect(c).toMatchObject({ withinRange: false, verdict: 'missed', variance: 4.43 });
    expect(c.variancePct).toBeCloseTo(124.09, 1);
  });

  it('lets a reviewer mark a figure not comparable without hiding the arithmetic', () => {
    const c = compareOutcome(expected, 8, true);
    expect(c.verdict).toBe('not_comparable');
    expect(c.withinRange).toBe(false);
  });

  it('copes with a zero central estimate and a reversed range', () => {
    expect(compareOutcome({ low: 0, central: 0, high: 0 }, 0)).toMatchObject({
      variancePct: null,
      verdict: 'held',
    });
    expect(compareOutcome({ low: 5, central: 3, high: 1 }, 2).withinRange).toBe(true);
  });
});
