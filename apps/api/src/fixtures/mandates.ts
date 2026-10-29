/** Synthetic mandate register and authority matrix for the fictional demonstration institution. */
import type { Role } from '@tigeris/shared';

export const MANDATES: {
  key: string;
  title: string;
  description: string;
  category: string;
  limitText: string;
  ownerRole: Role;
}[] = [
  {
    key: 'M-STRAT-01',
    title: 'Long-term national diversification',
    description: 'Grow non-hydrocarbon exposure while preserving capital across cycles.',
    category: 'Strategic mandate',
    limitText: 'Target band set annually by the board (synthetic)',
    ownerRole: 'executive',
  },
  {
    key: 'M-RISK-02',
    title: 'Route-concentration limit',
    description: 'Limit holdings whose value depends on a single maritime chokepoint.',
    category: 'Risk limit',
    limitText: 'No more than 15 holdings dependent on one chokepoint (synthetic)',
    ownerRole: 'approver',
  },
  {
    key: 'M-RISK-03',
    title: 'Energy and shipping concentration',
    description: 'Cap combined energy and shipping exposure as a share of net asset value.',
    category: 'Risk limit',
    limitText: 'Up to 20% of NAV (synthetic)',
    ownerRole: 'approver',
  },
  {
    key: 'M-RES-04',
    title: 'Critical-service continuity',
    description: 'Protect utility holdings that supply essential power and water services.',
    category: 'Resilience mandate',
    limitText: 'Minimum 7 days of fuel buffer at essential plants (synthetic)',
    ownerRole: 'domain_expert',
  },
  {
    key: 'M-GOV-05',
    title: 'Evidence standard for decisions',
    description: 'Decisions rely only on validated or explicitly labelled evidence with lineage.',
    category: 'Governance',
    limitText: 'Unverified or disputed evidence cannot be the sole basis of a decision',
    ownerRole: 'administrator',
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
