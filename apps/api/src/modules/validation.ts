/**
 * Validation tasking, desks and roll-up (Phase 5E, FR-56, D-107, D-119). A finding (case, scenario run,
 * recommendation or intervention) is put to named people and/or desks with a due date. Each answer records a verdict,
 * the reasoning and the assumptions relied on. The roll-up shows a batch's answers side by side with counts and never
 * averages them. Requests follow the scope of the finding they are about; the requester never answers their own.
 */
import {
  VALIDATION_REQUEST_ROLES,
  VALIDATION_SUBJECTS,
  VALIDATION_VERDICTS,
  rollupCounts,
  validationState,
  type DivisionItem,
  type DivisionKind,
  type Sensitivity,
  type ValidationAssumption,
  type ValidationBatch,
  type ValidationRequestItem,
  type ValidationSubject,
  type ValidationVerdict,
} from '@tigeris/shared';
import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { appendAudit } from '../audit/audit';
import { withInstitution, type Tx } from '../db/client';
import {
  cases,
  deskMembers,
  divisions,
  interventions,
  principals,
  recommendations,
  scenarioRuns,
  validationRequests,
} from '../db/schema';
import { ctxOf, requireSession, type AppDeps, type RequestContext } from './context';
import { caseReadable } from './scope';

const today = () => new Date().toISOString().slice(0, 10);

/** What a reader may see: the request's classification, and the scope of the case it concerns. Left-join `cases`. */
function readable(ctx: RequestContext) {
  if (!ctx.scope.sensitivities.length) return sql`false`;
  return and(
    inArray(validationRequests.classification, ctx.scope.sensitivities),
    or(isNull(validationRequests.caseId), caseReadable(ctx.scope)),
  )!;
}

interface Subject {
  label: string;
  caseId: string | null;
  classification: Sensitivity;
}

/** Resolves a finding the reader may read, or null. */
async function resolveSubject(
  tx: Tx,
  ctx: RequestContext,
  type: ValidationSubject,
  key: string,
): Promise<Subject | null> {
  const viaCase = async (caseId: string, label: string): Promise<Subject | null> => {
    const [c] = await tx
      .select({ id: cases.id, sensitivity: cases.sensitivity })
      .from(cases)
      .where(and(eq(cases.id, caseId), caseReadable(ctx.scope)));
    return c ? { label, caseId: c.id, classification: c.sensitivity as Sensitivity } : null;
  };
  if (type === 'case') {
    const [c] = await tx.select().from(cases).where(eq(cases.key, key));
    return c ? viaCase(c.id, `Case ${c.key}: ${c.title}`) : null;
  }
  if (type === 'scenario_run') {
    const [r] = await tx.select().from(scenarioRuns).where(eq(scenarioRuns.key, key));
    return r ? viaCase(r.caseId, `Scenario run ${r.key}: ${r.title}`) : null;
  }
  if (type === 'recommendation') {
    const [r] = await tx.select().from(recommendations).where(eq(recommendations.key, key));
    return r ? viaCase(r.caseId, `Recommendation ${r.key}`) : null;
  }
  const [i] = await tx.select().from(interventions).where(eq(interventions.key, key));
  if (!i || !ctx.scope.sensitivities.includes(i.classification as Sensitivity)) return null;
  if (i.caseId) return viaCase(i.caseId, `Intervention ${i.key}: ${i.title}`);
  return {
    label: `Intervention ${i.key}: ${i.title}`,
    caseId: null,
    classification: i.classification as Sensitivity,
  };
}

async function nextKey(tx: Tx, prefix: 'VR' | 'VB', now: Date, offset = 0): Promise<string> {
  const day = now.toISOString().slice(0, 10).replace(/-/g, '');
  const col = prefix === 'VR' ? validationRequests.key : validationRequests.batchKey;
  const [row] = await tx
    .select({ n: sql<number>`count(distinct ${col})::int` })
    .from(validationRequests)
    .where(sql`${col} like ${prefix + '-' + day + '-%'}`);
  return `${prefix}-${day}-${String((row?.n ?? 0) + 1 + offset).padStart(2, '0')}`;
}

async function myDesks(tx: Tx, principalId: string): Promise<string[]> {
  const rows = await tx
    .select({ id: deskMembers.divisionId })
    .from(deskMembers)
    .where(eq(deskMembers.principalId, principalId));
  return rows.map((r) => r.id);
}

