/**
 * Scenario engine — deterministic code computes every quantity (CLAUDE.md §7). No model is involved.
 *
 * Template `hormuz-disruption`, engine version 1.0.0. Given four drivers and a set of resolved inputs
 * (evidence facts, synthetic fixtures and labelled assumptions), it returns low / central / high ranges and a
 * no-disruption baseline for each output metric across four horizons. Every metric carries its formula and
 * the references of the inputs it used, so each displayed number resolves to a versioned calculation.
 *
 * Ranges come from evaluating the same formulas with every uncertain assumption at its low-impact end,
 * its central value and its high-impact end. Drivers are not varied: they are the analyst's what-if.
 */

export const ENGINE = { key: 'hormuz-disruption', version: '1.0.0' } as const;

export const SCENARIO_HORIZONS = [
  { key: 'h72', label: '72 hours', days: 3 },
  { key: 'd90', label: '90 days', days: 90 },
  { key: 'y1', label: '1 year', days: 365 },
  { key: 'y5', label: '5 years', days: 1825 },
] as const;
export type HorizonKey = (typeof SCENARIO_HORIZONS)[number]['key'];

export const DRIVER_KEYS = ['durationDays', 'capacityLostPct', 'bypassMbd', 'oilPriceShockPct'] as const;
export type DriverKey = (typeof DRIVER_KEYS)[number];
export type Drivers = Record<DriverKey, number>;

export interface DriverDef {
  key: DriverKey;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  /** Fixed default, or null when the default is the central value of a registered assumption. */
  default: number | null;
  defaultFromAssumption?: AssumptionKey;
  description: string;
}

export const HORMUZ_DRIVERS: DriverDef[] = [
  {
    key: 'durationDays',
    label: 'Disruption duration',
    unit: 'days',
    min: 1,
    max: 365,
    step: 1,
    default: 21,
    description: 'How long transit through the strait is restricted.',
  },
  {
    key: 'capacityLostPct',
    label: 'Transit capacity lost',
    unit: '%',
    min: 0,
    max: 100,
    step: 5,
    default: 50,
    description: 'Share of normal oil flow through the strait that cannot transit.',
  },
  {
    key: 'bypassMbd',
    label: 'Bypass capacity available',
    unit: 'million b/d',
    min: 0,
    max: 7,
    step: 0.1,
    default: null,
    defaultFromAssumption: 'bypass_capacity',
    description: 'Unused pipeline capacity able to route crude around the strait. A labelled assumption.',
  },
  {
    key: 'oilPriceShockPct',
    label: 'Oil price shock',
    unit: '%',
    min: 0,
    max: 200,
    step: 5,
    default: 30,
    description: 'Assumed rise in crude prices while the disruption lasts.',
  },
];

export const ASSUMPTION_KEYS = [
  'bypass_capacity',
  'bypass_ramp_days',
  'valuation_elasticity',
  'war_risk_base_pct',
  'war_risk_multiplier',
  'premium_half_life_days',
  'freight_sensitivity_pct',
  'fuel_cost_passthrough',
] as const;
export type AssumptionKey = (typeof ASSUMPTION_KEYS)[number];

export interface Range3 {
  low: number;
  central: number;
  high: number;
}

/** Point inputs resolved from evidence facts and synthetic fixtures, keyed by their input reference. */
export interface EngineFacts {
  baselineFlowMbd: number;
  globalLiquidsSharePct: number;
  exposedNavSharePct: number;
  fuelBufferDays: number;
  dependentPlants: number;
}

export interface EngineInputs {
  facts: EngineFacts;
  assumptions: Record<AssumptionKey, Range3>;
}

/** Stable references used in `MetricDef.inputs`; the API maps each to its evidence fact or assumption row. */
export const INPUT_REFS = {
  baselineFlowMbd: 'fact:hormuz_oil_flow',
  globalLiquidsSharePct: 'fact:hormuz_global_share',
  exposedNavSharePct: 'fact:energy_shipping_nav_share',
  fuelBufferDays: 'fact:fuel_buffer_days',
  dependentPlants: 'fact:gas_dependent_desal_plants',
} as const satisfies Record<keyof EngineFacts, string>;

