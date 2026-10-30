/**
 * Oversight (slice H): expected-versus-observed outcome review (FR-31), the audit log viewer with chain
 * verification (FR-40), and role and workspace administration.
 *
 * Every write here is audited. Reads of case-linked records go through the same case scope as the rest of the API.
 */
import {
  METRICS,
  OUTCOME_REVIEW_VERSION,
  ROLES,
  SECTOR_KEYS,
  compareOutcome,
  formatScenarioValue,
  type AdminOverview,
  type AdminPrincipalItem,
  type AuditEventItem,
  type AuditPage,
  type AuditVerification,
  type EngineResult,
  type ExpectedFigure,
  type GovernanceCheck,
  type OutcomeFigure,
  type OutcomeReviewItem,
  type OutcomeReviewPayload,
  type OutcomeVerdict,
  type Role,
  type SectorKey,
} from '@tigeris/shared';
import { and, asc, desc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { appendAudit, hashAuditEvent } from '../audit/audit';
import { withInstitution, type Tx } from '../db/client';
import {
  auditEvents,
  caseEvents,
  cases,
  institutions,
  memoryEntries,
  outcomeReviews,
  principalRoles,
  principals,
  principalWorkspaces,
  scenarioRuns,
} from '../db/schema';
import { ctxOf, requireSession, type AppDeps, type RequestContext } from './context';
import { caseReadable } from './scope';

export const OUTCOME_ROLES: readonly Role[] = ['analyst', 'domain_expert'];
export const AUDIT_ROLES: readonly Role[] = ['auditor', 'administrator', 'executive'];
const has = (ctx: RequestContext, roles: readonly Role[]) => roles.some((r) => ctx.roles.includes(r));
const KEY = /^[A-Z0-9-]{3,40}$/;

// ───────────────────────────── Outcome review ─────────────────────────────

/** Expected figures of a memory entry, with their numeric range read back from the scenario run that produced them. */
async function figuresOf(tx: Tx, expected: ExpectedFigure[]): Promise<Omit<OutcomeFigure, 'reviews'>[]> {
  const runKeys = [...new Set(expected.map((e) => e.scenarioRunKey))];
  const runs = runKeys.length
    ? await tx.select().from(scenarioRuns).where(inArray(scenarioRuns.key, runKeys))
    : [];
  return expected.flatMap((e) => {
    const m = e.ref.match(/^scenario:(.+):metric:([a-z_]+):(\w+)$/);
    const run = runs.find((r) => r.key === e.scenarioRunKey);
    const def = METRICS.find((x) => x.key === m?.[2]);
    const values = (run?.outputs as { result?: EngineResult } | undefined)?.result?.metrics.find(
      (x) => x.key === m?.[2],
    )?.values[(m?.[3] ?? 'd90') as 'd90'];
    if (!m || !def || !values) return [];
    return [
      {
        ref: e.ref,
        label: e.label,
        unit: def.unit ?? '',
        decimals: def.decimals,
        expected: { low: values.low, central: values.central, high: values.high, display: e.display },
        scenarioRunKey: e.scenarioRunKey,
      },
    ];
  });
}

function reviewCheck(ctx: RequestContext): GovernanceCheck {
  return has(ctx, OUTCOME_ROLES)
    ? {
        allowed: true,
        reason: 'Record what was observed, with its source and date. Reviews are kept, never edited.',
      }
    : { allowed: false, reason: 'An Intelligence Analyst or Domain Expert records outcome reviews.' };
}

async function outcomePayload(
  tx: Tx,
  ctx: RequestContext,
  memoryKey: string,
): Promise<OutcomeReviewPayload | null> {
  const [row] = await tx
    .select({ m: memoryEntries, caseKey: cases.key })
    .from(memoryEntries)
    .innerJoin(cases, eq(cases.id, memoryEntries.caseId))
    .where(and(eq(memoryEntries.key, memoryKey), caseReadable(ctx.scope)));
  if (!row) return null;
  const figures = await figuresOf(tx, row.m.expected as ExpectedFigure[]);
  const reviews = await tx
    .select({ r: outcomeReviews, by: principals.displayName })
    .from(outcomeReviews)
    .innerJoin(principals, eq(principals.id, outcomeReviews.reviewerId))
    .where(eq(outcomeReviews.memoryId, row.m.id))
    .orderBy(desc(outcomeReviews.createdAt));
  const out: OutcomeFigure[] = figures.map((f) => ({
    ...f,
    reviews: reviews
      .filter((x) => x.r.figureRef === f.ref)
      .map(({ r, by }): OutcomeReviewItem => {
        const fmt = (n: number) => formatScenarioValue(n, f.unit, f.decimals);
        const variance = Number(r.variance);
        return {
          key: r.key,
          observedValue: Number(r.observedValue),
          observedDisplay: fmt(Number(r.observedValue)),
          observedOn: r.observedOn,
          source: r.source,
          sourceUrl: r.sourceUrl,
          variance,
          varianceDisplay: `${variance > 0 ? '+' : ''}${fmt(variance)}`,
          variancePct: r.variancePct === null ? null : Number(r.variancePct),
          withinRange: r.withinRange,
          verdict: r.verdict as OutcomeVerdict,
          note: r.note,
          version: r.version,
          reviewer: by,
          createdAt: r.createdAt.toISOString(),
        };
      }),
  }));
  const latest = out.map((f) => f.reviews[0]).filter((x) => x !== undefined);
  return {
    memoryKey: row.m.key,
    caseKey: row.caseKey,
    title: row.m.title,
    figures: out,
    canReview: reviewCheck(ctx),
    summary: {
      reviewed: latest.length,
      held: latest.filter((r) => r.verdict === 'held').length,
      missed: latest.filter((r) => r.verdict === 'missed').length,
      notComparable: latest.filter((r) => r.verdict === 'not_comparable').length,
      total: out.length,
    },
  };
}

async function nextKey(tx: Tx, now: Date) {
  const day = now.toISOString().slice(0, 10).replace(/-/g, '');
  const [r] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(outcomeReviews)
    .where(sql`${outcomeReviews.key} like ${'OUT-' + day + '-%'}`);
  return `OUT-${day}-${String((r?.n ?? 0) + 1).padStart(2, '0')}`;
}

// ───────────────────────────── Audit ─────────────────────────────

/** Recomputes every link and hash of the institution's chain from genesis (FR-40, TR-042). */
export async function verifyChain(tx: Tx, institutionId: string): Promise<AuditVerification> {
  const rows = await tx
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.institutionId, institutionId))
    .orderBy(asc(auditEvents.seq));
  let prev: string | null = null;
  for (const e of rows) {
    const body = {
      institutionId: e.institutionId,
      actorPrincipalId: e.actorPrincipalId,
      actorType: e.actorType,
      action: e.action,
      objectType: e.objectType,
      objectId: e.objectId,
      caseId: e.caseId,
      payload: e.payload,
      occurredAt: e.occurredAt.toISOString(),
    };
    const fail = (reason: string): AuditVerification => ({
      checked: rows.length,
      valid: false,
      brokenAt: e.seq,
      reason,
      headHash: rows.at(-1)?.hash ?? null,
      verifiedAt: new Date().toISOString(),
    });
    if (e.prevHash !== prev) return fail('The event does not link to the one before it.');
    if (hashAuditEvent(prev, body) !== e.hash) return fail('The event content does not match its hash.');
    prev = e.hash;
  }
  return {
    checked: rows.length,
    valid: true,
    brokenAt: null,
    reason: null,
    headHash: prev,
    verifiedAt: new Date().toISOString(),
  };
}

