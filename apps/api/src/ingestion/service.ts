import type { SourceClass } from '@tigeris/shared';
import { eq } from 'drizzle-orm';
import { appendAudit, canonicalJson } from '../audit/audit';
import type { Tx } from '../db/client';
import { evidenceObjects, ingestionJobs, sources, validationRuns } from '../db/schema';
import {
  packageDecision,
  RULE_SET_VERSION,
  sha256Hex,
  validateRecord,
  type SnapshotPackage,
  type SourceContext,
} from './rules';

export interface IngestResult {
  jobId: string;
  status: 'completed' | 'rejected';
  duplicatePackage: boolean;
  counts: { accepted: number; warned: number; quarantined: number; rejected: number; duplicate: number };
}

/**
 * Ingests one snapshot package inside the caller's institution-scoped transaction (TR-001..TR-011, TR-017).
 * Every record gets a validation run with machine-readable checks; failures are kept with their reason.
 * The package hash makes ingestion idempotent: re-submitting the same package changes nothing.
 */
export async function ingestPackage(
  tx: Tx,
  institutionId: string,
  actorPrincipalId: string | null,
  pkg: SnapshotPackage,
  now = new Date(),
): Promise<IngestResult> {
  const packageSha256 = sha256Hex(canonicalJson(pkg));
  const [existing] = await tx
    .select({ id: ingestionJobs.id, status: ingestionJobs.status })
    .from(ingestionJobs)
    .where(eq(ingestionJobs.packageSha256, packageSha256));
  const zero = { accepted: 0, warned: 0, quarantined: 0, rejected: 0, duplicate: 0 };
  if (existing) {
    return {
      jobId: existing.id,
      status: existing.status as IngestResult['status'],
      duplicatePackage: true,
      counts: zero,
    };
  }

  const [src] = await tx.select().from(sources).where(eq(sources.key, pkg.sourceKey));
  const ctx: SourceContext | null = src
    ? {
        sourceClass: src.sourceClass as SourceClass,
        approvalStatus: src.approvalStatus as SourceContext['approvalStatus'],
        freshnessLimitHours: src.freshnessLimitHours,
      }
    : null;
  const gate = packageDecision(ctx);
  const counts = { ...zero };
  const runs: Omit<typeof validationRuns.$inferInsert, 'ingestionJobId'>[] = [];

  // Validate and admit evidence first; the job row is written once, with final counts (append-only).
  if (gate.result !== 'pass' || !src || !ctx) {
    counts.rejected = pkg.records.length;
    for (const raw of pkg.records) {
      const externalId =
        typeof (raw as { externalId?: unknown })?.externalId === 'string'
          ? (raw as { externalId: string }).externalId
          : '(missing id)';
      runs.push({
        institutionId,
        externalId,
        ruleSetVersion: RULE_SET_VERSION,
        checks: [gate],
        outcome: 'rejected',
        rationale: 'Package rejected: source gate failed.',
      });
    }
  } else {
    const held = await tx
      .select({ externalId: evidenceObjects.externalId, sha256: evidenceObjects.sha256 })
      .from(evidenceObjects)
      .where(eq(evidenceObjects.sourceId, src.id));

    for (const raw of pkg.records) {
      const d = validateRecord(raw, ctx, held, now);
      counts[d.outcome === 'duplicate' ? 'duplicate' : d.outcome] += 1;
      let evidenceId: string | null = null;
      if (d.record && (d.outcome === 'accepted' || d.outcome === 'warned' || d.outcome === 'quarantined')) {
        const versions = held.filter((h) => h.externalId === d.record!.externalId).length;
        const stale = d.checks.some((c) => c.rule === 'freshness' && c.result === 'warn');
        const status =
          d.outcome === 'quarantined'
            ? 'quarantined'
            : stale
              ? 'stale'
              : ctx.sourceClass === 'synthetic'
                ? 'validated'
                : 'unverified';
        const failed = d.checks.filter((c) => c.result === 'fail').map((c) => c.detail);
        const [ev] = await tx
          .insert(evidenceObjects)
          .values({
            institutionId,
            sourceId: src.id,
            externalId: d.record.externalId,
            title: d.record.title,
            summary: d.record.summary,
            eventTime: d.record.eventTime ? new Date(d.record.eventTime) : null,
            retrievedAt: new Date(d.record.retrievedAt),
            version: String(versions + 1),
            sha256: d.record.sha256,
            validationStatus: status,
            validationNote:
              d.outcome === 'quarantined'
                ? `Quarantined by ${RULE_SET_VERSION}: ${failed.join(' ')}`
                : status === 'unverified'
                  ? 'Passed ingestion checks; awaiting factual review.'
                  : d.rationale,
          })
          .returning({ id: evidenceObjects.id });
        evidenceId = ev!.id;
        held.push({ externalId: d.record.externalId, sha256: d.record.sha256 });
      }
      runs.push({
        institutionId,
        evidenceId,
        externalId: d.externalId,
        ruleSetVersion: RULE_SET_VERSION,
        checks: d.checks,
        outcome: d.outcome,
        rationale: d.rationale,
      });
    }
  }

  const status = gate.result === 'pass' ? 'completed' : 'rejected';
  const [job] = await tx
    .insert(ingestionJobs)
    .values({
      institutionId,
      sourceId: src?.id ?? null,
      packageId: pkg.packageId,
      packageSha256,
      ruleSetVersion: RULE_SET_VERSION,
      actorPrincipalId,
      status,
      acceptedCount: counts.accepted,
      warnedCount: counts.warned,
      quarantinedCount: counts.quarantined,
      // Duplicates store nothing new, so they count with rejections in the job summary.
      rejectedCount: counts.rejected + counts.duplicate,
      startedAt: now,
      completedAt: new Date(),
    })
    .returning({ id: ingestionJobs.id });
  const jobId = job!.id;
  if (runs.length) await tx.insert(validationRuns).values(runs.map((r) => ({ ...r, ingestionJobId: jobId })));

  await appendAudit(tx, {
    institutionId,
    actorPrincipalId,
    actorType: actorPrincipalId ? 'human' : 'service',
    action: 'ingestion.package_processed',
    objectType: 'ingestion_job',
    objectId: jobId,
    payload: {
      packageId: pkg.packageId,
      packageSha256,
      ruleSet: RULE_SET_VERSION,
      gate: gate.result,
      counts,
    },
  });

  return { jobId, status, duplicatePackage: false, counts };
}

