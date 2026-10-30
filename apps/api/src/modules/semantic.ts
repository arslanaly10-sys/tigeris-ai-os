/**
 * Semantic registry (Phase 5A, FR-52, D-111, D-115): the institution's metric definitions and codified rules,
 * versioned, owned and approved by a second person; current rule evaluations with lineage; JSON-LD export.
 *
 * System definitions come from the engines in code. Institution definitions and rules are stored; content is never
 * edited after it is written: a change is a new version, and approving it retires the previous approved version.
 */
import {
  CLAIM_CLASSES,
  DEFINITION_KINDS,
  INPUT_REFS,
  ROLES,
  RULE_OPERATORS,
  RULE_SEVERITIES,
  SECTOR_DATASET_DEFS,
  SECTOR_DATASETS,
  SENSITIVITY_ORDER,
  SEMANTIC_APPROVER_ROLES,
  SEMANTIC_AUTHOR_ROLES,
  SEMANTIC_CONTEXT,
  SEMANTIC_VERSION,
  VOCAB_IRI,
  evaluateRule,
  registryJsonLd,
  systemDefinitions,
  type ClaimClass,
  type DefinitionKind,
  type EngineResult,
  type Role,
  type RuleOperator,
  type RuleSeverity,
  type ScenarioInputRef,
  type ReadScope,
  type SectorDataset,
  type Sensitivity,
  type SemanticDefinitionItem,
  type SemanticRegistry,
  type SemanticRuleItem,
  type SemanticStatus,
} from '@tigeris/shared';
import { and, desc, eq, inArray, max } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { appendAudit } from '../audit/audit';
import { withInstitution, type Tx } from '../db/client';
import {
  cases,
  institutions,
  principals,
  scenarioRuns,
  sectorRecords,
  semanticDefinitions,
  semanticRules,
} from '../db/schema';
import { ctxOf, requireSession, type AppDeps, type RequestContext } from './context';
import { caseReadable } from './scope';
import { EXPORT_ROLES } from './reports';
import { sectorModels } from './sectors';

const has = (ctx: RequestContext, roles: readonly Role[]) => roles.some((r) => ctx.roles.includes(r));
const SYSTEM_PREFIXES = ['scenario:', 'situation:', 'sector:'];

/** Situation measures are recorded as facts on every scenario run. */
const SITUATION_FACT: Record<string, string> = {
  'situation:route_dependent_holdings': 'fact:route_dependent_holdings',
  'situation:exposed_nav_share_pct': INPUT_REFS.exposedNavSharePct,
  'situation:fuel_buffer_days': INPUT_REFS.fuelBufferDays,
};

export interface Observation {
  value: number | null;
  observedFrom: string | null;
  asOf: string | null;
  inputKeys: string[];
  /** Where the value came from, so anything raised from it is read under the same scope. */
  classification: Sensitivity;
  sectorKey: string | null;
  caseId: string | null;
}

