/**
 * One-at-a-time sensitivity for a scenario run (slice G, FR-24). Every input is held at its central value except
 * one, which is moved to each end of its range: an assumption to its registered low and high, a driver by a stated
 * step either side of the analyst's choice (clamped to the driver's allowed range). The rows are ordered by how far
 * the chosen metric moves, so a reviewer sees which inputs the conclusion actually rests on.
 *
 * Deterministic and pure: the same stored inputs and engine version always give the same table.
 */
import {
  ASSUMPTION_KEYS,
  HORMUZ_DRIVERS,
  METRICS,
  SCENARIO_HORIZONS,
  assumptionsForCase,
  evaluate,
  type AssumptionKey,
  type DriverKey,
  type Drivers,
  type EngineInputs,
  type HorizonKey,
} from './scenario-engine';

export const SENSITIVITY = { version: '1.0.0', driverStepPct: 20 } as const;

export interface SensitivityRow {
  ref: string;
  kind: 'assumption' | 'driver';
  label: string;
  unit: string;
  inputLow: number;
  inputCentral: number;
  inputHigh: number;
  /** Metric value with this input at its low end, everything else central. */
  valueAtLow: number;
  valueAtHigh: number;
  /** Absolute distance between the two values. */
  swing: number;
}

export interface SensitivityResult {
  version: string;
  metricKey: string;
  horizon: HorizonKey;
  /** Metric with every input central. */
  central: number;
  rows: SensitivityRow[];
}

const round = (v: number, d: number) => Number(v.toFixed(d + 2));

export function sensitivity(
  drivers: Drivers,
  inputs: EngineInputs,
  metricKey: string,
  horizon: HorizonKey = 'd90',
): SensitivityResult {
  const def = METRICS.find((m) => m.key === metricKey);
  const h = SCENARIO_HORIZONS.find((x) => x.key === horizon);
  if (!def || !h) throw new Error(`unknown metric or horizon: ${metricKey} ${horizon}`);
  const central = assumptionsForCase(inputs.assumptions, 'central');
  const bypassCentral = inputs.assumptions.bypass_capacity.central;
  const at = (d: Drivers, a: Record<AssumptionKey, number>) =>
    round(evaluate(d, inputs.facts, a, bypassCentral, h.days)[metricKey]!, def.decimals);

  const rows: SensitivityRow[] = [];
  for (const k of ASSUMPTION_KEYS) {
    const r = inputs.assumptions[k];
    const valueAtLow = at(drivers, { ...central, [k]: r.low });
    const valueAtHigh = at(drivers, { ...central, [k]: r.high });
    rows.push({
      ref: `assumption:${k}`,
      kind: 'assumption',
      label: k,
      unit: '',
      inputLow: r.low,
      inputCentral: r.central,
      inputHigh: r.high,
      valueAtLow,
      valueAtHigh,
      swing: round(Math.abs(valueAtHigh - valueAtLow), def.decimals),
    });
  }
  for (const d of HORMUZ_DRIVERS) {
    const v = drivers[d.key];
    const step = (Math.abs(v) * SENSITIVITY.driverStepPct) / 100;
    const lo = Math.max(d.min, v - step);
    const hi = Math.min(d.max, v + step);
    const with_ = (x: number) => ({ ...drivers, [d.key as DriverKey]: x });
    const valueAtLow = at(with_(lo), central);
    const valueAtHigh = at(with_(hi), central);
    rows.push({
      ref: `driver:${d.key}`,
      kind: 'driver',
      label: d.label,
      unit: d.unit,
      inputLow: round(lo, 2),
      inputCentral: v,
      inputHigh: round(hi, 2),
      valueAtLow,
      valueAtHigh,
      swing: round(Math.abs(valueAtHigh - valueAtLow), def.decimals),
    });
  }
  rows.sort((a, b) => b.swing - a.swing || a.ref.localeCompare(b.ref));
  return { version: SENSITIVITY.version, metricKey, horizon, central: at(drivers, central), rows };
}
