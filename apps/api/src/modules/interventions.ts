/**
 * Intervention engine and inbox (Phase 5B, FR-53, D-106, D-116). A sweep evaluates every approved watch rule against
 * what the institution currently records and keeps one live intervention per rule and subject: new findings are
 * raised, recurring ones refreshed, and ones whose condition has cleared are marked as cleared but left for a person
 * to close. The inbox shows each reader the interventions their scope allows, routed to their roles by default.
 */
import {
  INTERVENTION_ENGINE,
  INTERVENTION_STATUSES,
  LIVE_STATUSES,
  ROLES,
  SENSITIVITY_ORDER,
  WATCH_APPROVER_ROLES,
  WATCH_AUTHOR_ROLES,
  WATCH_KINDS,
  evaluateRule,
  evaluateWatchRule,
  type ClaimClass,
  type Finding,
  type InterventionInput,
  type InterventionItem,
  type InterventionInbox,
  type InterventionSeverity,
  type InterventionStatus,
  type Observations,
  type ReadScope,
  type Role,
  type RuleOperator,
  type RuleSeverity,
  type Sensitivity,
  type Urgency,
  type WatchKind,
  type WatchRuleItem,
} from '@tigeris/shared';
import { and, desc, eq, inArray, isNull, max, or, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { appendAudit } from '../audit/audit';
import { QUEUES } from '../jobs';
import { withInstitution, type Tx } from '../db/client';
import {
  cases,
  connectors,
  interventions,
  outcomeReviews,
  principals,
  semanticRules,
  signals,
  watchRules,
} from '../db/schema';
import { ctxOf, requireSession, type AppDeps, type RequestContext } from './context';
import { caseReadable } from './scope';
import { observer } from './semantic';

const has = (ctx: RequestContext, roles: readonly Role[]) => roles.some((r) => ctx.roles.includes(r));
/** The sweep sees everything in the institution; what each person sees is filtered when they read. */
const FULL_SCOPE: ReadScope = { sensitivities: [...SENSITIVITY_ORDER], sectors: null };

async function observe(tx: Tx, now: Date): Promise<Observations> {
  const [rules, sigs, conns, outs] = await Promise.all([
    tx.select().from(semanticRules).where(eq(semanticRules.status, 'approved')),
    tx.select().from(signals),
    tx.select().from(connectors),
    tx
      .select({ o: outcomeReviews, caseKey: cases.key, sensitivity: cases.sensitivity, sectorKey: cases.sectorKey })
      .from(outcomeReviews)
      .innerJoin(cases, eq(cases.id, outcomeReviews.caseId)),
  ]);
  const read = await observer(tx, FULL_SCOPE);
  const semantic: Observations['semantic'] = [];
  for (const r of rules) {
    const o = await read(r.subject);
    const spec = {
      operator: r.operator as RuleOperator,
      threshold: Number(r.threshold),
      severity: r.severity as RuleSeverity,
      attentionMargin: Number(r.attentionMargin),
    };
    semantic.push({
      ruleKey: r.key,
      ruleVersion: r.version,
      label: r.label,
      description: `${r.label}: ${r.subject} ${r.operator} ${Number(r.threshold)}${r.unit ? ` ${r.unit}` : ''}`,
      unit: r.unit,
      evaluation: { ...evaluateRule(spec, o.value), observedFrom: o.observedFrom, asOf: o.asOf, inputKeys: o.inputKeys },
      classification: o.classification,
      sectorKey: o.sectorKey,
      caseId: o.caseId,
    });
  }
  return {
    now: now.toISOString(),
    semantic,
    signals: sigs.map((s) => ({
      key: s.key,
      title: s.title,
      urgency: s.urgency as Urgency,
      disposition: s.disposition,
      detectedAt: s.detectedAt.toISOString(),
    })),
    connectors: conns.map((c) => ({
      key: c.key,
      name: c.name,
      status: c.status,
      schedule: c.schedule,
      lastSuccessAt: c.lastSuccessAt?.toISOString() ?? null,
      lastErrorAt: c.lastErrorAt?.toISOString() ?? null,
      lastError: c.lastError,
      classification: c.classification as Sensitivity,
      sectorKey: c.sectorKey,
    })),
    outcomes: outs.map(({ o, caseKey, sensitivity, sectorKey }) => ({
      key: o.key,
      caseId: o.caseId,
      caseKey,
      figureLabel: o.figureLabel,
      unit: o.unit,
      expectedLow: Number(o.expectedLow),
      expectedHigh: Number(o.expectedHigh),
      observedValue: Number(o.observedValue),
      observedOn: o.observedOn,
      verdict: o.verdict,
      classification: sensitivity as Sensitivity,
      sectorKey,
    })),
  };
}

async function nextKey(tx: Tx, now: Date, offset: number): Promise<string> {
  const day = now.toISOString().slice(0, 10).replace(/-/g, '');
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(interventions)
    .where(sql`${interventions.key} like ${'INT-' + day + '-%'}`);
  return `INT-${day}-${String((row?.n ?? 0) + 1 + offset).padStart(4, '0')}`;
}

export interface SweepResult {
  engine: string;
  rules: number;
  raised: number;
  refreshed: number;
  cleared: number;
}

/**
 * Runs every approved watch rule once. Deterministic over what is recorded; it writes interventions only, never
 * acts on anything, and never closes an intervention.
 */
export async function sweep(
  tx: Tx,
  institutionId: string,
  actorPrincipalId: string | null,
  now = new Date(),
): Promise<SweepResult> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'interventions:' + institutionId}))`);
  const rules = await tx.select().from(watchRules).where(eq(watchRules.status, 'approved'));
  const obs = await observe(tx, now);
  const live = await tx
    .select({ i: interventions, ruleKey: watchRules.key })
    .from(interventions)
    .innerJoin(watchRules, eq(watchRules.id, interventions.watchRuleId))
    .where(inArray(interventions.status, [...LIVE_STATUSES]));
  const result: SweepResult = { engine: INTERVENTION_ENGINE, rules: rules.length, raised: 0, refreshed: 0, cleared: 0 };
  const seen = new Set<string>();
  for (const rule of rules) {
    const findings: Finding[] = evaluateWatchRule(
      { key: rule.key, version: rule.version, kind: rule.kind as WatchKind, params: rule.params, severity: rule.severity as InterventionSeverity },
      obs,
    );
    for (const f of findings) {
      // One live intervention per rule key and subject, across versions of the rule.
      const existing = live.find((l) => l.ruleKey === rule.key && l.i.subjectRef === f.subjectRef);
      if (existing) {
        seen.add(existing.i.id);
        await tx
          .update(interventions)
          .set({
            severity: f.severity,
            title: f.title,
            detail: f.detail,
            inputs: f.inputs,
            lastSeenAt: now,
            conditionClearedAt: null,
          })
          .where(eq(interventions.id, existing.i.id));
        result.refreshed++;
      } else {
        await tx.insert(interventions).values({
          institutionId,
          key: await nextKey(tx, now, 0),
          watchRuleId: rule.id,
          engineVersion: INTERVENTION_ENGINE,
          subjectRef: f.subjectRef,
          severity: f.severity,
          title: f.title,
          detail: f.detail,
          inputs: f.inputs,
          routeRoles: rule.routeRoles,
          classification: f.classification,
          sectorKey: f.sectorKey,
          caseId: f.caseId,
          status: 'open',
          firstSeenAt: now,
          lastSeenAt: now,
        });
        result.raised++;
      }
    }
  }
  for (const l of live) {
    if (seen.has(l.i.id) || l.i.conditionClearedAt) continue;
    await tx.update(interventions).set({ conditionClearedAt: now }).where(eq(interventions.id, l.i.id));
    result.cleared++;
  }
  await appendAudit(tx, {
    institutionId,
    actorPrincipalId,
    actorType: actorPrincipalId ? 'human' : 'service',
    action: 'interventions.swept',
    objectType: 'intervention_engine',
    objectId: null,
    caseId: null,
    payload: { ...result },
  });
  return result;
}

/** What a reader may see. Case-linked interventions also follow the case's scope; callers left-join `cases`. */
function readable(scope: ReadScope) {
  if (!scope.sensitivities.length) return sql`false`;
  const clearance = inArray(interventions.classification, scope.sensitivities);
  const sector = scope.sectors
    ? or(isNull(interventions.sectorKey), inArray(interventions.sectorKey, scope.sectors))
    : undefined;
  return and(clearance, sector, or(isNull(interventions.caseId), caseReadable(scope)))!;
}

const textArray = (values: readonly string[]) =>
  sql`array[${sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  )}]::text[]`;

const Filter = z.object({
  status: z.enum(['live', ...INTERVENTION_STATUSES, 'all']).default('live'),
  mine: z.enum(['true', 'false']).default('true'),
});

const Act = z.object({
  action: z.enum(['acknowledge', 'resolve', 'dismiss']),
  reason: z.string().trim().max(1000).optional(),
});

const WatchBody = z.object({
  key: z.string().regex(/^W-[A-Z0-9-]{2,40}$/),
  label: z.string().trim().min(3).max(120),
  kind: z.enum(WATCH_KINDS),
  params: z.record(z.string(), z.unknown()).default({}),
  severity: z.enum(['breach', 'attention']),
  routeRoles: z.array(z.enum(ROLES)).min(1),
  rationale: z.string().trim().min(10).max(2000),
});

/** Parameters each kind accepts, checked before a draft is stored. */
const PARAMS: Record<WatchKind, z.ZodType> = {
  semantic: z.object({ statuses: z.array(z.enum(['attention', 'breach'])).min(1).optional() }).strict(),
  signal_untriaged: z
    .object({
      urgencies: z.array(z.enum(['critical', 'elevated', 'routine'])).min(1).optional(),
      maxHours: z.number().int().min(1).max(24 * 30).optional(),
    })
    .strict(),
  connector_stale: z.object({ maxDays: z.number().int().min(1).max(365).optional() }).strict(),
  decision_drift: z.object({}).strict(),
};

/** Background sweep every 15 minutes per institution, when jobs are on (D-116). */
export const SWEEP_CRON = '*/15 * * * *';

export async function interventionRoutes(app: FastifyInstance, deps: AppDeps) {
  const guard = { preHandler: requireSession(deps) };
  const scheduled = new Set<string>();
  if (deps.jobs.enabled)
    await deps.jobs.work(QUEUES.interventionSweep, async (data) => {
      const institutionId = String(data.institutionId);
      await withInstitution(deps.db, institutionId, (tx) => sweep(tx, institutionId, null));
    });
  /** The first read in each institution registers its schedule; the schedule itself is idempotent. */
  const ensureSchedule = async (institutionId: string) => {
    if (!deps.jobs.enabled || scheduled.has(institutionId)) return;
    scheduled.add(institutionId);
    await deps.jobs
      .scheduleRecurring(QUEUES.interventionSweep, SWEEP_CRON, { institutionId }, institutionId)
      .catch(() => scheduled.delete(institutionId));
  };

  app.get('/api/interventions', guard, async (request, reply): Promise<InterventionInbox | undefined> => {
    const ctx = ctxOf(request);
    const q = Filter.safeParse(request.query);
    if (!q.success) return reply.code(400).send({ error: 'bad_request' });
    await ensureSchedule(ctx.institutionId);
    return withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const statusCond =
        q.data.status === 'live'
          ? inArray(interventions.status, [...LIVE_STATUSES])
          : q.data.status === 'all'
            ? undefined
            : eq(interventions.status, q.data.status);
      const mineCond =
        q.data.mine === 'true'
          ? sql`${interventions.routeRoles} && ${textArray(ctx.roles)}`
          : undefined;
      const [rows, people, lastSweep] = await Promise.all([
        tx
          .select({ i: interventions, rule: watchRules, caseKey: cases.key })
          .from(interventions)
          .innerJoin(watchRules, eq(watchRules.id, interventions.watchRuleId))
          .leftJoin(cases, eq(cases.id, interventions.caseId))
          .where(and(readable(ctx.scope), statusCond, mineCond))
          .orderBy(desc(interventions.lastSeenAt))
          .limit(200),
        tx.select({ id: principals.id, name: principals.displayName }).from(principals),
        tx.execute<{ at: Date | null }>(
          sql`select max(occurred_at) as at from audit_events where action = 'interventions.swept'`,
        ),
      ]);
      const name = (id: string | null) => (id ? (people.find((p) => p.id === id)?.name ?? null) : null);
      const items = rows.map(
        ({ i, rule, caseKey }): InterventionItem => ({
          key: i.key,
          ruleKey: rule.key,
          ruleVersion: rule.version,
          ruleLabel: rule.label,
          kind: rule.kind as WatchKind,
          engineVersion: i.engineVersion,
          subjectRef: i.subjectRef,
          severity: i.severity as InterventionSeverity,
          title: i.title,
          detail: i.detail,
          inputs: i.inputs as InterventionInput[],
          routeRoles: i.routeRoles as Role[],
          classification: i.classification as Sensitivity,
          sectorKey: i.sectorKey,
          caseKey,
          status: i.status as InterventionStatus,
          firstSeenAt: i.firstSeenAt.toISOString(),
          lastSeenAt: i.lastSeenAt.toISOString(),
          conditionClearedAt: i.conditionClearedAt?.toISOString() ?? null,
          acknowledgedBy: name(i.acknowledgedBy),
          acknowledgedAt: i.acknowledgedAt?.toISOString() ?? null,
          closedBy: name(i.closedBy),
          closedAt: i.closedAt?.toISOString() ?? null,
          closeReason: i.closeReason,
          routedToMe: (i.routeRoles as Role[]).some((r) => ctx.roles.includes(r)),
        }),
      );
      const at = lastSweep[0]?.at;
      return {
        engine: INTERVENTION_ENGINE,
        lastSweepAt: at ? new Date(at).toISOString() : null,
        items,
      };
    });
  });

  app.post('/api/interventions/sweep', guard, async (request) => {
    const ctx = ctxOf(request);
    return withInstitution(deps.db, ctx.institutionId, (tx) => sweep(tx, ctx.institutionId, ctx.principalId));
  });

  app.post('/api/interventions/:key/act', guard, async (request, reply) => {
    const ctx = ctxOf(request);
    const key = z
      .string()
      .regex(/^INT-[0-9]{8}-[0-9]{4}$/)
      .safeParse((request.params as { key?: string }).key);
    const body = Act.safeParse(request.body);
    if (!key.success || !body.success) return reply.code(400).send({ error: 'bad_request' });
    if (body.data.action !== 'acknowledge' && (body.data.reason ?? '').length < 10)
      return reply.code(400).send({ error: 'reason_required', message: 'Give a reason of at least 10 characters.' });
    return withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const [found] = await tx
        .select({ i: interventions })
        .from(interventions)
        .leftJoin(cases, eq(cases.id, interventions.caseId))
        .where(and(eq(interventions.key, key.data), readable(ctx.scope)));
      const row = found?.i;
      if (!row) return reply.code(404).send({ error: 'not_found' });
      // Only the roles it is routed to act on it; everyone in scope may read it.
      if (!(row.routeRoles as Role[]).some((r) => ctx.roles.includes(r)))
        return reply.code(403).send({ error: 'not_routed', message: 'This intervention is routed to other roles.' });
      if (!(LIVE_STATUSES as readonly string[]).includes(row.status))
        return reply.code(409).send({ error: 'closed' });
      if (body.data.action === 'acknowledge' && row.status !== 'open')
        return reply.code(409).send({ error: 'already_acknowledged' });
      const now = new Date();
      const status: InterventionStatus =
        body.data.action === 'acknowledge' ? 'acknowledged' : body.data.action === 'resolve' ? 'resolved' : 'dismissed';
      await tx
        .update(interventions)
        .set(
          body.data.action === 'acknowledge'
            ? { status, acknowledgedBy: ctx.principalId, acknowledgedAt: now }
            : { status, closedBy: ctx.principalId, closedAt: now, closeReason: body.data.reason! },
        )
        .where(eq(interventions.id, row.id));
      await appendAudit(tx, {
        institutionId: ctx.institutionId,
        actorPrincipalId: ctx.principalId,
        actorType: 'human',
        action: `intervention.${status}`,
        objectType: 'intervention',
        objectId: row.id,
        caseId: row.caseId,
        payload: { key: row.key, reason: body.data.reason ?? null },
      });
      return { key: row.key, status };
    });
  });

  app.get('/api/watch-rules', guard, async (request) => {
    const ctx = ctxOf(request);
    return withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const [rows, people] = await Promise.all([
        tx.select().from(watchRules).orderBy(watchRules.key, desc(watchRules.version)),
        tx.select({ id: principals.id, name: principals.displayName }).from(principals),
      ]);
      const name = (id: string | null) => (id ? (people.find((p) => p.id === id)?.name ?? null) : null);
      return {
        engine: INTERVENTION_ENGINE,
        canAuthor: has(ctx, WATCH_AUTHOR_ROLES),
        canApprove: has(ctx, WATCH_APPROVER_ROLES),
        rules: rows.map(
          (r): WatchRuleItem => ({
            key: r.key,
            version: r.version,
            label: r.label,
            kind: r.kind as WatchKind,
            params: r.params,
            severity: r.severity as InterventionSeverity,
            routeRoles: r.routeRoles as Role[],
            rationale: r.rationale,
            claimClass: r.claimClass as ClaimClass,
            status: r.status as WatchRuleItem['status'],
            createdBy: name(r.createdBy),
            approvedBy: name(r.approvedBy),
            approvedAt: r.approvedAt?.toISOString() ?? null,
            basis: r.basis,
          }),
        ),
      };
    });
  });

  app.post('/api/watch-rules', guard, async (request, reply) => {
    const ctx = ctxOf(request);
    if (!has(ctx, WATCH_AUTHOR_ROLES)) return reply.code(403).send({ error: 'forbidden' });
    const body = WatchBody.safeParse(request.body);
    if (!body.success || !PARAMS[body.data.kind].safeParse(body.data.params).success)
      return reply.code(400).send({ error: 'bad_request' });
    return withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const [last] = await tx
        .select({ v: max(watchRules.version) })
        .from(watchRules)
        .where(eq(watchRules.key, body.data.key));
      const version = (last?.v ?? 0) + 1;
      await tx.insert(watchRules).values({
        ...body.data,
        institutionId: ctx.institutionId,
        version,
        claimClass: 'assumed',
        status: 'draft',
        createdBy: ctx.principalId,
      });
      await appendAudit(tx, {
        institutionId: ctx.institutionId,
        actorPrincipalId: ctx.principalId,
        actorType: 'human',
        action: 'watch_rule.drafted',
        objectType: 'watch_rule',
        objectId: null,
        caseId: null,
        payload: { key: body.data.key, version, kind: body.data.kind },
      });
      return reply.code(201).send({ key: body.data.key, version });
    });
  });

  for (const action of ['approve', 'retire'] as const) {
    app.post(`/api/watch-rules/:key/:version/${action}`, guard, async (request, reply) => {
      const ctx = ctxOf(request);
      if (!has(ctx, WATCH_APPROVER_ROLES)) return reply.code(403).send({ error: 'forbidden' });
      const p = z
        .object({ key: z.string().regex(/^W-[A-Z0-9-]{2,40}$/), version: z.coerce.number().int().positive() })
        .safeParse(request.params);
      if (!p.success) return reply.code(400).send({ error: 'bad_request' });
      return withInstitution(deps.db, ctx.institutionId, async (tx) => {
        const [row] = await tx
          .select()
          .from(watchRules)
          .where(and(eq(watchRules.key, p.data.key), eq(watchRules.version, p.data.version)));
        if (!row) return reply.code(404).send({ error: 'not_found' });
        if (action === 'approve') {
          if (row.status !== 'draft') return reply.code(409).send({ error: 'not_draft' });
          if (row.createdBy === ctx.principalId)
            return reply.code(403).send({ error: 'self_approval', message: 'The author of a version cannot approve it.' });
          await tx
            .update(watchRules)
            .set({ status: 'retired' })
            .where(and(eq(watchRules.key, p.data.key), eq(watchRules.status, 'approved')));
          await tx
            .update(watchRules)
            .set({ status: 'approved', approvedBy: ctx.principalId, approvedAt: new Date() })
            .where(eq(watchRules.id, row.id));
        } else {
          if (row.status !== 'approved') return reply.code(409).send({ error: 'not_approved' });
          await tx.update(watchRules).set({ status: 'retired' }).where(eq(watchRules.id, row.id));
        }
        await appendAudit(tx, {
          institutionId: ctx.institutionId,
          actorPrincipalId: ctx.principalId,
          actorType: 'human',
          action: `watch_rule.${action === 'approve' ? 'approved' : 'retired'}`,
          objectType: 'watch_rule',
          objectId: row.id,
          caseId: null,
          payload: { key: p.data.key, version: p.data.version },
        });
        return { key: p.data.key, version: p.data.version, status: action === 'approve' ? 'approved' : 'retired' };
      });
    });
  }
}