/** Reads the current value of each subject from the latest readable scenario run and the sector models. */
export async function observer(tx: Tx, scope: ReadScope) {
  const [run] = await tx
    .select({ r: scenarioRuns, sensitivity: cases.sensitivity, sectorKey: cases.sectorKey })
    .from(scenarioRuns)
    .innerJoin(cases, eq(cases.id, scenarioRuns.caseId))
    .where(caseReadable(scope))
    .orderBy(desc(scenarioRuns.createdAt))
    .limit(1);
  const sectorCache = new Map<SectorDataset, Awaited<ReturnType<typeof sectorModels>>>();
  const none: Observation = {
    value: null,
    observedFrom: null,
    asOf: null,
    inputKeys: [],
    classification: 'internal',
    sectorKey: null,
    caseId: null,
  };

  return async (subject: string): Promise<Observation> => {
    if (subject.startsWith('situation:') || subject.startsWith('scenario:')) {
      if (!run) return none;
      const base = {
        observedFrom: `Scenario run ${run.r.key}`,
        asOf: run.r.createdAt.toISOString(),
        inputKeys: [run.r.key],
        classification: run.sensitivity as Sensitivity,
        sectorKey: run.sectorKey,
        caseId: run.r.caseId,
      };
      if (subject.startsWith('situation:')) {
        const fact = (run.r.inputs as ScenarioInputRef[]).find((i) => i.ref === SITUATION_FACT[subject]);
        return fact && 'value' in fact ? { ...base, value: fact.value } : none;
      }
      const metric = (run.r.outputs as { result?: EngineResult }).result?.metrics.find(
        (m) => m.key === subject.slice('scenario:'.length),
      );
      return metric ? { ...base, value: metric.values.d90.central } : none;
    }
    const m = subject.match(/^sector:([a-z_]+):([a-z0-9_]+)$/);
    if (m && (SECTOR_DATASETS as readonly string[]).includes(m[1]!)) {
      const dataset = m[1] as SectorDataset;
      if (!sectorCache.has(dataset))
        sectorCache.set(dataset, await sectorModels(tx, scope, SECTOR_DATASET_DEFS[dataset].sector));
      const model = sectorCache.get(dataset)![0];
      const ind = model?.indicators.find((i) => i.key === m[2]);
      if (!model || !ind || ind.value === null) return none;
      const classes = ind.drivingKeys.length
        ? await tx
            .selectDistinct({ c: sectorRecords.classification })
            .from(sectorRecords)
            .where(and(eq(sectorRecords.dataset, dataset), inArray(sectorRecords.key, ind.drivingKeys)))
        : [];
      return {
        value: ind.value,
        observedFrom: `Sector models ${ind.version}`,
        asOf: model.latestAsOf,
        inputKeys: ind.drivingKeys,
        classification: SENSITIVITY_ORDER[
          Math.max(0, ...classes.map((x) => SENSITIVITY_ORDER.indexOf(x.c as Sensitivity)))
        ]!,
        sectorKey: SECTOR_DATASET_DEFS[dataset].sector,
        caseId: null,
      };
    }
    return none;
  };
}

async function loadRegistry(tx: Tx, ctx: RequestContext): Promise<SemanticRegistry> {
  const [defs, rules, people] = await Promise.all([
    tx.select().from(semanticDefinitions).orderBy(semanticDefinitions.key, desc(semanticDefinitions.version)),
    tx.select().from(semanticRules).orderBy(semanticRules.key, desc(semanticRules.version)),
    tx.select({ id: principals.id, name: principals.displayName }).from(principals),
  ]);
  const name = (id: string | null) => (id ? (people.find((p) => p.id === id)?.name ?? null) : null);
  const system = systemDefinitions();
  const definitions: SemanticDefinitionItem[] = [
    ...system.map((d): SemanticDefinitionItem => ({
      key: d.key,
      version: d.version,
      kind: d.kind,
      label: d.label,
      description: d.formula,
      unit: d.unit,
      formula: d.formula,
      ownerRole: null,
      source: d.source,
      jurisdiction: null,
      claimClass: 'inferred',
      status: 'approved',
      origin: 'system',
      createdBy: null,
      approvedBy: null,
      approvedAt: null,
      basis: 'Defined by the versioned engine in code',
    })),
    ...defs.map((d): SemanticDefinitionItem => ({
      key: d.key,
      version: String(d.version),
      kind: d.kind as DefinitionKind,
      label: d.label,
      description: d.description,
      unit: d.unit,
      formula: d.formula,
      ownerRole: d.ownerRole as Role,
      source: d.sourceRef,
      jurisdiction: d.jurisdiction,
      claimClass: d.claimClass as ClaimClass,
      status: d.status as SemanticStatus,
      origin: 'institution',
      createdBy: name(d.createdBy),
      approvedBy: name(d.approvedBy),
      approvedAt: d.approvedAt?.toISOString() ?? null,
      basis: d.basis,
    })),
  ];
  const observe = await observer(tx, ctx.scope);
  const items: SemanticRuleItem[] = [];
  for (const r of rules) {
    const spec = {
      operator: r.operator as RuleOperator,
      threshold: Number(r.threshold),
      severity: r.severity as RuleSeverity,
      attentionMargin: Number(r.attentionMargin),
    };
    const obs = r.status === 'approved' ? await observe(r.subject) : null;
    items.push({
      key: r.key,
      version: r.version,
      label: r.label,
      subject: r.subject,
      subjectLabel: definitions.find((d) => d.key === r.subject)?.label ?? null,
      ...spec,
      unit: r.unit,
      mandateKey: r.mandateKey,
      jurisdiction: r.jurisdiction,
      rationale: r.rationale,
      claimClass: r.claimClass as ClaimClass,
      status: r.status as SemanticStatus,
      createdBy: name(r.createdBy),
      approvedBy: name(r.approvedBy),
      approvedAt: r.approvedAt?.toISOString() ?? null,
      basis: r.basis,
      evaluation: obs
        ? {
            ...evaluateRule(spec, obs.value),
            observedFrom: obs.observedFrom,
            asOf: obs.asOf,
            inputKeys: obs.inputKeys,
          }
        : null,
    });
  }
  return {
    version: SEMANTIC_VERSION,
    vocabulary: VOCAB_IRI,
    definitions,
    rules: items,
    canAuthor: has(ctx, SEMANTIC_AUTHOR_ROLES),
    canApprove: has(ctx, SEMANTIC_APPROVER_ROLES),
  };
}

