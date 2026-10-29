/**
 * Foresight & Scenarios (Phase 3, FR-14..FR-18). A scenario run resolves its inputs from evidence facts and
 * the assumption register, runs the deterministic engine, drafts ranked options and records the specialist
 * drafts made through the gateway. Runs are append-only; changing a driver creates a new run.
 */
import { createHash } from 'node:crypto';
import {
  ASSUMPTION_KEYS,
  ENGINE,
  HORMUZ_DRIVERS,
  INPUT_REFS,
  METRICS,
  RANKER,
  SECTORS,
  checkMandates,
  formatScenarioValue,
  rankOptions,
  runEngine,
  scenarioConfidence,
  validateDrivers,
  type AgentRunItem,
  type AssumptionItem,
  type AssumptionKey,
  type ClaimClass,
  type ConfidenceBasis,
  type DraftOptionItem,
  type Drivers,
  type EngineInputs,
  type EngineResult,
  type MandateCheck,
  type Range3,
  type Role,
  type ScenarioInputRef,
  type ScenarioRunDetail,
  type ScenarioRunSummary,
  type ScenarioSetup,
  type Severity,
  type ValidationStatus,
} from '@tigeris/shared';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { appendAudit, canonicalJson } from '../audit/audit';
import { withInstitution, type Tx } from '../db/client';
import {
  agentRuns,
  assumptions,
  authorityRules,
  caseEvents,
  cases,
  draftOptions,
  evidenceFacts,
  evidenceObjects,
  mandates,
  principals,
  scenarioRuns,
  sources,
} from '../db/schema';
import { ROLE_LABEL_API } from './roles';
import { ctxOf, requireSession, type AppDeps } from './context';
import { draft, type Citation } from './gateway';

export const SCENARIO_ROLES: readonly Role[] = ['analyst'];

/** Evidence facts the engine reads, by input reference. */
const FACT_BINDINGS: Record<string, { externalId: string; predicate: string }> = {
  [INPUT_REFS.baselineFlowMbd]: {
    externalId: 'eia:todayinenergy:61002',
    predicate: 'Average oil flow, 2023',
  },
  [INPUT_REFS.globalLiquidsSharePct]: {
    externalId: 'eia:todayinenergy:61002',
    predicate: 'Share of global petroleum liquids consumption, 2023',
  },
  [INPUT_REFS.exposedNavSharePct]: {
    externalId: 'gsia-demo:exposure-register:v1',
    predicate: 'Energy and shipping share of net asset value',
  },
  [INPUT_REFS.fuelBufferDays]: {
    externalId: 'gsia-demo:dependency:energy-water:v1',
    predicate: 'Fuel buffer before output reduction',
  },
  [INPUT_REFS.dependentPlants]: {
    externalId: 'gsia-demo:dependency:energy-water:v1',
    predicate: 'Desalination plants dependent on gas-fired power',
  },
  'fact:route_dependent_holdings': {
    externalId: 'gsia-demo:exposure-register:v1',
    predicate: 'Holdings with Hormuz route dependency',
  },
};

const TEMPLATE_INFO = {
  key: ENGINE.key,
  title: 'Hormuz disruption',
  engineVersion: ENGINE.version,
  description:
    'Transit restriction at the Strait of Hormuz: energy flow at risk, portfolio exposure, water and power resilience, and freight and insurance cost across four horizons.',
};

const sha = (v: unknown) => createHash('sha256').update(canonicalJson(v)).digest('hex');

export const formatValue = formatScenarioValue;

async function latestAssumptions(tx: Tx): Promise<AssumptionItem[]> {
  const rows = await tx.select().from(assumptions).orderBy(assumptions.key, desc(assumptions.version));
  const seen = new Set<string>();
  const out: AssumptionItem[] = [];
  for (const r of rows) {
    if (seen.has(r.key)) continue;
    seen.add(r.key);
    out.push({
      id: r.id,
      key: r.key,
      label: r.label,
      unit: r.unit,
      low: Number(r.low),
      central: Number(r.central),
      high: Number(r.high),
      rationale: r.rationale,
      basisEvidenceId: r.basisEvidenceId,
      ownerRole: r.ownerRole as Role,
      version: r.version,
      claimClass: 'assumed',
    });
  }
  return out;
}

