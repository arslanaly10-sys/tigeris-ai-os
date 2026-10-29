import type { SectorKey } from './sectors';
import type {
  CaseState,
  ClaimClass,
  ConfidenceBand,
  ConfidenceBasis,
  DataMode,
  EntityType,
  RelationshipClass,
  Role,
  Sensitivity,
  SignalAction,
  SignalDisposition,
  SignalType,
  SourceClass,
  Urgency,
  ValidationOutcome,
  ValidationStatus,
} from './vocabulary';

export interface DemoPrincipal {
  id: string;
  displayName: string;
  title: string;
  roles: Role[];
}

export interface AuthContext {
  institution: { id: string; key: string; name: string; isSynthetic: boolean };
  principal: DemoPrincipal;
  environment: 'demonstration' | 'pilot' | 'production';
  dataModes: DataMode[];
}

export interface SourceSummary {
  id: string;
  key: string;
  publisher: string;
  title: string;
  sourceClass: SourceClass;
  url: string | null;
  termsRef: string | null;
  approvalStatus: 'approved' | 'pending' | 'suspended';
  freshnessLimitHours: number | null;
  lastRetrievedAt: string | null;
  freshness: 'fresh' | 'stale' | 'not_applicable';
}

export interface EvidenceFact {
  id: string;
  subject: string;
  predicate: string;
  valueNum: number | null;
  valueText: string | null;
  unit: string | null;
  claimClass: ClaimClass;
  validFrom: string | null;
  transformation: string | null;
  extractionVersion: string;
}

export interface EvidenceItem {
  id: string;
  title: string;
  summary: string;
  source: SourceSummary;
  eventTime: string | null;
  retrievedAt: string | null;
  sha256: string | null;
  version: string;
  validationStatus: ValidationStatus;
  validationNote: string | null;
  facts: EvidenceFact[];
}

export interface CaseEventItem {
  id: string;
  eventType: string;
  fromState: CaseState | null;
  toState: CaseState | null;
  actor: string;
  rationale: string | null;
  occurredAt: string;
}

export interface CaseSummary {
  id: string;
  key: string;
  title: string;
  state: CaseState;
  domain: string;
  sensitivity: Sensitivity;
  urgency: Urgency;
  owner: string;
  dataMode: DataMode;
  updatedAt: string;
  nextStep: string;
  nextStepRole: Role | null;
}

export interface CaseDetail extends CaseSummary {
  summary: string;
  whyItMatters: string;
  unresolvedQuestions: string[];
  objective: string;
  confidence: ConfidenceBasis;
  createdAt: string;
  version: number;
  evidence: EvidenceItem[];
  events: CaseEventItem[];
}

export interface AttentionItem {
  kind: 'signal' | 'case' | 'source';
  id: string;
  ref: string;
  title: string;
  reason: string;
  urgency: Urgency;
  dataMode: DataMode;
  /** Null when there is no meaningful time yet (e.g. a registered source never retrieved). */
  updatedAt: string | null;
  nextStep: string;
  nextStepRole: Role | null;
  forYou: boolean;
}

export interface CommandCentre {
  attention: AttentionItem[];
  counts: { openCases: number; awaitingReview: number; awaitingDecision: number; staleSources: number };
  sourceHealth: SourceSummary[];
}

export interface SignalEventItem {
  id: string;
  action: SignalAction;
  fromDisposition: SignalDisposition;
  toDisposition: SignalDisposition;
  actor: string;
  rationale: string;
  occurredAt: string;
}

export interface SignalSummary {
  id: string;
  key: string;
  title: string;
  summary: string;
  signalType: SignalType;
  domain: string;
  urgency: Urgency;
  dataMode: DataMode;
  disposition: SignalDisposition;
  confidenceBand: ConfidenceBand;
  locationLabel: string | null;
  detectedAt: string;
  /** Event and retrieval times come from the signal's primary evidence. */
  eventTime: string | null;
  retrievedAt: string | null;
  primarySource: SourceSummary | null;
  validationStatus: ValidationStatus | null;
  caseKey: string | null;
}

