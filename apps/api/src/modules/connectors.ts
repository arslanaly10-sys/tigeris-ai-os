/**
 * Connector registry and ingestion routes (FR-06, FR-07, FR-10). Administrators register connectors (each with its
 * own source, pending approval), approve sources, test connections, schedule syncs and import files. Everyone reads
 * within their clearance. Credentials are referenced by environment-variable name only.
 */
import {
  CONNECTION_SUPPORT,
  CONNECTION_TYPES,
  AUTH_TYPES,
  DATASETS,
  SECTOR_KEYS,
  SENSITIVITIES,
  TABULAR_DATASETS,
  templateCsv,
  type ConnectorItem,
  type ConnectorRunDetail,
  type ConnectorRunItem,
  type DataQualitySummary,
  type DatasetQuality,
  type QualityStatus,
  type RecordMode,
  type ConnectionType,
  type Dataset,
  type Role,
  type SectorKey,
  type Sensitivity,
  type SourceClass,
} from '@tigeris/shared';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { appendAudit } from '../audit/audit';
import { ADAPTERS } from '../connectors/adapters';
import { ingestUpload, nextKey } from '../connectors/ingest';
import { UploadError } from '../connectors/parse';
import { syncConnector } from '../connectors/sync';
import { withInstitution, type Tx } from '../db/client';
import {
  connectorRuns,
  connectors,
  ddRecords,
  documents,
  managers,
  positions,
  principals,
  rowIssues,
  sources,
  uploadedFiles,
  validationRuns,
} from '../db/schema';
import { ctxOf, requireSession, type AppDeps, type RequestContext } from './context';
import { listSources } from './sources';

const ADMIN: Role = 'administrator';
const KEY = /^[A-Z0-9-]{2,40}$/;
/** Five-field cron, minute resolution, no more often than every 15 minutes. */
const CRON =
  /^(\*\/(1[5-9]|[2-5]\d)|[0-5]?\d)\s+(\*|\*\/\d+|\d{1,2})\s+(\*|\d{1,2})\s+(\*|\d{1,2})\s+(\*|[0-6])$/;

const isAdmin = (ctx: RequestContext) => ctx.roles.includes(ADMIN);

type ConnectorRow = typeof connectors.$inferSelect;

async function toItems(tx: Tx, rows: ConnectorRow[]): Promise<ConnectorItem[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [srcs, runs] = await Promise.all([
    tx
      .select()
      .from(sources)
      .where(
        inArray(
          sources.id,
          rows.map((r) => r.sourceId),
        ),
      ),
    tx
      .select({
        connectorId: connectorRuns.connectorId,
        key: connectorRuns.key,
        status: connectorRuns.status,
        n: sql<number>`count(*) over (partition by ${connectorRuns.connectorId})::int`,
      })
      .from(connectorRuns)
      .where(inArray(connectorRuns.connectorId, ids))
      .orderBy(desc(connectorRuns.startedAt)),
  ]);
  return rows.map((c) => {
    const src = srcs.find((s) => s.id === c.sourceId)!;
    const last = runs.find((r) => r.connectorId === c.id);
    return {
      id: c.id,
      key: c.key,
      provider: c.provider,
      name: c.name,
      connectionType: c.connectionType as ConnectionType,
      support: CONNECTION_SUPPORT[c.connectionType as ConnectionType],
      authType: c.authType as ConnectorItem['authType'],
      authRef: c.authRef,
      credentialPresent: c.authRef ? Boolean(process.env[c.authRef]) : null,
      endpoint: c.endpoint,
      datasets: c.datasets as Dataset[],
      sectorKey: (c.sectorKey as SectorKey | null) ?? null,
      classification: c.classification as Sensitivity,
      schedule: c.schedule,
      status: c.status as ConnectorItem['status'],
      schemaVersion: c.schemaVersion,
      mappingVersion: c.mappingVersion,
      source: {
        key: src.key,
        approvalStatus: src.approvalStatus as ConnectorItem['source']['approvalStatus'],
        sourceClass: src.sourceClass as SourceClass,
      },
      lastSuccessAt: c.lastSuccessAt?.toISOString() ?? null,
      lastError: c.lastError,
      lastErrorAt: c.lastErrorAt?.toISOString() ?? null,
      retryCount: c.retryCount,
      nextRetryAt: c.nextRetryAt?.toISOString() ?? null,
      readOnly: true,
      runs: {
        total: last?.n ?? 0,
        lastKey: last?.key ?? null,
        lastStatus: (last?.status as ConnectorRunItem['status']) ?? null,
      },
      createdAt: c.createdAt.toISOString(),
    };
  });
}