type FactInput = Extract<ScenarioInputRef, { kind: 'evidence_fact' }>;
type AssumptionInput = Extract<ScenarioInputRef, { kind: 'assumption' }>;

async function resolveFacts(tx: Tx): Promise<{ facts: FactInput[]; missing: string[] }> {
  const ids = [...new Set(Object.values(FACT_BINDINGS).map((b) => b.externalId))];
  const rows = await tx
    .select({ e: evidenceObjects, f: evidenceFacts, publisher: sources.publisher })
    .from(evidenceObjects)
    .innerJoin(evidenceFacts, eq(evidenceFacts.evidenceId, evidenceObjects.id))
    .innerJoin(sources, eq(sources.id, evidenceObjects.sourceId))
    .where(inArray(evidenceObjects.externalId, ids));
  const facts: FactInput[] = [];
  const missing: string[] = [];
  for (const [ref, b] of Object.entries(FACT_BINDINGS)) {
    const hit = rows.find(
      (r) =>
        r.e.externalId === b.externalId &&
        r.f.predicate === b.predicate &&
        r.f.valueNum !== null &&
        r.e.validationStatus !== 'quarantined',
    );
    if (!hit) {
      missing.push(b.predicate);
      continue;
    }
    facts.push({
      ref,
      kind: 'evidence_fact',
      label: b.predicate,
      value: Number(hit.f.valueNum),
      unit: hit.f.unit,
      claimClass: hit.f.claimClass as ClaimClass,
      validationStatus: hit.e.validationStatus as ValidationStatus,
      evidenceId: hit.e.id,
      factId: hit.f.id,
      publisher: hit.publisher,
    });
  }
  return { facts, missing };
}

/** Rebuilds engine inputs from stored input references, so a stored run can be re-computed and verified. */
export function engineInputsFrom(inputs: ScenarioInputRef[]): EngineInputs {
  const fact = (ref: string) => {
    const hit = inputs.find((i) => i.ref === ref);
    if (!hit || hit.kind !== 'evidence_fact') throw new Error(`missing input ${ref}`);
    return hit.value;
  };
  const a = {} as Record<AssumptionKey, Range3>;
  for (const k of ASSUMPTION_KEYS) {
    const hit = inputs.find((i) => i.ref === `assumption:${k}`);
    if (!hit || hit.kind !== 'assumption') throw new Error(`missing assumption ${k}`);
    a[k] = { low: hit.low, central: hit.central, high: hit.high };
  }
  return {
    facts: {
      baselineFlowMbd: fact(INPUT_REFS.baselineFlowMbd),
      globalLiquidsSharePct: fact(INPUT_REFS.globalLiquidsSharePct),
      exposedNavSharePct: fact(INPUT_REFS.exposedNavSharePct),
      fuelBufferDays: fact(INPUT_REFS.fuelBufferDays),
      dependentPlants: fact(INPUT_REFS.dependentPlants),
    },
    assumptions: a,
  };
}

function warningsFor(inputs: ScenarioInputRef[]): string[] {
  const facts = inputs.filter((i): i is FactInput => i.kind === 'evidence_fact');
  const out: string[] = [];
  for (const f of facts.filter(
    (f) => f.validationStatus === 'unverified' || f.validationStatus === 'disputed',
  ))
    out.push(`Uses ${f.validationStatus} input: ${f.label} (${f.publisher}).`);
  const synthetic = facts.filter((f) => f.claimClass === 'synthetic' || f.claimClass === 'assumed');
  if (synthetic.length)
    out.push(
      `Uses ${synthetic.length} synthetic demonstration inputs from the fictional institution's registers.`,
    );
  out.push(`${ASSUMPTION_KEYS.length} labelled assumptions and 4 analyst drivers shape every range.`);
  return out;
}

async function nextRunKey(tx: Tx, now: Date): Promise<string> {
  const day = now.toISOString().slice(0, 10).replace(/-/g, '');
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(scenarioRuns)
    .where(sql`${scenarioRuns.key} like ${'SCN-' + day + '-%'}`);
  return `SCN-${day}-${String((row?.n ?? 0) + 1).padStart(2, '0')}`;
}

const AGENT_NAME = new Map(SECTORS.flatMap((s) => s.agents.map((a) => [a.key, a.name] as const)));

interface StoredOutputs {
  result: EngineResult;
  metricDefs: typeof METRICS;
  ranking: { severity: Severity; navCentral: number; rankerVersion: string };
  confidence: ConfidenceBasis;
}

