/**
 * Phase 2 fixtures for the demonstration institution: intelligence graph, illustrative signals and
 * movement. Honesty rules as in demo.ts:
 * - Real places use approximate public coordinates (`approximate`); fictional assets use `illustrative`.
 * - Edges citing public reporting are `sourced` and link their evidence; geography-based links are
 *   `inferred`; analyst conditions are `assumed`; fictional portfolio links are `synthetic`.
 * - Every synthetic signal title starts with "Illustrative:" and comes from a synthetic source.
 */
import type {
  ClaimClass,
  ConfidenceBand,
  EntityType,
  RelationshipClass,
  SignalType,
  ValidationStatus,
} from '@tigeris/shared';

export interface EntityFixture {
  key: string;
  type: EntityType;
  name: string;
  description: string;
  lonLat?: [number, number];
  geoPrecision?: 'exact' | 'approximate' | 'illustrative';
  claimClass: ClaimClass;
}

export interface RelationshipFixture {
  subject: string;
  predicate: string;
  object: string;
  relClass: RelationshipClass;
  band: ConfidenceBand;
  rationale: string;
  evidence?: { ref: string; stance: 'supporting' | 'contradicting' | 'contextual' }[];
}

export interface SyntheticSignalFixture {
  key: string;
  title: string;
  summary: string;
  signalType: SignalType;
  domain: string;
  urgency: 'critical' | 'elevated' | 'routine';
  disposition: 'new' | 'monitoring' | 'corroborated';
  confidenceBand: ConfidenceBand;
  locationLabel: string;
  entityKey: string | null;
  hoursAgo: number;
  evidence: { title: string; summary: string; validationStatus: ValidationStatus; note: string };
}

export interface TrackFixture {
  key: string;
  kind: 'vessel' | 'truck';
  label: string;
  /** [lon, lat] waypoints; timing is spread across the replay window starting at `startSeconds`. */
  path: [number, number][];
  startSeconds: number;
  durationSeconds: number;
}

export const REPLAY_SECONDS = 3600;

