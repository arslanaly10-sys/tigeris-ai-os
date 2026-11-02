/**
 * Scenario room and the oil-price-shock template (Phase 5F, FR-57, D-109, D-120). Templates are described
 * declaratively; the oil-price shock runs on the positions the analyst may read and the oil assumptions in the
 * register, and is stored apart from Hormuz runs. The room puts up to four runs side by side: headline figures with
 * their ranges, the drivers that differ, and each run's engine version. Position detail is shown only to readers who
 * may read that position; totals are derived figures and always shown.
 */
import {
  ENGINE,
  HORMUZ_DRIVERS,
  METRICS,
  OIL_ASSUMPTION_KEYS,
  OIL_ENGINE,
  OIL_TEMPLATE,
  runOilShock,
  validateOilDrivers,
  type EngineResult,
  type OilAssumptions,
  type OilResult,
  type Range3,
  type Role,
  type ScenarioRoomPayload,
  type ScenarioRoomRun,
  type ScenarioTemplate,
  type TemplateRunDetail,
} from '@tigeris/shared';
import { createHash } from 'node:crypto';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { appendAudit, canonicalJson } from '../audit/audit';
import { withInstitution, type Tx } from '../db/client';
import { assumptions, cases, principals, scenarioRuns, templateRuns } from '../db/schema';
import { ctxOf, requireSession, type AppDeps, type RequestContext } from './context';
import { readPositions } from './portfolio';
import { caseReadable } from './scope';

export const TEMPLATE_RUN_ROLES: readonly Role[] = ['analyst'];
const sha = (v: unknown) => createHash('sha256').update(canonicalJson(v)).digest('hex');

/** The Hormuz engine, described in the same declarative form as later templates. */
const HORMUZ_TEMPLATE: ScenarioTemplate = {
  key: ENGINE.key,
  version: ENGINE.version,
  title: 'Hormuz disruption',
  description:
    'Transit restriction at the Strait of Hormuz: energy flow at risk, portfolio exposure, water and power resilience, and freight and insurance cost.',
  drivers: HORMUZ_DRIVERS.map((d) => ({
    key: d.key,
    label: d.label,
    unit: d.unit,
    min: d.min,
    max: d.max,
    step: d.step,
    default: d.default,
  })),
  assumptionKeys: [],
  outputs: METRICS.map((m) => ({ key: m.key, label: m.label, unit: m.unit ?? '' })),
};

/** Hormuz figures the room compares: the 90-day values of these metrics. */
const ROOM_METRICS = [
  'nav_at_risk_peak',
  'net_disrupted_flow',
  'desal_reduced_output_days',
  'war_risk_premium',
];

async function oilAssumptions(tx: Tx): Promise<OilAssumptions | null> {
  const rows = await tx
    .select()
    .from(assumptions)
    .where(inArray(assumptions.key, [...OIL_ASSUMPTION_KEYS]))
    .orderBy(assumptions.key, desc(assumptions.version));
  const out: Partial<OilAssumptions> = {};
  for (const r of rows)
    if (!out[r.key as keyof OilAssumptions])
      out[r.key as keyof OilAssumptions] = {
        low: Number(r.low),
        central: Number(r.central),
        high: Number(r.high),
        version: r.version,
      };
  return OIL_ASSUMPTION_KEYS.every((k) => out[k]) ? (out as OilAssumptions) : null;
}

async function nextKey(tx: Tx, now: Date): Promise<string> {
  const day = now.toISOString().slice(0, 10).replace(/-/g, '');
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(templateRuns)
    .where(sql`${templateRuns.key} like ${'TR-' + day + '-%'}`);
  return `TR-${day}-${String((row?.n ?? 0) + 1).padStart(2, '0')}`;
}

/** Hides position rows the reader may not read; totals stay, since they are derived figures. */
async function forReader(
  tx: Tx,
  ctx: RequestContext,
  result: OilResult,
): Promise<OilResult & { hiddenPositions: number }> {
  const visible = new Set((await readPositions(tx, ctx.scope)).positions.map((p) => p.key));
  const positions = result.positions.filter((p) => visible.has(p.key));
  return {
    ...result,
    positions,
    topContributors: result.topContributors.filter((k) => visible.has(k)),
    hiddenPositions: result.positions.length - positions.length,
  };
}

const range = (r: Range3) => ({ low: r.low, central: r.central, high: r.high });