const metricDef = (key: string) => METRICS.find((m) => m.key === key)!;

/** Citations every specialist draft may quote. Display strings are the only numbers prose can contain. */
function buildCitations(
  drivers: Drivers,
  inputs: ScenarioInputRef[],
  result: EngineResult,
): Record<string, Citation> {
  const c: Record<string, Citation> = {};
  const add = (ref: string, label: string, display: string) => (c[ref] = { ref, label, display });
  for (const d of HORMUZ_DRIVERS) add(`driver:${d.key}`, d.label, formatValue(drivers[d.key], d.unit, 1));
  for (const i of inputs) {
    if (i.kind === 'evidence_fact') add(i.ref, i.label, formatValue(i.value, i.unit, 1));
    if (i.kind === 'assumption')
      for (const k of ['low', 'central', 'high'] as const)
        add(`${i.ref}:${k}`, `${i.label} (${k})`, formatValue(i[k], i.unit, 2));
  }
  for (const m of result.metrics) {
    const def = metricDef(m.key);
    for (const k of ['low', 'central', 'high'] as const)
      add(
        `metric:${m.key}:${k}`,
        `${def.label} (${k}, 90 days)`,
        formatValue(m.values.d90[k], def.unit, def.decimals),
      );
    add(
      `metric:${m.key}:h72`,
      `${def.label} (central, 72 hours)`,
      formatValue(m.values.h72.central, def.unit, def.decimals),
    );
  }
  for (const h of result.horizons) add(`horizon:${h.key}`, 'Horizon', h.label);
  return c;
}

function pick(c: Record<string, Citation>, refs: string[]): Citation[] {
  return refs.map((r) => {
    const hit = c[r];
    if (!hit) throw new Error(`citation missing: ${r}`);
    return hit;
  });
}

const SPECIALIST_DRAFTS: {
  agentKey: string;
  sectorKey: string;
  task: string;
  templateKey: string;
  refs: string[];
}[] = [
  {
    agentKey: 'energy-impact',
    sectorKey: 'energy',
    task: 'Impact summary',
    templateKey: 'impact-summary',
    refs: [
      'driver:capacityLostPct',
      'driver:durationDays',
      'metric:net_disrupted_flow:central',
      'metric:net_disrupted_flow:low',
      'metric:net_disrupted_flow:high',
      'horizon:d90',
      'metric:global_share_disrupted:central',
      INPUT_REFS.baselineFlowMbd,
    ],
  },
  {
    agentKey: 'route-alternatives',
    sectorKey: 'energy',
    task: 'Bypass route note',
    templateKey: 'bypass-note',
    refs: [
      'driver:bypassMbd',
      'assumption:bypass_capacity:low',
      'assumption:bypass_capacity:high',
      'assumption:bypass_ramp_days:central',
      'horizon:h72',
      'metric:net_disrupted_flow:h72',
    ],
  },
  {
    agentKey: 'outage-risk',
    sectorKey: 'utilities',
    task: 'Water and power resilience note',
    templateKey: 'resilience-note',
    refs: [
      INPUT_REFS.fuelBufferDays,
      'driver:durationDays',
      'metric:desal_reduced_output_days:central',
      'horizon:d90',
      'metric:utility_fuel_cost:central',
      'driver:oilPriceShockPct',
    ],
  },
  {
    agentKey: 'exposure-analyst',
    sectorKey: 'capital',
    task: 'Portfolio exposure note',
    templateKey: 'exposure-note',
    refs: [
      INPUT_REFS.exposedNavSharePct,
      'fact:route_dependent_holdings',
      'metric:nav_at_risk_peak:central',
      'metric:nav_at_risk_peak:low',
      'metric:nav_at_risk_peak:high',
      'assumption:valuation_elasticity:central',
    ],
  },
];

const ROLE_PHRASE = (role: Role, twoPerson: boolean) =>
  `the ${ROLE_LABEL_API[role]}'s authority${twoPerson ? ', with two-person approval' : ''}, after expert review`;