const optText = z
  .string()
  .trim()
  .max(400)
  .optional()
  .transform((v) => (v ? v : null));

const DefinitionBody = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_:.-]{2,80}$/),
  kind: z.enum(DEFINITION_KINDS),
  label: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(2000),
  unit: z.string().trim().max(40).default(''),
  formula: optText,
  ownerRole: z.enum(ROLES),
  sourceRef: optText,
  jurisdiction: optText,
  claimClass: z.enum(CLAIM_CLASSES).default('assumed'),
});

const RuleBody = z.object({
  key: z.string().regex(/^[A-Z][A-Z0-9-]{2,40}$/),
  label: z.string().trim().min(3).max(120),
  subject: z.string().min(3).max(120),
  operator: z.enum(RULE_OPERATORS),
  threshold: z.number().finite(),
  severity: z.enum(RULE_SEVERITIES).default('breach'),
  attentionMargin: z.number().min(0).lt(1).default(0),
  mandateKey: optText,
  jurisdiction: optText,
  rationale: z.string().trim().min(10).max(2000),
  claimClass: z.enum(CLAIM_CLASSES).default('assumed'),
});

const Target = z.object({
  kind: z.enum(['definitions', 'rules']),
  key: z.string().min(3).max(81),
  version: z.coerce.number().int().positive(),
});

