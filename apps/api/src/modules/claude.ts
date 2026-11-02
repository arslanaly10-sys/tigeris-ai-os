/**
 * Claude through the model gateway (Phase 5I, D-112, D-113, D-123). Off by default. When on, it only rewrites an
 * answer from records already retrieved and cited; it never sees anything the reader may not read, and its draft
 * must pass the gateway's grounding check (every number must appear in a citation) or the deterministic answer is
 * kept. Every call and every fallback is recorded with tokens and cost; at the monthly budget it stops calling.
 */
import { SENSITIVITY_ORDER, type ModelStatus, type Sensitivity } from '@tigeris/shared';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { config } from '../config';
import { withInstitution, type Tx } from '../db/client';
import { cases, decisions, modelUsage } from '../db/schema';
import { ctxOf, requireSession, type AppDeps } from './context';
import { groundingCheck, type Citation } from './gateway';
import { caseReadable } from './scope';

/** Why Claude is off, or null when it may be called. Prices and a budget are required: no unpriced spend. */
export function claudeOffReason(): string | null {
  if (!config.ANTHROPIC_API_KEY) return 'Off: ANTHROPIC_API_KEY is not set.';
  if (!config.ANTHROPIC_PRICE_INPUT_PER_MTOK || !config.ANTHROPIC_PRICE_OUTPUT_PER_MTOK)
    return 'Off: set ANTHROPIC_PRICE_INPUT_PER_MTOK and ANTHROPIC_PRICE_OUTPUT_PER_MTOK from your agreement.';
  if (!config.MODEL_MONTHLY_BUDGET_USD) return 'Off: set MODEL_MONTHLY_BUDGET_USD.';
  return null;
}

const monthStart = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
};

async function spentThisMonth(tx: Tx): Promise<number> {
  const [r] = await tx
    .select({ s: sql<string>`coalesce(sum(${modelUsage.costUsd}), 0)` })
    .from(modelUsage)
    .where(gte(modelUsage.createdAt, monthStart()));
  return Number(r?.s ?? 0);
}

export const costUsd = (inputTokens: number, outputTokens: number) =>
  (inputTokens * (config.ANTHROPIC_PRICE_INPUT_PER_MTOK ?? 0) +
    outputTokens * (config.ANTHROPIC_PRICE_OUTPUT_PER_MTOK ?? 0)) /
  1_000_000;

/**
 * Asks Claude to rewrite `fallback` as a plain answer using only `citations`. Returns the text to show and how it
 * was produced. Never throws: any failure keeps the deterministic answer and is recorded.
 */