async function recordAgentRun(
  tx: Tx,
  base: { institutionId: string; caseId: string; scenarioRunId: string; triggeredBy: string; at: Date },
  spec: { agentKey: string; sectorKey: string; task: string; templateKey: string; citations: Citation[] },
) {
  const d = draft({ templateKey: spec.templateKey, citations: spec.citations });
  const [row] = await tx
    .insert(agentRuns)
    .values({
      institutionId: base.institutionId,
      agentKey: spec.agentKey,
      sectorKey: spec.sectorKey,
      task: spec.task,
      caseId: base.caseId,
      scenarioRunId: base.scenarioRunId,
      modelId: d.modelId,
      modelVersion: d.modelVersion,
      external: false,
      templateKey: d.templateKey,
      templateVersion: d.templateVersion,
      inputs: spec.citations,
      outputText: d.text,
      grounding: d.grounding,
      policyDecision: d.policyDecision,
      status: d.status,
      triggeredBy: base.triggeredBy,
      startedAt: base.at,
      finishedAt: base.at,
    })
    .returning({ id: agentRuns.id });
  return { id: row!.id, text: d.text };
}

const runBody = z.object({
  caseKey: z.string().regex(/^[A-Z0-9-]{3,40}$/),
  drivers: z.record(z.string(), z.unknown()),
});