export const assumptionRef = (k: AssumptionKey) => `assumption:${k}`;
export const driverRef = (k: DriverKey) => `driver:${k}`;

export type GroupKey = 'energy_flow' | 'portfolio' | 'resilience' | 'freight';

export const GROUPS: { key: GroupKey; label: string; description: string }[] = [
  {
    key: 'energy_flow',
    label: 'Energy flow at risk',
    description: 'Oil that cannot transit after bypass routes ramp up.',
  },
  {
    key: 'portfolio',
    label: 'Portfolio exposure',
    description: 'Route-dependent holdings in the synthetic exposure register.',
  },
  {
    key: 'resilience',
    label: 'Water & power resilience',
    description: 'Gas-dependent desalination and utility fuel cost.',
  },
  {
    key: 'freight',
    label: 'Freight & insurance cost',
    description: 'War-risk insurance and tanker freight.',
  },
];

export interface MetricDef {
  key: string;
  group: GroupKey;
  label: string;
  unit: string;
  /** Human-readable formula shown in the calculation drawer. */
  formula: string;
  /** Input references this metric depends on. */
  inputs: string[];
  /** Whether the value is time-weighted over the horizon, a peak while disrupted, or cumulative. */
  basis: 'average_while_disrupted' | 'cumulative' | 'horizon_average' | 'peak' | 'days';
  decimals: number;
}

const A = assumptionRef;
const D = driverRef;
const F = INPUT_REFS;

export const METRICS: MetricDef[] = [
  {
    key: 'net_disrupted_flow',
    group: 'energy_flow',
    label: 'Oil flow disrupted (average while disrupted)',
    unit: 'million b/d',
    formula:
      'max(0, baseline flow × capacity lost − bypass × ramp factor); ramp factor averages a linear ramp-up over the disrupted days in the horizon',
    inputs: [
      F.baselineFlowMbd,
      D('capacityLostPct'),
      D('bypassMbd'),
      A('bypass_capacity'),
      A('bypass_ramp_days'),
      D('durationDays'),
    ],
    basis: 'average_while_disrupted',
    decimals: 2,
  },
  {
    key: 'cumulative_volume',
    group: 'energy_flow',
    label: 'Cumulative oil volume disrupted',
    unit: 'million barrels',
    formula: 'oil flow disrupted × disrupted days within the horizon',
    inputs: [
      F.baselineFlowMbd,
      D('capacityLostPct'),
      D('bypassMbd'),
      A('bypass_capacity'),
      A('bypass_ramp_days'),
      D('durationDays'),
    ],
    basis: 'cumulative',
    decimals: 1,
  },
  {
    key: 'global_share_disrupted',
    group: 'energy_flow',
    label: 'Share of global liquids consumption disrupted',
    unit: '%',
    formula: 'oil flow disrupted ÷ (baseline flow ÷ Hormuz share of global consumption) × 100',
    inputs: [
      F.baselineFlowMbd,
      F.globalLiquidsSharePct,
      D('capacityLostPct'),
      D('bypassMbd'),
      A('bypass_capacity'),
      A('bypass_ramp_days'),
      D('durationDays'),
    ],
    basis: 'average_while_disrupted',
    decimals: 1,
  },
  {
    key: 'nav_at_risk_peak',
    group: 'portfolio',
    label: 'NAV at risk while disrupted',
    unit: '% of NAV',
    formula: 'energy & shipping share of NAV × valuation sensitivity × (oil flow disrupted ÷ baseline flow)',
    inputs: [
      F.exposedNavSharePct,
      A('valuation_elasticity'),
      F.baselineFlowMbd,
      D('capacityLostPct'),
      D('bypassMbd'),
      A('bypass_capacity'),
      A('bypass_ramp_days'),
      D('durationDays'),
    ],
    basis: 'peak',
    decimals: 2,
  },
  {
    key: 'nav_at_risk_time_weighted',
    group: 'portfolio',
    label: 'NAV at risk (time-weighted over horizon)',
    unit: '% of NAV',
    formula: 'NAV at risk while disrupted × disrupted days ÷ horizon days',
    inputs: [
      F.exposedNavSharePct,
      A('valuation_elasticity'),
      F.baselineFlowMbd,
      D('capacityLostPct'),
      D('bypassMbd'),
      A('bypass_capacity'),
      A('bypass_ramp_days'),
      D('durationDays'),
    ],
    basis: 'horizon_average',
    decimals: 2,
  },
  {
    key: 'desal_reduced_output_days',
    group: 'resilience',
    label: 'Plant-days of reduced desalination output',
    unit: 'plant-days',
    formula: 'if capacity lost > 0: max(0, disrupted days − fuel buffer days) × gas-dependent plants; else 0',
    inputs: [D('durationDays'), D('capacityLostPct'), F.fuelBufferDays, F.dependentPlants],
    basis: 'days',
    decimals: 0,
  },
  {
    key: 'utility_fuel_cost',
    group: 'resilience',
    label: 'Utility fuel cost increase (horizon average)',
    unit: '%',
    formula: 'oil price shock × fuel cost pass-through × disrupted days ÷ horizon days',
    inputs: [D('oilPriceShockPct'), A('fuel_cost_passthrough'), D('durationDays')],
    basis: 'horizon_average',
    decimals: 1,
  },
  {
    key: 'war_risk_premium',
    group: 'freight',
    label: 'War-risk premium (horizon average)',
    unit: '% of hull value per transit',
    formula:
      'base premium × (1 + multiplier × capacity lost) while disrupted, then the excess decays with the stated half-life; averaged over the horizon',
    inputs: [
      A('war_risk_base_pct'),
      A('war_risk_multiplier'),
      A('premium_half_life_days'),
      D('capacityLostPct'),
      D('durationDays'),
    ],
    basis: 'horizon_average',
    decimals: 3,
  },
  {
    key: 'freight_rate_change',
    group: 'freight',
    label: 'Tanker freight rate change while disrupted',
    unit: '%',
    formula: 'freight sensitivity × (oil flow disrupted ÷ baseline flow)',
    inputs: [
      A('freight_sensitivity_pct'),
      F.baselineFlowMbd,
      D('capacityLostPct'),
      D('bypassMbd'),
      A('bypass_capacity'),
      A('bypass_ramp_days'),
      D('durationDays'),
    ],
    basis: 'peak',
    decimals: 0,
  },
];