async function loadRequests(
  tx: Tx,
  ctx: RequestContext,
  extra?: ReturnType<typeof and>,
): Promise<ValidationRequestItem[]> {
  const [rows, people, divs, desks] = await Promise.all([
    tx
      .select({ v: validationRequests, caseKey: cases.key })
      .from(validationRequests)
      .leftJoin(cases, eq(cases.id, validationRequests.caseId))
      .where(and(readable(ctx), extra))
      .orderBy(desc(validationRequests.createdAt), validationRequests.key)
      .limit(300),
    tx.select({ id: principals.id, name: principals.displayName }).from(principals),
    tx.select().from(divisions),
    myDesks(tx, ctx.principalId),
  ]);
  const name = (id: string | null) => (id ? (people.find((p) => p.id === id)?.name ?? 'Unknown') : null);
  const t = today();
  return rows.map(({ v, caseKey }): ValidationRequestItem => {
    const desk = v.assigneeDivisionId ? divs.find((d) => d.id === v.assigneeDivisionId) : null;
    const assignedToMe =
      v.assigneePrincipalId === ctx.principalId ||
      (!!v.assigneeDivisionId && desks.includes(v.assigneeDivisionId));
    return {
      key: v.key,
      batchKey: v.batchKey,
      subjectType: v.subjectType as ValidationSubject,
      subjectKey: v.subjectKey,
      subjectLabel: v.subjectLabel,
      caseKey,
      question: v.question,
      requestedBy: name(v.requestedBy)!,
      assignee: desk
        ? { kind: 'desk', key: desk.key ?? desk.id, name: desk.name }
        : { kind: 'person', key: v.assigneePrincipalId!, name: name(v.assigneePrincipalId)! },
      dueOn: v.dueOn,
      state: validationState(v.status as 'open' | 'answered' | 'withdrawn', v.dueOn, t),
      verdict: (v.verdict as ValidationVerdict | null) ?? null,
      response: v.response,
      assumptions: v.assumptions as ValidationAssumption[],
      answeredBy: name(v.answeredBy),
      answeredAt: v.answeredAt?.toISOString() ?? null,
      withdrawnReason: v.withdrawnReason,
      createdAt: v.createdAt.toISOString(),
      canAnswer: v.status === 'open' && assignedToMe && v.requestedBy !== ctx.principalId,
      canWithdraw: v.status === 'open' && v.requestedBy === ctx.principalId,
    };
  });
}

/** Open requests for the intervention engine, institution-wide (the sweep reads everything; readers are filtered). */
export async function openValidations(tx: Tx) {
  const [rows, people, divs] = await Promise.all([
    tx.select().from(validationRequests).where(eq(validationRequests.status, 'open')),
    tx.select({ id: principals.id, name: principals.displayName }).from(principals),
    tx.select().from(divisions),
  ]);
  const caseSectors = rows.some((r) => r.caseId)
    ? await tx
        .select({ id: cases.id, sectorKey: cases.sectorKey })
        .from(cases)
        .where(
          inArray(
            cases.id,
            rows.flatMap((r) => (r.caseId ? [r.caseId] : [])),
          ),
        )
    : [];
  const name = (id: string | null) => people.find((p) => p.id === id)?.name ?? 'Unknown';
  return rows.map((v) => ({
    key: v.key,
    subjectLabel: v.subjectLabel,
    question: v.question,
    assignee: v.assigneeDivisionId
      ? (divs.find((d) => d.id === v.assigneeDivisionId)?.name ?? 'A desk')
      : name(v.assigneePrincipalId),
    dueOn: v.dueOn,
    requestedBy: name(v.requestedBy),
    classification: v.classification as Sensitivity,
    sectorKey: caseSectors.find((c) => c.id === v.caseId)?.sectorKey ?? null,
    caseId: v.caseId,
  }));
}

const Assumption = z.object({
  label: z.string().trim().min(2).max(120),
  value: z.string().trim().min(1).max(120),
  basis: z.string().trim().min(5).max(500),
});

const RequestBody = z
  .object({
    subjectType: z.enum(VALIDATION_SUBJECTS),
    subjectKey: z.string().trim().min(3).max(60),
    question: z.string().trim().min(10).max(1000),
    dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    deskKeys: z
      .array(z.string().regex(/^[A-Z][A-Z0-9-]{1,30}$/))
      .max(10)
      .default([]),
    principalIds: z.array(z.string().uuid()).max(10).default([]),
  })
  .refine((b) => b.deskKeys.length + b.principalIds.length > 0, {
    message: 'Name at least one person or desk.',
  });

