/**
 * Synthetic canonical records for the fictional demonstration institution (slice B). Every row is labelled
 * `record_mode = 'synthetic'` and comes from the synthetic exposure register source. These are not real holdings,
 * managers or values. Figures agree with the evidence the scenario engine cites: 11 route-dependent holdings
 * making up 18% of NAV.
 */
import type { Role, SectorKey } from '@tigeris/shared';

export const CANONICAL_SOURCE_REF = 'gsia-exposure-register';
export const MAPPING_VERSION = 'gsia-synthetic.v1';
/** Synthetic net asset value, USD millions. */
export const SYNTHETIC_NAV_USD_M = 100_000;
export const AS_OF = '2026-09-30';

export interface PositionFixture {
  key: string;
  name: string;
  assetClass: string;
  sectorKey: SectorKey;
  country: string;
  navSharePct: number;
  routeDependent: boolean;
  holdingEntityKey?: string;
}

/** Route-dependent shares sum to 18.0% of NAV; the rest is a partial, illustrative slice of the book. */
export const POSITIONS: PositionFixture[] = [
  {
    key: 'POS-001',
    name: 'Gulf crude export terminal stake (Demo)',
    assetClass: 'Infrastructure equity',
    sectorKey: 'energy',
    country: 'AE',
    navSharePct: 3.1,
    routeDependent: true,
  },
  {
    key: 'POS-002',
    name: 'LNG carrier fleet partnership (Demo)',
    assetClass: 'Private equity',
    sectorKey: 'energy',
    country: 'QA',
    navSharePct: 2.4,
    routeDependent: true,
  },
  {
    key: 'POS-003',
    name: 'Gulf container logistics (Demo)',
    assetClass: 'Private equity',
    sectorKey: 'supply_chain',
    country: 'AE',
    navSharePct: 2.0,
    routeDependent: true,
    holdingEntityKey: 'hold-logistics',
  },
  {
    key: 'POS-004',
    name: 'Refined products trading house (Demo)',
    assetClass: 'Listed equity',
    sectorKey: 'energy',
    country: 'SG',
    navSharePct: 1.8,
    routeDependent: true,
  },
  {
    key: 'POS-005',
    name: 'Coastal power utility (Demo)',
    assetClass: 'Infrastructure equity',
    sectorKey: 'utilities',
    country: 'AE',
    navSharePct: 1.6,
    routeDependent: true,
    holdingEntityKey: 'hold-utility',
  },
  {
    key: 'POS-006',
    name: 'Petrochemicals complex (Demo)',
    assetClass: 'Listed equity',
    sectorKey: 'manufacturing',
    country: 'SA',
    navSharePct: 1.5,
    routeDependent: true,
  },
  {
    key: 'POS-007',
    name: 'Tanker chartering company (Demo)',
    assetClass: 'Listed equity',
    sectorKey: 'energy',
    country: 'GR',
    navSharePct: 1.4,
    routeDependent: true,
  },
  {
    key: 'POS-008',
    name: 'Marine insurance syndicate share (Demo)',
    assetClass: 'Private credit',
    sectorKey: 'insurance',
    country: 'GB',
    navSharePct: 1.3,
    routeDependent: true,
  },
  {
    key: 'POS-009',
    name: 'Port free-zone real estate (Demo)',
    assetClass: 'Real estate',
    sectorKey: 'real_estate',
    country: 'AE',
    navSharePct: 1.1,
    routeDependent: true,
  },
  {
    key: 'POS-010',
    name: 'Trade-finance lending book (Demo)',
    assetClass: 'Private credit',
    sectorKey: 'banking',
    country: 'BH',
    navSharePct: 1.0,
    routeDependent: true,
  },
  {
    key: 'POS-011',
    name: 'Desalination concession (Demo)',
    assetClass: 'Infrastructure equity',
    sectorKey: 'utilities',
    country: 'OM',
    navSharePct: 0.8,
    routeDependent: true,
  },
  {
    key: 'POS-012',
    name: 'Global developed-market equity sleeve (Demo)',
    assetClass: 'Listed equity',
    sectorKey: 'capital',
    country: 'US',
    navSharePct: 6.0,
    routeDependent: false,
  },
  {
    key: 'POS-013',
    name: 'Sovereign bond portfolio (Demo)',
    assetClass: 'Fixed income',
    sectorKey: 'capital',
    country: 'US',
    navSharePct: 5.0,
    routeDependent: false,
  },
  {
    key: 'POS-014',
    name: 'Domestic logistics parks (Demo)',
    assetClass: 'Real estate',
    sectorKey: 'real_estate',
    country: 'SA',
    navSharePct: 4.5,
    routeDependent: false,
  },
  {
    key: 'POS-015',
    name: 'Renewable generation platform (Demo)',
    assetClass: 'Infrastructure equity',
    sectorKey: 'utilities',
    country: 'MA',
    navSharePct: 3.5,
    routeDependent: false,
  },
  {
    key: 'POS-016',
    name: 'Digital payments investment (Demo)',
    assetClass: 'Venture',
    sectorKey: 'banking',
    country: 'IN',
    navSharePct: 3.0,
    routeDependent: false,
  },
];

