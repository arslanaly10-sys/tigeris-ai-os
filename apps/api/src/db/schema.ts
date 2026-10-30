// Drizzle table definitions mirroring db/migrations. The SQL migrations are authoritative
// (they also hold RLS policies, CHECK constraints and grants); keep these in step with them.
import {
  bigint,
  date,
  doublePrecision,
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import type { ConfidenceBasis } from '@tigeris/shared';

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const institutions = pgTable('institutions', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull(),
  name: text('name').notNull(),
  isSynthetic: boolean('is_synthetic').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const principals = pgTable('principals', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull(),
  divisionId: uuid('division_id'),
  displayName: text('display_name').notNull(),
  title: text('title').notNull(),
  idpIssuer: text('idp_issuer').notNull(),
  idpSubject: text('idp_subject').notNull(),
  isDemo: boolean('is_demo').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const principalRoles = pgTable(
  'principal_roles',
  {
    institutionId: uuid('institution_id').notNull(),
    principalId: uuid('principal_id').notNull(),
    role: text('role').notNull(),
  },
  (t) => [primaryKey({ columns: [t.institutionId, t.principalId, t.role] })],
);

export const sources = pgTable('sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull(),
  key: text('key').notNull(),
  publisher: text('publisher').notNull(),
  title: text('title').notNull(),
  sourceClass: text('source_class').notNull(),
  url: text('url'),
  termsRef: text('terms_ref'),
  allowedPurpose: text('allowed_purpose').notNull(),
  cadence: text('cadence'),
  freshnessLimitHours: integer('freshness_limit_hours'),
  approvalStatus: text('approval_status').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const evidenceObjects = pgTable('evidence_objects', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull(),
  sourceId: uuid('source_id').notNull(),
  externalId: text('external_id').notNull(),
  title: text('title').notNull(),
  summary: text('summary').notNull(),
  eventTime: ts('event_time'),
  retrievedAt: ts('retrieved_at'),
  version: text('version').notNull(),
  sha256: text('sha256'),
  objectKey: text('object_key'),
  validationStatus: text('validation_status').notNull(),
  validationNote: text('validation_note'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const evidenceFacts = pgTable('evidence_facts', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull(),
  evidenceId: uuid('evidence_id').notNull(),
  subject: text('subject').notNull(),
  predicate: text('predicate').notNull(),
  valueNum: numeric('value_num'), // string from the driver; converted in mappers
  valueText: text('value_text'),
  unit: text('unit'),
  claimClass: text('claim_class').notNull(),
  validFrom: ts('valid_from'),
  transformation: text('transformation'),
  extractionVersion: text('extraction_version').notNull(),
  sortOrder: integer('sort_order').notNull(),
});

export const cases = pgTable('cases', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull(),
  key: text('key').notNull(),
  title: text('title').notNull(),
  state: text('state').notNull(),
  domain: text('domain').notNull(),
  sensitivity: text('sensitivity').notNull(),
  urgency: text('urgency').notNull(),
  dataMode: text('data_mode').notNull(),
  ownerPrincipalId: uuid('owner_principal_id').notNull(),
  objective: text('objective').notNull(),
  summary: text('summary').notNull(),
  whyItMatters: text('why_it_matters').notNull(),
  unresolvedQuestions: text('unresolved_questions').array().notNull(),
  confidence: jsonb('confidence').$type<ConfidenceBasis>().notNull(),
  version: integer('version').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
  sectorKey: text('sector_key'),
});

export const signals = pgTable('signals', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull(),
  key: text('key').notNull(),
  title: text('title').notNull(),
  summary: text('summary').notNull(),
  domain: text('domain').notNull(),
  urgency: text('urgency').notNull(),
  dataMode: text('data_mode').notNull(),
  disposition: text('disposition').notNull(),
  detectedAt: ts('detected_at').notNull(),
  caseId: uuid('case_id'),
  signalType: text('signal_type').notNull().default('maritime'),
  confidenceBand: text('confidence_band').notNull().default('insufficient'),
  locationLabel: text('location_label'),
  entityId: uuid('entity_id'),
});

export const caseEvidence = pgTable(
  'case_evidence',
  {
    institutionId: uuid('institution_id').notNull(),
    caseId: uuid('case_id').notNull(),
    evidenceId: uuid('evidence_id').notNull(),
    sortOrder: integer('sort_order').notNull(),
  },
  (t) => [primaryKey({ columns: [t.institutionId, t.caseId, t.evidenceId] })],
);

export const caseEvents = pgTable('case_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull(),
  caseId: uuid('case_id').notNull(),
  actorPrincipalId: uuid('actor_principal_id'),
  eventType: text('event_type').notNull(),
  fromState: text('from_state'),
  toState: text('to_state'),
  rationale: text('rationale'),
  occurredAt: ts('occurred_at').notNull().defaultNow(),
});

export const auditEvents = pgTable('audit_events', {
  seq: bigint('seq', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  id: uuid('id').notNull().defaultRandom(),
  institutionId: uuid('institution_id').notNull(),
  actorPrincipalId: uuid('actor_principal_id'),
  actorType: text('actor_type').notNull(),
  action: text('action').notNull(),
  objectType: text('object_type').notNull(),
  objectId: text('object_id'),
  caseId: uuid('case_id'),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  occurredAt: ts('occurred_at').notNull(),
  prevHash: text('prev_hash'),
  hash: text('hash').notNull(),
});

// ───────────────────────────── Phase 2: graph, signals, ingestion, movement ─────────────────────────────

export const entities = pgTable('entities', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull(),
  key: text('key').notNull(),
  entityType: text('entity_type').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  lon: doublePrecision('lon'),
  lat: doublePrecision('lat'),
  geoPrecision: text('geo_precision'),
  claimClass: text('claim_class').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const entityRelationships = pgTable('entity_relationships', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull(),
  subjectId: uuid('subject_id').notNull(),
  predicate: text('predicate').notNull(),
  objectId: uuid('object_id').notNull(),
  relationshipClass: text('relationship_class').notNull(),
  confidenceBand: text('confidence_band').notNull(),
  rationale: text('rationale').notNull(),
  validFrom: ts('valid_from'),
  validTo: ts('valid_to'),
  status: text('status').notNull(),
  graphVersion: integer('graph_version').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const relationshipEvidence = pgTable(
  'relationship_evidence',
  {
    institutionId: uuid('institution_id').notNull(),
    relationshipId: uuid('relationship_id').notNull(),
    evidenceId: uuid('evidence_id').notNull(),
    stance: text('stance').notNull(),
  },
  (t) => [primaryKey({ columns: [t.institutionId, t.relationshipId, t.evidenceId] })],
);

export const caseEntities = pgTable(
  'case_entities',
  {
    institutionId: uuid('institution_id').notNull(),
    caseId: uuid('case_id').notNull(),
    entityId: uuid('entity_id').notNull(),
    role: text('role').notNull(),
  },
  (t) => [primaryKey({ columns: [t.institutionId, t.caseId, t.entityId] })],
);

export const signalEvidence = pgTable(
  'signal_evidence',
  {
    institutionId: uuid('institution_id').notNull(),
    signalId: uuid('signal_id').notNull(),
    evidenceId: uuid('evidence_id').notNull(),
  },
  (t) => [primaryKey({ columns: [t.institutionId, t.signalId, t.evidenceId] })],
);

export const signalEvents = pgTable('signal_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull(),
  signalId: uuid('signal_id').notNull(),
  actorPrincipalId: uuid('actor_principal_id').notNull(),
  action: text('action').notNull(),
  fromDisposition: text('from_disposition').notNull(),
  toDisposition: text('to_disposition').notNull(),
  rationale: text('rationale').notNull(),
  occurredAt: ts('occurred_at').notNull().defaultNow(),
});

export const ingestionJobs = pgTable('ingestion_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull(),
  sourceId: uuid('source_id'),
  packageId: text('package_id').notNull(),
  packageSha256: text('package_sha256').notNull(),
  ruleSetVersion: text('rule_set_version').notNull(),
  actorPrincipalId: uuid('actor_principal_id'),
  status: text('status').notNull(),
  acceptedCount: integer('accepted_count').notNull(),
  warnedCount: integer('warned_count').notNull(),
  quarantinedCount: integer('quarantined_count').notNull(),
  rejectedCount: integer('rejected_count').notNull(),
  startedAt: ts('started_at').notNull().defaultNow(),
  completedAt: ts('completed_at').notNull().defaultNow(),
});

export interface ValidationCheck {
  rule: string;
  result: 'pass' | 'warn' | 'fail';
  detail: string;
}

export const validationRuns = pgTable('validation_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull(),
  ingestionJobId: uuid('ingestion_job_id').notNull(),
  evidenceId: uuid('evidence_id'),
  externalId: text('external_id').notNull(),
  ruleSetVersion: text('rule_set_version').notNull(),
  checks: jsonb('checks').$type<ValidationCheck[]>().notNull(),
  outcome: text('outcome').notNull(),
  rationale: text('rationale').notNull(),
  occurredAt: ts('occurred_at').notNull().defaultNow(),
});

export const movementTracks = pgTable('movement_tracks', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull(),
  sourceId: uuid('source_id').notNull(),
  key: text('key').notNull(),
  kind: text('kind').notNull(),
  label: text('label').notNull(),
  dataMode: text('data_mode').notNull(),
  claimClass: text('claim_class').notNull(),
  points: jsonb('points').$type<[number, number, number][]>().notNull(),
});

// ───────────────────────────── Mandates and authority (read-only) ─────────────────────────────

export const mandates = pgTable('mandates', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull(),
  key: text('key').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  category: text('category').notNull(),
  limitText: text('limit_text').notNull(),
  ownerRole: text('owner_role').notNull(),
  claimClass: text('claim_class').notNull(),
  limitValue: numeric('limit_value'),
  limitUnit: text('limit_unit'),
});