export const ENTITIES: EntityFixture[] = [
  {
    key: 'evt-msc-aries-seizure',
    type: 'event',
    name: 'MSC Aries seizure',
    description:
      'Boarding and seizure of the container ship MSC Aries, 13 April 2024 (dated public reporting).',
    lonLat: [56.6, 26.0],
    geoPrecision: 'approximate',
    claimClass: 'sourced',
  },
  {
    key: 'vessel-msc-aries',
    type: 'vessel',
    name: 'MSC Aries',
    description: 'Portuguese-flagged container ship (per reporting).',
    claimClass: 'sourced',
  },
  {
    key: 'cp-hormuz',
    type: 'chokepoint',
    name: 'Strait of Hormuz',
    description: 'Maritime chokepoint between the Arabian Gulf and the Gulf of Oman.',
    lonLat: [56.35, 26.55],
    geoPrecision: 'approximate',
    claimClass: 'observed',
  },
  {
    key: 'com-oil-flow',
    type: 'commodity',
    name: 'Seaborne oil flow',
    description: 'Crude oil and petroleum products transiting the strait.',
    claimClass: 'sourced',
  },
  {
    key: 'com-lng',
    type: 'commodity',
    name: 'LNG trade',
    description: 'Liquefied natural gas cargoes transiting the strait.',
    claimClass: 'sourced',
  },
  {
    key: 'term-ras-tanura',
    type: 'terminal',
    name: 'Ras Tanura terminal',
    description: 'Crude export terminal on the Arabian Gulf coast.',
    lonLat: [50.16, 26.64],
    geoPrecision: 'approximate',
    claimClass: 'observed',
  },
  {
    key: 'term-ras-laffan',
    type: 'terminal',
    name: 'Ras Laffan LNG terminal',
    description: 'LNG export terminal on the Arabian Gulf coast.',
    lonLat: [51.55, 25.91],
    geoPrecision: 'approximate',
    claimClass: 'observed',
  },
  {
    key: 'port-jebel-ali',
    type: 'port',
    name: 'Jebel Ali port',
    description: 'Container port inside the Arabian Gulf.',
    lonLat: [55.03, 25.01],
    geoPrecision: 'approximate',
    claimClass: 'observed',
  },
  {
    key: 'port-fujairah',
    type: 'port',
    name: 'Fujairah port',
    description: 'Port on the Gulf of Oman coast, outside the strait.',
    lonLat: [56.36, 25.17],
    geoPrecision: 'approximate',
    claimClass: 'observed',
  },
  {
    key: 'port-sohar',
    type: 'port',
    name: 'Sohar port',
    description: 'Port on the Gulf of Oman coast, outside the strait.',
    lonLat: [56.74, 24.36],
    geoPrecision: 'approximate',
    claimClass: 'observed',
  },
  {
    key: 'pf-gsia',
    type: 'portfolio',
    name: 'GSIA (Demo) portfolio',
    description: 'Fictional demonstration portfolio.',
    claimClass: 'synthetic',
  },
  {
    key: 'hold-logistics',
    type: 'holding',
    name: 'Gulf container logistics (Demo)',
    description: 'Fictional logistics holding dependent on Gulf container ports.',
    claimClass: 'synthetic',
  },
  {
    key: 'hold-utility',
    type: 'holding',
    name: 'Coastal power utility (Demo)',
    description: 'Fictional utility running gas-fired generation.',
    lonLat: [55.6, 24.9],
    geoPrecision: 'illustrative',
    claimClass: 'synthetic',
  },
  {
    key: 'asset-desal',
    type: 'asset',
    name: 'Desalination plant A (Demo)',
    description: 'Fictional desalination plant co-located with the utility.',
    lonLat: [55.75, 25.2],
    geoPrecision: 'illustrative',
    claimClass: 'synthetic',
  },
  {
    key: 'svc-water',
    type: 'service',
    name: 'Municipal water supply (Demo)',
    description: 'Fictional downstream service dependent on desalination output.',
    claimClass: 'synthetic',
  },
];