/** Builds a fresh synthetic sample package (one clean record, one tampered) for demonstrations. */
export function sampleSyntheticPackage(now = new Date()): SnapshotPackage {
  const stamp = now.toISOString();
  const clean = `Illustrative vessel count snapshot generated ${stamp}.`;
  const tampered = `Illustrative berth occupancy snapshot generated ${stamp}.`;
  return {
    packageId: `demo-sample-${stamp}`,
    sourceKey: 'synthetic-signals',
    createdAt: stamp,
    records: [
      {
        externalId: `sample:vessel-count:${stamp}`,
        title: 'Illustrative vessel count snapshot',
        summary: 'Synthetic sample record; passes all checks.',
        content: clean,
        sha256: sha256Hex(clean),
        dataClass: 'synthetic',
        eventTime: new Date(now.getTime() - 3_600_000).toISOString(),
        retrievedAt: new Date(now.getTime() - 60_000).toISOString(),
      },
      {
        externalId: `sample:berth-occupancy:${stamp}`,
        title: 'Illustrative berth occupancy snapshot',
        summary: 'Synthetic sample record whose content no longer matches its declared hash.',
        content: tampered + ' [altered after hashing]',
        sha256: sha256Hex(tampered),
        dataClass: 'synthetic',
        eventTime: new Date(now.getTime() - 3_600_000).toISOString(),
        retrievedAt: new Date(now.getTime() - 60_000).toISOString(),
      },
    ],
  };
}