export const authorityRules = pgTable('authority_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull(),
  actionClass: text('action_class').notNull(),
  description: text('description').notNull(),
  requiredRole: text('required_role').notNull(),
  thresholdText: text('threshold_text').notNull(),
  requiresExpertReview: boolean('requires_expert_review').notNull(),
  twoPerson: boolean('two_person').notNull(),
  selfApprovalBlocked: boolean('self_approval_blocked').notNull(),
  claimClass: text('claim_class').notNull(),
  sortOrder: integer('sort_order').notNull(),
});

export const assumptions = pgTable('assumptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull(),
  key: text('key').notNull(),
  label: text('label').notNull(),
  unit: text('unit').notNull(),
  low: numeric('low').notNull(),
  central: numeric('central').notNull(),
  high: numeric('high').notNull(),
  rationale: text('rationale').notNull(),
  basisEvidenceId: uuid('basis_evidence_id'),
  ownerRole: text('owner_role').notNull(),
  claimClass: text('claim_class').notNull().default('assumed'),
  version: integer('version').notNull().default(1),
  effectiveFrom: ts('effective_from').notNull().defaultNow(),
});

export const scenarioRuns = pgTable('scenario_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull(),
  key: text('key').notNull(),
  caseId: uuid('case_id').notNull(),
  templateKey: text('template_key').notNull(),
  engineVersion: text('engine_version').notNull(),
  title: text('title').notNull(),
  drivers: jsonb('drivers').notNull(),
  inputs: jsonb('inputs').notNull(),
  outputs: jsonb('outputs').notNull(),
  warnings: jsonb('warnings').notNull(),
  inputHash: text('input_hash').notNull(),
  outputHash: text('output_hash').notNull(),
  dataMode: text('data_mode').notNull().default('scenario'),
  createdBy: uuid('created_by').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const agentRuns = pgTable('agent_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull(),
  agentKey: text('agent_key').notNull(),
  sectorKey: text('sector_key').notNull(),
  task: text('task').notNull(),
  caseId: uuid('case_id'),
  scenarioRunId: uuid('scenario_run_id'),
  modelId: text('model_id').notNull(),
  modelVersion: text('model_version').notNull(),
  external: boolean('external').notNull().default(false),
  templateKey: text('template_key').notNull(),
  templateVersion: text('template_version').notNull(),
  inputs: jsonb('inputs').notNull(),
  outputText: text('output_text').notNull(),
  grounding: jsonb('grounding').notNull(),
  policyDecision: text('policy_decision').notNull(),
  status: text('status').notNull(),
  triggeredBy: uuid('triggered_by').notNull(),
  startedAt: ts('started_at').notNull(),
  finishedAt: ts('finished_at').notNull(),
  analysisRunId: uuid('analysis_run_id'),
});