export interface SignalDetail extends SignalSummary {
  evidence: EvidenceItem[];
  events: SignalEventItem[];
  /** Actions the current principal may take now (server-computed). */
  allowedActions: SignalAction[];
}

export interface GraphNode {
  id: string;
  key: string;
  type: EntityType;
  name: string;
  description: string;
  claimClass: ClaimClass;
  /** Hops from the case origin (0 = origin). Absent for whole-graph views. */
  hop?: number;
  lon: number | null;
  lat: number | null;
  geoPrecision: 'exact' | 'approximate' | 'illustrative' | null;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  predicate: string;
  relationshipClass: RelationshipClass;
  confidenceBand: ConfidenceBand;
  rationale: string;
  status: 'active' | 'challenged' | 'retired';
  evidence: { evidenceId: string; title: string; stance: 'supporting' | 'contradicting' | 'contextual' }[];
}

export interface GraphPayload {
  nodes: GraphNode[];
  edges: GraphEdge[];
  maxHops: number;
}

export interface MovementTrack {
  id: string;
  key: string;
  kind: 'vessel' | 'truck';
  label: string;
  dataMode: DataMode;
  claimClass: ClaimClass;
  /** [lon, lat, secondsFromStart] */
  points: [number, number, number][];
}

export interface MapLayers {
  entities: GraphNode[];
  edges: GraphEdge[];
  tracks: MovementTrack[];
  /** Replay window length in seconds. */
  durationSeconds: number;
  movementSource: SourceSummary | null;
}

export interface ValidationRunItem {
  id: string;
  externalId: string;
  outcome: ValidationOutcome;
  rationale: string;
  checks: { rule: string; result: 'pass' | 'warn' | 'fail'; detail: string }[];
  evidenceId: string | null;
}

export interface IngestionJobItem {
  id: string;
  packageId: string;
  packageSha256: string;
  source: string | null;
  ruleSetVersion: string;
  actor: string | null;
  status: 'completed' | 'rejected';
  counts: { accepted: number; warned: number; quarantined: number; rejected: number };
  completedAt: string;
  runs: ValidationRunItem[];
}

export interface SearchResult {
  kind: 'case' | 'signal' | 'entity';
  ref: string;
  title: string;
  detail: string;
  href: string;
}

export interface SectorKpi {
  key: string;
  label: string;
  /** Null when no approved source is connected. */
  value: {
    valueNum: number | null;
    valueText: string | null;
    unit: string | null;
    claimClass: ClaimClass;
    evidenceId: string;
    validationStatus: ValidationStatus;
    publisher: string;
    retrievedAt: string | null;
  } | null;
}

export interface SectorSummary {
  key: SectorKey;
  label: string;
  depth: 'demo' | 'shell';
  openCases: number;
  newSignals: number;
  kpisConnected: number;
  kpisTotal: number;
}

export interface SectorDetail extends SectorSummary {
  title: string;
  tagline: string;
  kpis: SectorKpi[];
  cases: CaseSummary[];
  signals: SignalSummary[];
  reviewQueue: CaseSummary[];
  entityKeys: string[];
  lastUpdated: string | null;
}

export interface MandateItem {
  id: string;
  key: string;
  title: string;
  description: string;
  category: string;
  limitText: string;
  ownerRole: Role;
  claimClass: ClaimClass;
}

export interface AuthorityRuleItem {
  id: string;
  actionClass: string;
  description: string;
  requiredRole: Role;
  thresholdText: string;
  requiresExpertReview: boolean;
  twoPerson: boolean;
  selfApprovalBlocked: boolean;
  claimClass: ClaimClass;
}

export interface PendingApprovals {
  count: number;
  items: AttentionItem[];
}
