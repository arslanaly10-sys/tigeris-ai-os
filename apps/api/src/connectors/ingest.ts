/**
 * File ingestion (FR-10, TR-061): one upload becomes one connector run. Rows are validated against the dataset's
 * versioned mapping; accepted rows become canonical records with provenance, rejected rows are kept as row-level
 * issues, and the run, the connector and the audit chain record what happened. Nothing is accepted from an
 * unapproved source (TR-001).
 */
import {
  MAPPING_VERSIONS,
  TABULAR_DATASETS,
  validateRows,
  type CleanValue,
  type Dataset,
  type RowIssue,
  type TabularDataset,
} from '@tigeris/shared';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { appendAudit } from '../audit/audit';
import type { Tx } from '../db/client';
import {
  connectorRuns,
  connectors,
  ddRecords,
  documents,
  managers,
  positions,
  rowIssues,
  sources,
  uploadedFiles,
} from '../db/schema';
import type { RequestContext } from '../modules/context';
import {
  DOCUMENT_KINDS,
  extractDocument,
  MEDIA_TYPES,
  parseTabular,
  sniff,
  TABULAR_KINDS,
  UploadError,
} from './parse';
import { storeUpload } from './storage';

type ConnectorRow = typeof connectors.$inferSelect;

export interface IngestOutcome {
  status: 'succeeded' | 'partial' | 'failed';
  runKey: string;
  rowsTotal: number;
  rowsAccepted: number;
  rowsWarned: number;
  rowsRejected: number;
  error: string | null;
}

export async function nextKey(
  tx: Tx,
  table: typeof connectorRuns | typeof documents | typeof connectors,
  prefix: string,
  now: Date,
) {
  const day = now.toISOString().slice(0, 10).replace(/-/g, '');
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(table)
    .where(sql`${table.key} like ${`${prefix}-${day}-%`}`);
  return `${prefix}-${day}-${String((row?.n ?? 0) + 1).padStart(2, '0')}`;
}

const str = (v: CleanValue | undefined) => (typeof v === 'string' ? v : null);

/** Inserts accepted rows; rows that clash with existing records become errors instead. */
async function insertRecords(
  tx: Tx,
  ctx: RequestContext,
  c: ConnectorRow,
  dataset: TabularDataset,
  runId: string,
  fileSha: string,
  candidates: { row: number; values: Record<string, CleanValue>; issues: RowIssue[] }[],
): Promise<{ accepted: string[]; clashes: RowIssue[] }> {
  const prov = (row: number, warned: boolean) => ({
    institutionId: ctx.institutionId,
    sourceId: c.sourceId,
    sourceRecordId: `${c.key}:${fileSha.slice(0, 12)}:row${row}`,
    recordMode: 'imported',
    classification: c.classification,
    mappingVersion: MAPPING_VERSIONS[dataset],
    qualityStatus: warned ? 'warning' : 'valid',
    connectorId: c.id,
    runId,
  });
  const accepted: string[] = [];
  const clashes: RowIssue[] = [];
  const clash = (row: number, field: string, code: string, message: string) =>
    clashes.push({ row, field, severity: 'error', code, message });

  if (dataset === 'positions') {
    const existing = await tx
      .select({ key: positions.key, asOf: positions.asOf })
      .from(positions)
      .where(
        inArray(
          positions.key,
          candidates.map((r) => str(r.values.key)!),
        ),
      );
    const taken = new Set(existing.map((e) => `${e.key}|${e.asOf}`));
    for (const r of candidates) {
      const v = r.values;
      if (taken.has(`${v.key}|${v.as_of}`)) {
        clash(
          r.row,
          'key',
          'already_imported',
          `${v.key} as of ${v.as_of} already exists; positions are immutable.`,
        );
        continue;
      }
      await tx.insert(positions).values({
        ...prov(r.row, r.issues.length > 0),
        key: str(v.key)!,
        name: str(v.name)!,
        assetClass: str(v.asset_class)!,
        sectorKey: str(v.sector) ?? c.sectorKey,
        country: str(v.country),
        currency: str(v.currency)!,
        marketValue: String(v.market_value),
        navSharePct: String(v.nav_share_pct),
        routeDependent: v.route_dependent === true,
        asOf: str(v.as_of)!,
        qualityNotes: r.issues.map((i) => i.message),
      });
      accepted.push(`${v.key}@${v.as_of}`);
    }
  } else if (dataset === 'managers') {
    const existing = await tx
      .select({ key: managers.key })
      .from(managers)
      .where(
        inArray(
          managers.key,
          candidates.map((r) => str(r.values.key)!),
        ),
      );
    const taken = new Set(existing.map((e) => e.key));
    for (const r of candidates) {
      const v = r.values;
      if (taken.has(str(v.key)!)) {
        clash(r.row, 'key', 'already_imported', `Manager ${v.key} already exists.`);
        continue;
      }
      await tx.insert(managers).values({
        ...prov(r.row, r.issues.length > 0),
        key: str(v.key)!,
        name: str(v.name)!,
        strategy: str(v.strategy)!,
        domicile: str(v.domicile),
        sectorKey: str(v.sector) ?? c.sectorKey,
      });
      accepted.push(str(v.key)!);
    }
  } else {
    const keys = candidates.map((r) => str(r.values.manager_key)!);
    const mgrs = keys.length
      ? await tx
          .select({ id: managers.id, key: managers.key })
          .from(managers)
          .where(inArray(managers.key, keys))
      : [];
    const existing = await tx
      .select({ key: ddRecords.key })
      .from(ddRecords)
      .where(
        inArray(
          ddRecords.key,
          candidates.map((r) => str(r.values.key)!),
        ),
      );
    const taken = new Set(existing.map((e) => e.key));
    for (const r of candidates) {
      const v = r.values;
      const mgr = mgrs.find((m) => m.key === v.manager_key);
      if (!mgr) {
        clash(
          r.row,
          'manager_key',
          'unknown_reference',
          `No manager with key ${v.manager_key}; import managers first.`,
        );
        continue;
      }
      if (taken.has(str(v.key)!)) {
        clash(r.row, 'key', 'already_imported', `Review ${v.key} already exists.`);
        continue;
      }
      await tx.insert(ddRecords).values({
        ...prov(r.row, r.issues.length > 0),
        key: str(v.key)!,
        managerId: mgr.id,
        reviewType: str(v.review_type)!,
        status: str(v.status)!,
        openIssues: typeof v.open_issues === 'number' ? v.open_issues : 0,
        summary: str(v.summary)!,
        reviewedOn: str(v.reviewed_on),
      });
      accepted.push(str(v.key)!);
    }
  }
  return { accepted, clashes };
}