export type CaseKey = 'low' | 'central' | 'high';

/** Pick each assumption's value for a case. "low" means low impact: more bypass, everything else at its low end. */
export function assumptionsForCase(
  a: Record<AssumptionKey, Range3>,
  c: CaseKey,
): Record<AssumptionKey, number> {
  const out = {} as Record<AssumptionKey, number>;
  for (const k of ASSUMPTION_KEYS) {
    const r = a[k];
    if (c === 'central') out[k] = r.central;
    else if (k === 'bypass_capacity') out[k] = c === 'low' ? r.high : r.low;
    else out[k] = c === 'low' ? r.low : r.high;
  }
  return out;
}

/** Average availability of a linear ramp from 0 to 1 over `ramp` days, across the first `active` days. */
export function rampFactor(active: number, ramp: number): number {
  if (active <= 0) return 0;
  if (ramp <= 0) return 1;
  return active <= ramp ? active / (2 * ramp) : 1 - ramp / (2 * active);
}

/** All metric values for one case and one horizon. Pure; no rounding. */
export function evaluate(
  drivers: Drivers,
  facts: EngineFacts,
  a: Record<AssumptionKey, number>,
  bypassCentral: number,
  horizonDays: number,
): Record<string, number> {
  const active = Math.min(Math.max(drivers.durationDays, 0), horizonDays);
  const lost = Math.min(Math.max(drivers.capacityLostPct, 0), 100) / 100;
  // The analyst's bypass driver is scaled by the assumption's case ratio, so the band follows the register.
  const bypass =
    bypassCentral > 0 ? drivers.bypassMbd * (a.bypass_capacity / bypassCentral) : drivers.bypassMbd;
  const gross = facts.baselineFlowMbd * lost;
  const net = active > 0 ? Math.max(0, gross - bypass * rampFactor(active, a.bypass_ramp_days)) : 0;
  const netShare = facts.baselineFlowMbd > 0 ? net / facts.baselineFlowMbd : 0;
  const globalConsumption =
    facts.globalLiquidsSharePct > 0 ? facts.baselineFlowMbd / (facts.globalLiquidsSharePct / 100) : 0;
  const navPeak = facts.exposedNavSharePct * a.valuation_elasticity * netShare;
  const timeShare = active / horizonDays;

  const base = a.war_risk_base_pct;
  const excess = active > 0 ? base * a.war_risk_multiplier * lost : 0;
  const post = horizonDays - active;
  const halfLife = a.premium_half_life_days;
  const decayIntegral =
    excess > 0 && halfLife > 0 ? ((excess * halfLife) / Math.LN2) * (1 - 2 ** (-post / halfLife)) : 0;
  const premiumAvg = base + (excess * active + decayIntegral) / horizonDays;

  return {
    net_disrupted_flow: net,
    cumulative_volume: net * active,
    global_share_disrupted: globalConsumption > 0 ? (net / globalConsumption) * 100 : 0,
    nav_at_risk_peak: navPeak,
    nav_at_risk_time_weighted: navPeak * timeShare,
    desal_reduced_output_days:
      lost > 0 ? Math.max(0, active - facts.fuelBufferDays) * facts.dependentPlants : 0,
    utility_fuel_cost: drivers.oilPriceShockPct * a.fuel_cost_passthrough * timeShare,
    war_risk_premium: premiumAvg,
    freight_rate_change: a.freight_sensitivity_pct * netShare,
  };
}