export async function scenarioRoutes(app: FastifyInstance, deps: AppDeps) {
  const guard = { preHandler: requireSession(deps) };

  app.get('/api/scenarios/setup', guard, async (request): Promise<ScenarioSetup> => {
    const ctx = ctxOf(request);
    return withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const [register, caseRows] = await Promise.all([
        latestAssumptions(tx),
        tx.select().from(cases).orderBy(desc(cases.updatedAt)),
      ]);
      return {
        template: TEMPLATE_INFO,
        drivers: HORMUZ_DRIVERS,
        assumptions: register,
        cases: caseRows
          .filter((c) => c.state !== 'closed')
          .map((c) => ({
            key: c.key,
            title: c.title,
            state: c.state as ScenarioSetup['cases'][number]['state'],
            domain: c.domain,
          })),
        canRun: SCENARIO_ROLES.some((r) => ctx.roles.includes(r)),
      };
    });
  });

  app.get('/api/scenarios', guard, async (request): Promise<ScenarioRunSummary[]> => {
    const ctx = ctxOf(request);
    const q = z
      .object({
        case: z
          .string()
          .regex(/^[A-Z0-9-]{3,40}$/)
          .optional(),
      })
      .safeParse(request.query);
    const caseKey = q.success ? q.data.case : undefined;
    return withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const rows = await tx
        .select({ r: scenarioRuns, caseKey: cases.key, caseTitle: cases.title, by: principals.displayName })
        .from(scenarioRuns)
        .innerJoin(cases, eq(cases.id, scenarioRuns.caseId))
        .innerJoin(principals, eq(principals.id, scenarioRuns.createdBy))
        .where(caseKey ? eq(cases.key, caseKey) : undefined)
        .orderBy(desc(scenarioRuns.createdAt));
      return rows.map((x) => toSummary(x.r, x.caseKey, x.caseTitle, x.by));
    });
  });

  app.post('/api/scenarios', guard, async (request, reply) => {
    const ctx = ctxOf(request);
    if (!SCENARIO_ROLES.some((r) => ctx.roles.includes(r)))
      return reply.code(403).send({ error: 'not_permitted' });
    const body = runBody.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_request' });
    const drivers = validateDrivers(body.data.drivers);
    if (!drivers) return reply.code(400).send({ error: 'invalid_drivers' });

    const result = await withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const [kase] = await tx.select().from(cases).where(eq(cases.key, body.data.caseKey));
      if (!kase) return { status: 404 as const, error: 'not_found' };
      if (kase.state === 'closed') return { status: 409 as const, error: 'case_closed' };

      const [{ facts, missing }, register, mandateRows, ruleRows] = await Promise.all([
        resolveFacts(tx),
        latestAssumptions(tx),
        tx.select().from(mandates),
        tx.select().from(authorityRules),
      ]);
      const missingAssumptions = ASSUMPTION_KEYS.filter((k) => !register.some((a) => a.key === k));
      if (missing.length || missingAssumptions.length)
        return {
          status: 409 as const,
          error: 'inputs_not_connected',
          missing: [...missing, ...missingAssumptions],
        };

      const assumptionInputs: AssumptionInput[] = ASSUMPTION_KEYS.map((k) => {
        const a = register.find((x) => x.key === k)!;
        return {
          ref: `assumption:${k}`,
          kind: 'assumption',
          label: a.label,
          unit: a.unit,
          low: a.low,
          central: a.central,
          high: a.high,
          claimClass: 'assumed',
          assumptionId: a.id,
          version: a.version,
          rationale: a.rationale,
        };
      });
      const driverInputs: ScenarioInputRef[] = HORMUZ_DRIVERS.map((d) => ({
        ref: `driver:${d.key}`,
        kind: 'driver',
        label: d.label,
        unit: d.unit,
        value: drivers[d.key],
        claimClass: 'assumed',
      }));
      const inputs: ScenarioInputRef[] = [...facts, ...assumptionInputs, ...driverInputs];
      const engineResult = runEngine(drivers, engineInputsFrom(inputs));

      const factOf = (ref: string) => facts.find((f) => f.ref === ref)!;
      const situation = {
        durationDays: drivers.durationDays,
        routeDependentHoldings: factOf('fact:route_dependent_holdings').value,
        exposedNavSharePct: factOf(INPUT_REFS.exposedNavSharePct).value,
        fuelBufferDays: factOf(INPUT_REFS.fuelBufferDays).value,
        unverifiedInputs: facts.filter((f) => f.validationStatus === 'unverified').length,
        disputedInputs: facts.filter((f) => f.validationStatus === 'disputed').length,
        syntheticInputs: facts.filter((f) => f.claimClass === 'synthetic' || f.claimClass === 'assumed')
          .length,
        assumptionsInRankingMetric: metricDef('nav_at_risk_peak').inputs.filter(
          (r) => r.startsWith('assumption:') || r === 'driver:bypassMbd',
        ).length,
      };
      const mandateChecks: MandateCheck[] = checkMandates(
        engineResult,
        situation,
        mandateRows.map((m) => ({
          key: m.key,
          title: m.title,
          limitValue: m.limitValue === null ? null : Number(m.limitValue),
          limitUnit: m.limitUnit,
        })),
      );
      const confidence = scenarioConfidence(engineResult, situation);
      const ranking = rankOptions(engineResult);
      const warnings = warningsFor(inputs);

      const now = new Date();
      const key = await nextRunKey(tx, now);
      const outputs: StoredOutputs = {
        result: engineResult,
        metricDefs: METRICS,
        ranking: {
          severity: ranking.severity,
          navCentral: ranking.navCentral,
          rankerVersion: RANKER.version,
        },
        confidence,
      };
      const [run] = await tx
        .insert(scenarioRuns)
        .values({
          institutionId: ctx.institutionId,
          key,
          caseId: kase.id,
          templateKey: ENGINE.key,
          engineVersion: ENGINE.version,
          title: `${TEMPLATE_INFO.title}: ${drivers.capacityLostPct}% capacity lost for ${drivers.durationDays} days`,
          drivers,
          inputs,
          outputs,
          warnings,
          inputHash: sha({ engine: ENGINE, drivers, inputs }),
          outputHash: sha(engineResult),
          createdBy: ctx.principalId,
          createdAt: now,
        })
        .returning({ id: scenarioRuns.id });

      const base = {
        institutionId: ctx.institutionId,
        caseId: kase.id,
        scenarioRunId: run!.id,
        triggeredBy: ctx.principalId,
        at: now,
      };
      const citations = buildCitations(drivers, inputs, engineResult);
      for (const s of SPECIALIST_DRAFTS)
        await recordAgentRun(tx, base, { ...s, citations: pick(citations, s.refs) });

      for (const o of ranking.options) {
        const rule = ruleRows.find((r) => r.actionClass === o.actionClass);
        const authority = rule
          ? {
              requiredRole: rule.requiredRole as Role,
              thresholdText: rule.thresholdText,
              twoPerson: rule.twoPerson,
              requiresExpertReview: rule.requiresExpertReview,
              selfApprovalBlocked: rule.selfApprovalBlocked,
            }
          : null;
        const optionCitations = [
          { ref: 'option:title', label: 'Option', display: o.title },
          { ref: 'option:severity', label: 'Severity rule', display: ranking.severity },
          {
            ref: 'option:authority',
            label: 'Authority',
            display: authority
              ? ROLE_PHRASE(authority.requiredRole, authority.twoPerson)
              : 'an authority rule that is not configured',
          },
          ...pick(citations, [
            'metric:nav_at_risk_peak:central',
            'horizon:d90',
            'metric:war_risk_premium:central',
          ]),
        ];
        const drafted = await recordAgentRun(tx, base, {
          agentKey: 'allocation-options',
          sectorKey: 'capital',
          task: `Draft option ${o.rank}: ${o.actionClass}`,
          templateKey: 'option-rationale',
          citations: optionCitations,
        });
        await tx.insert(draftOptions).values({
          institutionId: ctx.institutionId,
          key: `${key}-O${o.rank}`,
          scenarioRunId: run!.id,
          caseId: kase.id,
          rank: o.rank,
          actionClass: o.actionClass,
          title: o.title,
          summary: drafted.text,
          rankBasis: o.rankBasis,
          mandateChecks,
          authority,
          confidence,
          citedRefs: optionCitations.map((c) => c.ref),
          rankerVersion: RANKER.version,
          draftedByRunId: drafted.id,
          createdBy: ctx.principalId,
          createdAt: now,
        });
      }

      const summary = mandateChecks.map((m) => `${m.title} — ${m.status}: ${m.detail}`).join(' ');
      await recordAgentRun(tx, base, {
        agentKey: 'mandate-check',
        sectorKey: 'capital',
        task: 'Mandate alignment check',
        templateKey: 'mandate-summary',
        citations: [
          { ref: 'mandates:summary', label: 'Mandate checks', display: summary || 'no mandates configured' },
        ],
      });

      // The case's scenario-stability factor now has a basis. The overall band stays a human assessment.
      const stability = confidence.factors.find((f) => f.factor === 'scenario_stability')!;
      const caseConfidence = kase.confidence as ConfidenceBasis;
      await tx
        .update(cases)
        .set({
          confidence: {
            ...caseConfidence,
            factors: caseConfidence.factors.map((f) =>
              f.factor === 'scenario_stability'
                ? { ...f, band: stability.band, note: `${stability.note} (${key})` }
                : f,
            ),
          },
          version: kase.version + 1,
          updatedAt: now,
        })
        .where(eq(cases.id, kase.id));
      await tx.insert(caseEvents).values({
        institutionId: ctx.institutionId,
        caseId: kase.id,
        actorPrincipalId: ctx.principalId,
        eventType: 'scenario.run_recorded',
        fromState: null,
        toState: null,
        rationale: `Scenario ${key} recorded with ${ranking.options.length} draft options for expert review.`,
        occurredAt: now,
      });
      await appendAudit(tx, {
        institutionId: ctx.institutionId,
        actorPrincipalId: ctx.principalId,
        actorType: 'human',
        action: 'scenario.run',
        objectType: 'scenario_run',
        objectId: run!.id,
        caseId: kase.id,
        payload: { key, engine: ENGINE, drivers, inputHash: sha({ engine: ENGINE, drivers, inputs }) },
      });
      return { status: 201 as const, key };
    });

    if (result.status !== 201)
      return reply
        .code(result.status)
        .send({ error: result.error, ...('missing' in result ? { missing: result.missing } : {}) });
    return reply.code(201).send({ key: result.key });
  });

  app.get('/api/scenarios/:key', guard, async (request, reply) => {
    const params = z.object({ key: z.string().regex(/^SCN-\d{8}-\d{2,}$/) }).safeParse(request.params);
    if (!params.success) return reply.code(404).send({ error: 'not_found' });
    const ctx = ctxOf(request);
    const detail = await withInstitution(
      deps.db,
      ctx.institutionId,
      async (tx): Promise<ScenarioRunDetail | null> => {
        const [row] = await tx
          .select({ r: scenarioRuns, caseKey: cases.key, caseTitle: cases.title, by: principals.displayName })
          .from(scenarioRuns)
          .innerJoin(cases, eq(cases.id, scenarioRuns.caseId))
          .innerJoin(principals, eq(principals.id, scenarioRuns.createdBy))
          .where(eq(scenarioRuns.key, params.data.key));
        if (!row) return null;
        const outputs = row.r.outputs as StoredOutputs;
        const inputs = row.r.inputs as ScenarioInputRef[];
        const optionRows = await tx
          .select({ o: draftOptions, by: principals.displayName })
          .from(draftOptions)
          .innerJoin(principals, eq(principals.id, draftOptions.createdBy))
          .where(eq(draftOptions.scenarioRunId, row.r.id))
          .orderBy(draftOptions.rank);
        const runs = await listAgentRuns(tx, eq(agentRuns.scenarioRunId, row.r.id));
        let reproducible = false;
        try {
          reproducible =
            sha(runEngine(row.r.drivers as Drivers, engineInputsFrom(inputs))) === row.r.outputHash;
        } catch {
          reproducible = false;
        }
        return {
          ...toSummary(row.r, row.caseKey, row.caseTitle, row.by),
          dataMode: 'scenario',
          inputs,
          result: outputs.result,
          metricDefs: outputs.metricDefs,
          inputHash: row.r.inputHash,
          outputHash: row.r.outputHash,
          reproducible,
          confidence: outputs.confidence ?? null,
          options: optionRows.map((x) => toDraftOption(x.o, x.by)),
          agentRuns: runs,
        };
      },
    );
    if (!detail) return reply.code(404).send({ error: 'not_found' });
    return detail;
  });

  app.get('/api/agent-runs', guard, async (request): Promise<AgentRunItem[]> => {
    const ctx = ctxOf(request);
    return withInstitution(deps.db, ctx.institutionId, (tx) => listAgentRuns(tx, undefined, 200));
  });
}

