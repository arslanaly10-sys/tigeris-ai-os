/**
 * The TIGERIS truth vocabulary. Every layer (database CHECK constraints, API payloads, UI badges)
 * uses these exact values. Three independent questions are answered separately:
 *
 *   SourceClass — where did the data come from?
 *   ClaimClass  — how do we know this specific fact or link?
 *   DataMode    — what time does the view represent?
 *
 * Keep this file in sync with apps/api/db/migrations (CHECK constraints).
 */

export const SOURCE_CLASSES = ['public', 'third_party', 'licensed', 'client', 'synthetic'] as const;
export type SourceClass = (typeof SOURCE_CLASSES)[number];

export const CLAIM_CLASSES = [
  'observed',
  'sourced',
  'inferred',
  'assumed',
  'synthetic',
  'illustrative',
] as const;
export type ClaimClass = (typeof CLAIM_CLASSES)[number];

export const DATA_MODES = ['live', 'snapshot', 'replay', 'scenario', 'synthetic_demo'] as const;
export type DataMode = (typeof DATA_MODES)[number];

export const VALIDATION_STATUSES = ['validated', 'unverified', 'stale', 'disputed', 'quarantined'] as const;
export type ValidationStatus = (typeof VALIDATION_STATUSES)[number];

/** Confidence is a band plus its basis; never a bare model-generated percentage. */
export const CONFIDENCE_BANDS = ['high', 'moderate', 'low', 'insufficient'] as const;
export type ConfidenceBand = (typeof CONFIDENCE_BANDS)[number];

export const CONFIDENCE_FACTORS = [
  'source_quality',
  'corroboration',
  'freshness',
  'graph_completeness',
  'assumption_load',
  'scenario_stability',
] as const;
export type ConfidenceFactor = (typeof CONFIDENCE_FACTORS)[number];

export interface ConfidenceBasis {
  band: ConfidenceBand;
  factors: { factor: ConfidenceFactor; band: ConfidenceBand; note: string }[];
}

export const ROLES = [
  'executive',
  'analyst',
  'domain_expert',
  'approver',
  'operations_owner',
  'administrator',
  'auditor',
] as const;
export type Role = (typeof ROLES)[number];

/** Expert review is mandatory: every case passes REVIEW before DECISION. */
export const CASE_STATES = [
  'detected',
  'triaged',
  'analysis',
  'scenario',
  'review',
  'decision',
  'handoff',
  'closed',
] as const;
export type CaseState = (typeof CASE_STATES)[number];

export const POLICY_RESULTS = ['pass', 'hold', 'block'] as const;
export type PolicyResult = (typeof POLICY_RESULTS)[number];

export const SENSITIVITIES = ['internal', 'restricted', 'confidential'] as const;
export type Sensitivity = (typeof SENSITIVITIES)[number];

export const URGENCIES = ['critical', 'elevated', 'routine'] as const;
export type Urgency = (typeof URGENCIES)[number];

/** The four scenario horizons are comparison windows, not forecast-accuracy claims. */
export const HORIZONS = ['72h', '90d', '1y', '5y'] as const;
export type Horizon = (typeof HORIZONS)[number];

export const SIGNAL_TYPES = ['maritime', 'land', 'energy', 'supply_chain', 'institutional'] as const;
export type SignalType = (typeof SIGNAL_TYPES)[number];

export const SIGNAL_DISPOSITIONS = ['new', 'monitoring', 'corroborated', 'dismissed', 'case_opened'] as const;
export type SignalDisposition = (typeof SIGNAL_DISPOSITIONS)[number];

/** Analyst triage actions on a signal (App Flow step 3). */
export const SIGNAL_ACTIONS = ['corroborate', 'challenge', 'monitor', 'dismiss', 'open_case'] as const;
export type SignalAction = (typeof SIGNAL_ACTIONS)[number];

export const ENTITY_TYPES = [
  'event',
  'vessel',
  'chokepoint',
  'port',
  'terminal',
  'commodity',
  'asset',
  'institution',
  'portfolio',
  'holding',
  'service',
  'route',
  'region',
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

/** Graph edges: observed / sourced / inferred / assumed / synthetic. Never unlabelled (FR-15). */
export const RELATIONSHIP_CLASSES = ['observed', 'sourced', 'inferred', 'assumed', 'synthetic'] as const;
export type RelationshipClass = (typeof RELATIONSHIP_CLASSES)[number];

export const VALIDATION_OUTCOMES = ['accepted', 'warned', 'quarantined', 'rejected', 'duplicate'] as const;
export type ValidationOutcome = (typeof VALIDATION_OUTCOMES)[number];