export async function scenarioRoomRoutes(app: FastifyInstance, deps: AppDeps) {
  const guard = { preHandler: requireSession(deps) };

  app.get('/api/templates', guard, async (request) => {
    const ctx = ctxOf(request);
    return withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const a = await oilAssumptions(tx);
      const labels = await tx
        .select({
          key: assumptions.key,
          label: assumptions.label,
          unit: assumptions.unit,
          rationale: assumptions.rationale,
          version: assumptions.version,
        })
        .from(assumptions)
        .where(inArray(assumptions.key, [...OIL_ASSUMPTION_KEYS]))
        .orderBy(assumptions.key, desc(assumptions.version));
      const seen = new Set<string>();
      return {
        canRun: TEMPLATE_RUN_ROLES.some((r) => ctx.roles.includes(r)),
        templates: [HORMUZ_TEMPLATE, OIL_TEMPLATE],
        oilAssumptions: labels
          .filter((l) => (seen.has(l.key) ? false : (seen.add(l.key), true)))
          .map((l) => ({
            ...l,
            ...(a ? range(a[l.key as keyof OilAssumptions]) : { low: 0, central: 0, high: 0 }),
            claimClass: 'assumed' as const,
          })),
      };
    });
  });

  app.post('/api/templates/oil-price-shock/runs', guard, async (request, reply) => {
    const ctx = ctxOf(request);
    if (!TEMPLATE_RUN_ROLES.some((r) => ctx.roles.includes(r)))
      return reply.code(403).send({ error: 'not_permitted' });
    const body = z
      .object({ caseKey: z.string().regex(/^[A-Z0-9-]{3,40}$/), drivers: z.record(z.string(), z.unknown()) })
      .safeParse(request.body);
    const drivers = body.success ? validateOilDrivers(body.data.drivers) : null;
    if (!body.success || !drivers) return reply.code(400).send({ error: 'invalid_drivers' });
    return withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const [kase] = await tx
        .select()
        .from(cases)
        .where(and(eq(cases.key, body.data.caseKey), caseReadable(ctx.scope)));
      if (!kase) return reply.code(404).send({ error: 'not_found' });
      const a = await oilAssumptions(tx);
      if (!a) return reply.code(409).send({ error: 'assumptions_missing' });
      const positions = (await readPositions(tx, ctx.scope)).positions;
      if (!positions.length)
        return reply.code(409).send({ error: 'no_positions', message: 'No positions you may read.' });
      const inputs = {
        positions: positions.map((p) => ({ key: p.key, mode: p.provenance.recordMode, asOf: p.asOf })),
        assumptions: Object.fromEntries(OIL_ASSUMPTION_KEYS.map((k) => [k, a[k]])),
      };
      const result = runOilShock(
        drivers,
        positions.map((p) => ({
          key: p.key,
          name: p.name,
          assetClass: p.assetClass,
          sectorKey: p.sectorKey,
          marketValue: p.marketValue,
          currency: p.currency,
          navSharePct: p.navSharePct,
        })),
        a,
      );
      const now = new Date();
      const key = await nextKey(tx, now);
      const title = `${OIL_TEMPLATE.title}: oil ${drivers.oilPriceChangePct > 0 ? '+' : ''}${drivers.oilPriceChangePct}% over ${drivers.horizonMonths} months`;
      const [run] = await tx
        .insert(templateRuns)
        .values({
          institutionId: ctx.institutionId,
          key,
          caseId: kase.id,
          templateKey: OIL_ENGINE.key,
          engineVersion: OIL_ENGINE.version,
          title,
          drivers,
          inputs,
          outputs: result,
          inputHash: sha({ engine: OIL_ENGINE, drivers, inputs }),
          outputHash: sha(result),
          createdBy: ctx.principalId,
          createdAt: now,
        })
        .returning({ id: templateRuns.id });
      await appendAudit(tx, {
        institutionId: ctx.institutionId,
        actorPrincipalId: ctx.principalId,
        actorType: 'human',
        action: 'template_run.created',
        objectType: 'template_run',
        objectId: run!.id,
        caseId: kase.id,
        payload: { key, template: OIL_ENGINE.key, version: OIL_ENGINE.version, drivers },
      });
      return reply.code(201).send({ key });
    });
  });

  app.get(
    '/api/templates/runs/:key',
    guard,
    async (request, reply): Promise<TemplateRunDetail | undefined> => {
      const ctx = ctxOf(request);
      const p = z.object({ key: z.string().regex(/^TR-[0-9]{8}-[0-9]{2,4}$/) }).safeParse(request.params);
      if (!p.success) return reply.code(404).send({ error: 'not_found' });
      return withInstitution(deps.db, ctx.institutionId, async (tx) => {
        const [row] = await tx
          .select({ r: templateRuns, caseKey: cases.key, by: principals.displayName })
          .from(templateRuns)
          .innerJoin(cases, eq(cases.id, templateRuns.caseId))
          .innerJoin(principals, eq(principals.id, templateRuns.createdBy))
          .where(and(eq(templateRuns.key, p.data.key), caseReadable(ctx.scope)));
        if (!row) return reply.code(404).send({ error: 'not_found' });
        const result = row.r.outputs as OilResult;
        const recomputed = sha(result) === row.r.outputHash;
        return {
          key: row.r.key,
          title: row.r.title,
          caseKey: row.caseKey,
          templateKey: row.r.templateKey,
          engineVersion: row.r.engineVersion,
          dataMode: 'scenario',
          createdBy: row.by,
          createdAt: row.r.createdAt.toISOString(),
          inputHash: row.r.inputHash,
          outputHash: row.r.outputHash,
          intact: recomputed,
          result: await forReader(tx, ctx, result),
        };
      });
    },
  );

  app.get('/api/scenario-room', guard, async (request): Promise<ScenarioRoomPayload> => {
    const ctx = ctxOf(request);
    const q = z.object({ keys: z.string().max(200).optional() }).safeParse(request.query);
    const keys = (q.success && q.data.keys ? q.data.keys.split(',') : [])
      .filter((k) => /^(SCN|TR)-[0-9]{8}-[0-9]{2,4}$/.test(k))
      .slice(0, 4);
    return withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const [hormuz, oil] = await Promise.all([
        tx
          .select({ r: scenarioRuns, caseKey: cases.key })
          .from(scenarioRuns)
          .innerJoin(cases, eq(cases.id, scenarioRuns.caseId))
          .where(caseReadable(ctx.scope))
          .orderBy(desc(scenarioRuns.createdAt))
          .limit(40),
        tx
          .select({ r: templateRuns, caseKey: cases.key })
          .from(templateRuns)
          .innerJoin(cases, eq(cases.id, templateRuns.caseId))
          .where(caseReadable(ctx.scope))
          .orderBy(desc(templateRuns.createdAt))
          .limit(40),
      ]);
      const toRoom = (k: string): ScenarioRoomRun | null => {
        const h = hormuz.find((x) => x.r.key === k);
        if (h) {
          const result = (h.r.outputs as { result: EngineResult }).result;
          return {
            key: h.r.key,
            templateKey: ENGINE.key,
            engineVersion: h.r.engineVersion,
            title: h.r.title,
            caseKey: h.caseKey,
            createdAt: h.r.createdAt.toISOString(),
            drivers: h.r.drivers as Record<string, number>,
            figures: ROOM_METRICS.flatMap((m) => {
              const def = METRICS.find((x) => x.key === m);
              const v = result.metrics.find((x) => x.key === m)?.values.d90;
              return def && v
                ? [{ key: m, label: `${def.label} (90 days)`, unit: def.unit ?? '', ...range(v) }]
                : [];
            }),
          };
        }
        const o = oil.find((x) => x.r.key === k);
        if (!o) return null;
        const result = o.r.outputs as OilResult;
        return {
          key: o.r.key,
          templateKey: OIL_ENGINE.key,
          engineVersion: o.r.engineVersion,
          title: o.r.title,
          caseKey: o.caseKey,
          createdAt: o.r.createdAt.toISOString(),
          drivers: o.r.drivers as Record<string, number>,
          figures: [
            {
              key: 'nav_impact_pct',
              label: 'Change in NAV',
              unit: '% of NAV',
              ...range(result.navImpactPct),
            },
            {
              key: 'value_impact',
              label: 'Change in market value',
              unit: 'USD m',
              ...range(result.valueImpact),
            },
          ],
        };
      };
      return {
        available: [
          ...hormuz.map((h) => ({
            key: h.r.key,
            title: h.r.title,
            caseKey: h.caseKey,
            templateKey: ENGINE.key,
            createdAt: h.r.createdAt.toISOString(),
          })),
          ...oil.map((o) => ({
            key: o.r.key,
            title: o.r.title,
            caseKey: o.caseKey,
            templateKey: OIL_ENGINE.key,
            createdAt: o.r.createdAt.toISOString(),
          })),
        ].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        runs: keys.flatMap((k) => {
          const r = toRoom(k);
          return r ? [r] : [];
        }),
      };
    });
  });
}
