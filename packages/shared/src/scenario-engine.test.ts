import { describe, expect, it } from 'vitest';
import {
  ASSUMPTION_KEYS,
  SCENARIO_HORIZONS,
  METRICS,
  rampFactor,
  runEngine,
  validateDrivers,
  type AssumptionKey,
  type Drivers,
  type EngineInputs,
  type Range3,
} from './scenario-engine';
import { checkMandates, rankOptions, scenarioConfidence, severityOf } from './scenario-options';

const assumptions: Record<AssumptionKey, Range3> = {
  bypass_capacity: { low: 1.5, central: 2.6, high: 3.5 },
  bypass_ramp_days: { low: 3, central: 7, high: 14 },
  valuation_elasticity: { low: 0.3, central: 0.5, high: 0.8 },
  war_risk_base_pct: { low: 0.03, central: 0.05, high: 0.08 },
  war_risk_multiplier: { low: 4, central: 8, high: 15 },
  premium_half_life_days: { low: 30, central: 60, high: 120 },
  freight_sensitivity_pct: { low: 150, central: 300, high: 500 },
  fuel_cost_passthrough: { low: 0.3, central: 0.6, high: 0.9 },
};

const inputs: EngineInputs = {
  facts: {
    baselineFlowMbd: 20.9,
    globalLiquidsSharePct: 20,
    exposedNavSharePct: 18,
    fuelBufferDays: 9,
    dependentPlants: 2,
  },
  assumptions,
};

const drivers: Drivers = { durationDays: 21, capacityLostPct: 50, bypassMbd: 2.6, oilPriceShockPct: 30 };

const value = (
  r: ReturnType<typeof runEngine>,
  metric: string,
  h: (typeof SCENARIO_HORIZONS)[number]['key'],
) => r.metrics.find((m) => m.key === metric)!.values[h];

describe('scenario engine hormuz-disruption 1.0.0', () => {
  it('is deterministic', () => {
    expect(runEngine(drivers, inputs)).toEqual(runEngine({ ...drivers }, structuredClone(inputs)));
  });

  it('orders every range low ≤ central ≤ high and covers all metrics and horizons', () => {
    const r = runEngine(drivers, inputs);
    expect(r.metrics).toHaveLength(METRICS.length);
    for (const m of r.metrics)
      for (const h of SCENARIO_HORIZONS) {
        const v = m.values[h.key];
        expect(v.low).toBeLessThanOrEqual(v.central);
        expect(v.central).toBeLessThanOrEqual(v.high);
      }
  });

  it('has a no-disruption baseline: nothing disrupted, war-risk premium at its base', () => {
    const r = runEngine(drivers, inputs);
    for (const h of SCENARIO_HORIZONS) {
      expect(value(r, 'net_disrupted_flow', h.key).baseline).toBe(0);
      expect(value(r, 'nav_at_risk_peak', h.key).baseline).toBe(0);
      expect(value(r, 'war_risk_premium', h.key).baseline).toBe(0.05);
    }
  });

  it('computes the central 90-day flow from the published formula', () => {
    // gross 20.9 × 0.5 = 10.45; ramp factor over 21 days with a 7-day ramp = 1 − 7/42; bypass 2.6.
    const expected = 10.45 - 2.6 * (1 - 7 / 42);
    expect(value(runEngine(drivers, inputs), 'net_disrupted_flow', 'd90').central).toBeCloseTo(expected, 3);
  });

  it('shows more disruption at 72 hours because bypass routes are still ramping up', () => {
    const r = runEngine(drivers, inputs);
    expect(value(r, 'net_disrupted_flow', 'h72').central).toBeGreaterThan(
      value(r, 'net_disrupted_flow', 'd90').central,
    );
  });

  it('dilutes time-weighted effects over longer horizons', () => {
    const r = runEngine(drivers, inputs);
    expect(value(r, 'nav_at_risk_time_weighted', 'y5').central).toBeLessThan(
      value(r, 'nav_at_risk_time_weighted', 'd90').central,
    );
  });

  it('is monotonic in capacity lost', () => {
    const lo = runEngine({ ...drivers, capacityLostPct: 20 }, inputs);
    const hi = runEngine({ ...drivers, capacityLostPct: 80 }, inputs);
    expect(value(hi, 'cumulative_volume', 'y1').central).toBeGreaterThan(
      value(lo, 'cumulative_volume', 'y1').central,
    );
  });

  it('counts reduced desalination output only beyond the fuel buffer', () => {
    expect(
      value(runEngine({ ...drivers, durationDays: 9 }, inputs), 'desal_reduced_output_days', 'd90').central,
    ).toBe(0);
    expect(value(runEngine(drivers, inputs), 'desal_reduced_output_days', 'd90').central).toBe((21 - 9) * 2);
  });

  it('computes the ramp factor', () => {
    expect(rampFactor(0, 7)).toBe(0);
    expect(rampFactor(7, 7)).toBe(0.5);
    expect(rampFactor(14, 7)).toBe(0.75);
    expect(rampFactor(5, 0)).toBe(1);
  });

  it('rejects drivers outside their declared ranges', () => {
    expect(validateDrivers(drivers)).toEqual(drivers);
    expect(validateDrivers({ ...drivers, capacityLostPct: 120 })).toBeNull();
    expect(validateDrivers({ ...drivers, durationDays: Number.NaN })).toBeNull();
    expect(validateDrivers({ durationDays: 10 })).toBeNull();
  });

  it('declares every assumption it uses', () => {
    for (const m of METRICS)
      for (const ref of m.inputs.filter((r) => r.startsWith('assumption:')))
        expect(ASSUMPTION_KEYS).toContain(ref.slice('assumption:'.length));
  });
});