export interface ManagerFixture {
  key: string;
  name: string;
  strategy: string;
  domicile: string;
  sectorKey: SectorKey;
  dd: {
    key: string;
    reviewType: string;
    status: 'not_started' | 'in_progress' | 'completed' | 'escalated';
    openIssues: number;
    summary: string;
    reviewedOn: string | null;
  };
}

export const MANAGERS: ManagerFixture[] = [
  {
    key: 'MGR-01',
    name: 'Meridian Infrastructure Partners (Demo)',
    strategy: 'Energy and logistics infrastructure',
    domicile: 'LU',
    sectorKey: 'energy',
    dd: {
      key: 'DD-01',
      reviewType: 'Operational due diligence',
      status: 'completed',
      openIssues: 0,
      summary: 'Annual review completed; no open issues (synthetic).',
      reviewedOn: '2026-06-15',
    },
  },
  {
    key: 'MGR-02',
    name: 'Tidewater Shipping Credit (Demo)',
    strategy: 'Maritime private credit',
    domicile: 'IE',
    sectorKey: 'supply_chain',
    dd: {
      key: 'DD-02',
      reviewType: 'Risk due diligence',
      status: 'escalated',
      openIssues: 2,
      summary: 'Concentration in Gulf charter receivables flagged for follow-up (synthetic).',
      reviewedOn: '2026-08-02',
    },
  },
  {
    key: 'MGR-03',
    name: 'Dunes Real Estate Fund (Demo)',
    strategy: 'GCC logistics real estate',
    domicile: 'AE',
    sectorKey: 'real_estate',
    dd: {
      key: 'DD-03',
      reviewType: 'Investment due diligence',
      status: 'in_progress',
      openIssues: 1,
      summary: 'Valuation policy questionnaire outstanding (synthetic).',
      reviewedOn: null,
    },
  },
  {
    key: 'MGR-04',
    name: 'Oasis Global Equity (Demo)',
    strategy: 'Global developed-market equity',
    domicile: 'GB',
    sectorKey: 'capital',
    dd: {
      key: 'DD-04',
      reviewType: 'Operational due diligence',
      status: 'not_started',
      openIssues: 0,
      summary: 'Scheduled for next cycle (synthetic).',
      reviewedOn: null,
    },
  },
];

export interface LimitFixture {
  actionClass: string;
  role: Role;
  limitValue: number;
  limitUnit: string;
  basis: string;
}

/** Synthetic delegated limits (D-52). An action class with no row for a role has no numeric limit for it. */
export const AUTHORITY_LIMITS: LimitFixture[] = [
  {
    actionClass: 'Defer commitment',
    role: 'approver',
    limitValue: 90,
    limitUnit: 'days',
    basis: 'synthetic delegation DL-01',
  },
  {
    actionClass: 'Defer commitment',
    role: 'executive',
    limitValue: 180,
    limitUnit: 'days',
    basis: 'synthetic delegation DL-02',
  },
  {
    actionClass: 'Hedge exposure',
    role: 'approver',
    limitValue: 20,
    limitUnit: '% of NAV',
    basis: 'synthetic delegation DL-03',
  },
  {
    actionClass: 'Hedge exposure',
    role: 'executive',
    limitValue: 40,
    limitUnit: '% of NAV',
    basis: 'synthetic delegation DL-04',
  },
  {
    actionClass: 'Reallocate',
    role: 'executive',
    limitValue: 10,
    limitUnit: '% of NAV',
    basis: 'synthetic delegation DL-05; above it the board decides outside TIGERIS',
  },
];

/** Sector workspace of each seeded case. Cases opened later inherit their signal's workspace. */
export const CASE_SECTORS: Record<string, SectorKey> = {
  'HMZ-2024-0413': 'energy',
  'RES-EW-01': 'utilities',
  'CAP-ALLOC-01': 'capital',
  'CAP-HEDGE-02': 'capital',
};
