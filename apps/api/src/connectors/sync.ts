/**
 * Connector sync (read-only). Feed connectors fetch their items and record each new item as unverified evidence
 * from the connector's source plus a `new` signal in the inbox, labelled as a dated snapshot of the fetch — never
 * live. A connector becomes `connected` only when the fetch succeeds; failures keep the real error and back off.
 */
import { SECTOR_BY_KEY, MAPPING_VERSIONS, type SectorKey, type SignalType } from '@tigeris/shared';
import { createHash } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { appendAudit } from '../audit/audit';
import type { Tx } from '../db/client';
import { connectorRuns, connectors, evidenceObjects, signalEvidence, signals, sources } from '../db/schema';
import { ADAPTERS, type FeedItem } from './adapters';
import { nextKey } from './ingest';

type ConnectorRow = typeof connectors.$inferSelect;

const SIGNAL_TYPE: Partial<Record<SectorKey, SignalType>> = {
  energy: 'energy',
  supply_chain: 'supply_chain',
  utilities: 'energy',
};

/** Backoff after consecutive failures: 2, 4, 8 … minutes, at most one day. */
export const backoffMinutes = (failures: number) => Math.min(24 * 60, 2 ** Math.max(1, failures));

export interface SyncOutcome {
  status: 'succeeded' | 'failed';
  runKey: string;
  fetched: number;
  created: number;
  error: string | null;
}

export async function syncConnector(
  tx: Tx,
  institutionId: string,
  c: ConnectorRow,
  actorId: string | null,
  trigger: 'manual' | 'schedule',
): Promise<SyncOutcome> {
  const now = new Date();
  const adapter = ADAPTERS[c.connectionType as keyof typeof ADAPTERS];
  const runKey = await nextKey(tx, connectorRuns, 'RUN', now);
  const [run] = await tx
    .insert(connectorRuns)
    .values({
      institutionId,
      key: runKey,
      connectorId: c.id,
      dataset: 'signals',
      trigger,
      status: 'running',
      mappingVersion: MAPPING_VERSIONS.signals,
      actorId,
      startedAt: now,
    })
    .returning({ id: connectorRuns.id });

  let items: FeedItem[] = [];
  let error: string | null = null;
  if (!adapter.fetchItems) error = `${c.connectionType} connectors do not fetch items in this build.`;
  else {
    const [src] = await tx.select().from(sources).where(eq(sources.id, c.sourceId));
    if (src?.approvalStatus !== 'approved')
      error = "The connector's source is not approved; nothing can be ingested.";
    else
      try {
        items = await adapter.fetchItems({
          key: c.key,
          connectionType: c.connectionType as never,
          authType: c.authType as never,
          authRef: c.authRef,
          endpoint: c.endpoint,
        });
      } catch (e) {
        error = (e as Error).message;
      }
  }

  let created = 0;
  if (!error && items.length) {
    const keyed = items.map((i) => ({
      item: i,
      key: `FEED-${createHash('sha256').update(`${c.key}|${i.externalId}`).digest('hex').slice(0, 10).toUpperCase()}`,
    }));
    const existing = await tx
      .select({ key: signals.key })
      .from(signals)
      .where(
        inArray(
          signals.key,
          keyed.map((k) => k.key),
        ),
      );
    const seen = new Set(existing.map((e) => e.key));
    const sector = (c.sectorKey as SectorKey | null) ?? null;
    for (const { item, key } of keyed) {
      if (seen.has(key)) continue;
      const [ev] = await tx
        .insert(evidenceObjects)
        .values({
          institutionId,
          sourceId: c.sourceId,
          externalId: `${c.key}:${item.externalId}`.slice(0, 300),
          title: item.title.slice(0, 300),
          summary: item.summary || 'Feed item without a summary.',
          eventTime: item.publishedAt ? new Date(item.publishedAt) : null,
          retrievedAt: now,
          version: MAPPING_VERSIONS.signals,
          validationStatus: 'unverified',
          validationNote: `Fetched by connector ${c.key}; not corroborated.`,
        })
        .returning({ id: evidenceObjects.id });
      const [sig] = await tx
        .insert(signals)
        .values({
          institutionId,
          key,
          title: item.title.slice(0, 300),
          summary: `${item.summary.slice(0, 400) || 'Feed item.'} (Fetched from ${c.provider}; unverified.)`,
          domain: sector ? SECTOR_BY_KEY[sector].domains[0]! : 'Institutional',
          urgency: 'routine',
          dataMode: 'snapshot',
          disposition: 'new',
          detectedAt: item.publishedAt ? new Date(item.publishedAt) : now,
          signalType: (sector && SIGNAL_TYPE[sector]) || 'institutional',
          confidenceBand: 'insufficient',
        })
        .returning({ id: signals.id });
      await tx.insert(signalEvidence).values({ institutionId, signalId: sig!.id, evidenceId: ev!.id });
      created += 1;
    }
  }

  const done = new Date();
  await tx
    .update(connectorRuns)
    .set({
      status: error ? 'failed' : 'succeeded',
      rowsTotal: items.length,
      rowsAccepted: created,
      error,
      finishedAt: done,
    })
    .where(eq(connectorRuns.id, run!.id));
  const failures = error ? c.retryCount + 1 : 0;
  await tx
    .update(connectors)
    .set(
      error
        ? {
            status: c.status === 'paused' || c.status === 'retired' ? c.status : 'failed',
            lastError: error,
            lastErrorAt: done,
            retryCount: failures,
            nextRetryAt: new Date(done.getTime() + backoffMinutes(failures) * 60_000),
            updatedAt: done,
          }
        : { status: 'connected', lastSuccessAt: done, retryCount: 0, nextRetryAt: null, updatedAt: done },
    )
    .where(eq(connectors.id, c.id));
  await appendAudit(tx, {
    institutionId,
    actorPrincipalId: actorId,
    actorType: actorId ? 'human' : 'service',
    action: 'connector.sync',
    objectType: 'connector_run',
    objectId: run!.id,
    payload: { connector: c.key, run: runKey, trigger, fetched: items.length, created, error },
  });
  return { status: error ? 'failed' : 'succeeded', runKey, fetched: items.length, created, error };
}
