// Phase 5G: Ask TIGERIS and alert channels. Answers cite only records the reader may read; nothing is guessed;
// questions are audited by hash; alert text never carries restricted or confidential detail; channels stay off
// until configured. Runs as tigeris_app through the API.
import type { AskAnswer, DemoPrincipal, NotificationChannel } from '@tigeris/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { config } from './config';
import { createDb } from './db/client';
import { terms } from './modules/ask';
import { alertText } from './modules/notify';

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
const ask = async (role: string, question: string) =>
  app.inject({ method: 'POST', url: '/api/ask', headers: await as(role), payload: { question } });

beforeAll(async () => {
  principals = (await app.inject({ method: 'GET', url: '/api/auth/demo-principals' })).json().principals;
});
afterAll(async () => {
  await app.close();
  await close();
});

describe('Ask TIGERIS', () => {
  it('keeps the content words of a question', () => {
    expect(terms('What is the fuel buffer at the desalination plants?')).toEqual([
      'fuel',
      'buffer',
      'desalination',
      'plants',
    ]);
  });

  it('answers from cited records only, and says so when nothing matches', async () => {
    const a = (await ask('analyst', 'Hormuz seizure tanker')).json() as AskAnswer;
    expect(a.citations.length).toBeGreaterThan(0);
    expect(a.citations.some((c) => c.ref === 'HMZ-2024-0413')).toBe(true);
    expect(a.drafter).toContain('no model');
    for (const c of a.citations) expect(a.answer).toContain(c.ref);
    const none = (await ask('analyst', 'zzqx quantum giraffe')).json() as AskAnswer;
    expect(none.citations).toEqual([]);
    expect(none.answer).toContain('does not guess');
  });

  it('never cites a case outside the reader’s scope', async () => {
    const exec = (await ask('executive', 'capital reallocation allocation')).json() as AskAnswer;
    const ops = (await ask('operations_owner', 'capital reallocation allocation')).json() as AskAnswer;
    expect(exec.citations.some((c) => c.ref === 'CAP-ALLOC-01')).toBe(true);
    expect(ops.citations.some((c) => c.ref === 'CAP-ALLOC-01')).toBe(false);
  });

  it('audits the question by hash, not its text', async () => {
    const q = 'Unique audit check question about bypass pipelines';
    await ask('analyst', q);
    const audit = JSON.stringify(
      (
        await app.inject({
          method: 'GET',
          url: '/api/audit?action=ask.answered',
          headers: await as('auditor'),
        })
      ).json(),
    );
    expect(audit).toContain('questionSha256');
    expect(audit).not.toContain(q);
  });
});

describe('alert channels', () => {
  it('is in-app only until Teams or email is configured', async () => {
    const ch = (
      await app.inject({
        method: 'GET',
        url: '/api/notifications/channels',
        headers: await as('administrator'),
      })
    ).json() as NotificationChannel[];
    expect(ch.find((c) => c.key === 'inbox')!.status).toBe('on');
    expect(ch.find((c) => c.key === 'teams')!.status).toBe(config.TEAMS_WEBHOOK_URL ? 'configured' : 'off');
    expect(ch.find((c) => c.key === 'email')!.status).toBe(
      config.EMAIL_RELAY_URL && config.EMAIL_TO ? 'configured' : 'off',
    );
  });

  it('never puts restricted or confidential detail in an alert', () => {
    const secret = alertText({
      key: 'INT-20261102-0001',
      severity: 'breach',
      title: 'CAP-ALLOC-01 secret detail',
      classification: 'confidential',
    });
    expect(secret.body).not.toContain('secret detail');
    expect(secret.body).toContain('confidential intervention');
    expect(secret.subject).toContain('INT-20261102-0001');
    const open = alertText({
      key: 'INT-20261102-0002',
      severity: 'attention',
      title: 'Signal not triaged',
      classification: 'internal',
    });
    expect(open.body).toContain('Signal not triaged');
  });
});