export async function validationRoutes(app: FastifyInstance, deps: AppDeps) {
  const guard = { preHandler: requireSession(deps) };

  app.get('/api/desks', guard, async (request): Promise<DivisionItem[]> => {
    const ctx = ctxOf(request);
    return withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const [divs, members, open] = await Promise.all([
        tx
          .select()
          .from(divisions)
          .where(sql`${divisions.key} is not null`),
        tx
          .select({
            d: deskMembers.divisionId,
            id: principals.id,
            name: principals.displayName,
            title: principals.title,
          })
          .from(deskMembers)
          .innerJoin(principals, eq(principals.id, deskMembers.principalId)),
        tx
          .select({ d: validationRequests.assigneeDivisionId, n: sql<number>`count(*)::int` })
          .from(validationRequests)
          .where(eq(validationRequests.status, 'open'))
          .groupBy(validationRequests.assigneeDivisionId),
      ]);
      const order = { executive: 0, committee: 1, desk: 2 } as const;
      return divs
        .map((d): DivisionItem => ({
          key: d.key!,
          name: d.name,
          kind: d.kind as DivisionKind,
          parentKey: divs.find((p) => p.id === d.parentId)?.key ?? null,
          description: d.description,
          members: members.filter((m) => m.d === d.id).map(({ id, name, title }) => ({ id, name, title })),
          openRequests: open.find((o) => o.d === d.id)?.n ?? 0,
        }))
        .sort((a, b) => order[a.kind] - order[b.kind] || a.name.localeCompare(b.name));
    });
  });

  app.get('/api/validation', guard, async (request) => {
    const ctx = ctxOf(request);
    const q = z.object({ mine: z.enum(['true', 'false']).default('true') }).safeParse(request.query);
    const mine = !q.success || q.data.mine === 'true';
    return withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const desks = await myDesks(tx, ctx.principalId);
      const items = await loadRequests(
        tx,
        ctx,
        mine
          ? or(
              eq(validationRequests.requestedBy, ctx.principalId),
              eq(validationRequests.assigneePrincipalId, ctx.principalId),
              desks.length ? inArray(validationRequests.assigneeDivisionId, desks) : undefined,
            )
          : undefined,
      );
      return { canRequest: VALIDATION_REQUEST_ROLES.some((r) => ctx.roles.includes(r)), requests: items };
    });
  });

  app.get('/api/validation/rollup', guard, async (request): Promise<ValidationBatch[]> => {
    const ctx = ctxOf(request);
    return withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const items = await loadRequests(tx, ctx);
      const batches = new Map<string, ValidationRequestItem[]>();
      for (const i of items) batches.set(i.batchKey, [...(batches.get(i.batchKey) ?? []), i]);
      return [...batches.entries()].map(([batchKey, reqs]) => {
        const first = reqs[0]!;
        return {
          batchKey,
          subjectLabel: first.subjectLabel,
          subjectType: first.subjectType,
          subjectKey: first.subjectKey,
          caseKey: first.caseKey,
          question: first.question,
          requestedBy: first.requestedBy,
          dueOn: first.dueOn,
          counts: rollupCounts(
            reqs.map((r) => ({
              status: r.state === 'overdue' ? 'open' : (r.state as 'open' | 'answered' | 'withdrawn'),
              verdict: r.verdict,
            })),
          ),
          requests: [...reqs].sort((a, b) => a.assignee.name.localeCompare(b.assignee.name)),
        };
      });
    });
  });

  app.post('/api/validation', guard, async (request, reply) => {
    const ctx = ctxOf(request);
    if (!VALIDATION_REQUEST_ROLES.some((r) => ctx.roles.includes(r)))
      return reply.code(403).send({ error: 'not_permitted' });
    const body = RequestBody.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'bad_request' });
    if (body.data.dueOn < today()) return reply.code(400).send({ error: 'due_in_past' });
    if (body.data.principalIds.includes(ctx.principalId))
      return reply
        .code(400)
        .send({ error: 'self_assigned', message: 'You cannot validate your own finding.' });
    return withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const subject = await resolveSubject(tx, ctx, body.data.subjectType, body.data.subjectKey);
      if (!subject) return reply.code(404).send({ error: 'subject_not_found' });
      const desks = body.data.deskKeys.length
        ? await tx.select().from(divisions).where(inArray(divisions.key, body.data.deskKeys))
        : [];
      const people = body.data.principalIds.length
        ? await tx
            .select({ id: principals.id })
            .from(principals)
            .where(inArray(principals.id, body.data.principalIds))
        : [];
      if (
        desks.length !== new Set(body.data.deskKeys).size ||
        people.length !== new Set(body.data.principalIds).size
      )
        return reply.code(422).send({ error: 'unknown_assignee' });
      const now = new Date();
      const batchKey = await nextKey(tx, 'VB', now);
      const assignees = [
        ...desks.map((d) => ({ assigneeDivisionId: d.id, assigneePrincipalId: null })),
        ...people.map((p) => ({ assigneeDivisionId: null, assigneePrincipalId: p.id })),
      ];
      const keys: string[] = [];
      // Number the batch's requests from one count taken before inserting, so keys never collide.
      const first = await nextKey(tx, 'VR', now);
      const base = Number(first.split('-')[2]) - 1;
      const day = first.slice(3, 11);
      for (const [n, a] of assignees.entries()) {
        const key = `VR-${day}-${String(base + 1 + n).padStart(2, '0')}`;
        keys.push(key);
        await tx.insert(validationRequests).values({
          institutionId: ctx.institutionId,
          key,
          batchKey,
          subjectType: body.data.subjectType,
          subjectKey: body.data.subjectKey,
          subjectLabel: subject.label,
          caseId: subject.caseId,
          classification: subject.classification,
          question: body.data.question,
          requestedBy: ctx.principalId,
          ...a,
          dueOn: body.data.dueOn,
          status: 'open',
          assumptions: [],
          createdAt: now,
        });
      }
      await appendAudit(tx, {
        institutionId: ctx.institutionId,
        actorPrincipalId: ctx.principalId,
        actorType: 'human',
        action: 'validation.requested',
        objectType: 'validation_batch',
        objectId: null,
        caseId: subject.caseId,
        payload: {
          batch: batchKey,
          requests: keys,
          subject: `${body.data.subjectType}:${body.data.subjectKey}`,
          dueOn: body.data.dueOn,
        },
      });
      return reply.code(201).send({ batchKey, keys });
    });
  });

  app.post('/api/validation/:key/:action', guard, async (request, reply) => {
    const ctx = ctxOf(request);
    const p = z
      .object({ key: z.string().regex(/^VR-[0-9]{8}-[0-9]{2,4}$/), action: z.enum(['answer', 'withdraw']) })
      .safeParse(request.params);
    if (!p.success) return reply.code(404).send({ error: 'not_found' });
    const answer = z
      .object({
        verdict: z.enum(VALIDATION_VERDICTS),
        response: z.string().trim().min(10).max(2000),
        assumptions: z.array(Assumption).max(10).default([]),
      })
      .safeParse(request.body);
    const withdraw = z.object({ reason: z.string().trim().min(10).max(1000) }).safeParse(request.body);
    if (p.data.action === 'answer' ? !answer.success : !withdraw.success)
      return reply.code(400).send({ error: 'bad_request' });
    return withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const [found] = await tx
        .select({ v: validationRequests })
        .from(validationRequests)
        .leftJoin(cases, eq(cases.id, validationRequests.caseId))
        .where(and(eq(validationRequests.key, p.data.key), readable(ctx)));
      const v = found?.v;
      if (!v) return reply.code(404).send({ error: 'not_found' });
      if (v.status !== 'open') return reply.code(409).send({ error: 'closed' });
      const now = new Date();
      if (p.data.action === 'answer') {
        const desks = await myDesks(tx, ctx.principalId);
        const assigned =
          v.assigneePrincipalId === ctx.principalId ||
          (!!v.assigneeDivisionId && desks.includes(v.assigneeDivisionId));
        if (!assigned) return reply.code(403).send({ error: 'not_assigned' });
        if (v.requestedBy === ctx.principalId)
          return reply
            .code(403)
            .send({ error: 'own_request', message: 'You cannot validate your own finding.' });
        await tx
          .update(validationRequests)
          .set({
            status: 'answered',
            verdict: answer.data!.verdict,
            response: answer.data!.response,
            assumptions: answer.data!.assumptions,
            answeredBy: ctx.principalId,
            answeredAt: now,
          })
          .where(eq(validationRequests.id, v.id));
      } else {
        if (v.requestedBy !== ctx.principalId) return reply.code(403).send({ error: 'not_requester' });
        await tx
          .update(validationRequests)
          .set({ status: 'withdrawn', withdrawnReason: withdraw.data!.reason })
          .where(eq(validationRequests.id, v.id));
      }
      await appendAudit(tx, {
        institutionId: ctx.institutionId,
        actorPrincipalId: ctx.principalId,
        actorType: 'human',
        action: p.data.action === 'answer' ? 'validation.answered' : 'validation.withdrawn',
        objectType: 'validation_request',
        objectId: v.id,
        caseId: v.caseId,
        payload:
          p.data.action === 'answer'
            ? { key: v.key, verdict: answer.data!.verdict, assumptions: answer.data!.assumptions.length }
            : { key: v.key, reason: withdraw.data!.reason },
      });
      return { key: v.key, status: p.data.action === 'answer' ? 'answered' : 'withdrawn' };
    });
  });
}