export async function claudeDraft(
  tx: Tx,
  ctx: { institutionId: string; principalId: string },
  feature: string,
  question: string,
  citations: Citation[],
  fallback: string,
  caseId: string | null = null,
  classification: Sensitivity = 'internal',
): Promise<{ text: string; drafter: string; used: boolean }> {
  const deterministic = { text: fallback, drafter: 'deterministic (no model called)', used: false };
  if (claudeOffReason() || !citations.length) return deterministic;
  // Content above the configured ceiling never leaves for an external model (D-125).
  if (SENSITIVITY_ORDER.indexOf(classification) > SENSITIVITY_ORDER.indexOf(config.MODEL_MAX_CLASSIFICATION))
    return {
      ...deterministic,
      drafter: `deterministic (${classification} content is not sent to an external model)`,
    };
  const record = (outcome: string, inputTokens = 0, outputTokens = 0, detail: string | null = null) =>
    tx.insert(modelUsage).values({
      institutionId: ctx.institutionId,
      feature,
      model: config.ANTHROPIC_MODEL,
      outcome,
      inputTokens,
      outputTokens,
      costUsd: String(costUsd(inputTokens, outputTokens)),
      principalId: ctx.principalId,
      caseId,
      detail,
    });
  if ((await spentThisMonth(tx)) >= config.MODEL_MONTHLY_BUDGET_USD!) {
    await record('fallback_budget');
    return { ...deterministic, drafter: 'deterministic (monthly model budget reached)' };
  }
  try {
    const res = await fetch(`${config.ANTHROPIC_BASE_URL}/v1/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': config.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: config.ANTHROPIC_MODEL,
        max_tokens: 600,
        system:
          'You answer questions for a sovereign institution using ONLY the numbered records given. Cite each claim as [n]. ' +
          'Do not add facts, numbers or advice that are not in the records. If the records do not answer the question, say so.',
        messages: [
          {
            role: 'user',
            content: `Question: ${question}\n\nRecords:\n${citations.map((c, i) => `[${i + 1}] ${c.label}: ${c.display}`).join('\n')}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const body = (await res.json()) as {
      content?: { type: string; text?: string }[];
      usage?: { input_tokens?: number; output_tokens?: number };
      error?: { message?: string };
    };
    const inTok = body.usage?.input_tokens ?? 0;
    const outTok = body.usage?.output_tokens ?? 0;
    const text = (body.content ?? [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('')
      .trim();
    if (!res.ok || !text) {
      await record(
        'fallback_error',
        inTok,
        outTok,
        body.error?.message?.slice(0, 200) ?? `HTTP ${res.status}`,
      );
      return deterministic;
    }
    if (!groundingCheck(text, citations).passed) {
      await record('fallback_grounding', inTok, outTok, 'draft contained a number not in the citations');
      return { ...deterministic, drafter: 'deterministic (model draft failed the grounding check)' };
    }
    await record('used', inTok, outTok);
    return {
      text,
      drafter: `${config.ANTHROPIC_MODEL} via the gateway, from cited records only`,
      used: true,
    };
  } catch (err) {
    await record('fallback_error', 0, 0, (err as Error).message.slice(0, 200));
    return deterministic;
  }
}

export async function modelRoutes(app: FastifyInstance, deps: AppDeps) {
  app.get('/api/models', { preHandler: requireSession(deps) }, async (request): Promise<ModelStatus> => {
    const ctx = ctxOf(request);
    return withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const [spent, recent] = await Promise.all([
        spentThisMonth(tx),
        tx
          .select()
          .from(modelUsage)
          .where(and(gte(modelUsage.createdAt, monthStart())))
          .orderBy(desc(modelUsage.createdAt))
          .limit(20),
      ]);
      // Per case: every call that served it. Per decision: the case's model spend up to the moment of decision.
      const byCase = await tx
        .select({
          caseKey: cases.key,
          calls: sql<number>`count(*)::int`,
          cost: sql<string>`coalesce(sum(${modelUsage.costUsd}), 0)`,
        })
        .from(modelUsage)
        .innerJoin(cases, eq(cases.id, modelUsage.caseId))
        .where(caseReadable(ctx.scope))
        .groupBy(cases.key)
        .orderBy(desc(sql`sum(${modelUsage.costUsd})`))
        .limit(50);
      const byDecision = await tx
        .select({
          decisionKey: decisions.key,
          caseKey: cases.key,
          cost: sql<string>`coalesce(sum(${modelUsage.costUsd}), 0)`,
        })
        .from(decisions)
        .innerJoin(cases, eq(cases.id, decisions.caseId))
        .innerJoin(
          modelUsage,
          and(eq(modelUsage.caseId, decisions.caseId), lte(modelUsage.createdAt, decisions.createdAt)),
        )
        .where(caseReadable(ctx.scope))
        .groupBy(decisions.key, cases.key)
        .orderBy(desc(decisions.key))
        .limit(50);
      const off = claudeOffReason();
      return {
        enabled: !off,
        reason:
          off ??
          'On: drafts Ask TIGERIS answers from cited records; quantities are never produced by a model.',
        model: config.ANTHROPIC_MODEL,
        prices: {
          inputPerMTok: config.ANTHROPIC_PRICE_INPUT_PER_MTOK ?? null,
          outputPerMTok: config.ANTHROPIC_PRICE_OUTPUT_PER_MTOK ?? null,
        },
        monthlyBudgetUsd: config.MODEL_MONTHLY_BUDGET_USD ?? null,
        spentThisMonthUsd: Math.round(spent * 10_000) / 10_000,
        byCase: byCase.map((r) => ({ caseKey: r.caseKey, calls: r.calls, costUsd: Number(r.cost) })),
        byDecision: byDecision.map((r) => ({
          decisionKey: r.decisionKey,
          caseKey: r.caseKey,
          costUsd: Number(r.cost),
        })),
        recent: recent.map((r) => ({
          at: r.createdAt.toISOString(),
          feature: r.feature,
          model: r.model,
          outcome: r.outcome as ModelStatus['recent'][number]['outcome'],
          inputTokens: r.inputTokens,
          outputTokens: r.outputTokens,
          costUsd: Number(r.costUsd),
        })),
      };
    });
  });
}
