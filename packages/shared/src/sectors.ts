/**
 * Sector registry: the eight domain packs that extend the shared graph and workflows (Foundation §4).
 * A sector is a configuration of the one OS — not a separate product or dashboard.
 *
 * KPI values never live here. A KPI either binds to an evidence fact (so it keeps full lineage) or
 * renders as "Source not connected".
 */

export const SECTOR_KEYS = [
  'energy',
  'utilities',
  'capital',
  'supply_chain',
  'banking',
  'manufacturing',
  'real_estate',
  'insurance',
] as const;
export type SectorKey = (typeof SECTOR_KEYS)[number];

export interface SectorKpiDef {
  key: string;
  label: string;
  /** Binds to an evidence fact by its evidence external id and predicate. Absent = not connected. */
  binding?: { externalId: string; predicate: string };
}

export interface SectorAgentDef {
  key: string;
  name: string;
  description: string;
}

export interface SectorScenarioDef {
  key: string;
  title: string;
  description: string;
  /** Engine template that models this scenario. Absent = not yet modelled; the launch stays disabled. */
  modelTemplate?: 'hormuz-disruption';
}

export interface SectorDef {
  key: SectorKey;
  label: string;
  title: string;
  tagline: string;
  /** Case and signal `domain` values that belong to this sector. */
  domains: string[];
  /** Graph entity keys shown on the sector map. */
  entityKeys: string[];
  intelligenceAreas: { title: string; description: string }[];
  kpis: SectorKpiDef[];
  agents: SectorAgentDef[];
  scenarios: SectorScenarioDef[];
  /** Demonstration depth: 'demo' sectors carry seeded cases and evidence; 'shell' sectors are honest empty states. */
  depth: 'demo' | 'shell';
}