export const draftOptions = pgTable('draft_options', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull(),
  key: text('key').notNull(),
  scenarioRunId: uuid('scenario_run_id').notNull(),
  caseId: uuid('case_id').notNull(),
  rank: integer('rank').notNull(),
  actionClass: text('action_class').notNull(),
  title: text('title').notNull(),
  summary: text('summary').notNull(),
  rankBasis: text('rank_basis').notNull(),
  mandateChecks: jsonb('mandate_checks').notNull(),
  authority: jsonb('authority').notNull(),
  confidence: jsonb('confidence').$type<ConfidenceBasis>().notNull(),
  citedRefs: jsonb('cited_refs').notNull(),
  rankerVersion: text('ranker_version').notNull(),
  status: text('status').notNull().default('draft'),
  draftedByRunId: uuid('drafted_by_run_id'),
  createdBy: uuid('created_by').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
  magnitude: jsonb('magnitude'),
});

// ───────────────────────────── Phase 4: governance and memory (migration 0005) ─────────────────────────────

export const recommendations = pgTable('recommendations', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull(),
  key: text('key').notNull(),
  caseId: uuid('case_id').notNull(),
  optionId: uuid('option_id').notNull(),
  scenarioRunId: uuid('scenario_run_id').notNull(),
  rationale: text('rationale').notNull(),
  status: text('status').notNull().default('in_review'),
  policyVersion: text('policy_version').notNull(),
  createdBy: uuid('created_by').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const expertReviews = pgTable('expert_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull(),
  recommendationId: uuid('recommendation_id').notNull(),
  reviewerId: uuid('reviewer_id').notNull(),
  verdict: text('verdict').notNull(),
  rationale: text('rationale').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const decisions = pgTable('decisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull(),
  key: text('key').notNull(),
  recommendationId: uuid('recommendation_id').notNull(),
  caseId: uuid('case_id').notNull(),
  approverId: uuid('approver_id').notNull(),
  outcome: text('outcome').notNull(),
  rationale: text('rationale').notNull(),
  policyResult: text('policy_result').notNull(),
  policyVersion: text('policy_version').notNull(),
  policyReasons: jsonb('policy_reasons').notNull(),
  completes: boolean('completes').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const handoffs = pgTable('handoffs', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull(),
  key: text('key').notNull(),
  decisionId: uuid('decision_id').notNull(),
  caseId: uuid('case_id').notNull(),
  ownerRole: text('owner_role').notNull().default('operations_owner'),
  scope: text('scope').notNull(),
  status: text('status').notNull().default('awaiting_acknowledgement'),
  executedByTigeris: boolean('executed_by_tigeris').notNull().default(false),
  acknowledgedBy: uuid('acknowledged_by'),
  acknowledgedAt: ts('acknowledged_at'),
  startedBy: uuid('started_by'),
  startedAt: ts('started_at'),
  statusNote: text('status_note'),
  outcomeText: text('outcome_text'),
  completedBy: uuid('completed_by'),
  completedAt: ts('completed_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const memoryEntries = pgTable('memory_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull(),
  key: text('key').notNull(),
  caseId: uuid('case_id').notNull(),
  recommendationId: uuid('recommendation_id').notNull(),
  handoffId: uuid('handoff_id').notNull(),
  title: text('title').notNull(),
  actionClass: text('action_class').notNull(),
  decisionRationale: text('decision_rationale').notNull(),
  expected: jsonb('expected').notNull(),
  outcome: text('outcome').notNull(),
  lesson: text('lesson').notNull(),
  approvedBy: jsonb('approved_by').notNull(),
  recordedBy: uuid('recorded_by').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
});

// ───────────────────────────── Slice B: scope, limits, canonical records (migration 0006) ─────────────────────────────

export const principalWorkspaces = pgTable('principal_workspaces', {
  institutionId: uuid('institution_id').notNull(),
  principalId: uuid('principal_id').notNull(),
  sectorKey: text('sector_key').notNull(),
  grantedAt: ts('granted_at').notNull().defaultNow(),
});

export const authorityLimits = pgTable('authority_limits', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull(),
  actionClass: text('action_class').notNull(),
  role: text('role').notNull(),
  limitValue: numeric('limit_value').notNull(),
  limitUnit: text('limit_unit').notNull(),
  basis: text('basis').notNull(),
  claimClass: text('claim_class').notNull(),
});

/** Provenance shared by every canonical record (FR-12). */
const provenance = {
  sourceId: uuid('source_id').notNull(),
  sourceRecordId: text('source_record_id').notNull(),
  recordMode: text('record_mode').notNull(),
  classification: text('classification').notNull(),
  mappingVersion: text('mapping_version').notNull(),
  qualityStatus: text('quality_status').notNull().default('valid'),
  ingestedAt: ts('ingested_at').notNull().defaultNow(),
};

export const positions = pgTable('positions', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull(),
  key: text('key').notNull(),
  portfolioEntityId: uuid('portfolio_entity_id'),
  holdingEntityId: uuid('holding_entity_id'),
  name: text('name').notNull(),
  assetClass: text('asset_class').notNull(),
  sectorKey: text('sector_key'),
  country: text('country'),
  currency: text('currency').notNull(),
  marketValue: numeric('market_value').notNull(),
  navSharePct: numeric('nav_share_pct').notNull(),
  routeDependent: boolean('route_dependent').notNull().default(false),
  asOf: date('as_of').notNull(),
  qualityNotes: jsonb('quality_notes').notNull().default([]),
  connectorId: uuid('connector_id'),
  runId: uuid('run_id'),
  ...provenance,
});

export const managers = pgTable('managers', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull(),
  key: text('key').notNull(),
  name: text('name').notNull(),
  strategy: text('strategy').notNull(),
  domicile: text('domicile'),
  sectorKey: text('sector_key'),
  connectorId: uuid('connector_id'),
  runId: uuid('run_id'),
  ...provenance,
});

