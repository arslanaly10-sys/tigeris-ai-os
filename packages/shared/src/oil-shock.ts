/**
 * Oil-price shock on the portfolio (Phase 5F, FR-57, D-109, D-120). A second, declarative scenario template: an oil
 * price move is passed through to each position by an assumed sensitivity for its sector (with credit and fixed
 * income damped), reached gradually over an assumed adjustment period. Deterministic; every number names the
 * positions and assumption versions it came from. Synthetic sensitivities, owner-approved for the demonstration.
 *
 * Range method: for each position the lowest and highest impact over every combination of low and high
 * assumptions is taken, and those extremes are summed. This is a conservative envelope, not a probability interval.
 */
import type { Range3 } from './scenario-engine';

export const OIL_ENGINE = { key: 'oil-price-shock', version: 'oil-shock 1.0.0' } as const;

/** Declarative description of a scenario template: what it asks for and what it computes. */
export interface ScenarioTemplate {
  key: string;
  version: string;
  title: string;
  description: string;
  drivers: {
    key: string;
    label: string;
    unit: string;
    min: number;
    max: number;
    step: number;
    default: number | null;
  }[];
  assumptionKeys: readonly string[];
  outputs: { key: string; label: string; unit: string }[];
}

export const OIL_ASSUMPTION_KEYS = [
  'oil_beta_energy',
  'oil_beta_utilities',
  'oil_beta_supply_chain',
  'oil_beta_manufacturing',
  'oil_beta_other',
  'oil_credit_damping',
  'oil_adjustment_months',
] as const;
export type OilAssumptionKey = (typeof OIL_ASSUMPTION_KEYS)[number];

export const OIL_TEMPLATE: ScenarioTemplate = {
  key: OIL_ENGINE.key,
  version: OIL_ENGINE.version,
  title: 'Oil price shock on the portfolio',
  description:
    'Passes an oil price move through to each position by its sector sensitivity, damped for credit and fixed income, reached over an adjustment period.',
  drivers: [
    {
      key: 'oilPriceChangePct',
      label: 'Oil price change',
      unit: '%',
      min: -60,
      max: 150,
      step: 5,
      default: 40,
    },
    { key: 'horizonMonths', label: 'Horizon', unit: 'months', min: 1, max: 24, step: 1, default: 6 },
  ],
  assumptionKeys: OIL_ASSUMPTION_KEYS,
  outputs: [
    { key: 'nav_impact_pct', label: 'Change in NAV', unit: '% of NAV' },
    { key: 'value_impact', label: 'Change in market value', unit: 'USD m' },
  ],
};

export interface OilDrivers {
  oilPriceChangePct: number;
  horizonMonths: number;
}

export interface OilPosition {
  key: string;
  name: string;
  assetClass: string;
  sectorKey: string | null;
  /** Market value as recorded in the position register (USD millions for the seeded positions). */
  marketValue: number;
  currency: string;
  navSharePct: number;
}

export type OilAssumptions = Record<OilAssumptionKey, Range3 & { version: number }>;

const BETA_FOR: Record<string, OilAssumptionKey> = {
  energy: 'oil_beta_energy',
  utilities: 'oil_beta_utilities',
  supply_chain: 'oil_beta_supply_chain',
  manufacturing: 'oil_beta_manufacturing',
};
const DAMPED = ['Fixed income', 'Private credit'];

export const betaKeyFor = (p: Pick<OilPosition, 'sectorKey'>): OilAssumptionKey =>
  (p.sectorKey && BETA_FOR[p.sectorKey]) || 'oil_beta_other';

export interface OilPositionImpact {
  key: string;
  name: string;
  sectorKey: string | null;
  assetClass: string;
  navSharePct: number;
  /** Change in the position's value, in % of the position. */
  impactPct: Range3;
  /** Contribution to NAV, in % of NAV. */
  navImpactPct: Range3;
  valueImpact: Range3;
  assumptionKeys: OilAssumptionKey[];
}

export interface OilResult {
  engine: typeof OIL_ENGINE;
  drivers: OilDrivers;
  navImpactPct: Range3;
  /** USD positions only, in USD millions; positions in other currencies are counted in valueExcluded. */
  valueImpact: Range3;
  valueExcluded: number;
  bySector: { sectorKey: string; navImpactPct: Range3; positions: number }[];
  positions: OilPositionImpact[];
  /** Positions that drive the central result most, by absolute NAV contribution. */
  topContributors: string[];
  assumptionVersions: Record<OilAssumptionKey, number>;
  method: string;
}