// ───────────────────────────── Administration ─────────────────────────────

function manageCheck(ctx: RequestContext): GovernanceCheck {
  return ctx.roles.includes('administrator')
    ? {
        allowed: true,
        reason:
          'Grant or revoke roles and sector workspaces with a reason. Your own access is changed by another administrator, so the institution always keeps one.',
      }
    : { allowed: false, reason: 'Only the Governance Administrator changes roles and workspaces.' };
}

async function adminPrincipals(tx: Tx): Promise<AdminPrincipalItem[]> {
  const ps = await tx.select().from(principals).orderBy(asc(principals.displayName));
  const rs = await tx.select().from(principalRoles);
  const ws = await tx.select().from(principalWorkspaces);
  return ps.map((p) => ({
    id: p.id,
    displayName: p.displayName,
    title: p.title,
    isDemo: p.isDemo,
    identity: p.isDemo ? 'Demonstration identity' : `${p.idpIssuer} · ${p.idpSubject}`,
    roles: rs.filter((r) => r.principalId === p.id).map((r) => r.role as Role),
    workspaces: ws.filter((w) => w.principalId === p.id).map((w) => w.sectorKey as SectorKey),
    createdAt: p.createdAt.toISOString(),
  }));
}

const reason = z.string().trim().min(10).max(500);

