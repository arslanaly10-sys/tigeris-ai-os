/**
 * Expected-versus-observed outcome review (slice H, FR-31, D-60). After a decision has run its course, a reviewer
 * records what was actually observed for each figure the scenario expected, with a source and a date. The
 * comparison is deterministic: the variance against the central estimate and whether the observation fell inside
 * the scenario's range. A reviewer may only override the verdict to "not comparable", and must say why.
 */
export const OUTCOME_VERDICTS = ['held', 'missed', 'not_comparable'] as const;
export type OutcomeVerdict = (typeof OUTCOME_VERDICTS)[number];

export const OUTCOME_VERDICT_LABEL: Record<OutcomeVerdict, string> = {
  held: 'Analysis held: observed within the expected range',
  missed: 'Analysis missed: observed outside the expected range',
  not_comparable: 'Not comparable: the observation does not measure what was expected',
};

export const OUTCOME_REVIEW_VERSION = 'outcome-review 1.0.0';

export interface OutcomeComparison {
  variance: number;
  /** Variance as a share of the central estimate, or null when the central estimate is zero. */
  variancePct: number | null;
  withinRange: boolean;
  verdict: OutcomeVerdict;
}

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

export function compareOutcome(
  expected: { low: number; central: number; high: number },
  observed: number,
  notComparable = false,
): OutcomeComparison {
  const lo = Math.min(expected.low, expected.high);
  const hi = Math.max(expected.low, expected.high);
  const withinRange = observed >= lo && observed <= hi;
  const variance = r4(observed - expected.central);
  return {
    variance,
    variancePct: expected.central === 0 ? null : r4((variance / Math.abs(expected.central)) * 100),
    withinRange,
    verdict: notComparable ? 'not_comparable' : withinRange ? 'held' : 'missed',
  };
}
