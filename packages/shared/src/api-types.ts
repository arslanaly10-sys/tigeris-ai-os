import type { DefinitionKind, RuleEvaluation, RuleOperator, RuleSeverity, SemanticStatus } from './semantic';
import type { SectorDataset, SectorIndicator } from './sector-models';
import type { ServiceLevelKey } from './service-levels';
import type { OutcomeVerdict } from './outcome-review';
import type { DriverDef, Drivers, EngineResult, HorizonKey, MetricDef } from './scenario-engine';
import type { SensitivityResult } from './scenario-sensitivity';
import type { AnalysisAgentKey } from './analysis';
import type { MandateCheck, OptionMagnitude } from './scenario-options';
import type { AuthType, ConnectionType, ConnectorStatus, Dataset } from './connectors';
import type {
  DecisionOutcome,
  HandoffStatus,
  PolicyEvaluation,
  PolicyReason,
  RecommendationStatus,
  ReviewVerdict,
} from './governance';
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
  QualityStatus,
  RecordMode,
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

/** A governed step past its service level (slice I). Listed only; nothing is escalated automatically. */
export interface OverdueItem {
  kind: ServiceLevelKey;
  label: string;
  ref: string;
  caseKey: string;
  title: string;
  role: Role;
  dueAt: string;
  overdueHours: number;
  forYou: boolean;
}

export interface CommandCentre {
  attention: AttentionItem[];
  overdue: OverdueItem[];
  serviceLevelsBasis: string;
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
  /** Sector models computed from imported sector records the reader may see (slice K). */
  models: SectorModelItem[];
}

export interface SectorModelItem {
  dataset: SectorDataset;
  label: string;
  version: string;
  mappingVersion: string;
  records: number;
  latestAsOf: string | null;
  /** How the records entered TIGERIS (imported, sample…); never "live" unless a connector proved it. */
  modes: RecordMode[];
  indicators: SectorIndicator[];
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
  /** Delegated numeric limits for this action class, by role (D-52). Empty: no numeric limit. */
  limits: { role: Role; value: number; unit: string; basis: string; claimClass: ClaimClass }[];
}

export interface PendingApprovals {
  count: number;
  items: AttentionItem[];
}

// ───────────────────────────── Phase 3: scenarios, options, agent runs ─────────────────────────────

export interface AssumptionItem {
  id: string;
  key: string;
  label: string;
  unit: string;
  low: number;
  central: number;
  high: number;
  rationale: string;
  basisEvidenceId: string | null;
  ownerRole: Role;
  version: number;
  claimClass: 'assumed';
}

/** One input a scenario run used, with enough lineage to trace it. */
export type ScenarioInputRef =
  | {
      ref: string;
      kind: 'evidence_fact';
      label: string;
      value: number;
      unit: string | null;
      claimClass: ClaimClass;
      validationStatus: ValidationStatus;
      evidenceId: string;
      factId: string;
      publisher: string;
    }
  | {
      ref: string;
      kind: 'assumption';
      label: string;
      unit: string;
      low: number;
      central: number;
      high: number;
      claimClass: 'assumed';
      assumptionId: string;
      version: number;
      rationale: string;
    }
  | { ref: string; kind: 'driver'; label: string; unit: string; value: number; claimClass: 'assumed' };

export interface ScenarioSetup {
  template: { key: string; title: string; engineVersion: string; description: string };
  drivers: DriverDef[];
  assumptions: AssumptionItem[];
  cases: { key: string; title: string; state: CaseState; domain: string }[];
  canRun: boolean;
}

export interface ScenarioRunSummary {
  id: string;
  key: string;
  title: string;
  templateKey: string;
  engineVersion: string;
  caseKey: string;
  caseTitle: string;
  drivers: Drivers;
  createdBy: string;
  createdAt: string;
  warnings: string[];
  severity: 'low' | 'moderate' | 'high' | null;
}

