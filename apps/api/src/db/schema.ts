// Drizzle table definitions mirroring db/migrations. The SQL migrations are authoritative
// (they also hold RLS policies, CHECK constraints and grants); keep these in step with them.
import {
  bigint,
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
