/**
 * Sector datasets and models (slice K). Each sector that had no data of its own gets one importable dataset and two
 * deterministic, versioned indicators computed from the imported records. An indicator always names the records it
 * used and the method, and shows "not connected" when no record exists. Nothing is seeded: the institution imports
 * its own data (or a labelled sample) through Data & Sources.
 */
import type { FieldSpec } from './connectors';
import type { SectorKey } from './sectors';

export const SECTOR_MODELS_VERSION = 'sector-models 1.0.0';

export const SECTOR_DATASETS = [
  'utility_assets',
  'shipments',
  'counterparty_exposures',
  'supplier_tiers',
  'project_milestones',
  'insured_exposures',
] as const;
export type SectorDataset = (typeof SECTOR_DATASETS)[number];

const key = (example: string): FieldSpec => ({
  name: 'key',
  type: 'key',
  required: true,
  description: 'Stable record identifier (A–Z, 0–9, hyphen).',
  example,
});
const asOf: FieldSpec = {
  name: 'as_of',
  type: 'date',
  required: true,
  description: 'Date the record describes, YYYY-MM-DD.',
  example: '2026-09-30',
};
const text = (name: string, description: string, example: string, required = true): FieldSpec => ({
  name,
  type: 'text',
  required,
  description,
  example,
});
const num = (name: string, description: string, example: string, min = 0, max?: number): FieldSpec => ({
  name,
  type: 'number',
  required: true,
  description,
  example,
  min,
  ...(max === undefined ? {} : { max }),
});
const bool = (name: string, description: string, example: string): FieldSpec => ({
  name,
  type: 'boolean',
  required: true,
  description,
  example,
});

export const SECTOR_DATASET_DEFS: Record<
  SectorDataset,
  { sector: SectorKey; label: string; mappingVersion: string; fields: FieldSpec[] }
> = {
  utility_assets: {
    sector: 'utilities',
    label: 'Utility assets',
    mappingVersion: 'utility_assets.csv.v1',
    fields: [
      key('UA-101'),
      text('name', 'Asset name.', 'Coastal power station (Sample)'),
      {
        name: 'asset_type',
        type: 'enum',
        required: true,
        values: ['power', 'desalination', 'grid', 'gas'],
        description: 'power, desalination, grid or gas.',
        example: 'power',
      },
      num('capacity_mw', 'Installed capacity, MW (or MW-equivalent).', '850'),
      num('fuel_buffer_days', 'Days of fuel on site before output falls.', '9'),
      bool('gas_dependent', 'Runs on imported gas or LNG (true/false).', 'true'),
      asOf,
    ],
  },
  shipments: {
    sector: 'supply_chain',
    label: 'Shipments',
    mappingVersion: 'shipments.csv.v1',
    fields: [
      key('SH-101'),
      text('lane', 'Trade lane.', 'Jebel Ali to Mumbai'),
      text('origin_port', 'Origin port.', 'Jebel Ali'),
      text('destination_port', 'Destination port.', 'Nhava Sheva'),
      num('delay_days', 'Days behind the planned arrival (0 if on time).', '3'),
      bool('route_via_hormuz', 'Transits the Strait of Hormuz (true/false).', 'true'),
      num('value_usd', 'Cargo value, USD.', '1250000'),
      asOf,
    ],
  },
  counterparty_exposures: {
    sector: 'banking',
    label: 'Counterparty exposures',
    mappingVersion: 'counterparty_exposures.csv.v1',
    fields: [
      key('CP-101'),
      text('counterparty', 'Counterparty name.', 'Regional bank A (Sample)'),
      { name: 'country', type: 'country', required: false, description: 'ISO country code.', example: 'AE' },
      num('exposure_usd', 'Current exposure, USD.', '40000000'),
      num('limit_usd', 'Approved limit, USD.', '50000000'),
      asOf,
    ],
  },
  supplier_tiers: {
    sector: 'manufacturing',
    label: 'Supplier tiers',
    mappingVersion: 'supplier_tiers.csv.v1',
    fields: [
      key('SUP-101'),
      text('supplier', 'Supplier name.', 'Specialty resins supplier (Sample)'),
      {
        name: 'tier',
        type: 'integer',
        required: true,
        min: 1,
        max: 3,
        description: 'Supplier tier, 1 to 3.',
        example: '1',
      },
      text('critical_input', 'Input supplied.', 'Polymer resin'),
      bool('single_source', 'The only qualified source for this input (true/false).', 'true'),
      num('share_pct', 'Share of the input bought from this supplier, percent.', '65', 0, 100),
      asOf,
    ],
  },
  project_milestones: {
    sector: 'real_estate',
    label: 'Project milestones',
    mappingVersion: 'project_milestones.csv.v1',
    fields: [
      key('PM-101'),
      text('project', 'Project name.', 'Waterfront district phase 2 (Sample)'),
      text('milestone', 'Milestone.', 'Structural completion'),
      {
        name: 'planned_date',
        type: 'date',
        allowFuture: true,
        required: true,
        description: 'Planned date.',
        example: '2026-12-31',
      },
      {
        name: 'forecast_date',
        type: 'date',
        allowFuture: true,
        required: true,
        description: 'Current forecast.',
        example: '2027-02-28',
      },
      num('budget_usd', 'Milestone budget, USD.', '90000000'),
      num('spent_usd', 'Spent to date, USD.', '71000000'),
      asOf,
    ],
  },
  insured_exposures: {
    sector: 'insurance',
    label: 'Insured exposures',
    mappingVersion: 'insured_exposures.csv.v1',
    fields: [
      key('IE-101'),
      text('policy', 'Policy or programme.', 'Marine cargo programme (Sample)'),
      text('peril', 'Peril.', 'Marine war'),
      text('region', 'Region.', 'Arabian Gulf'),
      num('sum_insured_usd', 'Sum insured, USD.', '300000000'),
      num('retention_usd', 'Amount retained after reinsurance, USD.', '45000000'),
      asOf,
    ],
  },
};

