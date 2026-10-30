import { describe, expect, it } from 'vitest';
import { assumptionsBehind, calibrate, missWidths, proposeRange } from './learning';

const ref = 'scenario:SCN-20261030-01:metric:nav_at_risk_peak:d90';
const a = { key: 'valuation_elasticity', version: 1, low: 0.2, central: 0.4, high: 0.6 };

describe('learning loop', () => {
  it('reads the assumptions a figure depends on from the metric definition', () => {
    expect(assumptionsBehind(ref)).toEqual(
      expect.arrayContaining(['valuation_elasticity', 'bypass_capacity', 'bypass_ramp_days']),
    );
    expect(assumptionsBehind('not-a-ref')).toEqual([]);
  });

  it('measures a miss in expected-range widths, zero when inside', () => {
    expect(missWidths({ figureRef: ref, expectedLow: 1, expectedHigh: 2, observedValue: 1.5 })).toBe(0);
    expect(missWidths({ figureRef: ref, expectedLow: 1, expectedHigh: 2, observedValue: 3 })).toBe(1);
    expect(missWidths({ figureRef: ref, expectedLow: 1, expectedHigh: 2, observedValue: 0.5 })).toBe(0.5);
  });

  it('keeps the central value and widens the range by the size of the miss, capped and non-negative', () => {
    const p = proposeRange(a, { figureRef: ref, expectedLow: 1, expectedHigh: 2, observedValue: 3 })!;
    expect(p.central).toBe(0.4);
    expect(p.low).toBe(0); // 0.4 - 0.2 × 2 = 0
    expect(p.high).toBe(0.8);
    expect(p.basis).toContain('learning-loop 1.0.0');
    const huge = proposeRange(a, { figureRef: ref, expectedLow: 1, expectedHigh: 2, observedValue: 100 })!;
    expect(huge.high).toBe(1.2); // capped at four times the spread
    expect(huge.low).toBe(0);
    expect(
      proposeRange(a, { figureRef: ref, expectedLow: 1, expectedHigh: 2, observedValue: 1.2 }),
    ).toBeNull();
  });

  it('is deterministic', () => {
    const o = { figureRef: ref, expectedLow: 1, expectedHigh: 2, observedValue: 2.7 };
    expect(proposeRange(a, o)).toEqual(proposeRange(a, o));
  });

  it('counts held and missed reviews per assumption, ignoring the not comparable', () => {
    const rows = calibrate(
      [
        { figureRef: ref, verdict: 'held' },
        { figureRef: ref, verdict: 'missed' },
        { figureRef: ref, verdict: 'not_comparable' },
      ],
      ['valuation_elasticity', 'unrelated_key'],
    );
    expect(rows[0]).toEqual({ assumptionKey: 'valuation_elasticity', held: 1, missed: 1, hitRate: 0.5 });
    expect(rows[1]!.hitRate).toBeNull();
  });
});