/** Maps a stored draft option (immutable, status always 'draft') to its API shape. */
export function toDraftOption(o: typeof draftOptions.$inferSelect, createdBy: string): DraftOptionItem {
  return {
    id: o.id,
    key: o.key,
    rank: o.rank,
    actionClass: o.actionClass,
    title: o.title,
    summary: o.summary,
    rankBasis: o.rankBasis,
    mandateChecks: o.mandateChecks as MandateCheck[],
    authority: o.authority as DraftOptionItem['authority'],
    confidence: o.confidence,
    citedRefs: o.citedRefs as string[],
    rankerVersion: o.rankerVersion,
    status: 'draft',
    draftedByRunId: o.draftedByRunId,
    createdBy,
    createdAt: o.createdAt.toISOString(),
  };
}

function toSummary(
  r: typeof scenarioRuns.$inferSelect,
  caseKey: string,
  caseTitle: string,
  by: string,
): ScenarioRunSummary {
  const outputs = r.outputs as StoredOutputs;
  return {
    id: r.id,
    key: r.key,
    title: r.title,
    templateKey: r.templateKey,
    engineVersion: r.engineVersion,
    caseKey,
    caseTitle,
    drivers: r.drivers as Drivers,
    createdBy: by,
    createdAt: r.createdAt.toISOString(),
    warnings: r.warnings as string[],
    severity: outputs.ranking?.severity ?? null,
  };
}

