/**
 * Assumptions for the oil-price-shock template (Phase 5F, D-120). Sensitivities are synthetic, chosen to be
 * plausible in sign and order of magnitude for the demonstration only; they are not estimates for any real
 * portfolio. Each is a register entry like any other: versioned, owned and open to the learning loop.
 */
import type { Role } from '@tigeris/shared';

export const OIL_ASSUMPTIONS: {
  key: string;
  label: string;
  unit: string;
  low: string;
  central: string;
  high: string;
  rationale: string;
  ownerRole: Role;
}[] = [
  {
    key: 'oil_beta_energy',
    label: 'Energy holdings: value change per 1% oil move',
    unit: '% per %',
    low: '0.35',
    central: '0.55',
    high: '0.75',
    rationale:
      'Producers and energy infrastructure gain with oil prices. Synthetic sensitivity for the demonstration.',
    ownerRole: 'domain_expert',
  },
  {
    key: 'oil_beta_utilities',
    label: 'Utility holdings: value change per 1% oil move',
    unit: '% per %',
    low: '-0.15',
    central: '-0.05',
    high: '0.05',
    rationale:
      'Fuel costs are partly passed through under regulated tariffs, so the effect is small and may go either way. Synthetic.',
    ownerRole: 'domain_expert',
  },
  {
    key: 'oil_beta_supply_chain',
    label: 'Shipping and logistics holdings: value change per 1% oil move',
    unit: '% per %',
    low: '-0.3',
    central: '-0.15',
    high: '-0.05',
    rationale:
      'Bunker fuel is a large share of operating cost; surcharges recover part of it with a lag. Synthetic.',
    ownerRole: 'domain_expert',
  },
  {
    key: 'oil_beta_manufacturing',
    label: 'Manufacturing holdings: value change per 1% oil move',
    unit: '% per %',
    low: '-0.25',
    central: '-0.12',
    high: '-0.03',
    rationale: 'Energy and feedstock costs rise with oil; pricing power varies by industry. Synthetic.',
    ownerRole: 'domain_expert',
  },
  {
    key: 'oil_beta_other',
    label: 'Other holdings: value change per 1% oil move',
    unit: '% per %',
    low: '-0.08',
    central: '-0.03',
    high: '0',
    rationale:
      'A broad, mildly negative effect through inflation and rates for diversified holdings. Synthetic.',
    ownerRole: 'domain_expert',
  },
  {
    key: 'oil_credit_damping',
    label: 'Credit and fixed income: share of the equity effect',
    unit: 'ratio',
    low: '0.2',
    central: '0.3',
    high: '0.5',
    rationale: 'Senior claims move less than equity in the same company. Synthetic.',
    ownerRole: 'domain_expert',
  },
  {
    key: 'oil_adjustment_months',
    label: 'Months for valuations to reflect an oil move fully',
    unit: 'months',
    low: '3',
    central: '6',
    high: '12',
    rationale: 'Listed prices react within days; private marks follow quarterly reviews. Synthetic.',
    ownerRole: 'domain_expert',
  },
];
