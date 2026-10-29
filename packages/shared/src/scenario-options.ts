/**
 * Draft option ranking — deterministic rules, versioned, no model (CLAUDE.md §6–7).
 *
 * Options are drafts for expert review. Nothing here approves, executes or recommends a final action: ranking
 * follows a published severity rule, every option carries the authority it would need, the mandate checks
 * it was tested against and a confidence band with its basis.
 */
import type { EngineResult } from './scenario-engine';
import type { ConfidenceBand, ConfidenceBasis } from './vocabulary';

export const RANKER = { key: 'options-ranker', version: '1.0.0' } as const;

/** Horizon on which options are ranked. */
export const RANKING_HORIZON = 'd90' as const;
export const RANKING_METRIC = 'nav_at_risk_peak' as const;

export const OPTION_ACTIONS = [
  'Monitor / watchlist',
  'Defer commitment',
  'Hedge exposure',
  'Reallocate',
] as const;
export type OptionAction = (typeof OPTION_ACTIONS)[number];

export const OPTION_TITLES: Record<OptionAction, string> = {
  'Monitor / watchlist': 'Hold positions and monitor the corridor',
  'Defer commitment': 'Defer new route-dependent commitments',
  'Hedge exposure': 'Hedge oil, freight or FX exposure of affected holdings',
  Reallocate: 'Reallocate away from route-dependent holdings',
};

export type Severity = 'low' | 'moderate' | 'high';

/** Severity thresholds on central NAV at risk while disrupted (% of NAV) at the ranking horizon. */
export const SEVERITY_THRESHOLDS = { moderate: 0.5, high: 2 } as const;

export const RANK_ORDER: Record<Severity, OptionAction[]> = {
  low: ['Monitor / watchlist', 'Defer commitment', 'Hedge exposure', 'Reallocate'],
  moderate: ['Hedge exposure', 'Defer commitment', 'Monitor / watchlist', 'Reallocate'],
  high: ['Hedge exposure', 'Reallocate', 'Defer commitment', 'Monitor / watchlist'],
};

export function severityOf(navAtRiskPct: number): Severity {
  if (navAtRiskPct >= SEVERITY_THRESHOLDS.high) return 'high';
  if (navAtRiskPct >= SEVERITY_THRESHOLDS.moderate) return 'moderate';
  return 'low';
}

export interface MandateInput {
  key: string;
  title: string;
  limitValue: number | null;
  limitUnit: string | null;
}

export interface MandateCheck {
  mandateKey: string;
  title: string;
  status: 'within' | 'attention' | 'breach';
  detail: string;
}

export interface SituationInputs {
  durationDays: number;
  routeDependentHoldings: number;
  exposedNavSharePct: number;
  fuelBufferDays: number;
  unverifiedInputs: number;
  disputedInputs: number;
  syntheticInputs: number;
  /** Assumptions the ranking metric depends on (bypass driver counts as one). */
  assumptionsInRankingMetric: number;
}

const BAND_ORDER: ConfidenceBand[] = ['insufficient', 'low', 'moderate', 'high'];
const minBand = (bands: ConfidenceBand[]) =>
  bands.reduce((a, b) => (BAND_ORDER.indexOf(b) < BAND_ORDER.indexOf(a) ? b : a), 'high' as ConfidenceBand);

function metricAt(result: EngineResult, key: string) {
  return result.metrics.find((m) => m.key === key)!.values[RANKING_HORIZON];
}

const fmt = (v: number, d = 2) => Number(v.toFixed(d)).toString();

