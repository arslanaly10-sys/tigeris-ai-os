import { describe, expect, it } from 'vitest';
import {
  runEngine,
  type AssumptionKey,
  type Drivers,
  type EngineInputs,
  type Range3,
} from './scenario-engine';
import { sensitivity } from './scenario-sensitivity';

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

describe('one-at-a-time sensitivity', () => {
  const s = sensitivity(drivers, inputs, 'nav_at_risk_peak');

  it('agrees with the engine at the central case and is deterministic', () => {
    const central = runEngine(drivers, inputs).metrics.find((m) => m.key === 'nav_at_risk_peak')!.values.d90
      .central;
    expect(s.central).toBeCloseTo(central, 2);
    expect(sensitivity(drivers, structuredClone(inputs), 'nav_at_risk_peak')).toEqual(s);
  });

  it('ranks inputs by how far they move the metric, and inputs the metric ignores move it not at all', () => {
    expect(s.rows.map((r) => r.swing)).toEqual([...s.rows.map((r) => r.swing)].sort((a, b) => b - a));
    expect(s.rows[0]!.ref).toBe('assumption:valuation_elasticity');
    expect(s.rows.find((r) => r.ref === 'assumption:freight_sensitivity_pct')!.swing).toBe(0);
    expect(s.rows.find((r) => r.ref === 'driver:oilPriceShockPct')!.swing).toBe(0);
  });

  it('moves assumptions across their registered range and drivers by a clamped step', () => {
    const e = s.rows.find((r) => r.ref === 'assumption:valuation_elasticity')!;
    expect([e.inputLow, e.inputCentral, e.inputHigh]).toEqual([0.3, 0.5, 0.8]);
    expect(e.valueAtHigh).toBeGreaterThan(s.central);
    const cap = sensitivity({ ...drivers, capacityLostPct: 100 }, inputs, 'nav_at_risk_peak').rows.find(
      (r) => r.ref === 'driver:capacityLostPct',
    )!;
    expect(cap.inputHigh).toBe(100);
    expect(cap.inputLow).toBe(80);
  });

  it('refuses an unknown metric', () => {
    expect(() => sensitivity(drivers, inputs, 'no_such_metric')).toThrow();
  });
});
