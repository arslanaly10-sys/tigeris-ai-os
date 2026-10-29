/**
 * Demonstration fixtures.
 *
 * Honesty rules for this file (CLAUDE.md §2–4, §9):
 * - The institution, its people, portfolio and exposures are fictional and SYNTHETIC.
 * - Public facts paraphrase dated reporting with the real URL. They stay `unverified` (or `disputed`)
 *   until a snapshot is captured with a hash and the client's acceptance owner reviews them.
 * - No direct quotes are invented; summaries are paraphrases. No sha256 is set for uncaptured snapshots.
 */
import type {
  CaseState,
  ClaimClass,
  ConfidenceBasis,
  DataMode,
  Role,
  Sensitivity,
  SourceClass,
  Urgency,
  ValidationStatus,
} from '@tigeris/shared';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Time at which the reporting below was reviewed for this build. */
const REVIEWED_AT = '2026-10-29T09:00:00Z';

export interface PrincipalFixture {
  ref: string;
  displayName: string;
  title: string;
  roles: Role[];
}

export interface SourceFixture {
  ref: string;
  publisher: string;
  title: string;
  sourceClass: SourceClass;
  url: string | null;
  termsRef: string | null;
  allowedPurpose: string;
  cadence: string | null;
  freshnessLimitHours: number | null;
  approvalStatus: 'approved' | 'pending' | 'suspended';
}

export interface FactFixture {
  subject: string;
  predicate: string;
  valueNum?: number;
  valueText?: string;
  unit?: string;
  claimClass: ClaimClass;
  validFrom?: string;
  transformation?: string;
}

export interface EvidenceFixture {
  ref: string;
  sourceRef: string;
  externalId: string;
  title: string;
  summary: string;
  eventTime: string | null;
  /** ISO string, or a function of seed time for relative freshness fixtures. */
  retrievedAt: string | ((now: number) => string) | null;
  validationStatus: ValidationStatus;
  validationNote: string | null;
  facts: FactFixture[];
}

export interface CaseEventFixture {
  actorRef: string | null;
  eventType: string;
  fromState: CaseState | null;
  toState: CaseState | null;
  rationale: string | null;
  daysAgo: number;
}

export interface CaseFixture {
  key: string;
  title: string;
  state: CaseState;
  domain: string;
  sensitivity: Sensitivity;
  urgency: Urgency;
  dataMode: DataMode;
  ownerRef: string;
  objective: string;
  summary: string;
  whyItMatters: string;
  unresolvedQuestions: string[];
  confidence: ConfidenceBasis;
  evidenceRefs: string[];
  events: CaseEventFixture[];
  updatedDaysAgo: number;
}

export interface SignalFixture {
  key: string;
  title: string;
  summary: string;
  domain: string;
  urgency: Urgency;
  dataMode: DataMode;
  disposition: 'new' | 'monitoring' | 'corroborated' | 'dismissed' | 'case_opened';
  detectedAt: string | ((now: number) => string);
  caseKey: string | null;
}

export interface InstitutionFixture {
  key: string;
  name: string;
  isSynthetic: boolean;
  principals: PrincipalFixture[];
  sources: SourceFixture[];
  evidence: EvidenceFixture[];
  cases: CaseFixture[];
  signals: SignalFixture[];
}

export const relative = (offsetMs: number) => (now: number) => new Date(now - offsetMs).toISOString();

// ───────────────────────────── Gulf Sovereign Investment Authority (Demo) ─────────────────────────────