/** Mandate checks for the scenario situation. Unknown or unconfigured mandates are skipped, never assumed. */
export function checkMandates(
  result: EngineResult,
  s: SituationInputs,
  mandates: MandateInput[],
): MandateCheck[] {
  const by = new Map(mandates.map((m) => [m.key, m]));
  const out: MandateCheck[] = [];
  const route = by.get('M-RISK-02');
  if (route?.limitValue != null) {
    const ok = s.routeDependentHoldings <= route.limitValue;
    out.push({
      mandateKey: route.key,
      title: route.title,
      status: ok ? 'within' : 'breach',
      detail: `${s.routeDependentHoldings} route-dependent holdings against a limit of ${fmt(route.limitValue, 0)}.`,
    });
  }
  const conc = by.get('M-RISK-03');
  if (conc?.limitValue != null) {
    const ok = s.exposedNavSharePct <= conc.limitValue;
    out.push({
      mandateKey: conc.key,
      title: conc.title,
      status: ok ? 'within' : 'breach',
      detail: `Energy and shipping exposure is ${fmt(s.exposedNavSharePct, 1)}% of NAV against a limit of ${fmt(conc.limitValue, 1)}%.`,
    });
  }
  const res = by.get('M-RES-04');
  if (res?.limitValue != null) {
    const bufferOk = s.fuelBufferDays >= res.limitValue;
    const reduced = metricAt(result, 'desal_reduced_output_days').central;
    out.push({
      mandateKey: res.key,
      title: res.title,
      status: !bufferOk ? 'breach' : reduced > 0 ? 'attention' : 'within',
      detail:
        `Fuel buffer of ${fmt(s.fuelBufferDays, 0)} days against a minimum of ${fmt(res.limitValue, 0)} days. ` +
        (reduced > 0
          ? `The ${fmt(s.durationDays, 0)}-day disruption exceeds the buffer: ${fmt(reduced, 0)} plant-days of reduced output (central, 90 days).`
          : 'The disruption ends within the buffer.'),
    });
  }
  const evidence = by.get('M-GOV-05');
  if (evidence) {
    const n = s.unverifiedInputs + s.disputedInputs;
    out.push({
      mandateKey: evidence.key,
      title: evidence.title,
      status: n > 0 ? 'attention' : 'within',
      detail:
        n > 0
          ? `${n} sourced input${n === 1 ? ' is' : 's are'} unverified or disputed and cannot be the sole basis of a decision.`
          : 'All sourced inputs are validated.',
    });
  }
  return out;
}

/** Confidence band with its basis for the scenario that the options rest on. Never a percentage. */
export function scenarioConfidence(result: EngineResult, s: SituationInputs): ConfidenceBasis {
  const nav = metricAt(result, RANKING_METRIC);
  const sourceBand: ConfidenceBand =
    s.disputedInputs > 0 ? 'low' : s.unverifiedInputs > 0 ? 'moderate' : 'high';
  const assumptionBand: ConfidenceBand =
    s.assumptionsInRankingMetric >= 3 ? 'low' : s.assumptionsInRankingMetric === 2 ? 'moderate' : 'high';
  const spread = nav.central > 0 ? (nav.high - nav.low) / nav.central : 0;
  const stabilityBand: ConfidenceBand = spread <= 0.5 ? 'high' : spread <= 1 ? 'moderate' : 'low';
  const factors: ConfidenceBasis['factors'] = [
    {
      factor: 'source_quality',
      band: sourceBand,
      note:
        `${s.unverifiedInputs} unverified and ${s.disputedInputs} disputed sourced inputs; ` +
        `${s.syntheticInputs} synthetic demonstration inputs.`,
    },
    {
      factor: 'assumption_load',
      band: assumptionBand,
      note: `The ranking metric depends on ${s.assumptionsInRankingMetric} labelled assumptions.`,
    },
    {
      factor: 'scenario_stability',
      band: stabilityBand,
      note:
        nav.central > 0
          ? `Low-to-high range of NAV at risk is ${fmt(spread, 2)}× the central value at 90 days.`
          : 'No NAV at risk in any case at 90 days.',
    },
  ];
  return { band: minBand(factors.map((f) => f.band)), factors };
}

export interface DraftOptionSpec {
  actionClass: OptionAction;
  title: string;
  rank: number;
  rankBasis: string;
}

export function rankOptions(result: EngineResult): {
  severity: Severity;
  navCentral: number;
  options: DraftOptionSpec[];
} {
  const navCentral = metricAt(result, RANKING_METRIC).central;
  const severity = severityOf(navCentral);
  const options = RANK_ORDER[severity].map((actionClass, i) => ({
    actionClass,
    title: OPTION_TITLES[actionClass],
    rank: i + 1,
    rankBasis:
      `Rank ${i + 1} of ${OPTION_ACTIONS.length} under the ${severity}-severity rule (${RANKER.key} ${RANKER.version}): ` +
      `central NAV at risk while disrupted is ${fmt(navCentral)}% of NAV at 90 days ` +
      (severity === 'high'
        ? `(at or above ${SEVERITY_THRESHOLDS.high}%).`
        : severity === 'moderate'
          ? `(${SEVERITY_THRESHOLDS.moderate}% to below ${SEVERITY_THRESHOLDS.high}%).`
          : `(below ${SEVERITY_THRESHOLDS.moderate}%).`),
  }));
  return { severity, navCentral, options };
}