export interface DraftOptionItem {
  id: string;
  key: string;
  rank: number;
  actionClass: string;
  title: string;
  summary: string;
  rankBasis: string;
  mandateChecks: MandateCheck[];
  authority: {
    requiredRole: Role;
    thresholdText: string;
    twoPerson: boolean;
    requiresExpertReview: boolean;
    selfApprovalBlocked: boolean;
  } | null;
  confidence: ConfidenceBasis;
  citedRefs: string[];
  rankerVersion: string;
  status: 'draft';
  draftedByRunId: string | null;
  /** The option's size for delegated-limit checks; null for options with no size or drafted before sizing. */
  magnitude: OptionMagnitude | null;
  createdBy: string;
  createdAt: string;
}

export interface AgentRunItem {
  id: string;
  agentKey: string;
  agentName: string;
  sectorKey: string;
  task: string;
  caseKey: string | null;
  scenarioKey: string | null;
  modelId: string;
  modelVersion: string;
  external: false;
  templateKey: string;
  templateVersion: string;
  inputs: { ref: string; label: string; display: string }[];
  outputText: string;
  grounding: { passed: boolean; numbers: { value: string; cited: boolean }[] };
  policyDecision: string;
  status: 'completed' | 'refused';
  triggeredBy: string;
  startedAt: string;
}

export interface ScenarioRunDetail extends ScenarioRunSummary {
  dataMode: 'scenario';
  inputs: ScenarioInputRef[];
  result: EngineResult;
  metricDefs: MetricDef[];
  inputHash: string;
  outputHash: string;
  reproducible: boolean;
  options: DraftOptionItem[];
  confidence: ConfidenceBasis | null;
  agentRuns: AgentRunItem[];
}

// ───────────────────────────── Phase 4: governance and memory ─────────────────────────────

export interface PersonRef {
  id: string;
  name: string;
  title: string;
}

export interface ExpertReviewItem {
  id: string;
  reviewer: PersonRef;
  verdict: ReviewVerdict;
  rationale: string;
  createdAt: string;
}

export interface DecisionItem {
  id: string;
  key: string;
  approver: PersonRef;
  outcome: DecisionOutcome;
  rationale: string;
  policyResult: 'pass' | 'hold';
  policyVersion: string;
  reasons: PolicyReason[];
  completes: boolean;
  createdAt: string;
}

export interface RecommendationItem {
  id: string;
  key: string;
  caseKey: string;
  caseTitle: string;
  status: RecommendationStatus;
  rationale: string;
  createdBy: PersonRef;
  createdAt: string;
  updatedAt: string;
  scenarioRunKey: string;
  option: DraftOptionItem;
  reviews: ExpertReviewItem[];
  decisions: DecisionItem[];
}

export interface HandoffItem {
  id: string;
  key: string;
  caseKey: string;
  caseTitle: string;
  decisionKey: string;
  recommendationKey: string;
  actionClass: string;
  scope: string;
  status: HandoffStatus;
  acknowledgedBy: PersonRef | null;
  acknowledgedAt: string | null;
  startedBy: PersonRef | null;
  startedAt: string | null;
  statusNote: string | null;
  outcomeText: string | null;
  completedBy: PersonRef | null;
  completedAt: string | null;
  createdAt: string;
}

/** A figure the scenario expected, quoted with its lineage (run key and metric) into memory. */
export interface ExpectedFigure {
  ref: string;
  label: string;
  display: string;
  scenarioRunKey: string;
}

export interface MemoryItem {
  id: string;
  key: string;
  caseKey: string;
  caseTitle: string;
  recommendationKey: string;
  title: string;
  actionClass: string;
  decisionRationale: string;
  expected: ExpectedFigure[];
  outcome: string;
  lesson: string;
  approvedBy: { name: string; title: string; at: string }[];
  recordedBy: PersonRef;
  createdAt: string;
}

export interface GovernanceCheck {
  allowed: boolean;
  reason: string;
}