export interface MetricValue {
  low: number;
  central: number;
  high: number;
  baseline: number;
}

export interface EngineResult {
  engine: typeof ENGINE;
  horizons: { key: HorizonKey; label: string; days: number }[];
  metrics: { key: string; values: Record<HorizonKey, MetricValue> }[];
}

const round = (v: number, d: number) => {
  const f = 10 ** Math.max(d + 2, 4);
  return Math.round(v * f) / f;
};

export const BASELINE_DRIVERS = (bypassMbd: number): Drivers => ({
  durationDays: 0,
  capacityLostPct: 0,
  bypassMbd,
  oilPriceShockPct: 0,
});

/** Runs the template. Values are rounded to a fixed precision so stored runs hash identically on re-run. */
export function runEngine(drivers: Drivers, inputs: EngineInputs): EngineResult {
  const bypassCentral = inputs.assumptions.bypass_capacity.central;
  const cases: CaseKey[] = ['low', 'central', 'high'];
  const perCase = cases.map((c) => assumptionsForCase(inputs.assumptions, c));
  const central = perCase[1]!;
  const metrics = METRICS.map((m) => {
    const values = {} as Record<HorizonKey, MetricValue>;
    for (const h of SCENARIO_HORIZONS) {
      const [lo, mid, hi] = perCase.map(
        (a) => evaluate(drivers, inputs.facts, a, bypassCentral, h.days)[m.key]!,
      );
      const baseline = evaluate(
        BASELINE_DRIVERS(drivers.bypassMbd),
        inputs.facts,
        central,
        bypassCentral,
        h.days,
      )[m.key]!;
      values[h.key] = {
        low: round(Math.min(lo!, mid!, hi!), m.decimals),
        central: round(mid!, m.decimals),
        high: round(Math.max(lo!, mid!, hi!), m.decimals),
        baseline: round(baseline, m.decimals),
      };
    }
    return { key: m.key, values };
  });
  return { engine: ENGINE, horizons: SCENARIO_HORIZONS.map((h) => ({ ...h })), metrics };
}

export function validateDrivers(d: Partial<Record<DriverKey, unknown>>): Drivers | null {
  const out = {} as Drivers;
  for (const def of HORMUZ_DRIVERS) {
    const v = d[def.key];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < def.min || v > def.max) return null;
    out[def.key] = v;
  }
  return out;
}

/** Formats a scenario value with its unit, exactly as prose and screens quote it. */
export function formatScenarioValue(value: number, unit: string | null, decimals = 2): string {
  const n = Number(value.toFixed(decimals)).toLocaleString('en-US', { maximumFractionDigits: decimals });
  if (!unit || unit === 'ratio') return n;
  if (unit === '%' || unit.startsWith('% ')) return `${n}${unit}`;
  return `${n} ${unit}`;
}