export const ddRecords = pgTable('dd_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull(),
  key: text('key').notNull(),
  managerId: uuid('manager_id').notNull(),
  reviewType: text('review_type').notNull(),
  status: text('status').notNull(),
  openIssues: integer('open_issues').notNull().default(0),
  summary: text('summary').notNull(),
  reviewedOn: date('reviewed_on'),
  connectorId: uuid('connector_id'),
  runId: uuid('run_id'),
  ...provenance,
});

// ───────────────────────────── Slice C: connectors and ingestion (migration 0007) ─────────────────────────────

export const connectors = pgTable('connectors', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull(),
  key: text('key').notNull(),
  provider: text('provider').notNull(),
  name: text('name').notNull(),
  connectionType: text('connection_type').notNull(),
  authType: text('auth_type').notNull(),
  authRef: text('auth_ref'),
  endpoint: text('endpoint'),
  datasets: jsonb('datasets').$type<string[]>().notNull().default([]),
  sectorKey: text('sector_key'),
  classification: text('classification').notNull(),
  schedule: text('schedule'),
  status: text('status').notNull().default('configured'),
  schemaVersion: text('schema_version').notNull().default('v1'),
  mappingVersion: text('mapping_version').notNull().default('v1'),
  sourceId: uuid('source_id').notNull(),
  lastSuccessAt: ts('last_success_at'),
  lastError: text('last_error'),
  lastErrorAt: ts('last_error_at'),
  retryCount: integer('retry_count').notNull().default(0),
  nextRetryAt: ts('next_retry_at'),
  readOnly: boolean('read_only').notNull().default(true),
  createdBy: uuid('created_by').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const uploadedFiles = pgTable('uploaded_files', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull(),
  connectorId: uuid('connector_id').notNull(),
  originalName: text('original_name').notNull(),
  mediaType: text('media_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  sha256: text('sha256').notNull(),
  storagePath: text('storage_path').notNull(),
  classification: text('classification').notNull(),
  uploadedBy: uuid('uploaded_by').notNull(),
  uploadedAt: ts('uploaded_at').notNull().defaultNow(),
});

export const connectorRuns = pgTable('connector_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull(),
  key: text('key').notNull(),
  connectorId: uuid('connector_id').notNull(),
  dataset: text('dataset').notNull(),
  trigger: text('trigger').notNull(),
  fileId: uuid('file_id'),
  status: text('status').notNull(),
  rowsTotal: integer('rows_total').notNull().default(0),
  rowsAccepted: integer('rows_accepted').notNull().default(0),
  rowsWarned: integer('rows_warned').notNull().default(0),
  rowsRejected: integer('rows_rejected').notNull().default(0),
  mappingVersion: text('mapping_version').notNull(),
  error: text('error'),
  actorId: uuid('actor_id'),
  startedAt: ts('started_at').notNull().defaultNow(),
  finishedAt: ts('finished_at'),
});