export const SECTOR_DATASET_FOR: Partial<Record<SectorKey, SectorDataset>> = Object.fromEntries(
  SECTOR_DATASETS.map((d) => [SECTOR_DATASET_DEFS[d].sector, d]),
);

export type SectorAttrs = Record<string, string | number | boolean | null>;
export interface SectorRecordInput {
  key: string;
  attributes: SectorAttrs;
}

export interface SectorIndicator {
  key: string;
  label: string;
  unit: string;
  /** Null when there is nothing to compute from; the screen says "not connected". */
  value: number | null;
  method: string;
  /** Records that produced the value (all records of the dataset the reader may see). */
  inputKeys: string[];
  /** Records that determine the value, e.g. the minimum or the items counted. */
  drivingKeys: string[];
  version: string;
}

const n = (v: unknown) => (typeof v === 'number' ? v : Number(v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const pct = (part: number, whole: number) => (whole > 0 ? r2((part / whole) * 100) : null);

interface IndicatorDef {
  key: string;
  label: string;
  unit: string;
  method: string;
  compute: (rows: SectorRecordInput[]) => { value: number | null; driving: string[] };
}

const DEFS: Record<SectorDataset, IndicatorDef[]> = {
  utility_assets: [
    {
      key: 'min_fuel_buffer',
      label: 'Shortest fuel buffer, gas-dependent assets',
      unit: 'days',
      method: 'Minimum fuel_buffer_days over assets with gas_dependent = true.',
      compute: (rows) => {
        const gas = rows.filter((r) => r.attributes.gas_dependent === true);
        if (!gas.length) return { value: null, driving: [] };
        const min = Math.min(...gas.map((r) => n(r.attributes.fuel_buffer_days)));
        return {
          value: min,
          driving: gas.filter((r) => n(r.attributes.fuel_buffer_days) === min).map((r) => r.key),
        };
      },
    },
    {
      key: 'gas_capacity_share',
      label: 'Capacity dependent on imported gas',
      unit: '%',
      method: 'Sum of capacity_mw where gas_dependent, divided by total capacity_mw.',
      compute: (rows) => {
        const total = rows.reduce((a, r) => a + n(r.attributes.capacity_mw), 0);
        const gas = rows.filter((r) => r.attributes.gas_dependent === true);
        return {
          value: pct(
            gas.reduce((a, r) => a + n(r.attributes.capacity_mw), 0),
            total,
          ),
          driving: gas.map((r) => r.key),
        };
      },
    },
  ],
  shipments: [
    {
      key: 'delayed_shipments',
      label: 'Shipments delayed more than 2 days',
      unit: 'shipments',
      method: 'Count of shipments with delay_days > 2.',
      compute: (rows) => {
        const late = rows.filter((r) => n(r.attributes.delay_days) > 2);
        return { value: rows.length ? late.length : null, driving: late.map((r) => r.key) };
      },
    },
    {
      key: 'hormuz_value_share',
      label: 'Cargo value routed via Hormuz',
      unit: '%',
      method: 'Sum of value_usd where route_via_hormuz, divided by total value_usd.',
      compute: (rows) => {
        const via = rows.filter((r) => r.attributes.route_via_hormuz === true);
        return {
          value: pct(
            via.reduce((a, r) => a + n(r.attributes.value_usd), 0),
            rows.reduce((a, r) => a + n(r.attributes.value_usd), 0),
          ),
          driving: via.map((r) => r.key),
        };
      },
    },
  ],
  counterparty_exposures: [
    {
      key: 'over_limit',
      label: 'Counterparties over their limit',
      unit: 'counterparties',
      method: 'Count of counterparties with exposure_usd > limit_usd.',
      compute: (rows) => {
        const over = rows.filter((r) => n(r.attributes.exposure_usd) > n(r.attributes.limit_usd));
        return { value: rows.length ? over.length : null, driving: over.map((r) => r.key) };
      },
    },
    {
      key: 'largest_share',
      label: 'Largest single counterparty share',
      unit: '%',
      method: 'Largest exposure_usd divided by total exposure_usd.',
      compute: (rows) => {
        if (!rows.length) return { value: null, driving: [] };
        const max = Math.max(...rows.map((r) => n(r.attributes.exposure_usd)));
        return {
          value: pct(
            max,
            rows.reduce((a, r) => a + n(r.attributes.exposure_usd), 0),
          ),
          driving: rows.filter((r) => n(r.attributes.exposure_usd) === max).map((r) => r.key),
        };
      },
    },
  ],
  supplier_tiers: [
    {
      key: 'single_source_inputs',
      label: 'Critical inputs with a single source',
      unit: 'inputs',
      method: 'Count of distinct critical_input values that have a single_source supplier.',
      compute: (rows) => {
        const single = rows.filter((r) => r.attributes.single_source === true);
        return {
          value: rows.length ? new Set(single.map((r) => String(r.attributes.critical_input))).size : null,
          driving: single.map((r) => r.key),
        };
      },
    },
    {
      key: 'tier1_concentration',
      label: 'Highest tier-1 supplier share',
      unit: '%',
      method: 'Largest share_pct among tier-1 suppliers.',
      compute: (rows) => {
        const t1 = rows.filter((r) => n(r.attributes.tier) === 1);
        if (!t1.length) return { value: null, driving: [] };
        const max = Math.max(...t1.map((r) => n(r.attributes.share_pct)));
        return { value: max, driving: t1.filter((r) => n(r.attributes.share_pct) === max).map((r) => r.key) };
      },
    },
  ],
  project_milestones: [
    {
      key: 'slipping',
      label: 'Milestones forecast later than planned',
      unit: 'milestones',
      method: 'Count of milestones with forecast_date after planned_date.',
      compute: (rows) => {
        const late = rows.filter(
          (r) => String(r.attributes.forecast_date) > String(r.attributes.planned_date),
        );
        return { value: rows.length ? late.length : null, driving: late.map((r) => r.key) };
      },
    },
    {
      key: 'budget_consumed',
      label: 'Budget consumed',
      unit: '%',
      method: 'Sum of spent_usd divided by sum of budget_usd.',
      compute: (rows) => ({
        value: pct(
          rows.reduce((a, r) => a + n(r.attributes.spent_usd), 0),
          rows.reduce((a, r) => a + n(r.attributes.budget_usd), 0),
        ),
        driving: rows.map((r) => r.key),
      }),
    },
  ],
  insured_exposures: [
    {
      key: 'net_retention',
      label: 'Net retained exposure',
      unit: 'USD',
      method: 'Sum of retention_usd.',
      compute: (rows) => ({
        value: rows.length ? rows.reduce((a, r) => a + n(r.attributes.retention_usd), 0) : null,
        driving: rows.map((r) => r.key),
      }),
    },
    {
      key: 'largest_accumulation',
      label: 'Largest peril and region accumulation',
      unit: 'USD',
      method: 'Largest sum of sum_insured_usd over records sharing the same peril and region.',
      compute: (rows) => {
        const groups = new Map<string, SectorRecordInput[]>();
        for (const r of rows) {
          const g = `${String(r.attributes.peril)}|${String(r.attributes.region)}`;
          groups.set(g, [...(groups.get(g) ?? []), r]);
        }
        let best: { total: number; rows: SectorRecordInput[] } | null = null;
        for (const rs of groups.values()) {
          const total = rs.reduce((a, r) => a + n(r.attributes.sum_insured_usd), 0);
          if (!best || total > best.total) best = { total, rows: rs };
        }
        return { value: best ? best.total : null, driving: best ? best.rows.map((r) => r.key) : [] };
      },
    },
  ],
};

/** Deterministic indicators for one sector dataset. The same records always give the same values. */
export function sectorIndicators(dataset: SectorDataset, rows: SectorRecordInput[]): SectorIndicator[] {
  const sorted = [...rows].sort((a, b) => a.key.localeCompare(b.key));
  return DEFS[dataset].map((d) => {
    const { value, driving } = d.compute(sorted);
    return {
      key: d.key,
      label: d.label,
      unit: d.unit,
      value,
      method: d.method,
      inputKeys: value === null ? [] : sorted.map((r) => r.key),
      drivingKeys: value === null ? [] : driving,
      version: SECTOR_MODELS_VERSION,
    };
  });
}