export const RELATIONSHIPS: RelationshipFixture[] = [
  {
    subject: 'vessel-msc-aries',
    predicate: 'seized in',
    object: 'evt-msc-aries-seizure',
    relClass: 'sourced',
    band: 'moderate',
    rationale: 'Reported by trade press and the operator; crew count disputed.',
    evidence: [
      { ref: 'E-seizure', stance: 'supporting' },
      { ref: 'E-iran-statement', stance: 'contextual' },
      { ref: 'E-crew-iran', stance: 'contextual' },
    ],
  },
  {
    subject: 'evt-msc-aries-seizure',
    predicate: 'occurred near',
    object: 'cp-hormuz',
    relClass: 'sourced',
    band: 'moderate',
    rationale: 'Reporting places the boarding near the Strait of Hormuz.',
    evidence: [{ ref: 'E-seizure', stance: 'supporting' }],
  },
  {
    subject: 'cp-hormuz',
    predicate: 'carries',
    object: 'com-oil-flow',
    relClass: 'sourced',
    band: 'moderate',
    rationale: 'EIA reports ~20.9 million b/d in 2023 (via secondary summary; primary not yet captured).',
    evidence: [{ ref: 'E-eia-hormuz', stance: 'supporting' }],
  },
  {
    subject: 'cp-hormuz',
    predicate: 'carries',
    object: 'com-lng',
    relClass: 'sourced',
    band: 'moderate',
    rationale: 'EIA reports about one-fifth of global LNG trade transits the strait (via secondary summary).',
    evidence: [{ ref: 'E-eia-hormuz', stance: 'supporting' }],
  },
  {
    subject: 'term-ras-tanura',
    predicate: 'exports via',
    object: 'cp-hormuz',
    relClass: 'inferred',
    band: 'high',
    rationale: 'Geography: seaborne exports from this Gulf terminal must transit the strait.',
  },
  {
    subject: 'term-ras-laffan',
    predicate: 'exports via',
    object: 'cp-hormuz',
    relClass: 'inferred',
    band: 'high',
    rationale: 'Geography: LNG cargoes from this Gulf terminal must transit the strait.',
  },
  {
    subject: 'port-jebel-ali',
    predicate: 'ocean access via',
    object: 'cp-hormuz',
    relClass: 'inferred',
    band: 'high',
    rationale: 'Geography: deep-sea calls at this Gulf port transit the strait.',
  },
  {
    subject: 'port-fujairah',
    predicate: 'alternative to',
    object: 'port-jebel-ali',
    relClass: 'assumed',
    band: 'low',
    rationale:
      'Analyst assumption: Gulf of Oman ports could absorb some diverted calls. Capacity not assessed.',
  },
  {
    subject: 'port-sohar',
    predicate: 'alternative to',
    object: 'port-jebel-ali',
    relClass: 'assumed',
    band: 'low',
    rationale: 'Analyst assumption: diversion option outside the strait. Capacity not assessed.',
  },
  {
    subject: 'com-lng',
    predicate: 'fuels',
    object: 'hold-utility',
    relClass: 'assumed',
    band: 'low',
    rationale:
      'Assumes the demo utility depends on imported LNG; replace with operator data when authorised.',
    evidence: [{ ref: 'E-desal-dependency', stance: 'contextual' }],
  },
  {
    subject: 'hold-utility',
    predicate: 'powers',
    object: 'asset-desal',
    relClass: 'synthetic',
    band: 'moderate',
    rationale: 'Synthetic dependency register.',
    evidence: [{ ref: 'E-desal-dependency', stance: 'supporting' }],
  },
  {
    subject: 'asset-desal',
    predicate: 'supplies',
    object: 'svc-water',
    relClass: 'synthetic',
    band: 'moderate',
    rationale: 'Synthetic dependency register.',
    evidence: [{ ref: 'E-desal-dependency', stance: 'supporting' }],
  },
  {
    subject: 'pf-gsia',
    predicate: 'holds',
    object: 'hold-logistics',
    relClass: 'synthetic',
    band: 'high',
    rationale: 'Synthetic exposure register.',
    evidence: [{ ref: 'E-gsia-exposure', stance: 'supporting' }],
  },
  {
    subject: 'pf-gsia',
    predicate: 'holds',
    object: 'hold-utility',
    relClass: 'synthetic',
    band: 'high',
    rationale: 'Synthetic exposure register.',
    evidence: [{ ref: 'E-gsia-exposure', stance: 'supporting' }],
  },
  {
    subject: 'hold-logistics',
    predicate: 'depends on',
    object: 'port-jebel-ali',
    relClass: 'synthetic',
    band: 'moderate',
    rationale: 'Synthetic exposure register.',
    evidence: [{ ref: 'E-gsia-exposure', stance: 'supporting' }],
  },
  {
    subject: 'com-oil-flow',
    predicate: 'prices affect',
    object: 'pf-gsia',
    relClass: 'inferred',
    band: 'low',
    rationale: 'Energy and shipping holdings (synthetic share of NAV) are sensitive to oil-flow disruption.',
    evidence: [{ ref: 'E-gsia-exposure', stance: 'contextual' }],
  },
];

export const CASE_ENTITIES: {
  caseKey: string;
  entityKey: string;
  role: 'origin' | 'affected' | 'context';
}[] = [
  { caseKey: 'HMZ-2024-0413', entityKey: 'evt-msc-aries-seizure', role: 'origin' },
  { caseKey: 'HMZ-2024-0413', entityKey: 'pf-gsia', role: 'affected' },
  { caseKey: 'RES-EW-01', entityKey: 'com-lng', role: 'origin' },
  { caseKey: 'RES-EW-01', entityKey: 'svc-water', role: 'affected' },
  { caseKey: 'CAP-ALLOC-01', entityKey: 'pf-gsia', role: 'origin' },
];