export const rowIssues = pgTable('row_issues', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull(),
  runId: uuid('run_id').notNull(),
  rowNumber: integer('row_number').notNull(),
  field: text('field'),
  severity: text('severity').notNull(),
  code: text('code').notNull(),
  message: text('message').notNull(),
  raw: jsonb('raw').notNull(),
});

export const documents = pgTable('documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull(),
  key: text('key').notNull(),
  title: text('title').notNull(),
  fileId: uuid('file_id').notNull(),
  pageCount: integer('page_count'),
  charCount: integer('char_count').notNull(),
  excerpt: text('excerpt').notNull(),
  fullText: text('full_text').notNull(),
  sectorKey: text('sector_key'),
  connectorId: uuid('connector_id'),
  runId: uuid('run_id'),
  ...provenance,
});

// ───────────────────────────── Slices F/G: case analysis and reviewer notes (migration 0009) ─────────────────────────────

export const analysisRuns = pgTable('analysis_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull(),
  key: text('key').notNull(),
  caseId: uuid('case_id').notNull(),
  version: text('version').notNull(),
  question: text('question').notNull(),
  scenarioRunId: uuid('scenario_run_id'),
  steps: jsonb('steps').notNull(),
  gapCount: integer('gap_count').notNull(),
  inputHash: text('input_hash').notNull(),
  createdBy: uuid('created_by').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const reviewNotes = pgTable('review_notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull(),
  recommendationId: uuid('recommendation_id').notNull(),
  caseId: uuid('case_id').notNull(),
  authorId: uuid('author_id').notNull(),
  authorRole: text('author_role').notNull(),
  stance: text('stance').notNull(),
  body: text('body').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
});

