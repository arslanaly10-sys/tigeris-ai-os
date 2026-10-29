// Drizzle table definitions mirroring db/migrations. The SQL migrations are authoritative
// (they also hold RLS policies, CHECK constraints and grants); keep these in step with them.
import {
  bigint,
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
