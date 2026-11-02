// Phase 5I: Claude through the gateway, off by default; on only with a key, prices and a budget; drafts from cited
// records only; every call and fallback recorded with tokens and cost; hard stop at the monthly budget.
import type { AskAnswer, DemoPrincipal, ModelStatus } from '@tigeris/shared';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from './app';
import { config } from './config';
import { createDb } from './db/client';

const { db, close } = createDb(config.DATABASE_APP_URL, 3);
const app = await buildApp({ db, sessionSecret: config.SESSION_SECRET, demoInstitutionKey: 'gsia-demo' });
let principals: DemoPrincipal[];
const headers: Record<string, Record<string, string>> = {};
async function as(role: string) {
  if (headers[role]) return headers[role];
  const p = principals.find((x) => x.roles.includes(role as never))!;
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/demo-session',
    payload: { principalId: p.id },
  });
  const c = res.cookies.find((x) => x.name === 'tigeris_session')!;
  return (headers[role] = { cookie: `tigeris_session=${c.value}` });
}
const ask = async (q = 'Hormuz seizure tanker') =>
  (
    await app.inject({
      method: 'POST',
      url: '/api/ask',
      headers: await as('analyst'),
      payload: { question: q },
    })
  ).json() as AskAnswer;
const models = async () =>
  (
    await app.inject({ method: 'GET', url: '/api/models', headers: await as('executive') })
  ).json() as ModelStatus;
const saved = { ...config };
const claudeReplies = (text: string, status = 200) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            content: [{ type: 'text', text }],
            usage: { input_tokens: 1000, output_tokens: 200 },
          }),
          { status },
        ),
    ),
  );
const turnOn = (budget = 50) =>
  Object.assign(config, {
    ANTHROPIC_API_KEY: 'test-key',
    ANTHROPIC_PRICE_INPUT_PER_MTOK: 3,
    ANTHROPIC_PRICE_OUTPUT_PER_MTOK: 15,
    MODEL_MONTHLY_BUDGET_USD: budget,
  });

beforeAll(async () => {
  principals = (await app.inject({ method: 'GET', url: '/api/auth/demo-principals' })).json().principals;
});
afterEach(() => {
  Object.assign(config, saved);
  vi.unstubAllGlobals();
});
afterAll(async () => {
  await app.close();
  await close();
});

describe('Claude through the gateway', () => {
  it('is off by default and says why; no call is made', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const m = await models();
    expect(m.enabled).toBe(false);
    expect(m.reason).toContain('ANTHROPIC_API_KEY');
    expect((await ask()).drafter).toContain('no model called');
    expect(f).not.toHaveBeenCalled();
  });

  it('stays off with a key but no prices: no unpriced spend', async () => {
    Object.assign(config, { ANTHROPIC_API_KEY: 'test-key' });
    expect((await models()).reason).toContain('PRICE');
  });

  it('drafts from citations when on, recording tokens and cost', async () => {
    turnOn();
    claudeReplies('The MSC Aries was seized near the Strait of Hormuz [1].');
    const a = await ask();
    expect(a.drafter).toContain('claude');
    expect(a.answer).toContain('[1]');
    const m = await models();
    const used = m.recent.find((r) => r.outcome === 'used')!;
    expect(used).toMatchObject({ inputTokens: 1000, outputTokens: 200, costUsd: 0.006 }); // 1000×3 + 200×15 per million
  });

  it('keeps the deterministic answer when the draft adds an uncited number, or the call fails', async () => {
    turnOn();
    claudeReplies('About 97 tankers were affected [1].');
    expect((await ask()).drafter).toContain('grounding');
    claudeReplies('', 500);
    expect((await ask()).drafter).toContain('no model called');
    const outcomes = (await models()).recent.map((r) => r.outcome);
    expect(outcomes).toEqual(expect.arrayContaining(['fallback_grounding', 'fallback_error']));
  });

  it('stops calling at the monthly budget', async () => {
    turnOn(0.000001);
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    expect((await ask()).drafter).toContain('budget');
    expect(f).not.toHaveBeenCalled();
    expect((await models()).recent[0]!.outcome).toBe('fallback_budget');
  });
});