// ───────────────────────────── Slice H: outcome reviews (migration 0010) ─────────────────────────────

export const outcomeReviews = pgTable('outcome_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull(),
  key: text('key').notNull(),
  memoryId: uuid('memory_id').notNull(),
  caseId: uuid('case_id').notNull(),
  figureRef: text('figure_ref').notNull(),
  figureLabel: text('figure_label').notNull(),
  unit: text('unit').notNull(),
  expectedLow: numeric('expected_low').notNull(),
  expectedCentral: numeric('expected_central').notNull(),
  expectedHigh: numeric('expected_high').notNull(),
  observedValue: numeric('observed_value').notNull(),
  observedOn: date('observed_on').notNull(),
  source: text('source').notNull(),
  sourceUrl: text('source_url'),
  variance: numeric('variance').notNull(),
  variancePct: numeric('variance_pct'),
  withinRange: boolean('within_range').notNull(),
  verdict: text('verdict').notNull(),
  note: text('note').notNull(),
  version: text('version').notNull(),
  reviewerId: uuid('reviewer_id').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
});

// ───────────────────────────── Slice J: competitive intelligence (migration 0011) ─────────────────────────────

export const ciDomains = pgTable('ci_domains', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull(),
  key: text('key').notNull(),
  vendor: text('vendor').notNull(),
  host: text('host').notNull(),
  pathPrefix: text('path_prefix').notNull(),
  category: text('category').notNull(),
  status: text('status').notNull(),
  approvalBasis: text('approval_basis'),
  approvedBy: uuid('approved_by'),
  approvedAt: ts('approved_at'),
  lastCrawlAt: ts('last_crawl_at'),
  lastSuccessAt: ts('last_success_at'),
  lastError: text('last_error'),
  createdBy: uuid('created_by'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const ciCrawlRuns = pgTable('ci_crawl_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull(),
  key: text('key').notNull(),
  domainId: uuid('domain_id').notNull(),
  trigger: text('trigger').notNull(),
  status: text('status').notNull(),
  rulesVersion: text('rules_version').notNull(),
  robotsStatus: text('robots_status'),
  pagesSeen: integer('pages_seen').notNull().default(0),
  pagesFetched: integer('pages_fetched').notNull().default(0),
  pagesChanged: integer('pages_changed').notNull().default(0),
  pagesSkipped: integer('pages_skipped').notNull().default(0),
  claimsProposed: integer('claims_proposed').notNull().default(0),
  error: text('error'),
  log: jsonb('log').$type<string[]>().notNull().default([]),
  startedBy: uuid('started_by'),
  startedAt: ts('started_at').notNull().defaultNow(),
  finishedAt: ts('finished_at'),
});

export const ciPages = pgTable('ci_pages', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull(),
  domainId: uuid('domain_id').notNull(),
  url: text('url').notNull(),
  firstSeenAt: ts('first_seen_at').notNull().defaultNow(),
});