/** Everything the case's "Decision & memory" tab needs, evaluated for the signed-in person. */
export interface CaseGovernance {
  caseKey: string;
  caseState: CaseState;
  latestRunKey: string | null;
  /** Options from the latest scenario run, any of which the analyst may recommend. */
  candidateOptions: DraftOptionItem[];
  canRecommend: GovernanceCheck;
  recommendations: RecommendationItem[];
  open: RecommendationItem | null;
  canReview: GovernanceCheck;
  /** Policy preview per outcome for the signed-in person, when a decision is open. */
  decisionPreview: Record<DecisionOutcome, PolicyEvaluation> | null;
  handoff: HandoffItem | null;
  memory: MemoryItem | null;
  /** Reviewer notes, agreements and recorded disagreements on this case's recommendations (FR-24). */
  notes: ReviewNoteItem[];
  canNote: GovernanceCheck;
}

/** A recorded decision in the institution-wide log (Decisions & Approvals). */
export interface DecisionLogItem extends DecisionItem {
  caseKey: string;
  caseTitle: string;
  recommendationKey: string;
  actionClass: string;
}

// ───────────────────────────── Slice B: canonical records with provenance ─────────────────────────────

export interface RecordProvenance {
  sourceKey: string;
  sourcePublisher: string;
  sourceRecordId: string;
  recordMode: RecordMode;
  classification: Sensitivity;
  mappingVersion: string;
  qualityStatus: QualityStatus;
  ingestedAt: string;
  /** The connector and run that imported the record; null for seeded synthetic records. */
  connectorKey: string | null;
  runKey: string | null;
}

export interface PositionItem {
  id: string;
  key: string;
  name: string;
  assetClass: string;
  sectorKey: SectorKey | null;
  country: string | null;
  currency: string;
  marketValue: number;
  navSharePct: number;
  routeDependent: boolean;
  asOf: string;
  provenance: RecordProvenance;
}

export interface PositionsPayload {
  positions: PositionItem[];
  /** Totals computed from the listed rows only (the user's readable slice), with what they cover. */
  totals: {
    navSharePct: number;
    routeDependentNavSharePct: number;
    routeDependentCount: number;
    rows: number;
  };
}

export interface ManagerItem {
  id: string;
  key: string;
  name: string;
  strategy: string;
  domicile: string | null;
  sectorKey: SectorKey | null;
  dueDiligence: {
    key: string;
    reviewType: string;
    status: 'not_started' | 'in_progress' | 'completed' | 'escalated';
    openIssues: number;
    summary: string;
    reviewedOn: string | null;
  }[];
  provenance: RecordProvenance;
}

// ───────────────────────────── Slice C: connectors and ingestion ─────────────────────────────

export interface ConnectorItem {
  id: string;
  key: string;
  provider: string;
  name: string;
  connectionType: ConnectionType;
  support: 'implemented' | 'adapter_boundary';
  authType: AuthType;
  /** Name of the environment variable holding the credential, and whether it is set. Never the value. */
  authRef: string | null;
  credentialPresent: boolean | null;
  endpoint: string | null;
  datasets: Dataset[];
  sectorKey: SectorKey | null;
  classification: Sensitivity;
  schedule: string | null;
  status: ConnectorStatus;
  schemaVersion: string;
  mappingVersion: string;
  source: { key: string; approvalStatus: 'approved' | 'pending' | 'rejected'; sourceClass: SourceClass };
  lastSuccessAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  retryCount: number;
  nextRetryAt: string | null;
  readOnly: true;
  runs: { total: number; lastKey: string | null; lastStatus: ConnectorRunItem['status'] | null };
  createdAt: string;
}

