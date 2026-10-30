/**
 * Codified rules for the synthetic mandate register (Phase 5A, D-115). The thresholds are the mandate limits already
 * in `mandates.ts`; codifying them names the measure each one judges, its operator and when it raises attention.
 * Synthetic, owner-approved for the demonstration only.
 */
export const SEMANTIC_BASIS =
  'Codified from the synthetic mandate register; owner-approved for the demonstration (D-115)';

export const SEMANTIC_RULES = [
  {
    key: 'M-RISK-02',
    label: 'Route-concentration limit',
    subject: 'situation:route_dependent_holdings',
    operator: '<=',
    threshold: '15',
    unit: 'holdings',
    severity: 'breach',
    attentionMargin: '0.1',
    mandateKey: 'M-RISK-02',
    rationale:
      'No more than 15 holdings may depend on one maritime chokepoint; attention within 10% of the limit.',
  },
  {
    key: 'M-RISK-03',
    label: 'Energy and shipping concentration',
    subject: 'situation:exposed_nav_share_pct',
    operator: '<=',
    threshold: '20',
    unit: '% of NAV',
    severity: 'breach',
    attentionMargin: '0.1',
    mandateKey: 'M-RISK-03',
    rationale:
      'Combined energy and shipping exposure is capped at 20% of NAV; attention within 10% of the cap.',
  },
  {
    key: 'M-RES-04',
    label: 'Critical-service fuel buffer',
    subject: 'situation:fuel_buffer_days',
    operator: '>=',
    threshold: '7',
    unit: 'days',
    severity: 'breach',
    attentionMargin: '0.15',
    mandateKey: 'M-RES-04',
    rationale: 'Essential plants keep at least 7 days of fuel; attention within 15% of the minimum.',
  },
  {
    key: 'UTIL-FUEL-01',
    label: 'Lowest plant fuel buffer',
    subject: 'sector:utility_assets:min_fuel_buffer',
    operator: '>=',
    threshold: '7',
    unit: 'days',
    severity: 'breach',
    attentionMargin: '0.15',
    mandateKey: 'M-RES-04',
    rationale: 'Every essential utility asset in the workspace keeps the mandate minimum of 7 days of fuel.',
  },
  {
    key: 'CPTY-LIMIT-01',
    label: 'Counterparties over limit',
    subject: 'sector:counterparty_exposures:over_limit',
    operator: '<=',
    threshold: '0',
    unit: 'counterparties',
    severity: 'breach',
    attentionMargin: '0',
    mandateKey: null,
    rationale: 'No counterparty may exceed its approved exposure limit.',
  },
] as const;

export const SEMANTIC_DEFINITIONS = [
  {
    key: 'term:route_dependent_holding',
    kind: 'term',
    label: 'Route-dependent holding',
    description:
      'A holding whose revenue or valuation depends on cargo transiting a single maritime chokepoint, as recorded in the positions register.',
    unit: '',
    formula: null,
    ownerRole: 'domain_expert',
    sourceRef: 'Positions register field route_dependent',
    jurisdiction: null,
  },
] as const;
