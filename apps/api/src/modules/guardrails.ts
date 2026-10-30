/**
 * Decision guardrails (Phase 5C, FR-54, D-105, D-117). A guardrail is a standing rule recorded from an approved
 * decision: later approvals of the same action class are blocked, or need a named role, optionally only above a size
 * threshold. The decision policy enforces every active guardrail and names it in its reasons. Guardrails are never
 * edited: an executive other than the person who recorded one may lift it, with a reason.
 */
import { ROLES, type GuardrailInput, type GuardrailItem, type Role } from '@tigeris/shared';
import { and, desc, eq, gte, isNull, or, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { appendAudit } from '../audit/audit';
import { withInstitution, type Tx } from '../db/client';
import {
  authorityRules,
  cases,
  decisions,
  draftOptions,
  guardrails,
  principals,
  recommendations,
} from '../db/schema';
import { ctxOf, requireSession, type AppDeps } from './context';
import { caseReadable } from './scope';

/** Roles that may record a guardrail: the executive, or the person who approved the decision it comes from. */
export const GUARDRAIL_ROLES: readonly Role[] = ['executive', 'approver'];

/** Active, unexpired guardrails on an action class, as the decision policy reads them. */
export async function activeGuardrails(
  tx: Tx,
  actionClass: string,
  today = new Date(),
): Promise<GuardrailInput[]> {
  const day = today.toISOString().slice(0, 10);
  const rows = await tx
    .select()
    .from(guardrails)
    .where(
      and(
        eq(guardrails.actionClass, actionClass),
        eq(guardrails.status, 'active'),
        or(isNull(guardrails.expiresOn), gte(guardrails.expiresOn, day)),
      ),
    )
    .orderBy(guardrails.key);
  return rows.map((g) => ({
    key: g.key,
    effect: g.effect as GuardrailInput['effect'],
    requiredRole: (g.requiredRole as Role | null) ?? null,
    threshold:
      g.thresholdValue === null ? null : { value: Number(g.thresholdValue), unit: g.thresholdUnit ?? '' },
    statement: g.statement,
  }));
}

async function nextKey(tx: Tx, now: Date): Promise<string> {
  const day = now.toISOString().slice(0, 10).replace(/-/g, '');
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(guardrails)
    .where(sql`${guardrails.key} like ${'GR-' + day + '-%'}`);
  return `GR-${day}-${String((row?.n ?? 0) + 1).padStart(2, '0')}`;
}

const Body = z
  .object({
    actionClass: z.string().min(3).max(80).optional(),
    effect: z.enum(['block', 'require_role']),
    requiredRole: z.enum(ROLES).optional(),
    thresholdValue: z.number().min(0).optional(),
    thresholdUnit: z.string().trim().min(1).max(40).optional(),
    statement: z.string().trim().min(10).max(1000),
    expiresOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
  .refine((b) => (b.effect === 'require_role') === (b.requiredRole !== undefined), {
    message: 'A role is named exactly when the guardrail requires one.',
  })
  .refine((b) => (b.thresholdValue === undefined) === (b.thresholdUnit === undefined), {
    message: 'A threshold needs both a value and a unit.',
  });

export async function guardrailRoutes(app: FastifyInstance, deps: AppDeps) {
  const guard = { preHandler: requireSession(deps) };

  app.get('/api/guardrails', guard, async (request) => {
    const ctx = ctxOf(request);
    return withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const [rows, people, readable] = await Promise.all([
        tx
          .select({ g: guardrails, decisionKey: decisions.key, caseKey: cases.key })
          .from(guardrails)
          .innerJoin(decisions, eq(decisions.id, guardrails.decisionId))
          .innerJoin(cases, eq(cases.id, guardrails.caseId))
          .orderBy(desc(guardrails.createdAt)),
        tx.select({ id: principals.id, name: principals.displayName }).from(principals),
        tx.select({ id: cases.id }).from(cases).where(caseReadable(ctx.scope)),
      ]);
      const name = (id: string | null) => (id ? (people.find((p) => p.id === id)?.name ?? null) : null);
      const canRead = new Set(readable.map((r) => r.id));
      const today = new Date().toISOString().slice(0, 10);
      return {
        canLift: ctx.roles.includes('executive'),
        guardrails: rows.map(({ g, decisionKey, caseKey }): GuardrailItem => ({
          key: g.key,
          actionClass: g.actionClass,
          effect: g.effect as GuardrailItem['effect'],
          requiredRole: (g.requiredRole as Role | null) ?? null,
          threshold:
            g.thresholdValue === null
              ? null
              : { value: Number(g.thresholdValue), unit: g.thresholdUnit ?? '' },
          statement: g.statement,
          expiresOn: g.expiresOn,
          expired: g.expiresOn !== null && g.expiresOn < today,
          status: g.status as GuardrailItem['status'],
          // The rule binds everyone; the case it came from is shown only to those who may read that case.
          decisionKey: canRead.has(g.caseId) ? decisionKey : null,
          caseKey: canRead.has(g.caseId) ? caseKey : null,
          createdBy: name(g.createdBy) ?? 'Unknown',
          createdAt: g.createdAt.toISOString(),
          liftedBy: name(g.liftedBy),
          liftedAt: g.liftedAt?.toISOString() ?? null,
          liftReason: g.liftReason,
        })),
      };
    });
  });

  app.post('/api/decisions/:key/guardrails', guard, async (request, reply) => {
    const ctx = ctxOf(request);
    const key = z
      .string()
      .regex(/^DEC-[0-9]{8}-[0-9]{2,4}$/)
      .safeParse((request.params as { key?: string }).key);
    const body = Body.safeParse(request.body);
    if (!key.success) return reply.code(404).send({ error: 'not_found' });
    if (!body.success) return reply.code(400).send({ error: 'bad_request' });
    if (!GUARDRAIL_ROLES.some((r) => ctx.roles.includes(r)))
      return reply.code(403).send({ error: 'not_permitted' });
    return withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const [d] = await tx
        .select({ d: decisions })
        .from(decisions)
        .innerJoin(cases, eq(cases.id, decisions.caseId))
        .where(and(eq(decisions.key, key.data), caseReadable(ctx.scope)));
      if (!d) return reply.code(404).send({ error: 'not_found' });
      if (d.d.outcome !== 'approve' || d.d.policyResult === 'block')
        return reply
          .code(409)
          .send({ error: 'not_approved', message: 'Guardrails are recorded from approved decisions only.' });
      if (!ctx.roles.includes('executive') && d.d.approverId !== ctx.principalId)
        return reply
          .code(403)
          .send({
            error: 'not_decider',
            message: 'Only the executive or the approver of this decision records one.',
          });
      const classes = await tx.select({ a: authorityRules.actionClass }).from(authorityRules);
      const [option] = await tx
        .select({ actionClass: draftOptions.actionClass })
        .from(recommendations)
        .innerJoin(draftOptions, eq(draftOptions.id, recommendations.optionId))
        .where(eq(recommendations.id, d.d.recommendationId));
      const actionClass = body.data.actionClass ?? option?.actionClass;
      if (!actionClass || !classes.some((c) => c.a === actionClass))
        return reply.code(422).send({ error: 'unknown_action_class' });
      const now = new Date();
      const gKey = await nextKey(tx, now);
      const [g] = await tx
        .insert(guardrails)
        .values({
          institutionId: ctx.institutionId,
          key: gKey,
          decisionId: d.d.id,
          caseId: d.d.caseId,
          actionClass,
          effect: body.data.effect,
          requiredRole: body.data.requiredRole ?? null,
          thresholdValue: body.data.thresholdValue === undefined ? null : String(body.data.thresholdValue),
          thresholdUnit: body.data.thresholdUnit ?? null,
          statement: body.data.statement,
          expiresOn: body.data.expiresOn ?? null,
          status: 'active',
          createdBy: ctx.principalId,
          createdAt: now,
        })
        .returning({ id: guardrails.id });
      await appendAudit(tx, {
        institutionId: ctx.institutionId,
        actorPrincipalId: ctx.principalId,
        actorType: 'human',
        action: 'guardrail.recorded',
        objectType: 'guardrail',
        objectId: g!.id,
        caseId: d.d.caseId,
        payload: { key: gKey, decision: key.data, actionClass, effect: body.data.effect },
      });
      return reply.code(201).send({ key: gKey, actionClass });
    });
  });

  app.post('/api/guardrails/:key/lift', guard, async (request, reply) => {
    const ctx = ctxOf(request);
    const key = z
      .string()
      .regex(/^GR-[0-9]{8}-[0-9]{2}$/)
      .safeParse((request.params as { key?: string }).key);
    const body = z.object({ reason: z.string().trim().min(10).max(1000) }).safeParse(request.body);
    if (!key.success) return reply.code(404).send({ error: 'not_found' });
    if (!body.success) return reply.code(400).send({ error: 'reason_required' });
    if (!ctx.roles.includes('executive')) return reply.code(403).send({ error: 'not_permitted' });
    return withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const [g] = await tx.select().from(guardrails).where(eq(guardrails.key, key.data));
      if (!g) return reply.code(404).send({ error: 'not_found' });
      if (g.status !== 'active') return reply.code(409).send({ error: 'not_active' });
      if (g.createdBy === ctx.principalId)
        return reply
          .code(403)
          .send({ error: 'self_lift', message: 'Another executive must lift a guardrail you recorded.' });
      await tx
        .update(guardrails)
        .set({
          status: 'lifted',
          liftedBy: ctx.principalId,
          liftedAt: new Date(),
          liftReason: body.data.reason,
        })
        .where(eq(guardrails.id, g.id));
      await appendAudit(tx, {
        institutionId: ctx.institutionId,
        actorPrincipalId: ctx.principalId,
        actorType: 'human',
        action: 'guardrail.lifted',
        objectType: 'guardrail',
        objectId: g.id,
        caseId: g.caseId,
        payload: { key: g.key, reason: body.data.reason },
      });
      return { key: g.key, status: 'lifted' };
    });
  });
}