function toRun(
  r: typeof connectorRuns.$inferSelect,
  connectorKey: string,
  file: typeof uploadedFiles.$inferSelect | null,
  actor: string | null,
): ConnectorRunItem {
  return {
    id: r.id,
    key: r.key,
    connectorKey,
    dataset: r.dataset as Dataset,
    trigger: r.trigger as ConnectorRunItem['trigger'],
    status: r.status as ConnectorRunItem['status'],
    file: file
      ? { name: file.originalName, mediaType: file.mediaType, sizeBytes: file.sizeBytes, sha256: file.sha256 }
      : null,
    rowsTotal: r.rowsTotal,
    rowsAccepted: r.rowsAccepted,
    rowsWarned: r.rowsWarned,
    rowsRejected: r.rowsRejected,
    mappingVersion: r.mappingVersion,
    error: r.error,
    actor,
    startedAt: r.startedAt.toISOString(),
    finishedAt: r.finishedAt?.toISOString() ?? null,
  };
}

const registerBody = z.object({
  provider: z.string().trim().min(2).max(120),
  name: z.string().trim().min(2).max(160),
  connectionType: z.enum(CONNECTION_TYPES),
  authType: z.enum(AUTH_TYPES),
  authRef: z
    .string()
    .trim()
    .regex(
      /^[A-Z][A-Z0-9_]{2,63}$/,
      'Name an environment variable (A–Z, 0–9, underscore), never a secret value.',
    )
    .optional()
    .nullable(),
  endpoint: z.string().trim().url().max(500).optional().nullable(),
  datasets: z.array(z.enum(DATASETS)).min(1).max(DATASETS.length),
  sectorKey: z.enum(SECTOR_KEYS).optional().nullable(),
  classification: z.enum(SENSITIVITIES),
  sourceClass: z.enum(['public', 'third_party', 'licensed', 'client']),
  termsRef: z.string().trim().max(300).optional().nullable(),
  schedule: z.string().trim().regex(CRON).optional().nullable(),
});