export async function oversightRoutes(app: FastifyInstance, deps: AppDeps) {
  const guard = { preHandler: requireSession(deps) };

  app.get('/api/memory/:key/outcomes', guard, async (request, reply) => {
    const p = z.object({ key: z.string().regex(KEY) }).safeParse(request.params);
    if (!p.success) return reply.code(404).send({ error: 'not_found' });
    const ctx = ctxOf(request);
    const out = await withInstitution(deps.db, ctx.institutionId, (tx) =>
      outcomePayload(tx, ctx, p.data.key),
    );
    if (!out) return reply.code(404).send({ error: 'not_found' });
    return out;
  });

  app.post('/api/memory/:key/outcomes', guard, async (request, reply) => {
    const p = z.object({ key: z.string().regex(KEY) }).safeParse(request.params);
    const body = z
      .object({
        figureRef: z.string().min(3).max(200),
        observedValue: z.number().finite(),
        observedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        source: z.string().trim().min(5).max(300),
        sourceUrl: z
          .string()
          .trim()
          .url()
          .regex(/^https:\/\//)
          .optional()
          .or(z.literal('').transform(() => undefined)),
        notComparable: z.boolean().default(false),
        note: z.string().trim().min(10).max(2000),
      })
      .safeParse(request.body);
    if (!p.success) return reply.code(404).send({ error: 'not_found' });
    if (!body.success) return reply.code(400).send({ error: 'invalid_review' });
    const ctx = ctxOf(request);
    const result = await withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const [row] = await tx
        .select({ m: memoryEntries })
        .from(memoryEntries)
        .innerJoin(cases, eq(cases.id, memoryEntries.caseId))
        .where(and(eq(memoryEntries.key, p.data.key), caseReadable(ctx.scope)));
      if (!row) return { status: 404 as const, error: 'not_found' };
      if (!has(ctx, OUTCOME_ROLES)) return { status: 403 as const, error: 'not_permitted' };
      const now = new Date();
      if (body.data.observedOn > now.toISOString().slice(0, 10))
        return { status: 400 as const, error: 'observed_in_future' };
      const figure = (await figuresOf(tx, row.m.expected as ExpectedFigure[])).find(
        (f) => f.ref === body.data.figureRef,
      );
      if (!figure) return { status: 400 as const, error: 'unknown_figure' };
      const c = compareOutcome(figure.expected, body.data.observedValue, body.data.notComparable);
      const key = await nextKey(tx, now);
      const [rev] = await tx
        .insert(outcomeReviews)
        .values({
          institutionId: ctx.institutionId,
          key,
          memoryId: row.m.id,
          caseId: row.m.caseId,
          figureRef: figure.ref,
          figureLabel: figure.label,
          unit: figure.unit,
          expectedLow: String(figure.expected.low),
          expectedCentral: String(figure.expected.central),
          expectedHigh: String(figure.expected.high),
          observedValue: String(body.data.observedValue),
          observedOn: body.data.observedOn,
          source: body.data.source,
          sourceUrl: body.data.sourceUrl ?? null,
          variance: String(c.variance),
          variancePct: c.variancePct === null ? null : String(c.variancePct),
          withinRange: c.withinRange,
          verdict: c.verdict,
          note: body.data.note,
          version: OUTCOME_REVIEW_VERSION,
          reviewerId: ctx.principalId,
          createdAt: now,
        })
        .returning({ id: outcomeReviews.id });
      await tx.insert(caseEvents).values({
        institutionId: ctx.institutionId,
        caseId: row.m.caseId,
        actorPrincipalId: ctx.principalId,
        eventType: 'outcome.reviewed',
        fromState: null,
        toState: null,
        rationale: `${key}: ${figure.label}, verdict ${c.verdict}. ${body.data.note}`,
        occurredAt: now,
      });
      await appendAudit(tx, {
        institutionId: ctx.institutionId,
        actorPrincipalId: ctx.principalId,
        actorType: 'human',
        action: 'outcome.reviewed',
        objectType: 'outcome_review',
        objectId: rev!.id,
        caseId: row.m.caseId,
        payload: {
          key,
          memory: p.data.key,
          figure: figure.ref,
          verdict: c.verdict,
          version: OUTCOME_REVIEW_VERSION,
        },
      });
      return { status: 201 as const, key, comparison: c };
    });
    if (result.status !== 201) return reply.code(result.status).send({ error: result.error });
    return reply.code(201).send({ key: result.key, comparison: result.comparison });
  });

  app.get('/api/audit', guard, async (request, reply): Promise<AuditPage | undefined> => {
    const ctx = ctxOf(request);
    if (!has(ctx, AUDIT_ROLES)) return reply.code(403).send({ error: 'not_permitted' });
    const q = z
      .object({
        before: z.coerce.number().int().positive().optional(),
        action: z
          .string()
          .regex(/^[a-z_.]{2,60}$/)
          .optional(),
        caseKey: z.string().regex(KEY).optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      })
      .safeParse(request.query);
    if (!q.success) return reply.code(400).send({ error: 'invalid_query' });
    const f = q.data;
    return withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const filters = and(
        f.before ? lt(auditEvents.seq, f.before) : undefined,
        f.action ? sql`${auditEvents.action} like ${f.action + '%'}` : undefined,
        f.caseKey ? eq(cases.key, f.caseKey) : undefined,
      );
      const rows = await tx
        .select({ e: auditEvents, actor: principals.displayName, caseKey: cases.key })
        .from(auditEvents)
        .leftJoin(principals, eq(principals.id, auditEvents.actorPrincipalId))
        .leftJoin(cases, eq(cases.id, auditEvents.caseId))
        .where(and(filters, or(isNull(auditEvents.caseId), caseReadable(ctx.scope))))
        .orderBy(desc(auditEvents.seq))
        .limit(f.limit + 1);
      const [{ n }] = (await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(auditEvents)
        .leftJoin(cases, eq(cases.id, auditEvents.caseId))
        .where(
          and(filters, sql`${auditEvents.caseId} is not null`, sql`not (${caseReadable(ctx.scope)})`),
        )) as [{ n: number }];
      const page = rows.slice(0, f.limit);
      return {
        events: page.map(({ e, actor, caseKey }): AuditEventItem => ({
          seq: e.seq,
          occurredAt: e.occurredAt.toISOString(),
          actor,
          actorType: e.actorType as AuditEventItem['actorType'],
          action: e.action,
          objectType: e.objectType,
          objectId: e.objectId,
          caseKey,
          payload: e.payload,
          hash: e.hash,
          prevHash: e.prevHash,
        })),
        nextBefore: rows.length > f.limit ? page.at(-1)!.e.seq : null,
        withheld: n,
      };
    });
  });

  app.post('/api/audit/verify', guard, async (request, reply) => {
    const ctx = ctxOf(request);
    if (!ctx.roles.includes('auditor') && !ctx.roles.includes('administrator'))
      return reply.code(403).send({ error: 'not_permitted' });
    return withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const v = await verifyChain(tx, ctx.institutionId);
      await appendAudit(tx, {
        institutionId: ctx.institutionId,
        actorPrincipalId: ctx.principalId,
        actorType: 'human',
        action: 'audit.verified',
        objectType: 'audit_chain',
        payload: { checked: v.checked, valid: v.valid, brokenAt: v.brokenAt, headHash: v.headHash },
      });
      return v;
    });
  });

  app.get('/api/admin', guard, async (request, reply): Promise<AdminOverview | undefined> => {
    const ctx = ctxOf(request);
    if (!ctx.roles.includes('administrator') && !ctx.roles.includes('auditor'))
      return reply.code(403).send({ error: 'not_permitted' });
    return withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const [inst] = await tx.select().from(institutions).where(eq(institutions.id, ctx.institutionId));
      return {
        institution: {
          key: inst!.key,
          name: inst!.name,
          isSynthetic: inst!.isSynthetic,
          createdAt: inst!.createdAt.toISOString(),
        },
        principals: await adminPrincipals(tx),
        canManage: manageCheck(ctx),
      };
    });
  });

  /**
   * Grant or revoke a role or a sector workspace. Separation of duties: never your own access. Because the actor is
   * an administrator who cannot remove themselves, the institution always keeps at least one administrator.
   */
  app.post('/api/admin/principals/:id/access', guard, async (request, reply) => {
    const p = z.object({ id: z.string().uuid() }).safeParse(request.params);
    const body = z
      .discriminatedUnion('kind', [
        z.object({ kind: z.literal('role'), role: z.enum(ROLES), grant: z.boolean(), reason }),
        z.object({
          kind: z.literal('workspace'),
          sectorKey: z.enum(SECTOR_KEYS),
          grant: z.boolean(),
          reason,
        }),
      ])
      .safeParse(request.body);
    if (!p.success) return reply.code(404).send({ error: 'not_found' });
    if (!body.success) return reply.code(400).send({ error: 'reason_required' });
    const ctx = ctxOf(request);
    if (!ctx.roles.includes('administrator')) return reply.code(403).send({ error: 'not_permitted' });
    if (p.data.id === ctx.principalId)
      return reply
        .code(409)
        .send({ error: 'own_access', reason: 'Another administrator must change your own access.' });
    const result = await withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const [target] = await tx.select().from(principals).where(eq(principals.id, p.data.id));
      if (!target) return { status: 404 as const, error: 'not_found' };
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'access:' + ctx.institutionId}))`);
      const b = body.data;
      if (b.kind === 'role') {
        const held = await tx
          .select()
          .from(principalRoles)
          .where(and(eq(principalRoles.principalId, target.id), eq(principalRoles.role, b.role)));
        if (b.grant === held.length > 0) return { status: 409 as const, error: 'no_change' };
        if (b.grant)
          await tx
            .insert(principalRoles)
            .values({ institutionId: ctx.institutionId, principalId: target.id, role: b.role });
        else
          await tx
            .delete(principalRoles)
            .where(and(eq(principalRoles.principalId, target.id), eq(principalRoles.role, b.role)));
      } else {
        const held = await tx
          .select()
          .from(principalWorkspaces)
          .where(
            and(
              eq(principalWorkspaces.principalId, target.id),
              eq(principalWorkspaces.sectorKey, b.sectorKey),
            ),
          );
        if (b.grant === held.length > 0) return { status: 409 as const, error: 'no_change' };
        if (b.grant)
          await tx
            .insert(principalWorkspaces)
            .values({ institutionId: ctx.institutionId, principalId: target.id, sectorKey: b.sectorKey });
        else
          await tx
            .delete(principalWorkspaces)
            .where(
              and(
                eq(principalWorkspaces.principalId, target.id),
                eq(principalWorkspaces.sectorKey, b.sectorKey),
              ),
            );
      }
      const what = b.kind === 'role' ? b.role : b.sectorKey;
      await appendAudit(tx, {
        institutionId: ctx.institutionId,
        actorPrincipalId: ctx.principalId,
        actorType: 'human',
        action: `admin.${b.kind}_${b.grant ? 'granted' : 'revoked'}`,
        objectType: 'principal',
        objectId: target.id,
        payload: { principal: target.displayName, [b.kind]: what, reason: b.reason },
      });
      return { status: 200 as const };
    });
    if (result.status !== 200) return reply.code(result.status).send({ error: result.error });
    return { ok: true };
  });

  /** Provision a person from the institution's identity provider. No password: sign-in stays with the IdP (FR-02). */
  app.post('/api/admin/principals', guard, async (request, reply) => {
    const body = z
      .object({
        displayName: z.string().trim().min(2).max(120),
        title: z.string().trim().min(2).max(120),
        idpSubject: z
          .string()
          .trim()
          .regex(/^[A-Za-z0-9@._:-]{3,200}$/),
        role: z.enum(ROLES),
        reason,
      })
      .safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_principal' });
    const ctx = ctxOf(request);
    if (!ctx.roles.includes('administrator')) return reply.code(403).send({ error: 'not_permitted' });
    const result = await withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const issuer = `urn:tigeris:idp:${ctx.institutionId}`;
      const [dup] = await tx
        .select({ id: principals.id })
        .from(principals)
        .where(and(eq(principals.idpIssuer, issuer), eq(principals.idpSubject, body.data.idpSubject)));
      if (dup) return { status: 409 as const, error: 'identity_exists' };
      const [p] = await tx
        .insert(principals)
        .values({
          institutionId: ctx.institutionId,
          displayName: body.data.displayName,
          title: body.data.title,
          idpIssuer: issuer,
          idpSubject: body.data.idpSubject,
          isDemo: false,
        })
        .returning({ id: principals.id });
      await tx
        .insert(principalRoles)
        .values({ institutionId: ctx.institutionId, principalId: p!.id, role: body.data.role });
      await appendAudit(tx, {
        institutionId: ctx.institutionId,
        actorPrincipalId: ctx.principalId,
        actorType: 'human',
        action: 'admin.principal_provisioned',
        objectType: 'principal',
        objectId: p!.id,
        payload: { principal: body.data.displayName, role: body.data.role, reason: body.data.reason },
      });
      return { status: 201 as const, id: p!.id };
    });
    if (result.status !== 201) return reply.code(result.status).send({ error: result.error });
    return reply.code(201).send({ id: result.id });
  });
}
