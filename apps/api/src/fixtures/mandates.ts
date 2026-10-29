/** Synthetic mandate register and authority matrix for the fictional demonstration institution. */
import type { Role } from '@tigeris/shared';

export const MANDATES: {
  key: string;
  title: string;
  description: string;
  category: string;
  limitText: string;
  ownerRole: Role;
  /** Numeric limit used by deterministic mandate checks; null where the mandate is qualitative. */
  limitValue: string | null;
  limitUnit: string | null;
}[] = [
  {
    key: 'M-STRAT-01',
    title: 'Long-term national diversification',
    description: 'Grow non-hydrocarbon exposure while preserving capital across cycles.',
    category: 'Strategic mandate',
    limitText: 'Target band set annually by the board (synthetic)',
    ownerRole: 'executive',
    limitValue: null,
    limitUnit: null,
  },
  {
    key: 'M-RISK-02',
    title: 'Route-concentration limit',
    description: 'Limit holdings whose value depends on a single maritime chokepoint.',
    category: 'Risk limit',
    limitText: 'No more than 15 holdings dependent on one chokepoint (synthetic)',
    ownerRole: 'approver',
    limitValue: '15',
    limitUnit: 'holdings',
  },
  {
    key: 'M-RISK-03',
    title: 'Energy and shipping concentration',
    description: 'Cap combined energy and shipping exposure as a share of net asset value.',
    category: 'Risk limit',
    limitText: 'Up to 20% of NAV (synthetic)',
    ownerRole: 'approver',
    limitValue: '20',
    limitUnit: '% of NAV',
  },
  {
    key: 'M-RES-04',
    title: 'Critical-service continuity',
    description: 'Protect utility holdings that supply essential power and water services.',
    category: 'Resilience mandate',
    limitText: 'Minimum 7 days of fuel buffer at essential plants (synthetic)',
    ownerRole: 'domain_expert',
    limitValue: '7',
    limitUnit: 'days',
  },
  {
    key: 'M-GOV-05',
    title: 'Evidence standard for decisions',
    description: 'Decisions rely only on validated or explicitly labelled evidence with lineage.',
    category: 'Governance',
    limitText: 'Unverified or disputed evidence cannot be the sole basis of a decision',
    ownerRole: 'administrator',
    limitValue: null,
    limitUnit: null,
  },
];

export const AUTHORITY_RULES: {
  actionClass: string;
  description: string;
  requiredRole: Role;
  thresholdText: string;
  twoPerson: boolean;
}[] = [
  {
    actionClass: 'Monitor / watchlist',
    description: 'Add an exposure or counterparty to enhanced monitoring.',
    requiredRole: 'approver',
    thresholdText: 'Any size',
    twoPerson: false,
  },
  {
    actionClass: 'Defer commitment',
    description: 'Delay a planned deployment or capital commitment.',
    requiredRole: 'approver',
    thresholdText: 'Up to 90 days',
    twoPerson: false,
  },
  {
    actionClass: 'Hedge exposure',
    description: 'Add oil, freight or FX hedges to affected holdings.',
    requiredRole: 'approver',
    thresholdText: 'Within approved hedge budget (synthetic)',
    twoPerson: true,
  },
  {
    actionClass: 'Reallocate',
    description: 'Shift exposure away from affected sectors or routes.',
    requiredRole: 'executive',
    thresholdText: 'Above board-delegated threshold (synthetic)',
    twoPerson: true,
  },
  {
    actionClass: 'Operational handoff',
    description: 'Assign an approved action to an operations owner for manual follow-through.',
    requiredRole: 'operations_owner',
    thresholdText: 'Only after a recorded approval',
    twoPerson: false,
  },
];

/**
 * Assumption register for the hormuz-disruption engine. Every value is a labelled assumption with a range;
 * none is presented as sourced fact. Central bypass capacity follows the commonly cited EIA estimate of
 * unused pipeline capacity, recorded as an assumption until the primary source is captured.
 */
export const ASSUMPTIONS: {
  key: string;
  label: string;
  unit: string;
  low: string;
  central: string;
  high: string;
  rationale: string;
  ownerRole: Role;
  basisExternalId?: string;
}[] = [
  {
    key: 'bypass_capacity',
    label: 'Usable Hormuz bypass pipeline capacity',
    unit: 'million b/d',
    low: '1.5',
    central: '2.6',
    high: '3.5',
    rationale:
      'Unused capacity on pipelines that avoid the strait. Central value follows the commonly cited EIA estimate (secondary summary, unverified); the range reflects uncertain availability and contractual access.',
    ownerRole: 'domain_expert',
    basisExternalId: 'eia:todayinenergy:61002',
  },
  {
    key: 'bypass_ramp_days',
    label: 'Time for bypass routes to reach full use',
    unit: 'days',
    low: '3',
    central: '7',
    high: '14',
    rationale: 'Linear ramp-up while nominations, storage and loading schedules shift to bypass routes.',
    ownerRole: 'domain_expert',
  },
  {
    key: 'valuation_elasticity',
    label: 'Valuation sensitivity of route-dependent holdings',
    unit: 'ratio',
    low: '0.3',
    central: '0.5',
    high: '0.8',
    rationale:
      'Share of a disrupted-flow shock assumed to pass into holding valuations. Institutional assumption (synthetic).',
    ownerRole: 'analyst',
  },
  {
    key: 'war_risk_base_pct',
    label: 'Baseline war-risk premium',
    unit: '% of hull value per transit',
    low: '0.03',
    central: '0.05',
    high: '0.08',
    rationale: 'Pre-disruption premium for Gulf transits. Illustrative market range, not a quoted rate.',
    ownerRole: 'analyst',
  },
  {
    key: 'war_risk_multiplier',
    label: 'War-risk premium multiplier at full capacity loss',
    unit: '× base',
    low: '4',
    central: '8',
    high: '15',
    rationale: 'Premium rises in proportion to the share of transit capacity lost. Illustrative.',
    ownerRole: 'analyst',
  },
  {
    key: 'premium_half_life_days',
    label: 'Half-life of the premium spike after disruption ends',
    unit: 'days',
    low: '30',
    central: '60',
    high: '120',
    rationale: 'Underwriters keep elevated pricing for a period after transit resumes. Illustrative.',
    ownerRole: 'analyst',
  },
  {
    key: 'freight_sensitivity_pct',
    label: 'Tanker freight sensitivity to disrupted share',
    unit: '% rate change per 100% disrupted',
    low: '150',
    central: '300',
    high: '500',
    rationale:
      'Rate response to the share of flow disrupted. Illustrative range reflecting past corridor shocks.',
    ownerRole: 'analyst',
  },
  {
    key: 'fuel_cost_passthrough',
    label: 'Pass-through of oil price shock to utility fuel cost',
    unit: 'ratio',
    low: '0.3',
    central: '0.6',
    high: '0.9',
    rationale:
      'Share of a crude price rise reaching gas-fired generation fuel cost via oil-indexed contracts. Synthetic.',
    ownerRole: 'domain_expert',
  },
];