export const SECTORS: SectorDef[] = [
  {
    key: 'energy',
    label: 'Energy & Maritime',
    title: 'Energy & Maritime Command Centre',
    tagline: 'Chokepoints, cargoes and energy assets — traced to institutional exposure.',
    domains: ['Energy & maritime', 'Energy'],
    entityKeys: [
      'evt-msc-aries-seizure',
      'cp-hormuz',
      'term-ras-tanura',
      'term-ras-laffan',
      'port-jebel-ali',
      'port-fujairah',
      'port-sohar',
    ],
    intelligenceAreas: [
      {
        title: 'Chokepoint disruption',
        description: 'Transit restrictions and incidents at Hormuz and adjacent corridors.',
      },
      { title: 'Export terminals', description: 'Crude and LNG terminal dependencies on the strait.' },
      { title: 'Vessel & cargo signals', description: 'Reported seizures, boardings and diversions.' },
      { title: 'Bypass routes', description: 'Pipeline and Gulf of Oman port alternatives.' },
      { title: 'Price transmission', description: 'How flow disruption reaches oil and freight prices.' },
    ],
    kpis: [
      {
        key: 'hormuz-oil-flow',
        label: 'Hormuz oil flow (2023 avg.)',
        binding: { externalId: 'eia:todayinenergy:61002', predicate: 'Average oil flow, 2023' },
      },
      {
        key: 'hormuz-share',
        label: 'Share of global liquids consumption',
        binding: {
          externalId: 'eia:todayinenergy:61002',
          predicate: 'Share of global petroleum liquids consumption, 2023',
        },
      },
      { key: 'tanker-transits', label: 'Tanker transits (live)' },
      { key: 'terminal-throughput', label: 'Terminal throughput' },
    ],
    agents: [
      {
        key: 'maritime-signal-triage',
        name: 'Maritime Signal Analyst',
        description: 'Triages vessel, incident and corridor signals against source rules.',
      },
      {
        key: 'energy-impact',
        name: 'Energy Impact Analyst',
        description: 'Traces disruption from chokepoints to terminals, commodities and exposure.',
      },
      {
        key: 'route-alternatives',
        name: 'Route Alternatives Analyst',
        description: 'Compares bypass routes and port alternatives under assumptions.',
      },
    ],
    scenarios: [
      {
        modelTemplate: 'hormuz-disruption',
        key: 'hormuz-disruption',
        title: 'Hormuz disruption',
        description: 'Duration, transit capacity lost, bypass capacity and oil-price shock.',
      },
      {
        key: 'terminal-outage',
        title: 'Export terminal outage',
        description: 'Loss of a Gulf export terminal for a defined period.',
      },
    ],
    depth: 'demo',
  },
  {
    key: 'utilities',
    label: 'Infrastructure & Utilities',
    title: 'Infrastructure & Utilities Command Centre',
    tagline: 'Resilient infrastructure. Reliable services. Dependencies made visible.',
    domains: ['Resilience', 'Infrastructure & utilities'],
    entityKeys: ['hold-utility', 'asset-desal', 'port-jebel-ali', 'term-ras-laffan', 'cp-hormuz'],
    intelligenceAreas: [
      { title: 'Energy–water dependency', description: 'Fuel and LNG supply to power and desalination.' },
      { title: 'Service continuity', description: 'Buffers, outage windows and recovery options.' },
      { title: 'Network dependencies', description: 'Shared upstream inputs across critical services.' },
      { title: 'Capacity planning', description: 'Headroom and planned additions under stress.' },
    ],
    kpis: [
      {
        key: 'desal-gas-dependent',
        label: 'Desalination plants on gas-fired power',
        binding: {
          externalId: 'gsia-demo:dependency:energy-water:v1',
          predicate: 'Desalination plants dependent on gas-fired power',
        },
      },
      {
        key: 'fuel-buffer',
        label: 'Fuel buffer before output reduction',
        binding: {
          externalId: 'gsia-demo:dependency:energy-water:v1',
          predicate: 'Fuel buffer before output reduction',
        },
      },
      { key: 'grid-margin', label: 'Grid reserve margin' },
      { key: 'water-storage', label: 'Water storage days' },
    ],
    agents: [
      {
        key: 'network-modelling',
        name: 'Network Modelling Specialist',
        description: 'Maps interdependencies across power, water and fuel.',
      },
      {
        key: 'outage-risk',
        name: 'Outage Risk Analyst',
        description: 'Detects emerging service-disruption risk from upstream signals.',
      },
      {
        key: 'capacity-planning',
        name: 'Capacity Planning Specialist',
        description: 'Assesses buffers and capacity pathways.',
      },
    ],
    scenarios: [
      {
        modelTemplate: 'hormuz-disruption',
        key: 'fuel-supply-shortfall',
        title: 'Fuel supply shortfall',
        description: 'Reduced LNG deliveries to gas-fired generation.',
      },
      {
        key: 'demand-surge',
        title: 'Demand surge',
        description: 'Summer peak demand against reduced supply.',
      },
    ],
    depth: 'demo',
  },
  {
    key: 'capital',
    label: 'Sovereign Capital',
    title: 'Sovereign Capital Command Centre',
    tagline: 'Mandates, exposures and allocation options under governed authority.',
    domains: ['Sovereign capital'],
    entityKeys: ['port-jebel-ali', 'cp-hormuz', 'hold-utility'],
    intelligenceAreas: [
      { title: 'Route-dependent holdings', description: 'Holdings whose value depends on Hormuz transit.' },
      { title: 'Concentration', description: 'Counterparty and sector concentration against limits.' },
      { title: 'Allocation options', description: 'Hold, defer, hedge or reallocate under scenarios.' },
      { title: 'Mandate alignment', description: 'Options checked against mandates and authority.' },
    ],
    kpis: [
      {
        key: 'route-dependent-holdings',
        label: 'Holdings with Hormuz route dependency',
        binding: {
          externalId: 'gsia-demo:exposure-register:v1',
          predicate: 'Holdings with Hormuz route dependency',
        },
      },
      {
        key: 'energy-shipping-nav',
        label: 'Energy & shipping share of NAV',
        binding: {
          externalId: 'gsia-demo:exposure-register:v1',
          predicate: 'Energy and shipping share of net asset value',
        },
      },
      { key: 'liquidity-buffer', label: 'Liquidity buffer' },
      { key: 'hedge-coverage', label: 'Hedge coverage' },
    ],
    agents: [
      {
        key: 'exposure-analyst',
        name: 'Exposure Analyst',
        description: 'Links events to holdings through the institutional graph.',
      },
      {
        key: 'allocation-options',
        name: 'Allocation Options Analyst',
        description: 'Drafts hold / defer / hedge / reallocate options with evidence.',
      },
      {
        key: 'mandate-check',
        name: 'Mandate Alignment Checker',
        description: 'Checks options against mandates and authority rules.',
      },
    ],
    scenarios: [
      {
        modelTemplate: 'hormuz-disruption',
        key: 'route-shock-portfolio',
        title: 'Route shock on portfolio',
        description: 'Portfolio exposure under a Hormuz disruption.',
      },
      {
        key: 'oil-price-shock',
        title: 'Oil price shock',
        description: 'Energy holdings under an assumed Brent move.',
      },
    ],
    depth: 'demo',
  },
  {
    key: 'supply_chain',
    label: 'Supply Chain & Logistics',
    title: 'Supply Chain & Logistics Command Centre',
    tagline: 'End-to-end visibility. Resilient networks. Secure supply chains.',
    domains: ['Logistics', 'Supply chain & logistics'],
    entityKeys: ['port-jebel-ali', 'port-fujairah', 'port-sohar', 'cp-hormuz', 'hold-logistics'],
    intelligenceAreas: [
      { title: 'Port congestion', description: 'Congestion risk and downstream delivery impact.' },
      { title: 'Route resilience', description: 'Alternative sea and land routes for critical corridors.' },
      { title: 'Warehouse positioning', description: 'Hub locations for resilience and service levels.' },
      { title: 'Critical goods flow', description: 'Strategic and essential goods dependencies.' },
    ],
    kpis: [
      { key: 'shipments', label: 'Total shipments' },
      { key: 'on-time', label: 'On-time delivery' },
      { key: 'active-routes', label: 'Active routes' },
      { key: 'warehouse-capacity', label: 'Warehouse capacity usage' },
    ],
    agents: [
      {
        key: 'supply-chain-analyst',
        name: 'Supply Chain Analyst',
        description: 'Monitors supply chain developments and emerging risks.',
      },
      {
        key: 'logistics-optimiser',
        name: 'Logistics Optimiser',
        description: 'Analyses routing and distribution options.',
      },
      {
        key: 'port-operations',
        name: 'Port Operations Analyst',
        description: 'Assesses port operations, congestion and turnaround.',
      },
    ],
    scenarios: [
      {
        key: 'port-disruption',
        title: 'Port disruption',
        description: 'Test impact of port disruption and alternative routes.',
      },
      {
        key: 'route-diversion',
        title: 'Route diversion',
        description: 'Land and sea alternatives under disruption.',
      },
    ],
    depth: 'demo',
  },
  {
    key: 'banking',
    label: 'Banking & Financial Services',
    title: 'Banking & Financial Services Command Centre',
    tagline: 'Exposure and governance scenarios across the financial system.',
    domains: ['Banking & financial services'],
    entityKeys: [],
    intelligenceAreas: [
      { title: 'Counterparty exposure', description: 'Concentrations and contagion paths.' },
      { title: 'Liquidity conditions', description: 'Funding and liquidity under stress.' },
      { title: 'Regulatory signals', description: 'Policy and supervisory developments.' },
    ],
    kpis: [
      { key: 'counterparty-exposure', label: 'Counterparty exposure' },
      { key: 'liquidity-coverage', label: 'Liquidity coverage' },
      { key: 'credit-quality', label: 'Credit quality' },
    ],
    agents: [
      {
        key: 'counterparty-analyst',
        name: 'Counterparty Risk Analyst',
        description: 'Tracks counterparty concentrations and contagion paths.',
      },
      {
        key: 'liquidity-analyst',
        name: 'Liquidity Analyst',
        description: 'Assesses funding conditions under stress.',
      },
    ],
    scenarios: [
      {
        key: 'funding-stress',
        title: 'Funding stress',
        description: 'Liquidity under a regional funding shock.',
      },
    ],
    depth: 'shell',
  },
  {
    key: 'manufacturing',
    label: 'Manufacturing & Industrials',
    title: 'Manufacturing Command Centre',
    tagline: 'Production resilience, supply security and industrial competitiveness.',
    domains: ['Manufacturing & industrials'],
    entityKeys: [],
    intelligenceAreas: [
      { title: 'Production capacity', description: 'Capacity, utilisation and expansion options.' },
      { title: 'Critical materials', description: 'Key inputs and supply risk exposure.' },
      { title: 'Supplier concentration', description: 'Dependency risks across supplier tiers.' },
      { title: 'Inventory resilience', description: 'Buffer levels and stock-out risk.' },
      { title: 'Equipment reliability', description: 'Downtime risk and maintenance needs.' },
    ],
    kpis: [
      { key: 'production-capacity', label: 'Production capacity' },
      { key: 'critical-materials', label: 'Critical materials' },
      { key: 'supplier-concentration', label: 'Supplier concentration' },
      { key: 'inventory-buffers', label: 'Inventory buffers' },
    ],
    agents: [
      {
        key: 'industrial-operations',
        name: 'Industrial Operations Analyst',
        description: 'Monitors production, capacity and equipment performance.',
      },
      {
        key: 'materials-intelligence',
        name: 'Materials Intelligence Analyst',
        description: 'Tracks critical materials and alternative supply.',
      },
    ],
    scenarios: [
      {
        key: 'supply-disruption',
        title: 'Supply disruption',
        description: 'Impact of material supply shocks.',
      },
      { key: 'energy-price-shock', title: 'Energy price shock', description: 'Cost and operating impact.' },
    ],
    depth: 'shell',
  },
  {
    key: 'real_estate',
    label: 'Real Estate & Construction',
    title: 'Real Estate & Construction Command Centre',
    tagline: 'Unified intelligence for planning, delivery and sustainable urban growth.',
    domains: ['Real estate & construction'],
    entityKeys: [],
    intelligenceAreas: [
      { title: 'Delivery risk', description: 'Early indicators of delay across key projects.' },
      { title: 'Construction cost', description: 'Cost drivers and market conditions.' },
      { title: 'Land and zoning', description: 'Land allocation scenarios.' },
    ],
    kpis: [
      { key: 'total-projects', label: 'Total projects' },
      { key: 'projects-in-delivery', label: 'Projects in delivery' },
      { key: 'financing-exposure', label: 'Financing exposure' },
      { key: 'delivery-risk', label: 'Delivery risk (weighted)' },
    ],
    agents: [
      {
        key: 'construction-monitor',
        name: 'Construction Monitor',
        description: 'Tracks project delivery, contractors and site progress.',
      },
      {
        key: 'cost-intelligence',
        name: 'Cost Intelligence Specialist',
        description: 'Monitors construction costs and supply risks.',
      },
    ],
    scenarios: [
      {
        key: 'urban-growth',
        title: 'Urban growth',
        description: 'Demand, infrastructure and delivery phasing.',
      },
      {
        key: 'construction-cost',
        title: 'Construction cost',
        description: 'Cost change impacts on delivery timelines.',
      },
    ],
    depth: 'shell',
  },
  {
    key: 'insurance',
    label: 'Insurance',
    title: 'Insurance Command Centre',
    tagline: 'Event exposure, concentration and scenario analysis.',
    domains: ['Insurance'],
    entityKeys: [],
    intelligenceAreas: [
      { title: 'Event exposure', description: 'Insured exposure to defined events.' },
      { title: 'Accumulation', description: 'Concentration by geography and peril.' },
    ],
    kpis: [
      { key: 'insured-exposure', label: 'Insured exposure' },
      { key: 'accumulation', label: 'Accumulation by zone' },
      { key: 'war-risk-premium', label: 'Marine war-risk premium' },
    ],
    agents: [
      {
        key: 'exposure-accumulation',
        name: 'Accumulation Analyst',
        description: 'Assesses concentration by geography and peril.',
      },
    ],
    scenarios: [
      {
        key: 'marine-war-risk',
        title: 'Marine war-risk event',
        description: 'Premium and claims under a corridor incident.',
      },
    ],
    depth: 'shell',
  },
];

export const SECTOR_BY_KEY = Object.fromEntries(SECTORS.map((s) => [s.key, s])) as Record<
  SectorKey,
  SectorDef
>;

export function sectorForDomain(domain: string): SectorKey | null {
  return SECTORS.find((s) => s.domains.some((d) => d.toLowerCase() === domain.toLowerCase()))?.key ?? null;
}
