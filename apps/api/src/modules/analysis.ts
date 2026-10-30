/**
 * Agentic case analysis (slice F, FR-34, D-53) and scenario sensitivity (slice G, FR-24).
 *
 * A run is a fixed plan of eight read-only agents. Each one reads the case's authorized records through the same
 * scope filters as the rest of the API, gathers citations, and drafts prose through the model gateway, which only
 * permits the deterministic stub and rejects any number that is not in a cited display. Where the records are thin
 * the step says what is missing instead of answering. Runs are append-only; nothing in a run changes the case.
 */
import { createHash } from 'node:crypto';
import {
  ANALYSIS_AGENTS,
  ANALYSIS_VERSION,
  METRICS,
  SCENARIO_HORIZONS,
  dependencyWalk,
  sensitivity,
  type AnalysisAgentKey,
  type AnalysisRunItem,
  type AnalysisStepItem,
  type CaseState,
  type Drivers,
  type HorizonKey,
  type MandateCheck,
  type Role,
  type ScenarioInputRef,
  type SensitivityPayload,
} from '@tigeris/shared';
import { and, desc, eq, ne, or, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { appendAudit, canonicalJson } from '../audit/audit';
import { config } from '../config';
import { withInstitution, type Tx } from '../db/client';
import {
  agentRuns,
  analysisRuns,
  caseEntities,
  caseEvents,
  caseEvidence,
  cases,
  draftOptions,
  entities,
  evidenceObjects,
  memoryEntries,
  principals,
  scenarioRuns,
  sources,
} from '../db/schema';
import { ctxOf, requireSession, type AppDeps, type RequestContext } from './context';
import { draft, providerStatus, type Citation } from './gateway';
import { loadEdges } from './graph';
import { freshnessOf } from './mappers';
import { buildCitations, engineInputsFrom, formatValue, metricDef, type StoredOutputs } from './scenarios';
import { ROLE_LABEL_API } from './roles';
import { caseReadable } from './scope';

/** Roles that may start an analysis run. Agents only read and draft, but a run is still a recorded act. */
export const ANALYSIS_ROLES: readonly Role[] = ['analyst', 'domain_expert'];

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const list = (xs: string[], max = 4) =>
  xs.length <= max ? xs.join(', ') : `${xs.slice(0, max).join(', ')} and ${plural(xs.length - max, 'other')}`;
const sha = (v: unknown) => createHash('sha256').update(canonicalJson(v)).digest('hex');

interface StepSpec {
  agentKey: AnalysisAgentKey;
  templateKey: string;
  citations: Citation[];
  findings: string[];
  gaps: string[];
}

const cite = (ref: string, label: string, display: string): Citation => ({ ref, label, display });

function gap(agentKey: AnalysisAgentKey, missing: string): StepSpec {
  return {
    agentKey,
    templateKey: 'analysis-gap',
    citations: [cite('gap:missing', 'Missing input', missing)],
    findings: [],
    gaps: [missing],
  };
}

async function nextAnalysisKey(tx: Tx, now: Date): Promise<string> {
  const day = now.toISOString().slice(0, 10).replace(/-/g, '');
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(analysisRuns)
    .where(sql`${analysisRuns.key} like ${'ANL-' + day + '-%'}`);
  return `ANL-${day}-${String((row?.n ?? 0) + 1).padStart(2, '0')}`;
}

async function latestScenario(tx: Tx, caseId: string) {
  const [run] = await tx
    .select()
    .from(scenarioRuns)
    .where(eq(scenarioRuns.caseId, caseId))
    .orderBy(desc(scenarioRuns.createdAt))
    .limit(1);
  return run ?? null;
}

/** Gathers each agent's citations from the case's authorized records. Pure reads. */
async function planSteps(
  tx: Tx,
  ctx: RequestContext,
  kase: typeof cases.$inferSelect,
): Promise<{
  steps: StepSpec[];
  scenarioRunId: string | null;
}> {
  const steps: StepSpec[] = [];
  const state = kase.state as CaseState;

  // Planner: the question and the plan, from the case record.
  steps.push({
    agentKey: 'planner',
    templateKey: 'analysis-plan',
    citations: [
      cite('case:question', 'Question', `What does "${kase.title}" mean for the institution?`),
      cite('case:state', 'Case stage', state),
      cite(
        'plan:steps',
        'Plan',
        'gather the evidence, trace exposure through the graph, read the latest scenario, summarize the ranked options, check mandates and authority, argue against the leading option, and look for precedent',
      ),
    ],
    findings: ANALYSIS_AGENTS.filter((a) => a.key !== 'planner').map((a) => `${a.name}: ${a.does}`),
    gaps: [],
  });

  // Evidence retriever: linked evidence and its status; freshness from each source's latest retrieval.
  const ev = await tx
    .select({ e: evidenceObjects, s: sources })
    .from(caseEvidence)
    .innerJoin(evidenceObjects, eq(evidenceObjects.id, caseEvidence.evidenceId))
    .innerJoin(sources, eq(sources.id, evidenceObjects.sourceId))
    .where(eq(caseEvidence.caseId, kase.id));
  const unverified = ev.filter(
    (x) => x.e.validationStatus === 'unverified' || x.e.validationStatus === 'stale',
  );
  const disputed = ev.filter((x) => x.e.validationStatus === 'disputed');
  if (ev.length === 0) steps.push(gap('evidence-retriever', 'no evidence is linked to this case'));
  else {
    const bySource = new Map<string, { s: typeof sources.$inferSelect; last: Date | null }>();
    for (const x of ev) {
      const prev = bySource.get(x.s.id);
      const t = x.e.retrievedAt;
      if (!prev) bySource.set(x.s.id, { s: x.s, last: t });
      else if (t && (!prev.last || t > prev.last)) prev.last = t;
    }
    const stale = [...bySource.values()].filter(
      (v) => freshnessOf(v.s.freshnessLimitHours, v.last) === 'stale',
    );
    steps.push({
      agentKey: 'evidence-retriever',
      templateKey: 'evidence-brief',
      citations: [
        cite('evidence:count', 'Linked evidence', plural(ev.length, 'evidence item')),
        cite(
          'evidence:verified',
          'Validated',
          `${ev.filter((x) => x.e.validationStatus === 'validated').length} validated`,
        ),
        cite('evidence:unverified', 'Unverified or stale', `${unverified.length} unverified or stale`),
        cite('evidence:disputed', 'Disputed', `${disputed.length} disputed`),
        cite(
          'evidence:freshness',
          'Source freshness',
          stale.length
            ? `${plural(stale.length, 'source')} past the freshness limit: ${list(stale.map((v) => v.s.publisher))}`
            : 'No linked source is past its freshness limit',
        ),
      ],
      findings: ev.map((x) => `${x.e.title} (${x.e.validationStatus})`),
      gaps: disputed.length ? [`${plural(disputed.length, 'disputed item')} to resolve`] : [],
    });
  }

  // Impact tracer: directed walk from the case origin. An event's impact is traced from the places it is linked to.
  const linked = await tx.select().from(caseEntities).where(eq(caseEntities.caseId, kase.id));
  if (linked.length === 0) steps.push(gap('impact-tracer', 'no graph entity is linked to this case'));
  else {
    const all = await tx.select().from(entities);
    const byId = new Map(all.map((e) => [e.id, e]));
    const edges = await loadEdges(tx);
    const origins = linked.filter((l) => l.role === 'origin').map((l) => l.entityId);
    const originIds = origins.length ? origins : linked.map((l) => l.entityId);
    const seeds = originIds.flatMap((id) =>
      byId.get(id)?.entityType === 'event'
        ? edges
            .filter((e) => e.source === id || e.target === id)
            .map((e) => (e.source === id ? e.target : e.source))
        : [id],
    );
    const walk = (dir: 'upstream' | 'downstream') => {
      const seen = new Map<string, ReturnType<typeof dependencyWalk>[number]>();
      for (const s of seeds)
        for (const r of dependencyWalk(s, edges, dir))
          if (!seeds.includes(r.id) && (!seen.has(r.id) || seen.get(r.id)!.hop > r.hop)) seen.set(r.id, r);
      return [...seen.values()].sort((a, b) => a.hop - b.hop);
    };
    const down = walk('downstream');
    const up = walk('upstream');
    const edgeById = new Map(edges.map((e) => [e.id, e]));
    const used = [...down, ...up].map((r) => edgeById.get(r.edgeId)!);
    const rank = { high: 3, moderate: 2, low: 1, insufficient: 0 } as const;
    const weakest = [...used].sort((a, b) => rank[a.confidenceBand] - rank[b.confidenceBand])[0];
    const name = (id: string) => byId.get(id)?.name ?? 'an unknown entity';
    const maxHop = down.reduce((m, r) => Math.max(m, r.hop), 0);
    steps.push({
      agentKey: 'impact-tracer',
      templateKey: 'impact-trace',
      citations: [
        cite('impact:origin', 'Traced from', list(seeds.map(name))),
        cite('impact:exposed', 'Exposed', plural(down.length, 'entity', 'entities')),
        cite('impact:hops', 'Depth', plural(maxHop, 'step')),
        cite(
          'impact:first',
          'Directly exposed',
          list(down.filter((r) => r.hop === 1).map((r) => name(r.id))) || 'none',
        ),
        cite('impact:relies', 'Relies on', up.length ? list(up.map((r) => name(r.id))) : 'nothing recorded'),
        cite(
          'impact:weakest',
          'Weakest link',
          weakest
            ? `The weakest link on these paths is "${name(weakest.source)} ${weakest.predicate} ${name(weakest.target)}" (${weakest.relationshipClass}, ${weakest.confidenceBand} confidence)`
            : 'No dependency link was found on these paths',
        ),
      ],
      findings: down.map((r) => `${name(r.id)}: ${plural(r.hop, 'step')} from the origin`),
      gaps: down.length === 0 && up.length === 0 ? ['no dependency paths are recorded from the origin'] : [],
    });
  }

  // Scenario analyst, option drafter, mandate checker and red-team critic all read the latest scenario run.
  const run = await latestScenario(tx, kase.id);
  if (!run) {
    for (const k of ['scenario-analyst', 'option-drafter', 'mandate-checker', 'red-team-critic'] as const)
      steps.push(gap(k, 'no scenario has been run for this case'));
  } else {
    const outputs = run.outputs as StoredOutputs;
    const inputs = run.inputs as ScenarioInputRef[];
    const drivers = run.drivers as Drivers;
    const c = buildCitations(drivers, inputs, outputs.result);
    steps.push({
      agentKey: 'scenario-analyst',
      templateKey: 'scenario-brief',
      citations: [
        cite('scenario:key', 'Scenario run', run.key),
        ...[
          'driver:capacityLostPct',
          'driver:durationDays',
          'metric:nav_at_risk_peak:central',
          'metric:nav_at_risk_peak:low',
          'metric:nav_at_risk_peak:high',
          'horizon:d90',
        ].map((r) => c[r]!),
      ],
      findings: (run.warnings as string[]).slice(0, 4),
      gaps: [],
    });

    const options = await tx
      .select()
      .from(draftOptions)
      .where(eq(draftOptions.scenarioRunId, run.id))
      .orderBy(draftOptions.rank);
    const lead = options[0];
    if (!lead) {
      for (const k of ['option-drafter', 'mandate-checker', 'red-team-critic'] as const)
        steps.push(gap(k, `scenario run ${run.key} drafted no options`));
    } else {
      const leadCite = cite('options:leading', 'Leading option', lead.title);
      steps.push({
        agentKey: 'option-drafter',
        templateKey: 'option-brief',
        citations: [
          cite('options:ranker', 'Ranker', `The options ranker (${lead.rankerVersion})`),
          cite('options:count', 'Options', plural(options.length, 'option')),
          leadCite,
          cite('options:basis', 'Rank basis', lead.rankBasis.replace(/\.$/, '')),
        ],
        findings: options.map((o) => `${o.rank}. ${o.title}`),
        gaps: [],
      });

      const checks = lead.mandateChecks as MandateCheck[];
      const authority = lead.authority as { requiredRole: Role; twoPerson: boolean } | null;
      steps.push({
        agentKey: 'mandate-checker',
        templateKey: 'mandate-brief',
        citations: [
          leadCite,
          cite(
            'mandates:summary',
            'Mandate checks',
            checks.length
              ? checks.map((m) => `${m.mandateKey} ${m.status}`).join('; ')
              : 'no mandates are configured',
          ),
          cite(
            'options:authority',
            'Authority',
            authority
              ? `the ${ROLE_LABEL_API[authority.requiredRole]}${authority.twoPerson ? ', with two-person approval' : ''}, after expert review`
              : 'no authority rule is configured for this action',
          ),
        ],
        findings: checks.map((m) => `${m.mandateKey} (${m.status}): ${m.detail}`),
        gaps: authority ? [] : ['authority rule missing for the leading action'],
      });

      const metric = metricDef('nav_at_risk_peak');
      const s = sensitivity(drivers, engineInputsFrom(inputs), metric.key, 'd90');
      const labelOf = (ref: string) => inputs.find((i) => i.ref === ref)?.label ?? ref;
      const unitOf = (ref: string) => inputs.find((i) => i.ref === ref)?.unit ?? null;
      const [top, second] = s.rows;
      const fmt = (n: number) => formatValue(n, metric.unit, metric.decimals);
      const weak = unverified.length + disputed.length;
      steps.push({
        agentKey: 'red-team-critic',
        templateKey: 'red-team',
        citations: [
          leadCite,
          cite('sensitivity:central', 'Central estimate', `${metric.label} of ${fmt(s.central)}`),
          cite('sensitivity:top', 'Most sensitive input', labelOf(top!.ref)),
          cite('sensitivity:top_low_input', 'Input low', formatValue(top!.inputLow, unitOf(top!.ref), 2)),
          cite('sensitivity:top_high_input', 'Input high', formatValue(top!.inputHigh, unitOf(top!.ref), 2)),
          cite('sensitivity:top_low', 'Estimate at input low', fmt(top!.valueAtLow)),
          cite('sensitivity:top_high', 'Estimate at input high', fmt(top!.valueAtHigh)),
          cite('sensitivity:second', 'Second most sensitive input', labelOf(second!.ref)),
          cite(
            'evidence:weakness',
            'Evidence weakness',
            weak
              ? `${plural(weak, 'linked evidence item')} ${weak === 1 ? 'is' : 'are'} unverified, stale or disputed`
              : 'All linked evidence is validated',
          ),
        ],
        findings: s.rows
          .filter((r) => r.swing > 0)
          .slice(0, 5)
          .map((r) => `${labelOf(r.ref)}: ${fmt(r.valueAtLow)} to ${fmt(r.valueAtHigh)}`),
        gaps: [],
      });
    }
  }

  // Memory scout: approved decisions with outcomes in this institution's memory, same workspace, readable cases only.
  const memory = await tx
    .select({ title: memoryEntries.title, outcome: memoryEntries.outcome, caseKey: cases.key })
    .from(memoryEntries)
    .innerJoin(cases, eq(cases.id, memoryEntries.caseId))
    .where(
      and(
        caseReadable(ctx.scope),
        ne(memoryEntries.caseId, kase.id),
        kase.sectorKey
          ? or(eq(cases.sectorKey, kase.sectorKey), eq(cases.domain, kase.domain))
          : eq(cases.domain, kase.domain),
      ),
    )
    .orderBy(desc(memoryEntries.createdAt))
    .limit(5);
  if (memory.length === 0)
    steps.push(
      gap('memory-scout', "no earlier decision in this institution's memory concerns this workspace"),
    );
  else
    steps.push({
      agentKey: 'memory-scout',
      templateKey: 'memory-brief',
      citations: [
        cite('memory:count', 'Precedents', plural(memory.length, 'earlier decision')),
        cite(
          'memory:closest',
          'Closest',
          `${memory[0]!.title} (${memory[0]!.caseKey}), outcome ${memory[0]!.outcome}`,
        ),
      ],
      findings: memory.map((m) => `${m.caseKey}: ${m.title} (${m.outcome})`),
      gaps: [],
    });

  return { steps, scenarioRunId: run?.id ?? null };
}

function toRunItem(
  r: typeof analysisRuns.$inferSelect,
  caseKey: string,
  by: string,
  scenarioKey: string | null,
): AnalysisRunItem {
  return {
    key: r.key,
    caseKey,
    version: r.version,
    question: r.question,
    scenarioKey,
    inputHash: r.inputHash,
    createdAt: r.createdAt.toISOString(),
    createdBy: by,
    steps: r.steps as AnalysisStepItem[],
    gapCount: r.gapCount,
  };
}

const caseKeyParam = z.object({ key: z.string().regex(/^[A-Z0-9-]{3,40}$/) });

export async function analysisRoutes(app: FastifyInstance, deps: AppDeps) {
  const guard = { preHandler: requireSession(deps) };

  app.get('/api/model-gateway', guard, async () => providerStatus(config.MODEL_PROVIDER_URL));

  app.get('/api/cases/:key/analysis', guard, async (request, reply) => {
    const params = caseKeyParam.safeParse(request.params);
    if (!params.success) return reply.code(404).send({ error: 'not_found' });
    const ctx = ctxOf(request);
    const out = await withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const [kase] = await tx
        .select()
        .from(cases)
        .where(and(eq(cases.key, params.data.key), caseReadable(ctx.scope)));
      if (!kase) return null;
      const rows = await tx
        .select({ r: analysisRuns, by: principals.displayName, scenarioKey: scenarioRuns.key })
        .from(analysisRuns)
        .innerJoin(principals, eq(principals.id, analysisRuns.createdBy))
        .leftJoin(scenarioRuns, eq(scenarioRuns.id, analysisRuns.scenarioRunId))
        .where(eq(analysisRuns.caseId, kase.id))
        .orderBy(desc(analysisRuns.createdAt))
        .limit(10);
      return {
        caseKey: kase.key,
        canRun: ANALYSIS_ROLES.some((r) => ctx.roles.includes(r)) && kase.state !== 'closed',
        agents: ANALYSIS_AGENTS,
        gateway: providerStatus(config.MODEL_PROVIDER_URL),
        runs: rows.map((x) => toRunItem(x.r, kase.key, x.by, x.scenarioKey)),
      };
    });
    if (!out) return reply.code(404).send({ error: 'not_found' });
    return out;
  });

  app.post('/api/cases/:key/analysis', guard, async (request, reply) => {
    const params = caseKeyParam.safeParse(request.params);
    if (!params.success) return reply.code(404).send({ error: 'not_found' });
    const ctx = ctxOf(request);
    const result = await withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const [kase] = await tx
        .select()
        .from(cases)
        .where(and(eq(cases.key, params.data.key), caseReadable(ctx.scope)));
      if (!kase) return { status: 404 as const, error: 'not_found' };
      if (!ANALYSIS_ROLES.some((r) => ctx.roles.includes(r)))
        return { status: 403 as const, error: 'not_permitted' };
      if (kase.state === 'closed') return { status: 409 as const, error: 'case_closed' };

      const now = new Date();
      const { steps: specs, scenarioRunId } = await planSteps(tx, ctx, kase);
      const steps: AnalysisStepItem[] = specs.map((s) => {
        const d = draft({ templateKey: s.templateKey, citations: s.citations });
        const agent = ANALYSIS_AGENTS.find((a) => a.key === s.agentKey)!;
        return {
          agentKey: s.agentKey,
          agentName: agent.name,
          status: s.templateKey === 'analysis-gap' ? 'gap' : 'completed',
          text: d.text,
          findings: s.findings,
          gaps: s.gaps,
          citations: s.citations,
          grounding: d.grounding,
          modelId: d.modelId,
          modelVersion: d.modelVersion,
          templateKey: d.templateKey,
          templateVersion: d.templateVersion,
        };
      });
      const key = await nextAnalysisKey(tx, now);
      const question = specs[0]!.citations[0]!.display;
      const inputHash = sha({ version: ANALYSIS_VERSION, citations: specs.map((s) => s.citations) });
      const gapCount = steps.filter((s) => s.status === 'gap').length;
      const [run] = await tx
        .insert(analysisRuns)
        .values({
          institutionId: ctx.institutionId,
          key,
          caseId: kase.id,
          version: ANALYSIS_VERSION,
          question,
          scenarioRunId,
          steps,
          gapCount,
          inputHash,
          createdBy: ctx.principalId,
          createdAt: now,
        })
        .returning({ id: analysisRuns.id });
      await tx.insert(agentRuns).values(
        steps.map((s) => ({
          institutionId: ctx.institutionId,
          agentKey: s.agentKey,
          sectorKey: kase.sectorKey ?? 'institution',
          task: `Case analysis ${key}: ${s.agentName}`,
          caseId: kase.id,
          scenarioRunId,
          analysisRunId: run!.id,
          modelId: s.modelId,
          modelVersion: s.modelVersion,
          external: false,
          templateKey: s.templateKey,
          templateVersion: s.templateVersion,
          inputs: s.citations,
          outputText: s.text,
          grounding: s.grounding,
          policyDecision: 'allowed: internal deterministic stub',
          status: 'completed',
          triggeredBy: ctx.principalId,
          startedAt: now,
          finishedAt: now,
        })),
      );
      await tx.insert(caseEvents).values({
        institutionId: ctx.institutionId,
        caseId: kase.id,
        actorPrincipalId: ctx.principalId,
        eventType: 'analysis.run_recorded',
        fromState: null,
        toState: null,
        rationale: `Case analysis ${key} recorded: ${steps.length - gapCount} steps answered, ${gapCount} reported gaps.`,
        occurredAt: now,
      });
      await appendAudit(tx, {
        institutionId: ctx.institutionId,
        actorPrincipalId: ctx.principalId,
        actorType: 'human',
        action: 'analysis.run',
        objectType: 'analysis_run',
        objectId: run!.id,
        caseId: kase.id,
        payload: { key, version: ANALYSIS_VERSION, inputHash, gapCount },
      });
      return { status: 201 as const, key };
    });
    if (result.status !== 201) return reply.code(result.status).send({ error: result.error });
    return reply.code(201).send({ key: result.key });
  });

  /** One-at-a-time sensitivity of a stored scenario run, recomputed from its stored inputs (FR-24). */
  app.get('/api/scenarios/:key/sensitivity', guard, async (request, reply) => {
    const params = z.object({ key: z.string().regex(/^SCN-\d{8}-\d{2,}$/) }).safeParse(request.params);
    const query = z
      .object({
        metric: z.enum(METRICS.map((m) => m.key) as [string, ...string[]]).default('nav_at_risk_peak'),
        horizon: z.enum(SCENARIO_HORIZONS.map((h) => h.key) as [HorizonKey, ...HorizonKey[]]).default('d90'),
      })
      .safeParse(request.query);
    if (!params.success || !query.success) return reply.code(404).send({ error: 'not_found' });
    const ctx = ctxOf(request);
    const out = await withInstitution(
      deps.db,
      ctx.institutionId,
      async (tx): Promise<SensitivityPayload | null> => {
        const [row] = await tx
          .select({ r: scenarioRuns })
          .from(scenarioRuns)
          .innerJoin(cases, eq(cases.id, scenarioRuns.caseId))
          .where(and(eq(scenarioRuns.key, params.data.key), caseReadable(ctx.scope)));
        if (!row) return null;
        const inputs = row.r.inputs as ScenarioInputRef[];
        const def = metricDef(query.data.metric);
        const result = sensitivity(
          row.r.drivers as Drivers,
          engineInputsFrom(inputs),
          def.key,
          query.data.horizon,
        );
        for (const r of result.rows) {
          const i = inputs.find((x) => x.ref === r.ref);
          if (i) {
            r.label = i.label;
            r.unit = i.unit ?? '';
          }
        }
        const h = SCENARIO_HORIZONS.find((x) => x.key === query.data.horizon)!;
        return {
          scenarioKey: row.r.key,
          engineVersion: row.r.engineVersion,
          inputHash: row.r.inputHash,
          metric: { key: def.key, label: def.label, unit: def.unit ?? '', decimals: def.decimals },
          horizon: { key: h.key, label: h.label },
          result,
          metrics: METRICS.map((m) => ({ key: m.key, label: m.label })),
        };
      },
    );
    if (!out) return reply.code(404).send({ error: 'not_found' });
    return out;
  });
}
