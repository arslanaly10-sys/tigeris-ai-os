import { createHash } from 'node:crypto';
import { desc, eq, sql } from 'drizzle-orm';
import type { Tx } from '../db/client';
import { auditEvents } from '../db/schema';

export interface AuditInput {
  institutionId: string;
  actorPrincipalId: string | null;
  actorType: 'human' | 'service';
  action: string;
  objectType: string;
  objectId?: string | null;
  caseId?: string | null;
  payload?: Record<string, unknown>;
}

/** Key-sorted JSON so the hash survives jsonb storage, which does not preserve key order. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function hashAuditEvent(prevHash: string | null, body: Record<string, unknown>): string {
  return createHash('sha256')
    .update(`${prevHash ?? 'genesis'}|${canonicalJson(body)}`)
    .digest('hex');
}

function canonicalBody(e: AuditInput, occurredAt: string) {
  return {
    institutionId: e.institutionId,
    actorPrincipalId: e.actorPrincipalId,
    actorType: e.actorType,
    action: e.action,
    objectType: e.objectType,
    objectId: e.objectId ?? null,
    caseId: e.caseId ?? null,
    payload: e.payload ?? {},
    occurredAt,
  };
}

/**
 * Appends a hash-chained audit event inside the caller's institution-scoped transaction (FR-40, TR-042).
 * An advisory lock serialises writers per institution so the chain has no forks.
 * If this throws, the caller's transaction rolls back: protected mutations fail closed.
 */
export async function appendAudit(tx: Tx, e: AuditInput): Promise<string> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'audit:' + e.institutionId}))`);
  const [last] = await tx
    .select({ hash: auditEvents.hash })
    .from(auditEvents)
    .where(eq(auditEvents.institutionId, e.institutionId))
    .orderBy(desc(auditEvents.seq))
    .limit(1);
  const prevHash = last?.hash ?? null;
  const occurredAt = new Date().toISOString();
  const hash = hashAuditEvent(prevHash, canonicalBody(e, occurredAt));
  await tx.insert(auditEvents).values({
    institutionId: e.institutionId,
    actorPrincipalId: e.actorPrincipalId,
    actorType: e.actorType,
    action: e.action,
    objectType: e.objectType,
    objectId: e.objectId ?? null,
    caseId: e.caseId ?? null,
    payload: e.payload ?? {},
    occurredAt: new Date(occurredAt),
    prevHash,
    hash,
  });
  return hash;
}

/** Recomputes the chain for one institution; returns the seq of the first broken link, or null. */
export async function verifyAuditChain(tx: Tx, institutionId: string): Promise<number | null> {
  const rows = await tx
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.institutionId, institutionId))
    .orderBy(auditEvents.seq);
  let prev: string | null = null;
  for (const r of rows) {
    const body = canonicalBody(
      {
        institutionId: r.institutionId,
        actorPrincipalId: r.actorPrincipalId,
        actorType: r.actorType as AuditInput['actorType'],
        action: r.action,
        objectType: r.objectType,
        objectId: r.objectId,
        caseId: r.caseId,
        payload: r.payload,
      },
      r.occurredAt.toISOString(),
    );
    if (r.prevHash !== prev || hashAuditEvent(prev, body) !== r.hash) return r.seq;
    prev = r.hash;
  }
  return null;
}