export const gsiaDemo: InstitutionFixture = {
  key: 'gsia-demo',
  name: 'Gulf Sovereign Investment Authority (Demo)',
  isSynthetic: true,
  principals: [
    { ref: 'exec', displayName: 'Huda Al-Rashid', title: 'Deputy Governor, Strategy', roles: ['executive'] },
    { ref: 'analyst', displayName: 'Omar Haddad', title: 'Senior Intelligence Analyst', roles: ['analyst'] },
    {
      ref: 'expert',
      displayName: 'Dr. Samira Nasser',
      title: 'Maritime & Energy Domain Expert',
      roles: ['domain_expert'],
    },
    {
      ref: 'approver',
      displayName: 'Khalid Al-Farsi',
      title: 'Chief Investment Officer',
      roles: ['approver'],
    },
    {
      ref: 'ops',
      displayName: 'Rania Saleh',
      title: 'Head of Portfolio Operations',
      roles: ['operations_owner'],
    },
    { ref: 'admin', displayName: 'Yusuf Karim', title: 'Governance Administrator', roles: ['administrator'] },
    { ref: 'auditor', displayName: 'Aisha Rahman', title: 'Internal Audit', roles: ['auditor'] },
  ],
  sources: [
    {
      ref: 'gcaptain-seizure',
      publisher: 'gCaptain',
      title: 'Iran seizes Portuguese containership MSC Aries in the Strait of Hormuz',
      sourceClass: 'third_party',
      url: 'https://gcaptain.com/iran-seizes-portuguese-containership-msc-aries-in-the-strait-of-hormuz',
      termsRef: 'Publisher terms — citation and paraphrase only; no redistribution (review pending)',
      allowedPurpose: 'Case evidence (citation)',
      cadence: 'Event report',
      freshnessLimitHours: null,
      approvalStatus: 'approved',
    },
    {
      ref: 'gcaptain-iran-statement',
      publisher: 'gCaptain',
      title: 'Iran says seized MSC Aries was violating maritime laws',
      sourceClass: 'third_party',
      url: 'https://gcaptain.com/iran-says-seized-msc-aries-was-violating-maritime-laws',
      termsRef: 'Publisher terms — citation and paraphrase only; no redistribution (review pending)',
      allowedPurpose: 'Case evidence (citation)',
      cadence: 'Event report',
      freshnessLimitHours: null,
      approvalStatus: 'approved',
    },
    {
      ref: 'iranintl-crew',
      publisher: 'Iran International',
      title: 'Iran says crew of seized Portuguese-flagged ship in "perfect health"',
      sourceClass: 'third_party',
      url: 'https://iranintl.com/en/202404306038',
      termsRef: 'Publisher terms — citation and paraphrase only (review pending)',
      allowedPurpose: 'Case evidence (citation)',
      cadence: 'Event report',
      freshnessLimitHours: null,
      approvalStatus: 'approved',
    },
    {
      ref: 'eia-hormuz',
      publisher: 'U.S. Energy Information Administration',
      title: 'Today in Energy — Strait of Hormuz oil transit chokepoint (article 61002)',
      sourceClass: 'public',
      url: 'https://www.eia.gov/todayinenergy/detail.php?id=61002',
      termsRef: 'U.S. government public information; confirm reuse terms before mirroring',
      allowedPurpose: 'Baseline context and back-testing',
      cadence: 'Periodic analysis',
      freshnessLimitHours: null,
      approvalStatus: 'approved',
    },
    {
      ref: 'gsia-exposure-register',
      publisher: 'GSIA (Demo) — synthetic fixture',
      title: 'Portfolio exposure and dependency register (synthetic)',
      sourceClass: 'synthetic',
      url: null,
      termsRef: 'Synthetic demonstration data — not real holdings',
      allowedPurpose: 'Demonstration only',
      cadence: 'Static fixture',
      freshnessLimitHours: null,
      approvalStatus: 'approved',
    },
    {
      ref: 'synthetic-movement',
      publisher: 'TIGERIS demo generator',
      title: 'Illustrative vessel and truck movement (synthetic)',
      sourceClass: 'synthetic',
      url: null,
      termsRef: 'Synthetic demonstration data — never live AIS or telemetry',
      allowedPurpose: 'Demonstration only',
      cadence: 'Every 24 hours',
      freshnessLimitHours: 24,
      approvalStatus: 'approved',
    },
    {
      ref: 'gcc-stat',
      publisher: 'GCC-Stat',
      title: 'GCC-Stat Data Portal',
      sourceClass: 'public',
      url: 'https://www.gccstat.org',
      termsRef: 'Dataset-level terms to be confirmed',
      allowedPurpose: 'Regional macro, trade and energy context',
      cadence: 'Periodic releases',
      freshnessLimitHours: null,
      approvalStatus: 'pending',
    },
    {
      ref: 'ofac-sls',
      publisher: 'U.S. Treasury — OFAC',
      title: 'Sanctions List Service (dated snapshots)',
      sourceClass: 'public',
      url: 'https://sanctionslist.ofac.treas.gov',
      termsRef: 'Public list; dated reference, not a legal determination',
      allowedPurpose: 'Counterparty and vessel screening context',
      cadence: 'As published',
      freshnessLimitHours: null,
      approvalStatus: 'pending',
    },
  ],
  evidence: [
    {
      ref: 'E-seizure',
      sourceRef: 'gcaptain-seizure',
      externalId: 'gcaptain:iran-seizes-msc-aries',
      title: 'Container ship MSC Aries boarded and seized near the Strait of Hormuz',
      summary:
        'Trade press reports that Iranian forces seized the Portuguese-flagged container ship MSC Aries near the ' +
        'Strait of Hormuz on 13 April 2024. The operator, MSC, stated the vessel was boarded by helicopter at ' +
        'about 02:43 UTC and that 25 crew were aboard.',
      eventTime: '2024-04-13T02:43:00Z',
      retrievedAt: REVIEWED_AT,
      validationStatus: 'unverified',
      validationNote:
        'Snapshot not yet captured (no hash). Awaiting factual review by the client acceptance owner.',
      facts: [
        { subject: 'MSC Aries', predicate: 'Flag state', valueText: 'Portugal', claimClass: 'sourced' },
        {
          subject: 'MSC Aries',
          predicate: 'Boarding time (operator statement)',
          valueText: '13 Apr 2024, ~02:43 UTC',
          claimClass: 'sourced',
          validFrom: '2024-04-13T02:43:00Z',
        },
        {
          subject: 'MSC Aries',
          predicate: 'Boarding method',
          valueText: 'Helicopter',
          claimClass: 'sourced',
        },
        {
          subject: 'MSC Aries',
          predicate: 'Crew aboard (operator statement)',
          valueNum: 25,
          unit: 'persons',
          claimClass: 'sourced',
          transformation: 'As stated by MSC; reported by gCaptain. No transformation.',
        },
      ],
    },
    {
      ref: 'E-iran-statement',
      sourceRef: 'gcaptain-iran-statement',
      externalId: 'gcaptain:iran-says-violating-maritime-laws',
      title: 'Iranian authorities state grounds for the seizure',
      summary:
        "Reporting of Iran's foreign ministry position: the vessel was described as linked to Israel and as seized " +
        "for violating maritime laws. This is a party's stated position, not an established fact.",
      eventTime: '2024-04-15T00:00:00Z',
      retrievedAt: REVIEWED_AT,
      validationStatus: 'unverified',
      validationNote:
        'Statement of a party to the event. Record as a claim; corroborate before use in decisions.',
      facts: [
        {
          subject: 'MSC Aries',
          predicate: 'Stated grounds (Iranian position)',
          valueText: 'Violation of maritime laws; described as Israel-linked',
          claimClass: 'sourced',
        },
      ],
    },
    {
      ref: 'E-crew-iran',
      sourceRef: 'iranintl-crew',
      externalId: 'iranintl:202404306038',
      title: 'Iranian officials give a different crew figure',
      summary:
        'Report that Iranian officials described all 24 crew members as in good health — one fewer than the ' +
        'operator-stated 25. One reported explanation is that a crew member had already been allowed to return home; ' +
        'this explanation is not confirmed here.',
      eventTime: '2024-04-30T00:00:00Z',
      retrievedAt: REVIEWED_AT,
      validationStatus: 'disputed',
      validationNote:
        'Conflicts with operator-stated crew of 25 (E-seizure). Both values preserved; analyst disposition required.',
      facts: [
        {
          subject: 'MSC Aries',
          predicate: 'Crew aboard (Iranian statement)',
          valueNum: 24,
          unit: 'persons',
          claimClass: 'sourced',
          transformation:
            'As stated by Iranian officials; reported by Iran International. No transformation.',
        },
      ],
    },
    {
      ref: 'E-eia-hormuz',
      sourceRef: 'eia-hormuz',
      externalId: 'eia:todayinenergy:61002',
      title: 'Strait of Hormuz oil and LNG transit baseline (2023)',
      summary:
        'EIA analysis reports that oil flows through the Strait of Hormuz averaged about 20.9 million barrels per day ' +
        'in 2023, roughly one-fifth of global petroleum liquids consumption, and that about one-fifth of global LNG ' +
        'trade also transited the strait.',
      eventTime: '2023-12-31T00:00:00Z',
      retrievedAt: REVIEWED_AT,
      validationStatus: 'unverified',
      validationNote:
        'Primary eia.gov page was not reachable from the build environment (network policy). Figures come from a ' +
        'secondary summary of the EIA analysis and must be re-captured from eia.gov before acceptance.',
      facts: [
        {
          subject: 'Strait of Hormuz',
          predicate: 'Average oil flow, 2023',
          valueNum: 20.9,
          unit: 'million b/d',
          claimClass: 'sourced',
          validFrom: '2023-01-01T00:00:00Z',
          transformation: 'Reported value; taken from a secondary summary of EIA article 61002.',
        },
        {
          subject: 'Strait of Hormuz',
          predicate: 'Share of global petroleum liquids consumption, 2023',
          valueNum: 20,
          unit: '% (approx.)',
          claimClass: 'sourced',
          transformation: 'Reported as "about 20%"; not recomputed.',
        },
        {
          subject: 'Strait of Hormuz',
          predicate: 'Share of global LNG trade, 2023',
          valueText: 'About one-fifth',
          claimClass: 'sourced',
        },
      ],
    },
    {
      ref: 'E-gsia-exposure',
      sourceRef: 'gsia-exposure-register',
      externalId: 'gsia-demo:exposure-register:v1',
      title: 'GSIA (Demo) Hormuz route dependency in the portfolio',
      summary:
        'Synthetic exposure register for the fictional demonstration fund. Used to show how a public event connects ' +
        'to institutional exposure. These are not real holdings or values.',
      eventTime: null,
      retrievedAt: REVIEWED_AT,
      validationStatus: 'validated',
      validationNote: 'Synthetic fixture: passed schema checks. Not real exposure.',
      facts: [
        {
          subject: 'GSIA (Demo) portfolio',
          predicate: 'Holdings with Hormuz route dependency',
          valueNum: 11,
          unit: 'holdings',
          claimClass: 'synthetic',
        },
        {
          subject: 'GSIA (Demo) portfolio',
          predicate: 'Energy and shipping share of net asset value',
          valueNum: 18,
          unit: '% of NAV',
          claimClass: 'synthetic',
        },
        {
          subject: 'GSIA (Demo) portfolio',
          predicate: 'Stakes in desalination and power assets',
          valueNum: 3,
          unit: 'assets',
          claimClass: 'synthetic',
        },
      ],
    },
    {
      ref: 'E-movement',
      sourceRef: 'synthetic-movement',
      externalId: 'demo-movement:batch-latest',
      title: 'Illustrative movement batch for the Gulf replay',
      summary:
        'Generated vessel and truck tracks used only to demonstrate replay behaviour. The generator last ran three ' +
        'days ago, so the batch is past its 24-hour freshness limit.',
      eventTime: null,
      retrievedAt: relative(3 * DAY),
      validationStatus: 'stale',
      validationNote: 'Past the 24-hour freshness limit. Illustrative simulation — never live AIS.',
      facts: [
        {
          subject: 'Movement batch',
          predicate: 'Illustrative vessel tracks',
          valueNum: 40,
          unit: 'tracks',
          claimClass: 'illustrative',
        },
      ],
    },
    {
      ref: 'E-desal-dependency',
      sourceRef: 'gsia-exposure-register',
      externalId: 'gsia-demo:dependency:energy-water:v1',
      title: 'Energy–water dependency chain for GSIA (Demo) utility assets',
      summary:
        'Synthetic dependency record linking imported fuel and LNG supply to power generation and co-located ' +
        'desalination plants held in the demonstration portfolio.',
      eventTime: null,
      retrievedAt: REVIEWED_AT,
      validationStatus: 'validated',
      validationNote: 'Synthetic fixture: passed schema checks. Not a real asset register.',
      facts: [
        {
          subject: 'GSIA (Demo) utility assets',
          predicate: 'Desalination plants dependent on gas-fired power',
          valueNum: 2,
          unit: 'plants',
          claimClass: 'synthetic',
        },
        {
          subject: 'GSIA (Demo) utility assets',
          predicate: 'Fuel buffer before output reduction',
          valueNum: 9,
          unit: 'days',
          claimClass: 'assumed',
          transformation:
            'Scenario assumption entered by analyst; replace with operator data when authorised.',
        },
      ],
    },
  ],
  cases: [
    {
      key: 'HMZ-2024-0413',
      title: 'MSC Aries seizure near the Strait of Hormuz',
      state: 'analysis',
      domain: 'Energy & maritime',
      sensitivity: 'restricted',
      urgency: 'elevated',
      dataMode: 'snapshot',
      ownerRef: 'analyst',
      objective:
        'Assess whether the April 2024 MSC Aries seizure signals elevated disruption risk for Hormuz transit, and ' +
        "what it implies for GSIA (Demo)'s route-dependent holdings.",
      summary:
        'On 13 April 2024, Iranian forces boarded and seized the Portuguese-flagged container ship MSC Aries near the ' +
        'Strait of Hormuz. Reports agree on the date, flag and boarding method; crew figures differ between the ' +
        'operator (25) and Iranian officials (24).',
      whyItMatters:
        'About one-fifth of global petroleum liquids consumption transited Hormuz in 2023 (EIA, via secondary summary). ' +
        'The demonstration portfolio has 11 holdings with a Hormuz route dependency (synthetic).',
      unresolvedQuestions: [
        'Was this an isolated retaliatory act, or the start of a pattern affecting commercial transit?',
        'Which holdings rely on vessels with comparable ownership or flag profiles?',
        'Resolve the crew-count conflict (25 vs 24) before citing either figure.',
        'Capture the primary EIA snapshot; a secondary summary is not acceptable decision evidence.',
      ],
      confidence: {
        band: 'low',
        factors: [
          {
            factor: 'source_quality',
            band: 'moderate',
            note: 'Established trade press and official statements as reported; primary snapshots not yet captured.',
          },
          {
            factor: 'corroboration',
            band: 'moderate',
            note: 'Independent reports agree on date, flag and method; crew count is disputed.',
          },
          {
            factor: 'freshness',
            band: 'high',
            note: 'Historical event; dated snapshot is appropriate for replay.',
          },
          {
            factor: 'graph_completeness',
            band: 'insufficient',
            note: 'Impact graph not yet built — arrives in Phase 2.',
          },
          { factor: 'assumption_load', band: 'high', note: 'No scenario assumptions applied yet.' },
          {
            factor: 'scenario_stability',
            band: 'insufficient',
            note: 'No scenario runs yet — arrives in Phase 3.',
          },
        ],
      },
      evidenceRefs: ['E-seizure', 'E-iran-statement', 'E-crew-iran', 'E-eia-hormuz', 'E-gsia-exposure'],
      events: [
        {
          actorRef: null,
          eventType: 'case.opened_from_signal',
          fromState: null,
          toState: 'detected',
          rationale: 'Opened from signal SIG-2024-0413-01 (dated public snapshot).',
          daysAgo: 6,
        },
        {
          actorRef: 'analyst',
          eventType: 'case.state_changed',
          fromState: 'detected',
          toState: 'triaged',
          rationale: 'Credible multi-outlet reporting; relevant to route-dependent holdings.',
          daysAgo: 5,
        },
        {
          actorRef: 'analyst',
          eventType: 'case.state_changed',
          fromState: 'triaged',
          toState: 'analysis',
          rationale: 'Begin evidence curation; crew-count conflict flagged for disposition.',
          daysAgo: 4,
        },
      ],
      updatedDaysAgo: 1,
    },
    {
      key: 'RES-EW-01',
      title: 'Energy–water dependency: Gulf power and desalination',
      state: 'triaged',
      domain: 'Resilience',
      sensitivity: 'restricted',
      urgency: 'elevated',
      dataMode: 'synthetic_demo',
      ownerRef: 'analyst',
      objective:
        'Trace how a prolonged Hormuz disruption could propagate from fuel and LNG supply to power generation and ' +
        'desalination output for GSIA (Demo) utility assets.',
      summary:
        'A resilience case linked to HMZ-2024-0413. The dependency chain (fuel/LNG → power → desalination → water ' +
        'supply) is synthetic and exists to demonstrate propagation.',
      whyItMatters:
        'Two demonstration desalination plants depend on gas-fired power (synthetic), with an assumed nine-day fuel buffer.',
      unresolvedQuestions: [
        'Replace the assumed nine-day fuel buffer with operator data once authorised.',
        'Which alternative supply routes are realistic for the affected assets?',
      ],
      confidence: {
        band: 'insufficient',
        factors: [
          { factor: 'source_quality', band: 'low', note: 'Synthetic dependency data only.' },
          { factor: 'corroboration', band: 'insufficient', note: 'No independent sources yet.' },
          { factor: 'freshness', band: 'high', note: 'Static synthetic fixture.' },
          {
            factor: 'graph_completeness',
            band: 'insufficient',
            note: 'Dependency graph arrives in Phase 2.',
          },
          { factor: 'assumption_load', band: 'low', note: 'Key buffer value is an analyst assumption.' },
          { factor: 'scenario_stability', band: 'insufficient', note: 'No scenario runs yet.' },
        ],
      },
      evidenceRefs: ['E-desal-dependency', 'E-movement'],
      events: [
        {
          actorRef: 'analyst',
          eventType: 'case.created',
          fromState: null,
          toState: 'detected',
          rationale: 'Spawned from HMZ-2024-0413 to examine downstream utility dependencies.',
          daysAgo: 3,
        },
        {
          actorRef: 'analyst',
          eventType: 'case.state_changed',
          fromState: 'detected',
          toState: 'triaged',
          rationale: 'In scope for resilience demonstration.',
          daysAgo: 2,
        },
      ],
      updatedDaysAgo: 2,
    },
    {
      key: 'CAP-ALLOC-01',
      title: 'Capital response options under a Hormuz shock',
      state: 'review',
      domain: 'Sovereign capital',
      sensitivity: 'confidential',
      urgency: 'routine',
      dataMode: 'synthetic_demo',
      ownerRef: 'analyst',
      objective:
        'Compare hold, defer, hedge and reallocate responses for the synthetic demonstration portfolio under a ' +
        'route-disruption assumption. A scenario comparison only — not investment advice.',
      summary:
        'Synthetic capital-allocation slice prepared for expert review. Option comparison and calculations arrive with ' +
        'the scenario engine (Phase 3); this record demonstrates the review queue.',
      whyItMatters:
        'Shows how the same event connects to mandate-level choices that require named human authority.',
      unresolvedQuestions: [
        'Expert to confirm the disruption-duration assumptions before options are ranked.',
      ],
      confidence: {
        band: 'insufficient',
        factors: [
          { factor: 'source_quality', band: 'low', note: 'Synthetic portfolio context.' },
          { factor: 'corroboration', band: 'insufficient', note: 'Not applicable to synthetic inputs.' },
          { factor: 'freshness', band: 'high', note: 'Static synthetic fixture.' },
          { factor: 'graph_completeness', band: 'insufficient', note: 'Arrives in Phase 2.' },
          { factor: 'assumption_load', band: 'low', note: 'Depends on unreviewed duration assumptions.' },
          { factor: 'scenario_stability', band: 'insufficient', note: 'No scenario runs yet.' },
        ],
      },
      evidenceRefs: ['E-gsia-exposure'],
      events: [
        {
          actorRef: 'analyst',
          eventType: 'case.created',
          fromState: null,
          toState: 'detected',
          rationale: null,
          daysAgo: 5,
        },
        {
          actorRef: 'analyst',
          eventType: 'case.state_changed',
          fromState: 'detected',
          toState: 'triaged',
          rationale: null,
          daysAgo: 5,
        },
        {
          actorRef: 'analyst',
          eventType: 'case.state_changed',
          fromState: 'triaged',
          toState: 'analysis',
          rationale: null,
          daysAgo: 4,
        },
        {
          actorRef: 'analyst',
          eventType: 'case.state_changed',
          fromState: 'analysis',
          toState: 'scenario',
          rationale: 'Draft option set prepared on synthetic inputs.',
          daysAgo: 2,
        },
        {
          actorRef: 'analyst',
          eventType: 'case.state_changed',
          fromState: 'scenario',
          toState: 'review',
          rationale: 'Routed for mandatory expert review.',
          daysAgo: 1,
        },
      ],
      updatedDaysAgo: 1,
    },
  ],
  signals: [
    {
      key: 'SIG-2024-0413-01',
      title: 'Container ship boarded near the Strait of Hormuz',
      summary: 'Dated public reporting of the MSC Aries seizure (13 April 2024). Case opened.',
      domain: 'Energy & maritime',
      urgency: 'elevated',
      dataMode: 'snapshot',
      disposition: 'case_opened',
      detectedAt: '2024-04-13T06:00:00Z',
      caseKey: 'HMZ-2024-0413',
    },
    {
      key: 'SIG-SYN-0002',
      title: 'Illustrative: LNG departure schedule slippage at a Gulf export terminal',
      summary: 'Synthetic signal generated to demonstrate triage. Not a real event.',
      domain: 'Energy',
      urgency: 'routine',
      dataMode: 'synthetic_demo',
      disposition: 'new',
      detectedAt: relative(10 * HOUR),
      caseKey: null,
    },
  ],
};

