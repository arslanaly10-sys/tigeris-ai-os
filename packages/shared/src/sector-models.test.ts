import { describe, expect, it } from 'vitest';
import { SECTOR_DATASET_DEFS, SECTOR_DATASET_FOR, SECTOR_DATASETS, sectorIndicators } from './sector-models';

const ind = (
  ds: Parameters<typeof sectorIndicators>[0],
  rows: Parameters<typeof sectorIndicators>[1],
  key: string,
) => sectorIndicators(ds, rows).find((i) => i.key === key)!;

describe('sector datasets', () => {
  it('give each shell sector exactly one dataset with a key and a date', () => {
    expect(SECTOR_DATASETS).toHaveLength(6);
    for (const d of SECTOR_DATASETS) {
      const def = SECTOR_DATASET_DEFS[d];
      expect(SECTOR_DATASET_FOR[def.sector]).toBe(d);
      expect(def.fields.map((f) => f.name)).toEqual(expect.arrayContaining(['key', 'as_of']));
      expect(def.mappingVersion).toMatch(/\.csv\.v1$/);
    }
  });
});

describe('sector indicators (sector-models 1.0.0)', () => {
  it('say not connected, with no inputs, when there are no records', () => {
    for (const d of SECTOR_DATASETS)
      for (const i of sectorIndicators(d, [])) {
        expect(i.value).toBeNull();
        expect(i.inputKeys).toEqual([]);
      }
  });

  it('find the shortest gas-dependent fuel buffer and the gas capacity share', () => {
    const rows = [
      { key: 'UA-2', attributes: { capacity_mw: 300, fuel_buffer_days: 5, gas_dependent: true } },
      { key: 'UA-1', attributes: { capacity_mw: 700, fuel_buffer_days: 2, gas_dependent: false } },
      { key: 'UA-3', attributes: { capacity_mw: 1000, fuel_buffer_days: 9, gas_dependent: true } },
    ];
    expect(ind('utility_assets', rows, 'min_fuel_buffer')).toMatchObject({ value: 5, drivingKeys: ['UA-2'] });
    const share = ind('utility_assets', rows, 'gas_capacity_share');
    expect(share.value).toBe(65);
    expect(share.inputKeys).toEqual(['UA-1', 'UA-2', 'UA-3']);
  });

  it('counts limit breaches and slipping milestones, and accumulates insurance by peril and region', () => {
    expect(
      ind(
        'counterparty_exposures',
        [
          { key: 'CP-1', attributes: { exposure_usd: 60, limit_usd: 50 } },
          { key: 'CP-2', attributes: { exposure_usd: 40, limit_usd: 50 } },
        ],
        'over_limit',
      ),
    ).toMatchObject({ value: 1, drivingKeys: ['CP-1'] });
    expect(
      ind(
        'project_milestones',
        [
          { key: 'PM-1', attributes: { planned_date: '2026-12-31', forecast_date: '2027-02-28' } },
          { key: 'PM-2', attributes: { planned_date: '2026-12-31', forecast_date: '2026-11-30' } },
        ],
        'slipping',
      ).value,
    ).toBe(1);
    expect(
      ind(
        'insured_exposures',
        [
          { key: 'IE-1', attributes: { peril: 'Marine war', region: 'Gulf', sum_insured_usd: 100 } },
          { key: 'IE-2', attributes: { peril: 'Marine war', region: 'Gulf', sum_insured_usd: 150 } },
          { key: 'IE-3', attributes: { peril: 'Flood', region: 'Gulf', sum_insured_usd: 200 } },
        ],
        'largest_accumulation',
      ),
    ).toMatchObject({ value: 250, drivingKeys: ['IE-1', 'IE-2'] });
  });

  it('is deterministic regardless of record order', () => {
    const rows = [
      { key: 'SUP-2', attributes: { tier: 1, share_pct: 40, single_source: false, critical_input: 'Resin' } },
      { key: 'SUP-1', attributes: { tier: 1, share_pct: 65, single_source: true, critical_input: 'Resin' } },
    ];
    expect(sectorIndicators('supplier_tiers', rows)).toEqual(
      sectorIndicators('supplier_tiers', [...rows].reverse()),
    );
  });
});