export async function connectorRoutes(app: FastifyInstance, deps: AppDeps) {
  const guard = { preHandler: requireSession(deps) };
  const keyParam = z.object({ key: z.string().regex(KEY) });
  // Administrators manage connector configuration, so they see every connector's metadata; the records a connector
  // brings in stay within each reader's clearance. Everyone else sees connectors within their clearance.
  const scoped = (ctx: RequestContext) =>
    isAdmin(ctx)
      ? sql`true`
      : ctx.scope.sensitivities.length
        ? inArray(connectors.classification, ctx.scope.sensitivities)
        : sql`false`;

  app.get('/api/connectors', guard, async (request): Promise<ConnectorItem[]> => {
    const ctx = ctxOf(request);
    return withInstitution(deps.db, ctx.institutionId, async (tx) =>
      toItems(tx, await tx.select().from(connectors).where(scoped(ctx)).orderBy(asc(connectors.key))),
    );
  });

  app.post('/api/connectors', guard, async (request, reply) => {
    const ctx = ctxOf(request);
    if (!isAdmin(ctx)) return reply.code(403).send({ error: 'not_permitted' });
    const body = registerBody.safeParse(request.body);
    if (!body.success)
      return reply.code(400).send({
        error: 'invalid_request',
        fields: body.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    const b = body.data;
    if (b.authType !== 'none' && !b.authRef)
      return reply.code(400).send({
        error: 'invalid_request',
        fields: [
          { path: 'authRef', message: 'A credential reference is required for this authentication type.' },
        ],
      });
    if ((b.connectionType === 'rest' || b.connectionType === 'rss') && !b.endpoint)
      return reply.code(400).send({
        error: 'invalid_request',
        fields: [{ path: 'endpoint', message: 'An https endpoint is required.' }],
      });
    if (b.schedule && !(b.connectionType === 'rest' || b.connectionType === 'rss'))
      return reply.code(400).send({
        error: 'invalid_request',
        fields: [{ path: 'schedule', message: 'Only remote connectors can be scheduled.' }],
      });

    const created = await withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const now = new Date();
      const key = await nextKey(tx, connectors, 'CON', now);
      const [src] = await tx
        .insert(sources)
        .values({
          institutionId: ctx.institutionId,
          key: key.toLowerCase(),
          publisher: b.provider,
          title: b.name,
          sourceClass: b.sourceClass,
          url: b.endpoint ?? null,
          termsRef: b.termsRef ?? null,
          allowedPurpose: 'Institutional analysis (registered connector)',
          cadence: b.schedule ?? 'On import',
          freshnessLimitHours: null,
          approvalStatus: 'pending',
        })
        .returning({ id: sources.id });
      const [row] = await tx
        .insert(connectors)
        .values({
          institutionId: ctx.institutionId,
          key,
          provider: b.provider,
          name: b.name,
          connectionType: b.connectionType,
          authType: b.authType,
          authRef: b.authRef ?? null,
          endpoint: b.endpoint ?? null,
          datasets: b.datasets,
          sectorKey: b.sectorKey ?? null,
          classification: b.classification,
          schedule: b.schedule ?? null,
          status: 'configured',
          sourceId: src!.id,
          createdBy: ctx.principalId,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      await appendAudit(tx, {
        institutionId: ctx.institutionId,
        actorPrincipalId: ctx.principalId,
        actorType: 'human',
        action: 'connector.registered',
        objectType: 'connector',
        objectId: row!.id,
        payload: {
          key,
          connectionType: b.connectionType,
          datasets: b.datasets,
          classification: b.classification,
          authRef: b.authRef ?? null,
        },
      });
      return row!;
    });
    if (created.schedule && deps.jobs.enabled)
      await deps.jobs.scheduleConnector(
        { institutionId: ctx.institutionId, connectorId: created.id },
        created.schedule,
      );
    return reply.code(201).send({ key: created.key });
  });

  /** Source approval: until approved, nothing from the source can be ingested (TR-001). */
  app.post('/api/sources/:key/approve', guard, async (request, reply) => {
    const ctx = ctxOf(request);
    if (!isAdmin(ctx)) return reply.code(403).send({ error: 'not_permitted' });
    const params = z.object({ key: z.string().regex(/^[a-z0-9-]{2,60}$/) }).safeParse(request.params);
    if (!params.success) return reply.code(404).send({ error: 'not_found' });
    const ok = await withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const [src] = await tx.select().from(sources).where(eq(sources.key, params.data.key)).for('update');
      if (!src) return 404;
      if (src.approvalStatus === 'approved') return 409;
      await tx.update(sources).set({ approvalStatus: 'approved' }).where(eq(sources.id, src.id));
      await appendAudit(tx, {
        institutionId: ctx.institutionId,
        actorPrincipalId: ctx.principalId,
        actorType: 'human',
        action: 'source.approved',
        objectType: 'source',
        objectId: src.id,
        payload: { key: src.key, publisher: src.publisher },
      });
      return 200;
    });
    if (ok !== 200) return reply.code(ok).send({ error: ok === 404 ? 'not_found' : 'already_approved' });
    return { ok: true };
  });

  app.post('/api/connectors/:key/test', guard, async (request, reply) => {
    const ctx = ctxOf(request);
    if (!isAdmin(ctx)) return reply.code(403).send({ error: 'not_permitted' });
    const params = keyParam.safeParse(request.params);
    if (!params.success) return reply.code(404).send({ error: 'not_found' });
    const result = await withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const [c] = await tx
        .select()
        .from(connectors)
        .where(and(eq(connectors.key, params.data.key), scoped(ctx)));
      if (!c) return null;
      if (c.status === 'retired')
        return { status: 'retired' as const, message: 'Retired connectors are not tested.' };
      const t = await ADAPTERS[c.connectionType as ConnectionType].test({
        key: c.key,
        connectionType: c.connectionType as ConnectionType,
        authType: c.authType as ConnectorItem['authType'],
        authRef: c.authRef,
        endpoint: c.endpoint,
      });
      const now = new Date();
      // Testing never un-pauses a connector, and a configured status never overwrites `connected` evidence.
      const nextStatus =
        c.status === 'paused'
          ? 'paused'
          : t.status === 'configured' && c.status === 'sample'
            ? 'sample'
            : t.status;
      await tx
        .update(connectors)
        .set(
          t.status === 'failed'
            ? { status: nextStatus, lastError: t.message, lastErrorAt: now, updatedAt: now }
            : t.status === 'connected'
              ? { status: nextStatus, lastSuccessAt: now, lastError: null, retryCount: 0, updatedAt: now }
              : { status: nextStatus, updatedAt: now },
        )
        .where(eq(connectors.id, c.id));
      await appendAudit(tx, {
        institutionId: ctx.institutionId,
        actorPrincipalId: ctx.principalId,
        actorType: 'human',
        action: 'connector.tested',
        objectType: 'connector',
        objectId: c.id,
        payload: { key: c.key, result: t.status, message: t.message },
      });
      return t;
    });
    if (!result) return reply.code(404).send({ error: 'not_found' });
    return result;
  });

  app.post('/api/connectors/:key/status', guard, async (request, reply) => {
    const ctx = ctxOf(request);
    if (!isAdmin(ctx)) return reply.code(403).send({ error: 'not_permitted' });
    const params = keyParam.safeParse(request.params);
    const body = z.object({ status: z.enum(['paused', 'configured', 'retired']) }).safeParse(request.body);
    if (!params.success) return reply.code(404).send({ error: 'not_found' });
    if (!body.success) return reply.code(400).send({ error: 'invalid_request' });
    const out = await withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const [c] = await tx
        .select()
        .from(connectors)
        .where(and(eq(connectors.key, params.data.key), scoped(ctx)))
        .for('update');
      if (!c) return { code: 404 as const };
      if (c.status === 'retired') return { code: 409 as const };
      await tx
        .update(connectors)
        .set({ status: body.data.status, updatedAt: new Date() })
        .where(eq(connectors.id, c.id));
      await appendAudit(tx, {
        institutionId: ctx.institutionId,
        actorPrincipalId: ctx.principalId,
        actorType: 'human',
        action: 'connector.status_changed',
        objectType: 'connector',
        objectId: c.id,
        payload: { key: c.key, from: c.status, to: body.data.status },
      });
      return { code: 200 as const, c };
    });
    if (out.code !== 200)
      return reply.code(out.code).send({ error: out.code === 404 ? 'not_found' : 'retired' });
    if (body.data.status === 'configured' && out.c.schedule && deps.jobs.enabled)
      await deps.jobs.scheduleConnector(
        { institutionId: ctx.institutionId, connectorId: out.c.id },
        out.c.schedule,
      );
    if (body.data.status !== 'configured') await deps.jobs.unscheduleConnector(out.c.id);
    return { status: body.data.status };
  });

  app.post('/api/connectors/:key/sync', guard, async (request, reply) => {
    const ctx = ctxOf(request);
    if (!isAdmin(ctx)) return reply.code(403).send({ error: 'not_permitted' });
    const params = keyParam.safeParse(request.params);
    if (!params.success) return reply.code(404).send({ error: 'not_found' });
    const out = await withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const [c] = await tx
        .select()
        .from(connectors)
        .where(and(eq(connectors.key, params.data.key), scoped(ctx)))
        .for('update');
      if (!c) return { code: 404 as const };
      if (c.status === 'paused' || c.status === 'retired')
        return { code: 409 as const, error: `Connector is ${c.status}.` };
      if (!ADAPTERS[c.connectionType as ConnectionType].fetchItems)
        return { code: 409 as const, error: 'This connector imports files; use upload instead.' };
      return {
        code: 200 as const,
        result: await syncConnector(tx, ctx.institutionId, c, ctx.principalId, 'manual'),
      };
    });
    if (out.code !== 200)
      return reply.code(out.code).send({ error: out.code === 404 ? 'not_found' : out.error });
    return out.result;
  });

  /** File import: multipart with a `dataset` field and one file (CSV, XLSX, JSON, PDF, DOCX or TXT). */
  app.post('/api/connectors/:key/uploads', guard, async (request, reply) => {
    const ctx = ctxOf(request);
    if (!isAdmin(ctx)) return reply.code(403).send({ error: 'not_permitted' });
    const params = keyParam.safeParse(request.params);
    if (!params.success) return reply.code(404).send({ error: 'not_found' });
    let dataset: string | null = null;
    let fileName = '';
    let bytes: Buffer | null = null;
    try {
      for await (const part of request.parts()) {
        if (part.type === 'field' && part.fieldname === 'dataset') dataset = String(part.value);
        else if (part.type === 'file') {
          fileName = part.filename;
          bytes = await part.toBuffer();
        }
      }
    } catch (e) {
      const tooBig = (e as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE';
      return reply.code(tooBig ? 413 : 400).send({ error: tooBig ? 'too_large' : 'invalid_upload' });
    }
    const ds = z.enum(DATASETS).safeParse(dataset);
    if (!ds.success || !bytes)
      return reply.code(400).send({ error: 'invalid_upload', message: 'Send a dataset and one file.' });
    try {
      const out = await withInstitution(deps.db, ctx.institutionId, async (tx) => {
        const [c] = await tx
          .select()
          .from(connectors)
          .where(and(eq(connectors.key, params.data.key), scoped(ctx)))
          .for('update');
        if (!c) return null;
        if (c.status === 'paused' || c.status === 'retired')
          throw new UploadError('connector_inactive', `Connector is ${c.status}.`);
        if (!(c.connectionType === 'file' || c.connectionType === 'document'))
          throw new UploadError('not_file_connector', 'Only file and document connectors accept uploads.');
        return ingestUpload(tx, ctx, c, ds.data, fileName, bytes!);
      });
      if (!out) return reply.code(404).send({ error: 'not_found' });
      return reply.code(201).send(out);
    } catch (e) {
      if (e instanceof UploadError)
        return reply.code(e.code === 'too_large' ? 413 : 422).send({ error: e.code, message: e.message });
      throw e;
    }
  });

  app.get('/api/connector-runs', guard, async (request): Promise<ConnectorRunItem[]> => {
    const ctx = ctxOf(request);
    const q = z.object({ connector: z.string().regex(KEY).optional() }).safeParse(request.query);
    const connector = q.success ? q.data.connector : undefined;
    return withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const rows = await tx
        .select({ r: connectorRuns, ck: connectors.key, f: uploadedFiles, actor: principals.displayName })
        .from(connectorRuns)
        .innerJoin(connectors, eq(connectors.id, connectorRuns.connectorId))
        .leftJoin(uploadedFiles, eq(uploadedFiles.id, connectorRuns.fileId))
        .leftJoin(principals, eq(principals.id, connectorRuns.actorId))
        .where(and(scoped(ctx), connector ? eq(connectors.key, connector) : undefined))
        .orderBy(desc(connectorRuns.startedAt))
        .limit(100);
      return rows.map((x) => toRun(x.r, x.ck, x.f, x.actor));
    });
  });

  app.get('/api/connector-runs/:key', guard, async (request, reply) => {
    const ctx = ctxOf(request);
    const params = keyParam.safeParse(request.params);
    if (!params.success) return reply.code(404).send({ error: 'not_found' });
    const detail = await withInstitution(
      deps.db,
      ctx.institutionId,
      async (tx): Promise<ConnectorRunDetail | null> => {
        const [x] = await tx
          .select({ r: connectorRuns, ck: connectors.key, f: uploadedFiles, actor: principals.displayName })
          .from(connectorRuns)
          .innerJoin(connectors, eq(connectors.id, connectorRuns.connectorId))
          .leftJoin(uploadedFiles, eq(uploadedFiles.id, connectorRuns.fileId))
          .leftJoin(principals, eq(principals.id, connectorRuns.actorId))
          .where(and(eq(connectorRuns.key, params.data.key), scoped(ctx)));
        if (!x) return null;
        const issues = await tx
          .select()
          .from(rowIssues)
          .where(eq(rowIssues.runId, x.r.id))
          .orderBy(asc(rowIssues.rowNumber), asc(rowIssues.field));
        const keysOf = async (): Promise<string[]> => {
          const id = x.r.id;
          switch (x.r.dataset) {
            case 'positions':
              return (
                await tx
                  .select({ k: positions.key, a: positions.asOf })
                  .from(positions)
                  .where(eq(positions.runId, id))
              ).map((r) => `${r.k}@${r.a}`);
            case 'managers':
              return (await tx.select({ k: managers.key }).from(managers).where(eq(managers.runId, id))).map(
                (r) => r.k,
              );
            case 'due_diligence':
              return (
                await tx.select({ k: ddRecords.key }).from(ddRecords).where(eq(ddRecords.runId, id))
              ).map((r) => r.k);
            case 'documents':
              return (
                await tx.select({ k: documents.key }).from(documents).where(eq(documents.runId, id))
              ).map((r) => r.k);
            default:
              return [];
          }
        };
        return {
          ...toRun(x.r, x.ck, x.f, x.actor),
          issues: issues.map((i) => ({
            row: i.rowNumber,
            field: i.field,
            severity: i.severity as 'error' | 'warning',
            code: i.code,
            message: i.message,
          })),
          acceptedKeys: await keysOf(),
        };
      },
    );
    if (!detail) return reply.code(404).send({ error: 'not_found' });
    return detail;
  });

  /** Sample file for a tabular dataset: the header and two rows labelled as samples. */
  app.get('/api/templates/:dataset', guard, async (request, reply) => {
    const params = z.object({ dataset: z.enum(TABULAR_DATASETS) }).safeParse(request.params);
    if (!params.success) return reply.code(404).send({ error: 'not_found' });
    return reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="tigeris-${params.data.dataset}-sample.csv"`)
      .send(templateCsv(params.data.dataset));
  });

  /** Data-quality view (slice D): quality and mode per dataset within scope, connector health, runs, sources. */
  app.get('/api/data-quality', guard, async (request): Promise<DataQualitySummary> => {
    const ctx = ctxOf(request);
    const allowed = ctx.scope.sensitivities.length ? ctx.scope.sensitivities : ['__none__'];
    return withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const tally = async (
        dataset: DatasetQuality['dataset'],
        table: typeof positions | typeof managers | typeof ddRecords | typeof documents,
      ): Promise<DatasetQuality> => {
        const rows = await tx
          .select({ q: table.qualityStatus, m: table.recordMode, n: sql<number>`count(*)::int` })
          .from(table)
          .where(inArray(table.classification, allowed))
          .groupBy(table.qualityStatus, table.recordMode);
        const byQuality: Record<QualityStatus, number> = { valid: 0, warning: 0, quarantined: 0 };
        const byMode: Partial<Record<RecordMode, number>> = {};
        for (const r of rows) {
          byQuality[r.q as QualityStatus] += r.n;
          byMode[r.m as RecordMode] = (byMode[r.m as RecordMode] ?? 0) + r.n;
        }
        return { dataset, total: rows.reduce((a, r) => a + r.n, 0), byQuality, byMode };
      };
      const [datasets, conns, runRows, sourceList, quarantined] = await Promise.all([
        Promise.all([
          tally('positions', positions),
          tally('managers', managers),
          tally('due_diligence', ddRecords),
          tally('documents', documents),
        ]),
        tx.select().from(connectors).where(scoped(ctx)).orderBy(asc(connectors.key)),
        tx
          .select({ r: connectorRuns, ck: connectors.key, f: uploadedFiles, actor: principals.displayName })
          .from(connectorRuns)
          .innerJoin(connectors, eq(connectors.id, connectorRuns.connectorId))
          .leftJoin(uploadedFiles, eq(uploadedFiles.id, connectorRuns.fileId))
          .leftJoin(principals, eq(principals.id, connectorRuns.actorId))
          .where(scoped(ctx))
          .orderBy(desc(connectorRuns.startedAt)),
        listSources(tx),
        tx
          .select({ n: sql<number>`count(*)::int` })
          .from(validationRuns)
          .where(eq(validationRuns.outcome, 'quarantined')),
      ]);
      const count = (st: string) => runRows.filter((x) => x.r.status === st).length;
      return {
        datasets,
        connectors: conns
          .filter((c) => c.status === 'failed' || c.status === 'paused')
          .map((c) => ({
            key: c.key,
            name: c.name,
            status: c.status as DataQualitySummary['connectors'][number]['status'],
            lastError: c.lastError,
            lastErrorAt: c.lastErrorAt?.toISOString() ?? null,
          })),
        runs: {
          total: runRows.length,
          succeeded: count('succeeded'),
          partial: count('partial'),
          failed: count('failed'),
          rowsRejected: runRows.reduce((a, x) => a + x.r.rowsRejected, 0),
          rowsWarned: runRows.reduce((a, x) => a + x.r.rowsWarned, 0),
        },
        recentProblemRuns: runRows
          .filter((x) => x.r.status !== 'succeeded' || x.r.rowsWarned > 0)
          .slice(0, 10)
          .map((x) => toRun(x.r, x.ck, x.f, x.actor)),
        sources: {
          stale: sourceList.filter((s) => s.freshness === 'stale'),
          pending: sourceList.filter((s) => s.approvalStatus === 'pending'),
        },
        quarantinedPackageRecords: quarantined[0]?.n ?? 0,
      };
    });
  });
}