export const ciPageVersions = pgTable('ci_page_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull(),
  pageId: uuid('page_id').notNull(),
  runId: uuid('run_id').notNull(),
  version: integer('version').notNull(),
  canonicalUrl: text('canonical_url'),
  title: text('title').notNull(),
  publishedAt: ts('published_at'),
  retrievedAt: ts('retrieved_at').notNull(),
  contentHash: text('content_hash').notNull(),
  text: text('text').notNull(),
});

export const ciClaims = pgTable('ci_claims', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull(),
  key: text('key').notNull(),
  domainId: uuid('domain_id').notNull(),
  pageVersionId: uuid('page_version_id').notNull(),
  kind: text('kind').notNull(),
  passage: text('passage').notNull(),
  rule: text('rule').notNull(),
  status: text('status').notNull().default('candidate'),
  verification: text('verification').notNull().default('vendor_published'),
  paraphrase: text('paraphrase'),
  curationNote: text('curation_note'),
  curatedBy: uuid('curated_by'),
  curatedAt: ts('curated_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

// ───────────────────────────── Slice K: sector records (migration 0012) ─────────────────────────────

export const sectorRecords = pgTable('sector_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull(),
  dataset: text('dataset').notNull(),
  key: text('key').notNull(),
  sectorKey: text('sector_key').notNull(),
  attributes: jsonb('attributes').$type<Record<string, string | number | boolean | null>>().notNull(),
  asOf: date('as_of').notNull(),
  connectorId: uuid('connector_id'),
  runId: uuid('run_id'),
  ...provenance,
});

// ───────────────────────────── Phase 5A: semantic registry (migration 0013) ─────────────────────────────

const semanticCommon = {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull(),
  version: integer('version').notNull(),
  label: text('label').notNull(),
  unit: text('unit').notNull().default(''),
  jurisdiction: text('jurisdiction'),
  claimClass: text('claim_class').notNull(),
  status: text('status').notNull(),
  createdBy: uuid('created_by'),
  createdAt: ts('created_at').notNull().defaultNow(),
  approvedBy: uuid('approved_by'),
  approvedAt: ts('approved_at'),
  basis: text('basis'),
};

export const semanticDefinitions = pgTable('semantic_definitions', {
  ...semanticCommon,
  key: text('key').notNull(),
  kind: text('kind').notNull(),
  description: text('description').notNull(),
  formula: text('formula'),
  ownerRole: text('owner_role').notNull(),
  sourceRef: text('source_ref'),
});

export const semanticRules = pgTable('semantic_rules', {
  ...semanticCommon,
  key: text('key').notNull(),
  subject: text('subject').notNull(),
  operator: text('operator').notNull(),
  threshold: numeric('threshold').notNull(),
  severity: text('severity').notNull(),
  attentionMargin: numeric('attention_margin').notNull().default('0'),
  mandateKey: text('mandate_key'),
  rationale: text('rationale').notNull(),
});

// ───────────────────────────── Phase 5B: intervention engine (migration 0014) ─────────────────────────────

export const watchRules = pgTable('watch_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull(),
  key: text('key').notNull(),
  version: integer('version').notNull(),
  label: text('label').notNull(),
  kind: text('kind').notNull(),
  params: jsonb('params').$type<Record<string, unknown>>().notNull(),
  severity: text('severity').notNull(),
  routeRoles: text('route_roles').array().notNull(),
  rationale: text('rationale').notNull(),
  claimClass: text('claim_class').notNull(),
  status: text('status').notNull(),
  createdBy: uuid('created_by'),
  createdAt: ts('created_at').notNull().defaultNow(),
  approvedBy: uuid('approved_by'),
  approvedAt: ts('approved_at'),
  basis: text('basis'),
});