export async function ingestUpload(
  tx: Tx,
  ctx: RequestContext,
  c: ConnectorRow,
  dataset: Dataset,
  fileName: string,
  bytes: Buffer,
): Promise<IngestOutcome> {
  const now = new Date();
  const [src] = await tx.select().from(sources).where(eq(sources.id, c.sourceId));
  if (src?.approvalStatus !== 'approved')
    throw new UploadError(
      'source_not_approved',
      "The connector's source is not approved; nothing can be ingested.",
    );
  if (!(c.datasets as string[]).includes(dataset))
    throw new UploadError('dataset_not_configured', `This connector is not configured for ${dataset}.`);

  const kind = sniff(fileName, bytes);
  const tabular = (TABULAR_DATASETS as readonly string[]).includes(dataset);
  if (tabular && !TABULAR_KINDS.includes(kind))
    throw new UploadError('wrong_kind', 'Tabular datasets accept CSV, XLSX or JSON files.');
  if (!tabular && !DOCUMENT_KINDS.includes(kind))
    throw new UploadError('wrong_kind', 'Documents accept PDF, DOCX or TXT files.');

  const stored = await storeUpload(ctx.institutionId, bytes, kind);
  const [file] = await tx
    .insert(uploadedFiles)
    .values({
      institutionId: ctx.institutionId,
      connectorId: c.id,
      originalName: fileName.slice(0, 200),
      mediaType: MEDIA_TYPES[kind],
      sizeBytes: bytes.length,
      sha256: stored.sha256,
      storagePath: stored.path,
      classification: c.classification,
      uploadedBy: ctx.principalId,
      uploadedAt: now,
    })
    .returning({ id: uploadedFiles.id });
  const runKey = await nextKey(tx, connectorRuns, 'RUN', now);
  const [run] = await tx
    .insert(connectorRuns)
    .values({
      institutionId: ctx.institutionId,
      key: runKey,
      connectorId: c.id,
      dataset,
      trigger: 'upload',
      fileId: file!.id,
      status: 'running',
      mappingVersion: MAPPING_VERSIONS[dataset],
      actorId: ctx.principalId,
      startedAt: now,
    })
    .returning({ id: connectorRuns.id });

  let outcome: Omit<IngestOutcome, 'runKey'>;
  let issues: { issue: RowIssue; raw: unknown }[] = [];
  let accepted: string[] = [];
  try {
    if (tabular) {
      const t = await parseTabular(kind, bytes);
      const v = validateRows(dataset as TabularDataset, t.headers, t.rows);
      issues = v.issues.map((i) => ({ issue: i, raw: { headers: t.headers } }));
      const candidates = v.rows.filter((r) => !r.issues.some((i) => i.severity === 'error'));
      for (const r of v.rows)
        for (const i of r.issues) issues.push({ issue: i, raw: t.rows[r.row - 2] ?? {} });
      const res = await insertRecords(
        tx,
        ctx,
        c,
        dataset as TabularDataset,
        run!.id,
        stored.sha256,
        candidates,
      );
      accepted = res.accepted;
      for (const i of res.clashes) issues.push({ issue: i, raw: t.rows[i.row - 2] ?? {} });
      const rejectedRows = new Set(
        issues.filter((x) => x.issue.severity === 'error' && x.issue.row > 1).map((x) => x.issue.row),
      );
      const warnedRows = new Set(
        issues
          .filter((x) => x.issue.severity === 'warning' && x.issue.row > 1 && !rejectedRows.has(x.issue.row))
          .map((x) => x.issue.row),
      );
      const total = v.missingColumns.length ? 0 : t.rows.length;
      const fileError = v.missingColumns.length
        ? `Required columns missing: ${v.missingColumns.join(', ')}.`
        : null;
      outcome = {
        status: fileError || accepted.length === 0 ? 'failed' : rejectedRows.size ? 'partial' : 'succeeded',
        rowsTotal: total,
        rowsAccepted: accepted.length,
        rowsWarned: warnedRows.size,
        rowsRejected: fileError ? 0 : rejectedRows.size,
        error: fileError ?? (accepted.length === 0 ? 'No rows passed validation.' : null),
      };
    } else {
      const doc = await extractDocument(kind, bytes);
      const key = await nextKey(tx, documents, 'DOC', now);
      const empty = doc.text.length === 0;
      if (empty)
        issues.push({
          issue: {
            row: 1,
            field: null,
            severity: 'warning',
            code: 'no_text',
            message: 'No extractable text: the document may be a scan.',
          },
          raw: {},
        });
      await tx.insert(documents).values({
        institutionId: ctx.institutionId,
        key,
        title: fileName.replace(/\.[^.]+$/, '').slice(0, 200),
        fileId: file!.id,
        pageCount: doc.pages,
        charCount: doc.text.length,
        excerpt: doc.text.slice(0, 600),
        fullText: doc.text,
        sectorKey: c.sectorKey,
        sourceId: c.sourceId,
        sourceRecordId: `${c.key}:${stored.sha256.slice(0, 12)}`,
        recordMode: 'imported',
        classification: c.classification,
        mappingVersion: MAPPING_VERSIONS.documents,
        qualityStatus: empty ? 'warning' : 'valid',
        connectorId: c.id,
        runId: run!.id,
      });
      accepted = [key];
      outcome = {
        status: 'succeeded',
        rowsTotal: 1,
        rowsAccepted: 1,
        rowsWarned: empty ? 1 : 0,
        rowsRejected: 0,
        error: null,
      };
    }
  } catch (e) {
    if (!(e instanceof UploadError)) throw e;
    outcome = {
      status: 'failed',
      rowsTotal: 0,
      rowsAccepted: 0,
      rowsWarned: 0,
      rowsRejected: 0,
      error: e.message,
    };
  }

  if (issues.length)
    await tx.insert(rowIssues).values(
      issues.map(({ issue, raw }) => ({
        institutionId: ctx.institutionId,
        runId: run!.id,
        rowNumber: issue.row,
        field: issue.field,
        severity: issue.severity,
        code: issue.code,
        message: issue.message,
        raw: raw as object,
      })),
    );
  const done = new Date();
  await tx
    .update(connectorRuns)
    .set({ ...outcome, finishedAt: done })
    .where(eq(connectorRuns.id, run!.id));
  await tx
    .update(connectors)
    .set(
      outcome.status === 'failed'
        ? { lastError: outcome.error, lastErrorAt: done, updatedAt: done }
        : { lastSuccessAt: done, updatedAt: done },
    )
    .where(and(eq(connectors.id, c.id)));
  await appendAudit(tx, {
    institutionId: ctx.institutionId,
    actorPrincipalId: ctx.principalId,
    actorType: 'human',
    action: 'connector.import',
    objectType: 'connector_run',
    objectId: run!.id,
    payload: {
      connector: c.key,
      run: runKey,
      dataset,
      file: { name: fileName, sha256: stored.sha256, bytes: bytes.length },
      status: outcome.status,
      accepted: outcome.rowsAccepted,
      rejected: outcome.rowsRejected,
    },
  });
  return { ...outcome, runKey };
}