export async function semanticRoutes(app: FastifyInstance, deps: AppDeps) {
  const guard = { preHandler: requireSession(deps) };

  app.get('/api/semantic', guard, async (request) => {
    const ctx = ctxOf(request);
    return withInstitution(deps.db, ctx.institutionId, (tx) => loadRegistry(tx, ctx));
  });

  app.get('/api/semantic/vocab', guard, async () => ({ '@context': SEMANTIC_CONTEXT }));

  app.get('/api/semantic/export', guard, async (request, reply) => {
    const ctx = ctxOf(request);
    if (!has(ctx, EXPORT_ROLES)) return reply.code(403).send({ error: 'forbidden' });
    return withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const reg = await loadRegistry(tx, ctx);
      const [inst] = await tx.select({ name: institutions.name }).from(institutions);
      const doc = registryJsonLd(
        inst?.name ?? 'Institution',
        new Date().toISOString(),
        reg.definitions,
        reg.rules,
      );
      await appendAudit(tx, {
        institutionId: ctx.institutionId,
        actorPrincipalId: ctx.principalId,
        actorType: 'human',
        action: 'semantic.exported',
        objectType: 'semantic_registry',
        objectId: null,
        caseId: null,
        payload: { version: SEMANTIC_VERSION, definitions: doc.definitions.length, rules: doc.rules.length },
      });
      reply.header('content-type', 'application/ld+json; charset=utf-8');
      return doc;
    });
  });

  app.post('/api/semantic/definitions', guard, async (request, reply) => {
    const ctx = ctxOf(request);
    if (!has(ctx, SEMANTIC_AUTHOR_ROLES)) return reply.code(403).send({ error: 'forbidden' });
    const body = DefinitionBody.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'bad_request' });
    if (SYSTEM_PREFIXES.some((p) => body.data.key.startsWith(p)))
      return reply
        .code(409)
        .send({ error: 'system_key', message: 'System definitions are defined by their engine.' });
    return withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const [last] = await tx
        .select({ v: max(semanticDefinitions.version) })
        .from(semanticDefinitions)
        .where(eq(semanticDefinitions.key, body.data.key));
      const version = (last?.v ?? 0) + 1;
      await tx.insert(semanticDefinitions).values({
        ...body.data,
        institutionId: ctx.institutionId,
        version,
        status: 'draft',
        createdBy: ctx.principalId,
      });
      await appendAudit(tx, {
        institutionId: ctx.institutionId,
        actorPrincipalId: ctx.principalId,
        actorType: 'human',
        action: 'semantic.definition_drafted',
        objectType: 'semantic_definition',
        objectId: null,
        caseId: null,
        payload: { key: body.data.key, version },
      });
      return reply.code(201).send({ key: body.data.key, version });
    });
  });

  app.post('/api/semantic/rules', guard, async (request, reply) => {
    const ctx = ctxOf(request);
    if (!has(ctx, SEMANTIC_AUTHOR_ROLES)) return reply.code(403).send({ error: 'forbidden' });
    const body = RuleBody.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'bad_request' });
    return withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const sys = systemDefinitions().find((d) => d.key === body.data.subject);
      const [inst] = sys
        ? []
        : await tx
            .select({ unit: semanticDefinitions.unit, kind: semanticDefinitions.kind })
            .from(semanticDefinitions)
            .where(
              and(eq(semanticDefinitions.key, body.data.subject), eq(semanticDefinitions.status, 'approved')),
            );
      const subject = sys ?? (inst?.kind === 'metric' ? inst : null);
      if (!subject)
        return reply
          .code(422)
          .send({ error: 'unknown_subject', message: 'A rule must judge an approved metric definition.' });
      const [last] = await tx
        .select({ v: max(semanticRules.version) })
        .from(semanticRules)
        .where(eq(semanticRules.key, body.data.key));
      const version = (last?.v ?? 0) + 1;
      await tx.insert(semanticRules).values({
        ...body.data,
        threshold: String(body.data.threshold),
        attentionMargin: String(body.data.attentionMargin),
        unit: subject.unit,
        institutionId: ctx.institutionId,
        version,
        status: 'draft',
        createdBy: ctx.principalId,
      });
      await appendAudit(tx, {
        institutionId: ctx.institutionId,
        actorPrincipalId: ctx.principalId,
        actorType: 'human',
        action: 'semantic.rule_drafted',
        objectType: 'semantic_rule',
        objectId: null,
        caseId: null,
        payload: { key: body.data.key, version, subject: body.data.subject },
      });
      return reply.code(201).send({ key: body.data.key, version });
    });
  });

  /** Approve a draft (a second person) or retire an approved version. */
  for (const action of ['approve', 'retire'] as const) {
    app.post(`/api/semantic/:kind/:key/:version/${action}`, guard, async (request, reply) => {
      const ctx = ctxOf(request);
      if (!has(ctx, SEMANTIC_APPROVER_ROLES)) return reply.code(403).send({ error: 'forbidden' });
      const p = Target.safeParse(request.params);
      if (!p.success) return reply.code(400).send({ error: 'bad_request' });
      const table = p.data.kind === 'rules' ? semanticRules : semanticDefinitions;
      return withInstitution(deps.db, ctx.institutionId, async (tx) => {
        const [row] = await tx
          .select({ id: table.id, status: table.status, createdBy: table.createdBy })
          .from(table)
          .where(and(eq(table.key, p.data.key), eq(table.version, p.data.version)));
        if (!row) return reply.code(404).send({ error: 'not_found' });
        const now = new Date();
        if (action === 'approve') {
          if (row.status !== 'draft') return reply.code(409).send({ error: 'not_draft' });
          if (row.createdBy === ctx.principalId)
            return reply
              .code(403)
              .send({ error: 'self_approval', message: 'The author of a version cannot approve it.' });
          await tx
            .update(table)
            .set({ status: 'retired' })
            .where(and(eq(table.key, p.data.key), eq(table.status, 'approved')));
          await tx
            .update(table)
            .set({ status: 'approved', approvedBy: ctx.principalId, approvedAt: now })
            .where(eq(table.id, row.id));
        } else {
          if (row.status !== 'approved') return reply.code(409).send({ error: 'not_approved' });
          await tx.update(table).set({ status: 'retired' }).where(eq(table.id, row.id));
        }
        await appendAudit(tx, {
          institutionId: ctx.institutionId,
          actorPrincipalId: ctx.principalId,
          actorType: 'human',
          action: `semantic.${p.data.kind === 'rules' ? 'rule' : 'definition'}_${action === 'approve' ? 'approved' : 'retired'}`,
          objectType: p.data.kind === 'rules' ? 'semantic_rule' : 'semantic_definition',
          objectId: row.id,
          caseId: null,
          payload: { key: p.data.key, version: p.data.version },
        });
        return {
          key: p.data.key,
          version: p.data.version,
          status: action === 'approve' ? 'approved' : 'retired',
        };
      });
    });
  }
}