// ───────────────────────────── Second institution (isolation testing) ─────────────────────────────

export const isolationTest: InstitutionFixture = {
  key: 'nri-test',
  name: 'Northern Reserve Institution (Isolation Test)',
  isSynthetic: true,
  principals: [{ ref: 'analyst', displayName: 'Test Analyst', title: 'Analyst (test)', roles: ['analyst'] }],
  sources: [
    {
      ref: 'nri-synthetic',
      publisher: 'NRI (Test) — synthetic fixture',
      title: 'Isolation test register',
      sourceClass: 'synthetic',
      url: null,
      termsRef: null,
      allowedPurpose: 'Testing only',
      cadence: null,
      freshnessLimitHours: null,
      approvalStatus: 'approved',
    },
  ],
  evidence: [
    {
      ref: 'E-nri',
      sourceRef: 'nri-synthetic',
      externalId: 'nri:secret-1',
      title: 'NRI confidential test evidence',
      summary: 'Must never be visible to another institution.',
      eventTime: null,
      retrievedAt: REVIEWED_AT,
      validationStatus: 'validated',
      validationNote: null,
      facts: [
        {
          subject: 'NRI',
          predicate: 'Secret test value',
          valueNum: 42,
          unit: 'units',
          claimClass: 'synthetic',
        },
      ],
    },
  ],
  cases: [
    {
      key: 'NRI-TEST-01',
      title: 'NRI confidential test case',
      state: 'analysis',
      domain: 'Test',
      sensitivity: 'confidential',
      urgency: 'routine',
      dataMode: 'synthetic_demo',
      ownerRef: 'analyst',
      objective: 'Isolation testing.',
      summary: 'Must never be visible to another institution.',
      whyItMatters: 'Isolation testing.',
      unresolvedQuestions: [],
      confidence: { band: 'insufficient', factors: [] },
      evidenceRefs: ['E-nri'],
      events: [],
      updatedDaysAgo: 0,
    },
  ],
  signals: [],
};

export const ALL_INSTITUTIONS = [gsiaDemo, isolationTest];
