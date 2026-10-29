import {
  NEXT_STEP_LABEL,
  NEXT_STEP_OWNER,
  type CaseState,
  type CaseSummary,
  type ClaimClass,
  type DataMode,
  type EvidenceFact,
  type EvidenceItem,
  type Sensitivity,
  type SourceClass,
  type SourceSummary,
  type Urgency,
  type ValidationStatus,
} from '@tigeris/shared';
import type { cases, evidenceFacts, evidenceObjects, sources } from '../db/schema';

type SourceRow = typeof sources.$inferSelect;
type EvidenceRow = typeof evidenceObjects.$inferSelect;
type FactRow = typeof evidenceFacts.$inferSelect;
type CaseRow = typeof cases.$inferSelect;

export function freshnessOf(limitHours: number | null, lastRetrievedAt: Date | null, now = Date.now()) {
  if (limitHours === null) return 'not_applicable' as const;
  if (!lastRetrievedAt) return 'stale' as const;
  return now - lastRetrievedAt.getTime() > limitHours * 3_600_000 ? ('stale' as const) : ('fresh' as const);
}

export function toSource(s: SourceRow, lastRetrievedAt: Date | null): SourceSummary {
  return {
    id: s.id,
    key: s.key,
    publisher: s.publisher,
    title: s.title,
    sourceClass: s.sourceClass as SourceClass,
    url: s.url,
    termsRef: s.termsRef,
    approvalStatus: s.approvalStatus as SourceSummary['approvalStatus'],
    freshnessLimitHours: s.freshnessLimitHours,
    lastRetrievedAt: lastRetrievedAt?.toISOString() ?? null,
    freshness: freshnessOf(s.freshnessLimitHours, lastRetrievedAt),
  };
}

export function toFact(f: FactRow): EvidenceFact {
  return {
    id: f.id,
    subject: f.subject,
    predicate: f.predicate,
    valueNum: f.valueNum === null ? null : Number(f.valueNum),
    valueText: f.valueText,
    unit: f.unit,
    claimClass: f.claimClass as ClaimClass,
    validFrom: f.validFrom?.toISOString() ?? null,
    transformation: f.transformation,
    extractionVersion: f.extractionVersion,
  };
}

export function toEvidence(e: EvidenceRow, source: SourceSummary, facts: FactRow[]): EvidenceItem {
  return {
    id: e.id,
    title: e.title,
    summary: e.summary,
    source,
    eventTime: e.eventTime?.toISOString() ?? null,
    retrievedAt: e.retrievedAt?.toISOString() ?? null,
    sha256: e.sha256,
    version: e.version,
    validationStatus: e.validationStatus as ValidationStatus,
    validationNote: e.validationNote,
    facts: facts.map(toFact),
  };
}

export function toCaseSummary(c: CaseRow, ownerName: string): CaseSummary {
  const state = c.state as CaseState;
  return {
    id: c.id,
    key: c.key,
    title: c.title,
    state,
    domain: c.domain,
    sensitivity: c.sensitivity as Sensitivity,
    urgency: c.urgency as Urgency,
    owner: ownerName,
    dataMode: c.dataMode as DataMode,
    updatedAt: c.updatedAt.toISOString(),
    nextStep: NEXT_STEP_LABEL[state],
    nextStepRole: NEXT_STEP_OWNER[state],
  };
}