async function listAgentRuns(
  tx: Tx,
  where: ReturnType<typeof eq> | undefined,
  limit = 500,
): Promise<AgentRunItem[]> {
  const rows = await tx
    .select({ a: agentRuns, by: principals.displayName, caseKey: cases.key, scenarioKey: scenarioRuns.key })
    .from(agentRuns)
    .innerJoin(principals, eq(principals.id, agentRuns.triggeredBy))
    .leftJoin(cases, eq(cases.id, agentRuns.caseId))
    .leftJoin(scenarioRuns, eq(scenarioRuns.id, agentRuns.scenarioRunId))
    .where(where ? and(where) : undefined)
    .orderBy(desc(agentRuns.startedAt), agentRuns.task)
    .limit(limit);
  return rows.map((x) => ({
    id: x.a.id,
    agentKey: x.a.agentKey,
    agentName: AGENT_NAME.get(x.a.agentKey) ?? x.a.agentKey,
    sectorKey: x.a.sectorKey,
    task: x.a.task,
    caseKey: x.caseKey,
    scenarioKey: x.scenarioKey,
    modelId: x.a.modelId,
    modelVersion: x.a.modelVersion,
    external: false,
    templateKey: x.a.templateKey,
    templateVersion: x.a.templateVersion,
    inputs: x.a.inputs as AgentRunItem['inputs'],
    outputText: x.a.outputText,
    grounding: x.a.grounding as AgentRunItem['grounding'],
    policyDecision: x.a.policyDecision,
    status: x.a.status as AgentRunItem['status'],
    triggeredBy: x.by,
    startedAt: x.a.startedAt.toISOString(),
  }));
}