export interface ConnectorRunItem {
  id: string;
  key: string;
  connectorKey: string;
  dataset: Dataset;
  trigger: 'upload' | 'manual' | 'schedule' | 'test';
  status: 'running' | 'succeeded' | 'partial' | 'failed';
  file: { name: string; mediaType: string; sizeBytes: number; sha256: string } | null;
  rowsTotal: number;
  rowsAccepted: number;
  rowsWarned: number;
  rowsRejected: number;
  mappingVersion: string;
  error: string | null;
  actor: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface RowIssueItem {
  row: number;
  field: string | null;
  severity: 'error' | 'warning';
  code: string;
  message: string;
}

export interface ConnectorRunDetail extends ConnectorRunItem {
  issues: RowIssueItem[];
  /** Keys of the records this run created. */
  acceptedKeys: string[];
}

export interface DocumentItem {
  id: string;
  key: string;
  title: string;
  pageCount: number | null;
  charCount: number;
  excerpt: string;
  sectorKey: SectorKey | null;
  file: { name: string; mediaType: string; sizeBytes: number; sha256: string };
  provenance: RecordProvenance;
}

// ───────────────────────────── Slice D: data quality ─────────────────────────────

export interface DatasetQuality {
  dataset: Dataset;
  total: number;
  byQuality: Record<QualityStatus, number>;
  byMode: Partial<Record<RecordMode, number>>;
}

export interface DataQualitySummary {
  datasets: DatasetQuality[];
  connectors: {
    key: string;
    name: string;
    status: ConnectorStatus;
    lastError: string | null;
    lastErrorAt: string | null;
  }[];
  runs: {
    total: number;
    succeeded: number;
    partial: number;
    failed: number;
    rowsRejected: number;
    rowsWarned: number;
  };
  recentProblemRuns: ConnectorRunItem[];
  sources: { stale: SourceSummary[]; pending: SourceSummary[] };
  quarantinedPackageRecords: number;
}

/** Entity explorer row (slice E). Counts cover what the reader may see. */
export interface EntityListItem {
  id: string;
  key: string;
  type: EntityType;
  name: string;
  claimClass: ClaimClass;
  sectors: SectorKey[];
  links: number;
  dependsOn: number;
  dependents: number;
  located: boolean;
}

/** One entity reached by a directed dependency walk, with the link that reached it. */
export interface DependencyStep {
  node: GraphNode;
  hop: number;
  /** Key of the entity one step nearer the origin. */
  viaKey: string;
  edge: GraphEdge;
}

export interface EntityDetail {
  entity: GraphNode;
  sectors: SectorKey[];
  maxHops: number;
  /** What this entity relies on (providers, then theirs). */
  upstream: DependencyStep[];
  /** What relies on this entity: exposed if it is disrupted. */
  downstream: DependencyStep[];
  /** Direct links that are context or alternatives, not dependencies. */
  related: { node: GraphNode; edge: GraphEdge }[];
  /** Positions held through this entity, within the reader's clearance and workspaces. */
  positions: PositionsPayload;
  /** Cases linked to this entity that the reader may open. */
  cases: { key: string; title: string; state: CaseState; role: string }[];
}

/** One specialist's step in a case analysis run (slice F). */
export interface AnalysisStepItem {
  agentKey: AnalysisAgentKey;
  agentName: string;
  /** 'gap' when the authorized records were too thin to answer; the text says what is missing. */
  status: 'completed' | 'gap';
  text: string;
  /** Short, structured findings the prose summarizes (entity names, counts, option titles…). */
  findings: string[];
  gaps: string[];
  citations: { ref: string; label: string; display: string }[];
  grounding: { passed: boolean; numbers: { value: string; cited: boolean }[] };
  modelId: string;
  modelVersion: string;
  templateKey: string;
  templateVersion: string;
}

export interface AnalysisRunItem {
  key: string;
  caseKey: string;
  version: string;
  question: string;
  scenarioKey: string | null;
  inputHash: string;
  createdAt: string;
  createdBy: string;
  steps: AnalysisStepItem[];
  gapCount: number;
}

export interface CaseAnalysisPayload {
  caseKey: string;
  canRun: boolean;
  agents: readonly { key: AnalysisAgentKey; name: string; does: string; tools: readonly string[] }[];
  gateway: {
    active: 'tigeris-stub';
    external: { configured: boolean; endpointHost: string | null; enabled: false; reason: string };
  };
  runs: AnalysisRunItem[];
}

export interface SensitivityPayload {
  scenarioKey: string;
  engineVersion: string;
  inputHash: string;
  metric: { key: string; label: string; unit: string; decimals: number };
  horizon: { key: HorizonKey; label: string };
  result: SensitivityResult;
  /** Metrics a reviewer may choose. */
  metrics: { key: string; label: string }[];
}

export interface ReviewNoteItem {
  id: string;
  recommendationKey: string;
  stance: 'agree' | 'disagree' | 'note';
  body: string;
  author: string;
  authorRole: Role;
  createdAt: string;
}

// ───────────────────────────── Slice H: outcome review, audit, administration ─────────────────────────────

export interface OutcomeReviewItem {
  key: string;
  observedValue: number;
  observedDisplay: string;
  observedOn: string;
  source: string;
  sourceUrl: string | null;
  variance: number;
  varianceDisplay: string;
  variancePct: number | null;
  withinRange: boolean;
  verdict: OutcomeVerdict;
  note: string;
  version: string;
  reviewer: string;
  createdAt: string;
}

/** One figure a decision expected, with its range and every review of what was observed (latest first). */
export interface OutcomeFigure {
  ref: string;
  label: string;
  unit: string;
  decimals: number;
  expected: { low: number; central: number; high: number; display: string };
  scenarioRunKey: string;
  reviews: OutcomeReviewItem[];
}

export interface OutcomeReviewPayload {
  memoryKey: string;
  caseKey: string;
  title: string;
  figures: OutcomeFigure[];
  canReview: GovernanceCheck;
  summary: { reviewed: number; held: number; missed: number; notComparable: number; total: number };
}

export interface AuditEventItem {
  seq: number;
  occurredAt: string;
  actor: string | null;
  actorType: 'human' | 'service';
  action: string;
  objectType: string;
  objectId: string | null;
  caseKey: string | null;
  payload: Record<string, unknown>;
  hash: string;
  prevHash: string | null;
}

export interface AuditPage {
  events: AuditEventItem[];
  /** Pass as `before` to load older events; null when there are none. */
  nextBefore: number | null;
  /** Events withheld from this page because they belong to cases outside the reader's scope. */
  withheld: number;
}

export interface AuditVerification {
  checked: number;
  valid: boolean;
  /** First sequence number whose link or hash does not verify, when the chain is broken. */
  brokenAt: number | null;
  reason: string | null;
  headHash: string | null;
  verifiedAt: string;
}

export interface AdminPrincipalItem {
  id: string;
  displayName: string;
  title: string;
  isDemo: boolean;
  identity: string;
  roles: Role[];
  workspaces: SectorKey[];
  createdAt: string;
}

export interface AdminOverview {
  institution: { key: string; name: string; isSynthetic: boolean; createdAt: string };
  principals: AdminPrincipalItem[];
  canManage: GovernanceCheck;
}

// ───────────────────────────── Slice I: governance-ready case report ─────────────────────────────

/**
 * Case report and JSON evidence pack (FR-38, FR-39). Assembled from the same endpoints the screens use, with the
 * reader's own session, so it never contains a record the reader could not open. Every export is audited.
 */
export interface CaseReport {
  version: string;
  label: string;
  generatedAt: string;
  generatedBy: { name: string; title: string; roles: Role[] };
  institution: { name: string; isSynthetic: boolean };
  case: CaseDetail;
  graph: GraphPayload;
  scenario: ScenarioRunDetail | null;
  governance: Omit<
    CaseGovernance,
    'decisionPreview' | 'canRecommend' | 'canReview' | 'canNote' | 'candidateOptions'
  > & {
    candidateOptions: DraftOptionItem[];
  };
  analysis: AnalysisRunItem | null;
  outcomes: OutcomeReviewPayload | null;
  /** SHA-256 of the canonical JSON of every field above, so a recipient can check the pack is unaltered. */
  contentHash: string;
}

// ───────────────────────────── Slice J: competitive intelligence ─────────────────────────────

export type CiDomainStatus = 'pending_approval' | 'approved' | 'paused';
export type CiRunStatus = 'running' | 'succeeded' | 'partial' | 'failed' | 'blocked';
export type CiClaimKind = 'capability' | 'scale' | 'customer' | 'security' | 'positioning';

export interface CiDomainItem {
  id: string;
  key: string;
  vendor: string;
  host: string;
  pathPrefix: string;
  category: string;
  status: CiDomainStatus;
  approvalBasis: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  lastCrawlAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  /** Collected means at least one crawl fetched a page; never claimed otherwise (AC-16). */
  collected: boolean;
  pages: number;
  claims: { candidate: number; accepted: number; rejected: number };
}

export interface CiRunItem {
  key: string;
  domainKey: string;
  vendor: string;
  trigger: 'manual' | 'schedule';
  status: CiRunStatus;
  rulesVersion: string;
  robotsStatus: string | null;
  pagesSeen: number;
  pagesFetched: number;
  pagesChanged: number;
  pagesSkipped: number;
  claimsProposed: number;
  error: string | null;
  log: string[];
  startedBy: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface CiClaimItem {
  id: string;
  key: string;
  vendor: string;
  domainKey: string;
  kind: CiClaimKind;
  passage: string;
  paraphrase: string | null;
  status: 'candidate' | 'accepted' | 'rejected';
  verification: 'vendor_published' | 'verified';
  sourceUrl: string;
  pageTitle: string;
  retrievedAt: string;
  curationNote: string | null;
  curatedBy: string | null;
  curatedAt: string | null;
}

export interface CiChangeItem {
  vendor: string;
  url: string;
  title: string;
  version: number;
  retrievedAt: string;
  runKey: string;
  kind: 'new_page' | 'changed';
}

export interface CiOverview {
  domains: CiDomainItem[];
  runs: CiRunItem[];
  changes: CiChangeItem[];
  canAdminister: boolean;
  canCurate: boolean;
  rules: { version: string; minDelaySeconds: number; maxPagesPerRun: number; userAgent: string };
}

export interface CiReport {
  version: string;
  generatedAt: string;
  label: string;
  vendors: {
    vendor: string;
    host: string;
    pathPrefix: string;
    category: string;
    collected: boolean;
    lastSuccessAt: string | null;
    lastError: string | null;
    claims: CiClaimItem[];
  }[];
}

// ───────────────────────────── Phase 5A: semantic registry ─────────────────────────────

export interface SemanticDefinitionItem {
  key: string;
  version: string;
  kind: DefinitionKind;
  label: string;
  description: string;
  unit: string;
  formula: string | null;
  ownerRole: Role | null;
  source: string | null;
  jurisdiction: string | null;
  claimClass: ClaimClass;
  status: SemanticStatus;
  /** "system" definitions come from an engine in code; "institution" ones are authored and approved here. */
  origin: 'system' | 'institution';
  createdBy: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  basis: string | null;
}

export interface SemanticRuleItem {
  key: string;
  version: number;
  label: string;
  subject: string;
  subjectLabel: string | null;
  operator: RuleOperator;
  threshold: number;
  unit: string;
  severity: RuleSeverity;
  attentionMargin: number;
  mandateKey: string | null;
  jurisdiction: string | null;
  rationale: string;
  claimClass: ClaimClass;
  status: SemanticStatus;
  createdBy: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  basis: string | null;
  /** Current evaluation for approved rules; null for drafts and retired versions. */
  evaluation:
    (RuleEvaluation & { observedFrom: string | null; asOf: string | null; inputKeys: string[] }) | null;
}

export interface SemanticRegistry {
  version: string;
  vocabulary: string;
  definitions: SemanticDefinitionItem[];
  rules: SemanticRuleItem[];
  canAuthor: boolean;
  canApprove: boolean;
}