export const interventions = pgTable('interventions', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull(),
  key: text('key').notNull(),
  watchRuleId: uuid('watch_rule_id').notNull(),
  engineVersion: text('engine_version').notNull(),
  subjectRef: text('subject_ref').notNull(),
  severity: text('severity').notNull(),
  title: text('title').notNull(),
  detail: text('detail').notNull(),
  inputs: jsonb('inputs').notNull(),
  routeRoles: text('route_roles').array().notNull(),
  classification: text('classification').notNull(),
  sectorKey: text('sector_key'),
  caseId: uuid('case_id'),
  status: text('status').notNull(),
  firstSeenAt: ts('first_seen_at').notNull().defaultNow(),
  lastSeenAt: ts('last_seen_at').notNull().defaultNow(),
  conditionClearedAt: ts('condition_cleared_at'),
  acknowledgedBy: uuid('acknowledged_by'),
  acknowledgedAt: ts('acknowledged_at'),
  closedBy: uuid('closed_by'),
  closedAt: ts('closed_at'),
  closeReason: text('close_reason'),
});

// ───────────────────────────── Phase 5C: guardrails (migration 0015) ─────────────────────────────

export const guardrails = pgTable('guardrails', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull(),
  key: text('key').notNull(),
  decisionId: uuid('decision_id').notNull(),
  caseId: uuid('case_id').notNull(),
  actionClass: text('action_class').notNull(),
  effect: text('effect').notNull(),
  requiredRole: text('required_role'),
  thresholdValue: numeric('threshold_value'),
  thresholdUnit: text('threshold_unit'),
  statement: text('statement').notNull(),
  expiresOn: date('expires_on'),
  status: text('status').notNull(),
  createdBy: uuid('created_by').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
  liftedBy: uuid('lifted_by'),
  liftedAt: ts('lifted_at'),
  liftReason: text('lift_reason'),
});

// ───────────────────────────── Phase 5D: learning loop (migration 0016) ─────────────────────────────

export const assumptionProposals = pgTable('assumption_proposals', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull(),
  key: text('key').notNull(),
  assumptionKey: text('assumption_key').notNull(),
  baseVersion: integer('base_version').notNull(),
  outcomeReviewId: uuid('outcome_review_id').notNull(),
  methodVersion: text('method_version').notNull(),
  low: numeric('low').notNull(),
  central: numeric('central').notNull(),
  high: numeric('high').notNull(),
  basis: text('basis').notNull(),
  status: text('status').notNull(),
  proposedFor: uuid('proposed_for'),
  createdAt: ts('created_at').notNull().defaultNow(),
  decidedBy: uuid('decided_by'),
  decidedAt: ts('decided_at'),
  decisionNote: text('decision_note'),
  newVersion: integer('new_version'),
});