/** Links the real seeded signal to its entity and evidence. */
export const REAL_SIGNAL_LINKS = {
  key: 'SIG-2024-0413-01',
  signalType: 'maritime' as SignalType,
  confidenceBand: 'moderate' as ConfidenceBand,
  locationLabel: 'Near the Strait of Hormuz',
  entityKey: 'evt-msc-aries-seizure',
  evidenceRefs: ['E-seizure', 'E-iran-statement'],
};

export const SYNTHETIC_SIGNALS: SyntheticSignalFixture[] = [
  {
    key: 'SIG-SYN-0003',
    title: 'Illustrative: elevated night-time activity at a Gulf container port',
    summary: 'Synthetic signal: vessel and truck activity above the illustrative baseline after dark.',
    signalType: 'supply_chain',
    domain: 'Logistics',
    urgency: 'elevated',
    disposition: 'new',
    confidenceBand: 'low',
    locationLabel: 'Arabian Gulf (illustrative)',
    entityKey: 'port-jebel-ali',
    hoursAgo: 7,
    evidence: {
      title: 'Illustrative port activity summary',
      summary: 'Generated activity counts for demonstration. Not real port data.',
      validationStatus: 'unverified',
      note: 'Synthetic record; single uncorroborated generator output.',
    },
  },
  {
    key: 'SIG-SYN-0004',
    title: 'Illustrative: truck convoy leaves a coastal industrial zone toward the port corridor',
    summary: 'Synthetic signal: unusual convoy size on an illustrative road corridor.',
    signalType: 'land',
    domain: 'Logistics',
    urgency: 'routine',
    disposition: 'new',
    confidenceBand: 'moderate',
    locationLabel: 'UAE road corridor (illustrative)',
    entityKey: null,
    hoursAgo: 20,
    evidence: {
      title: 'Illustrative convoy observation',
      summary: 'Generated truck movement record. Truck telemetry is never assumed public.',
      validationStatus: 'validated',
      note: 'Synthetic record; passed schema checks.',
    },
  },
  {
    key: 'SIG-SYN-0005',
    title: 'Illustrative: supplier shipment records show higher refined-product exports',
    summary: 'Synthetic signal: trade-record volumes above the illustrative seasonal range.',
    signalType: 'supply_chain',
    domain: 'Energy',
    urgency: 'routine',
    disposition: 'monitoring',
    confidenceBand: 'moderate',
    locationLabel: 'Gulf region (illustrative)',
    entityKey: 'com-oil-flow',
    hoursAgo: 48,
    evidence: {
      title: 'Illustrative trade-record extract',
      summary: 'Generated shipment volumes for demonstration.',
      validationStatus: 'validated',
      note: 'Synthetic record; passed schema checks.',
    },
  },
  {
    key: 'SIG-SYN-0006',
    title: 'Illustrative: utility reduces gas nomination for a co-located desalination plant',
    summary: 'Synthetic signal relevant to the energy–water resilience case.',
    signalType: 'energy',
    domain: 'Resilience',
    urgency: 'elevated',
    disposition: 'new',
    confidenceBand: 'low',
    locationLabel: 'UAE coast (illustrative)',
    entityKey: 'asset-desal',
    hoursAgo: 30,
    evidence: {
      title: 'Illustrative nomination notice',
      summary: 'Generated utility notice for demonstration. Not operator data.',
      validationStatus: 'unverified',
      note: 'Synthetic record; awaiting corroboration.',
    },
  },
  {
    key: 'SIG-SYN-0007',
    title: 'Illustrative: demo portfolio approaches a counterparty concentration threshold',
    summary: 'Synthetic institutional signal from the demonstration exposure register.',
    signalType: 'institutional',
    domain: 'Sovereign capital',
    urgency: 'routine',
    disposition: 'new',
    confidenceBand: 'moderate',
    locationLabel: 'GSIA (Demo)',
    entityKey: 'pf-gsia',
    hoursAgo: 54,
    evidence: {
      title: 'Illustrative concentration check',
      summary: 'Generated threshold check on synthetic holdings.',
      validationStatus: 'validated',
      note: 'Synthetic record; passed schema checks.',
    },
  },
];

