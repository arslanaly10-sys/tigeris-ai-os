import { describe, expect, it } from 'vitest';
import { OIL_ASSUMPTION_KEYS, runOilShock, validateOilDrivers, type OilAssumptions } from './oil-shock';

const a = (low: number, central: number, high: number) => ({ low, central, high, version: 1 });
const assumptions = {
  oil_beta_energy: a(0.35, 0.55, 0.75),
  oil_beta_utilities: a(-0.15, -0.05, 0.05),
  oil_beta_supply_chain: a(-0.3, -0.15, -0.05),
  oil_beta_manufacturing: a(-0.25, -0.12, -0.03),
  oil_beta_other: a(-0.08, -0.03, 0),
  oil_credit_damping: a(0.2, 0.3, 0.5),
  oil_adjustment_months: a(3, 6, 12),
} satisfies OilAssumptions;
const positions = [
  {
    key: 'P-E',
    name: 'Energy',
    assetClass: 'Listed equity',
    sectorKey: 'energy',
    marketValue: 1000,
    currency: 'USD',
    navSharePct: 10,
  },
  {
    key: 'P-S',
    name: 'Shipping',
    assetClass: 'Private equity',
    sectorKey: 'supply_chain',
    marketValue: 500,
    currency: 'USD',
    navSharePct: 5,
  },
  {
    key: 'P-C',
    name: 'Credit',
    assetClass: 'Private credit',
    sectorKey: 'energy',
    marketValue: 200,
    currency: 'EUR',
    navSharePct: 2,
  },
];

describe('oil price shock', () => {
  it('validates drivers against the template ranges', () => {
    expect(validateOilDrivers({ oilPriceChangePct: 40, horizonMonths: 6 })).toEqual({
      oilPriceChangePct: 40,
      horizonMonths: 6,
    });
    expect(validateOilDrivers({ oilPriceChangePct: 400, horizonMonths: 6 })).toBeNull();
  });

  it('computes the central case from central assumptions, position by position', () => {
    const r = runOilShock({ oilPriceChangePct: 40, horizonMonths: 6 }, positions, assumptions);
    const e = r.positions.find((p) => p.key === 'P-E')!;
    expect(e.impactPct.central).toBe(22); // 40% × 0.55 × full effect at 6 of 6 months
    expect(e.navImpactPct.central).toBe(2.2);
    const c = r.positions.find((p) => p.key === 'P-C')!;
    expect(c.impactPct.central).toBe(6.6); // damped by 0.3
    expect(c.assumptionKeys).toContain('oil_credit_damping');
    expect(r.navImpactPct.central).toBeCloseTo(2.2 - 0.3 + 0.132, 4);
    expect(r.topContributors[0]).toBe('P-E');
    // Value change sums USD positions only (220 - 30); the EUR position is excluded and counted.
    expect(r.valueImpact.central).toBe(190);
    expect(r.valueExcluded).toBe(1);
  });

  it('brackets the central case with the envelope and keeps low <= central <= high', () => {
    const r = runOilShock({ oilPriceChangePct: 40, horizonMonths: 3 }, positions, assumptions);
    for (const p of r.positions) {
      expect(p.impactPct.low).toBeLessThanOrEqual(p.impactPct.central);
      expect(p.impactPct.central).toBeLessThanOrEqual(p.impactPct.high);
    }
    expect(r.navImpactPct.low).toBeLessThan(r.navImpactPct.high);
    expect(r.method).toContain('not a probability interval');
  });

  it('turns sign with the shock, is deterministic and names assumption versions', () => {
    const up = runOilShock({ oilPriceChangePct: 40, horizonMonths: 6 }, positions, assumptions);
    const down = runOilShock({ oilPriceChangePct: -40, horizonMonths: 6 }, positions, assumptions);
    expect(down.navImpactPct.central).toBeCloseTo(-up.navImpactPct.central, 4);
    expect(
      runOilShock({ oilPriceChangePct: 40, horizonMonths: 6 }, [...positions].reverse(), assumptions),
    ).toEqual(up);
    expect(Object.keys(up.assumptionVersions)).toEqual([...OIL_ASSUMPTION_KEYS]);
  });
});
