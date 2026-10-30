/**
 * Learning loop (Phase 5D, FR-55, D-108, D-118). When an outcome is reviewed and missed its expected range, every
 * assumption the missed figure depends on gets a proposed new version. Proposals are computed here, deterministically;
 * a domain expert approves or rejects each one. Nothing changes without that approval.
 *
 * Method `learning-loop 1.0.0`, range widening: the engine cannot attribute a miss to one assumption, so the central
 * value is kept and both sides of the range are widened by the size of the miss relative to the expected range: a miss
 * of one expected-range width doubles the distance from the central value to each bound (capped at four times).
 * Bounds that were non-negative stay non-negative.
 */
import { METRICS, type AssumptionKey } from './scenario-engine';

export const LEARNING_VERSION = 'learning-loop 1.0.0';
export const LEARNING_APPROVER_ROLES = ['domain_expert'] as const;

export interface MissedOutcome {
  figureRef: string;
  expectedLow: number;
  expectedHigh: number;
  observedValue: number;
}

export interface AssumptionVersion {
  key: string;
  version: number;
  low: number;
  central: number;
  high: number;
}

export interface ProposedRange {
  low: number;
  central: number;
  high: number;
  /** How far outside the expected range the outcome landed, in expected-range widths. */
  missWidths: number;
  basis: string;
}

const REF = /^scenario:(.+):metric:([a-z_]+):(\w+)$/;
const round = (v: number) => Math.round(v * 10_000) / 10_000;

/** The assumptions a figure depends on, read from the metric's declared inputs. */
export function assumptionsBehind(figureRef: string): AssumptionKey[] {
  const m = figureRef.match(REF);
  const def = m ? METRICS.find((x) => x.key === m[2]) : undefined;
  return (def?.inputs ?? [])
    .filter((r) => r.startsWith('assumption:'))
    .map((r) => r.slice('assumption:'.length) as AssumptionKey);
}

/** How far outside its expected range an outcome landed, in range widths (0 when inside). */
export function missWidths(o: MissedOutcome): number {
  const width = o.expectedHigh - o.expectedLow;
  const outside =
    o.observedValue > o.expectedHigh
      ? o.observedValue - o.expectedHigh
      : o.observedValue < o.expectedLow
        ? o.expectedLow - o.observedValue
        : 0;
  if (outside === 0) return 0;
  return width > 0 ? outside / width : 1;
}

/** Deterministic proposal for one assumption after one missed outcome. Returns null when the outcome did not miss. */
export function proposeRange(a: AssumptionVersion, o: MissedOutcome): ProposedRange | null {
  const k = missWidths(o);
  if (k === 0) return null;
  const factor = 1 + Math.min(k, 3); // At most quadruple the spread from a single outcome.
  const below = (a.central - a.low) * factor;
  const above = (a.high - a.central) * factor;
  let low = round(a.central - below);
  const high = round(a.central + above);
  if (a.low >= 0 && low < 0) low = 0;
  return {
    low,
    central: a.central,
    high,
    missWidths: round(k),
    basis:
      `${LEARNING_VERSION}: the outcome landed ${round(k)} expected-range widths outside ${o.expectedLow}–${o.expectedHigh} ` +
      `(observed ${o.observedValue}). The central value is kept; the range of ${a.key} v${a.version} ` +
      `(${a.low}–${a.high}) is widened ${round(factor)}× about it.`,
  };
}

export interface CalibrationRow {
  assumptionKey: string;
  held: number;
  missed: number;
  /** Held share of comparable reviews; null when there are none. Never shown as a bare percentage without counts. */
  hitRate: number | null;
}

/** Held and missed counts per assumption, over every comparable outcome review of a figure that depends on it. */
export function calibrate(
  reviews: readonly { figureRef: string; verdict: string }[],
  keys: readonly string[],
): CalibrationRow[] {
  return keys.map((k) => {
    const relevant = reviews.filter(
      (r) => r.verdict !== 'not_comparable' && assumptionsBehind(r.figureRef).includes(k as AssumptionKey),
    );
    const held = relevant.filter((r) => r.verdict === 'held').length;
    const missed = relevant.filter((r) => r.verdict === 'missed').length;
    return { assumptionKey: k, held, missed, hitRate: held + missed ? round(held / (held + missed)) : null };
  });
}