const GULF_LANE: [number, number][] = [
  [50.45, 26.75],
  [51.6, 26.85],
  [52.9, 26.6],
  [54.1, 26.4],
  [55.2, 26.3],
  [55.95, 26.35],
  [56.35, 26.55],
  [56.62, 26.42],
  [56.82, 26.1],
  [56.88, 25.8],
  [57.4, 25.25],
  [58.3, 24.75],
  [59.2, 24.3],
];
const LAFFAN_SPUR: [number, number][] = [
  [51.75, 26.05],
  [52.4, 26.45],
  [53.4, 26.5],
];
const JEBEL_ALI_SPUR: [number, number][] = [
  [55.0, 25.1],
  [55.3, 25.6],
  [55.7, 26.15],
];

const outbound = (start: [number, number][], fromLaneIndex: number) => [
  ...start,
  ...GULF_LANE.slice(fromLaneIndex),
];

export const TRACKS: TrackFixture[] = [
  {
    key: 'v-01',
    kind: 'vessel',
    label: 'Illustrative tanker A',
    path: GULF_LANE,
    startSeconds: 0,
    durationSeconds: 3200,
  },
  {
    key: 'v-02',
    kind: 'vessel',
    label: 'Illustrative tanker B',
    path: [...GULF_LANE].reverse(),
    startSeconds: 300,
    durationSeconds: 3200,
  },
  {
    key: 'v-03',
    kind: 'vessel',
    label: 'Illustrative LNG carrier',
    path: outbound(LAFFAN_SPUR, 3),
    startSeconds: 150,
    durationSeconds: 3000,
  },
  {
    key: 'v-04',
    kind: 'vessel',
    label: 'Illustrative container ship',
    path: [...JEBEL_ALI_SPUR, ...GULF_LANE.slice(6)],
    startSeconds: 600,
    durationSeconds: 2600,
  },
  {
    key: 'v-05',
    kind: 'vessel',
    label: 'Illustrative container ship (inbound)',
    path: [...GULF_LANE.slice(6)].reverse().concat([...JEBEL_ALI_SPUR].reverse()),
    startSeconds: 900,
    durationSeconds: 2500,
  },
  {
    key: 't-01',
    kind: 'truck',
    label: 'Illustrative truck — Jebel Ali to Abu Dhabi',
    path: [
      [55.05, 24.98],
      [54.85, 24.75],
      [54.6, 24.45],
      [54.45, 24.35],
    ],
    startSeconds: 0,
    durationSeconds: 2400,
  },
  {
    key: 't-02',
    kind: 'truck',
    label: 'Illustrative truck — Dubai to Fujairah',
    path: [
      [55.35, 25.2],
      [55.75, 25.15],
      [56.05, 25.15],
      [56.33, 25.14],
    ],
    startSeconds: 500,
    durationSeconds: 2200,
  },
  {
    key: 't-03',
    kind: 'truck',
    label: 'Illustrative truck — Sohar inland',
    path: [
      [56.72, 24.36],
      [56.5, 24.2],
      [56.2, 24.0],
    ],
    startSeconds: 1000,
    durationSeconds: 1800,
  },
];

/** Timestamps each waypoint proportionally to distance along the path. */
export function timeTrack(t: TrackFixture): [number, number, number][] {
  const seg = t.path.slice(1).map((p, i) => Math.hypot(p[0] - t.path[i]![0], p[1] - t.path[i]![1]));
  const total = seg.reduce((a, b) => a + b, 0);
  let acc = 0;
  return t.path.map((p, i) => {
    if (i > 0) acc += seg[i - 1]!;
    return [p[0], p[1], Math.round(t.startSeconds + (acc / total) * t.durationSeconds)];
  });
}
