/**
 * Validation rules v1 (FR-09, TR-007..TR-011). Pure functions: given a snapshot record, the source it
 * claims to come from and what is already held, decide accept / warn / quarantine / reject / duplicate.
 *
 *   reject      — structurally unusable or wrong data class: nothing is stored
 *   quarantine  — stored but excluded from cases, graph and recommendations (integrity or time failures)
 *   duplicate   — identical record already held: nothing new is stored (idempotent receipt)
 *   warn        — stored with a visible qualification (stale, new version of a known record)
 *   accept      — stored
 */
import { createHash } from 'node:crypto';
import type { SourceClass, ValidationOutcome } from '@tigeris/shared';
import { z } from 'zod';
import type { ValidationCheck } from '../db/schema';

export const RULE_SET_VERSION = 'validation-v1';

export const snapshotRecordSchema = z.object({
  externalId: z.string().min(1).max(200),
  title: z.string().min(3).max(300),
  summary: z.string().min(3).max(4000),
  content: z.string().min(1).max(200_000),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  dataClass: z.enum(['public', 'third_party', 'licensed', 'client', 'synthetic']),
  eventTime: z.string().datetime().nullable(),
  retrievedAt: z.string().datetime(),
});
export type SnapshotRecord = z.infer<typeof snapshotRecordSchema>;

export const snapshotPackageSchema = z.object({
  packageId: z.string().min(3).max(120),
  sourceKey: z.string().min(1).max(120),
  createdAt: z.string().datetime(),
  records: z.array(z.unknown()).min(1).max(500),
});
export type SnapshotPackage = z.infer<typeof snapshotPackageSchema>;

export interface SourceContext {
  sourceClass: SourceClass;
  approvalStatus: 'approved' | 'pending' | 'suspended';
  freshnessLimitHours: number | null;
}

export interface HeldVersion {
  externalId: string;
  sha256: string | null;
}

export interface RecordDecision {
  externalId: string;
  outcome: ValidationOutcome;
  checks: ValidationCheck[];
  rationale: string;
  record: SnapshotRecord | null;
}

export const sha256Hex = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

export function packageDecision(source: SourceContext | null): ValidationCheck {
  if (!source)
    return { rule: 'source_registered', result: 'fail', detail: 'Source key is not in the registry.' };
  if (source.approvalStatus !== 'approved') {
    return {
      rule: 'source_approved',
      result: 'fail',
      detail: `Source approval is "${source.approvalStatus}"; unapproved sources cannot be ingested.`,
    };
  }
  return { rule: 'source_approved', result: 'pass', detail: 'Source is registered and approved.' };
}

export function validateRecord(
  raw: unknown,
  source: SourceContext,
  held: HeldVersion[],
  now: Date,
): RecordDecision {
  const parsed = snapshotRecordSchema.safeParse(raw);
  const externalId =
    typeof (raw as { externalId?: unknown })?.externalId === 'string'
      ? (raw as { externalId: string }).externalId
      : '(missing id)';
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join('.') || 'record'}: ${i.message}`).join('; ');
    return {
      externalId,
      outcome: 'rejected',
      checks: [{ rule: 'schema', result: 'fail', detail }],
      rationale: 'Record does not match the snapshot schema.',
      record: null,
    };
  }
  const r = parsed.data;
  const checks: ValidationCheck[] = [
    { rule: 'schema', result: 'pass', detail: 'All required fields present.' },
  ];

  if (r.dataClass !== source.sourceClass) {
    checks.push({
      rule: 'data_class',
      result: 'fail',
      detail: `Record claims "${r.dataClass}" but the source is registered as "${source.sourceClass}".`,
    });
    return { externalId, outcome: 'rejected', checks, rationale: 'Data class mismatch.', record: null };
  }
  checks.push({
    rule: 'data_class',
    result: 'pass',
    detail: `Matches source class "${source.sourceClass}".`,
  });

  const actual = sha256Hex(r.content);
  const integrityOk = actual === r.sha256;
  checks.push(
    integrityOk
      ? { rule: 'integrity', result: 'pass', detail: 'Content hash matches the declared SHA-256.' }
      : {
          rule: 'integrity',
          result: 'fail',
          detail: `Declared ${r.sha256.slice(0, 12)}…, computed ${actual.slice(0, 12)}…. Content altered or corrupted.`,
        },
  );

  const retrieved = new Date(r.retrievedAt);
  const event = r.eventTime ? new Date(r.eventTime) : null;
  const tolerance = 5 * 60_000;
  const timeOk =
    retrieved.getTime() <= now.getTime() + tolerance &&
    (!event || event.getTime() <= retrieved.getTime() + tolerance);
  checks.push(
    timeOk
      ? {
          rule: 'timestamps',
          result: 'pass',
          detail: 'Event time precedes retrieval; retrieval not in the future.',
        }
      : {
          rule: 'timestamps',
          result: 'fail',
          detail: 'Event time after retrieval, or retrieval in the future.',
        },
  );

  if (!integrityOk || !timeOk) {
    return {
      externalId,
      outcome: 'quarantined',
      checks,
      rationale: 'Integrity or time checks failed; held for review and excluded from analysis.',
      record: r,
    };
  }

  const sameId = held.filter((h) => h.externalId === r.externalId);
  if (sameId.some((h) => h.sha256 === r.sha256)) {
    checks.push({ rule: 'duplicate', result: 'fail', detail: 'Identical record already held.' });
    return {
      externalId,
      outcome: 'duplicate',
      checks,
      rationale: 'Already ingested; nothing stored.',
      record: null,
    };
  }

  let warn = false;
  if (sameId.length > 0) {
    warn = true;
    checks.push({
      rule: 'duplicate',
      result: 'warn',
      detail: 'Known record with different content: stored as a new version; earlier version preserved.',
    });
  } else {
    checks.push({ rule: 'duplicate', result: 'pass', detail: 'No prior version held.' });
  }

  if (source.freshnessLimitHours !== null) {
    const ageHours = (now.getTime() - retrieved.getTime()) / 3_600_000;
    const fresh = ageHours <= source.freshnessLimitHours;
    if (!fresh) warn = true;
    checks.push({
      rule: 'freshness',
      result: fresh ? 'pass' : 'warn',
      detail: fresh
        ? `Retrieved ${ageHours.toFixed(1)} h ago (limit ${source.freshnessLimitHours} h).`
        : `Retrieved ${ageHours.toFixed(1)} h ago, past the ${source.freshnessLimitHours} h limit.`,
    });
  } else {
    checks.push({ rule: 'freshness', result: 'pass', detail: 'Dated snapshot; no freshness limit applies.' });
  }

  return {
    externalId,
    outcome: warn ? 'warned' : 'accepted',
    checks,
    rationale: warn ? 'Stored with a visible qualification.' : 'Passed all checks.',
    record: r,
  };
}
