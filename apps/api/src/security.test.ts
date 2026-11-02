// Security review fixes (D-125): no default session secret in production; demo sign-in off in production; an
// https-only OIDC issuer; content above the classification ceiling never goes to an external model.
import { execFileSync } from 'node:child_process';
import type { AskAnswer, DemoPrincipal } from '@tigeris/shared';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from './app';
import { config } from './config';
import { createDb } from './db/client';

/** Loads the config in a fresh process with the given environment; returns its output or the error text. */
const loadConfig = (env: Record<string, string>) => {
  try {
    return execFileSync(
      'node_modules/.bin/tsx',
      [
        '-e',
        "import('./src/config.ts').then((m) => console.log(JSON.stringify({ demo: m.config.DEMO_SIGN_IN })))",
      ],
      { env: { ...process.env, ...env }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch (err) {
    return String((err as { stderr?: string }).stderr ?? err);
  }
};

describe('configuration guards', () => {
  it('refuses to start in production with the default session secret', () => {
    expect(
      loadConfig({ NODE_ENV: 'production', SESSION_SECRET: 'dev-only-change-me-dev-only-change-me' }),
    ).toContain('Set a unique SESSION_SECRET in production');
  });

  it('turns demo sign-in off in production unless asked, and keeps it on in development', () => {
    const prod = { NODE_ENV: 'production', SESSION_SECRET: 'a-unique-production-secret-of-enough-length' };
    expect(loadConfig(prod)).toContain('"demo":false');
    expect(loadConfig({ ...prod, DEMO_SIGN_IN: 'true' })).toContain('"demo":true');
    expect(loadConfig({ NODE_ENV: 'development' })).toContain('"demo":true');
  });

  it('accepts only an https OIDC issuer', () => {
    expect(loadConfig({ OIDC_ISSUER: 'http://login.example.com/tenant/v2.0' })).toMatch(/https:\/\//);
  });
});

const { db, close } = createDb(config.DATABASE_APP_URL, 2);
const app = await buildApp({ db, sessionSecret: config.SESSION_SECRET, demoInstitutionKey: 'gsia-demo' });
let principals: DemoPrincipal[];
const saved = { ...config };
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

describe('demo sign-in switch', () => {
  it('answers 404 on every demo route when off', async () => {
    Object.assign(config, { DEMO_SIGN_IN: false });
    expect((await app.inject({ method: 'GET', url: '/api/auth/demo-principals' })).statusCode).toBe(404);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/auth/resolve-institution',
          payload: { identifier: 'GSIA-DEMO' },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/auth/demo-session',
          payload: { principalId: principals[0]!.id },
        })
      ).statusCode,
    ).toBe(404);
  });
});

describe('classification ceiling for external models', () => {
  it('keeps restricted content away from Claude at the default ceiling, without calling it', async () => {
    const analyst = principals.find((p) => p.roles.includes('analyst'))!;
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/demo-session',
      payload: { principalId: analyst.id },
    });
    const cookie = `tigeris_session=${login.cookies.find((c) => c.name === 'tigeris_session')!.value}`;
    Object.assign(config, {
      ANTHROPIC_API_KEY: 'test-key',
      ANTHROPIC_PRICE_INPUT_PER_MTOK: 3,
      ANTHROPIC_PRICE_OUTPUT_PER_MTOK: 15,
      MODEL_MONTHLY_BUDGET_USD: 50,
    });
    expect(config.MODEL_MAX_CLASSIFICATION).toBe('internal');
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    // HMZ-2024-0413 is a restricted case.
    const a = (
      await app.inject({
        method: 'POST',
        url: '/api/ask',
        headers: { cookie },
        payload: { question: 'Hormuz seizure tanker' },
      })
    ).json() as AskAnswer;
    expect(a.citations.some((c) => c.ref === 'HMZ-2024-0413')).toBe(true);
    expect(a.drafter).toContain('not sent to an external model');
    expect(f).not.toHaveBeenCalled();
  });
});
