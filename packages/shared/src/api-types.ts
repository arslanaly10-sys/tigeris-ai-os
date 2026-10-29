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