const round = (v: number, d = 4) => Math.round(v * 10 ** d) / 10 ** d;
const add = (a: Range3, b: Range3): Range3 => ({
  low: a.low + b.low,
  central: a.central + b.central,
  high: a.high + b.high,
});
const zero: Range3 = { low: 0, central: 0, high: 0 };
const r3 = (x: Range3, d = 4): Range3 => ({
  low: round(x.low, d),
  central: round(x.central, d),
  high: round(x.high, d),
});

export function validateOilDrivers(d: Partial<Record<keyof OilDrivers, unknown>>): OilDrivers | null {
  const out: Partial<OilDrivers> = {};
  for (const def of OIL_TEMPLATE.drivers) {
    const v = d[def.key as keyof OilDrivers];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < def.min || v > def.max) return null;
    out[def.key as keyof OilDrivers] = v;
  }
  return out as OilDrivers;
}

/** Runs the oil-price-shock template. Pure and deterministic. */
export function runOilShock(
  drivers: OilDrivers,
  positions: readonly OilPosition[],
  a: OilAssumptions,
): OilResult {
  const shock = drivers.oilPriceChangePct / 100;
  const reach = (months: number) => Math.min(1, drivers.horizonMonths / Math.max(months, 1e-9));
  const sorted = [...positions].sort((x, y) => x.key.localeCompare(y.key));
  const impacts: OilPositionImpact[] = sorted.map((p) => {
    const betaKey = betaKeyFor(p);
    const beta = a[betaKey];
    const damped = DAMPED.includes(p.assetClass);
    const damp = damped ? a.oil_credit_damping : { low: 1, central: 1, high: 1 };
    const adj = a.oil_adjustment_months;
    const at = (b: number, dm: number, m: number) => shock * b * dm * reach(m) * 100;
    const corners = [beta.low, beta.high].flatMap((b) =>
      [damp.low, damp.high].flatMap((dm) => [adj.low, adj.high].map((m) => at(b, dm, m))),
    );
    const impactPct: Range3 = {
      low: Math.min(...corners),
      central: at(beta.central, damp.central, adj.central),
      high: Math.max(...corners),
    };
    const scale = (f: number): Range3 => ({
      low: impactPct.low * f,
      central: impactPct.central * f,
      high: impactPct.high * f,
    });
    return {
      key: p.key,
      name: p.name,
      sectorKey: p.sectorKey,
      assetClass: p.assetClass,
      navSharePct: p.navSharePct,
      impactPct: r3(impactPct),
      navImpactPct: r3(scale(p.navSharePct / 100)),
      valueImpact: r3(scale(p.marketValue / 100), 1),
      assumptionKeys: [
        betaKey,
        ...(damped ? (['oil_credit_damping'] as const) : []),
        'oil_adjustment_months',
      ],
    };
  });
  const sectors = [...new Set(impacts.map((i) => i.sectorKey ?? 'unassigned'))].sort();
  return {
    engine: OIL_ENGINE,
    drivers,
    navImpactPct: r3(impacts.reduce((s, i) => add(s, i.navImpactPct), zero)),
    valueImpact: r3(
      impacts.reduce((s, i, n) => (sorted[n]!.currency === 'USD' ? add(s, i.valueImpact) : s), zero),
      1,
    ),
    valueExcluded: sorted.filter((p) => p.currency !== 'USD').length,
    bySector: sectors.map((k) => {
      const mine = impacts.filter((i) => (i.sectorKey ?? 'unassigned') === k);
      return {
        sectorKey: k,
        positions: mine.length,
        navImpactPct: r3(mine.reduce((s, i) => add(s, i.navImpactPct), zero)),
      };
    }),
    positions: impacts,
    topContributors: [...impacts]
      .sort(
        (x, y) =>
          Math.abs(y.navImpactPct.central) - Math.abs(x.navImpactPct.central) || x.key.localeCompare(y.key),
      )
      .slice(0, 5)
      .map((i) => i.key),
    assumptionVersions: Object.fromEntries(OIL_ASSUMPTION_KEYS.map((k) => [k, a[k].version])) as Record<
      OilAssumptionKey,
      number
    >,
    method:
      `${OIL_ENGINE.version}: value change = oil change × sector sensitivity × credit damping (credit and fixed income) × ` +
      'min(1, horizon ÷ adjustment period). Value change sums USD positions only, in USD millions as recorded. Ranges are the per-position extremes over low and high assumptions, summed: a conservative envelope, not a probability interval.',
  };
}
