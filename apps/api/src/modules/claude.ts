/**
 * Claude through the model gateway (Phase 5I, D-112, D-113, D-123). Off by default. When on, it only rewrites an
 * answer from records already retrieved and cited; it never sees anything the reader may not read, and its draft
 * must pass the gateway's grounding check (every number must appear in a citation) or the deterministic answer is
 * kept. Every call and every fallback is recorded with tokens and cost; at the monthly budget it stops calling.
 */
import type { ModelStatus } from '@tigeris/shared';
import { and, desc, gte, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { config } from '../config';
import { withInstitution, type Tx } from '../db/client';
import { modelUsage } from '../db/schema';
import { ctxOf, requireSession, type AppDeps } from './context';
import { groundingCheck, type Citation } from './gateway';

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
): Promise<{ text: string; drafter: string }> {
  const deterministic = { text: fallback, drafter: 'deterministic (no model called)' };
  if (claudeOffReason() || !citations.length) return deterministic;
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
    return { text, drafter: `${config.ANTHROPIC_MODEL} via the gateway, from cited records only` };
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