describe('options ranker 1.0.0', () => {
  const situation = {
    durationDays: 21,
    routeDependentHoldings: 11,
    exposedNavSharePct: 18,
    fuelBufferDays: 9,
    unverifiedInputs: 2,
    disputedInputs: 0,
    syntheticInputs: 4,
    assumptionsInRankingMetric: 3,
  };
  const mandates = [
    { key: 'M-RISK-02', title: 'Route-concentration limit', limitValue: 15, limitUnit: 'holdings' },
    { key: 'M-RISK-03', title: 'Energy and shipping concentration', limitValue: 20, limitUnit: '% of NAV' },
    { key: 'M-RES-04', title: 'Critical-service continuity', limitValue: 7, limitUnit: 'days' },
    { key: 'M-GOV-05', title: 'Evidence standard for decisions', limitValue: null, limitUnit: null },
  ];

  it('maps NAV at risk to severity thresholds', () => {
    expect(severityOf(0.2)).toBe('low');
    expect(severityOf(0.5)).toBe('moderate');
    expect(severityOf(2)).toBe('high');
  });

  it('ranks four draft options with a stated basis', () => {
    const { options, severity } = rankOptions(runEngine(drivers, inputs));
    expect(options.map((o) => o.rank)).toEqual([1, 2, 3, 4]);
    expect(options[0]!.rankBasis).toContain(`${severity}-severity rule`);
  });

  it('ranks monitoring first when nothing is disrupted', () => {
    const { options } = rankOptions(runEngine({ ...drivers, capacityLostPct: 0 }, inputs));
    expect(options[0]!.actionClass).toBe('Monitor / watchlist');
  });

  it('checks mandates against configured limits and flags unverified evidence', () => {
    const checks = checkMandates(runEngine(drivers, inputs), situation, mandates);
    expect(checks.find((c) => c.mandateKey === 'M-RISK-02')!.status).toBe('within');
    expect(checks.find((c) => c.mandateKey === 'M-RES-04')!.status).toBe('attention');
    expect(checks.find((c) => c.mandateKey === 'M-GOV-05')!.status).toBe('attention');
  });

  it('skips mandates that have no configured limit rather than assuming one', () => {
    const checks = checkMandates(runEngine(drivers, inputs), situation, [
      { ...mandates[0]!, limitValue: null },
    ]);
    expect(checks).toHaveLength(0);
  });

  it('gives a confidence band with its basis, never a percentage', () => {
    const c = scenarioConfidence(runEngine(drivers, inputs), situation);
    expect(['high', 'moderate', 'low', 'insufficient']).toContain(c.band);
    expect(c.factors.map((f) => f.factor)).toEqual([
      'source_quality',
      'assumption_load',
      'scenario_stability',
    ]);
    expect(c.band).toBe('low');
  });
});
