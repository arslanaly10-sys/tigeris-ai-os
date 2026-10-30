// Slice J: competitive intelligence. Uses test-only domains (*.example) and a stub network, so no seeded vendor ever
// receives simulated content. The seeded five vendor domains are only read, never crawled, here.
import type { AuditPage, CiClaimItem, CiOverview, DemoPrincipal } from '@tigeris/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { config } from './config';
import { createDb } from './db/client';

const { db, close } = createDb(config.DATABASE_APP_URL, 3);
const tag = Date.now().toString(36);
const HOST = `www.vendor-${tag}.example`;
const DOWN = `www.down-${tag}.example`;
let page2 = 'Our platform enables investment teams to unify portfolio data across every asset class.';
const delays: number[] = [];
const requested: string[] = [];

const html = (title: string, body: string) =>
  `<html><head><title>${title}</title></head><body><nav>Menu</nav><p>${body}</p>
   <p>Trusted by more than 200 institutions worldwide, including pension funds and insurers.</p></body></html>`;

const stub: typeof fetch = async (input) => {
  const url = String(input);
  requested.push(url);
  if (url.startsWith(`https://${DOWN}`))
    throw Object.assign(new TypeError('fetch failed'), {
      cause: { code: 'ECONNREFUSED', message: 'proxy refused' },
    });
  const u = new URL(url);
  const respond = (body: string, type = 'text/html', status = 200) =>
    new Response(body, { status, headers: { 'content-type': type } });
  if (u.pathname === '/robots.txt')
    return respond(
      `User-agent: *\nDisallow: /private\nCrawl-delay: 7\nSitemap: https://${HOST}/sitemap.xml\n`,
      'text/plain',
    );
  if (u.pathname === '/sitemap.xml')
    return respond(
      `<urlset>${['/platform', '/private/team', '/pricing', '/brochure.pdf', '/about?x=1']
        .map((p) => `<url><loc>https://${HOST}${p}</loc></url>`)
        .join('')}<url><loc>https://elsewhere.example/x</loc></url></urlset>`,
      'application/xml',
    );
  if (u.pathname === '/platform') return respond(html('Platform', page2));
  if (u.pathname === '/pricing') return respond('{}', 'application/json');
  return respond('not found', 'text/plain', 404);
};

const app = await buildApp({
  db,
  sessionSecret: config.SESSION_SECRET,
  demoInstitutionKey: 'gsia-demo',
  ciNetwork: { fetch: stub, sleep: async (ms) => void delays.push(ms) },
});
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
const get = async (role: string, url: string) => app.inject({ method: 'GET', url, headers: await as(role) });
const post = async (role: string, url: string, payload: object = {}) =>
  app.inject({ method: 'POST', url, headers: await as(role), payload });
const why = 'Added for the slice J integration test with enough words.';

beforeAll(async () => {
  principals = (await app.inject({ method: 'GET', url: '/api/auth/demo-principals' })).json().principals;
});
afterAll(async () => {
  await app.close();
  await close();
});

describe('domain registry (FR-45)', () => {
  it('lists the five approved seed vendors, BlackRock limited to Aladdin, none collected', async () => {
    const o: CiOverview = (await get('executive', '/api/ci')).json();
    const seeded = o.domains.filter((d) =>
      ['palantir', 'blackrock-aladdin', 'alternativesoft', 'dasseti', 'v7'].includes(d.key),
    );
    expect(seeded).toHaveLength(5);
    expect(seeded.every((d) => d.status === 'approved' && d.approvalBasis?.includes('D-54'))).toBe(true);
    expect(seeded.find((d) => d.key === 'blackrock-aladdin')!.pathPrefix).toBe('/aladdin');
    expect(seeded.some((d) => d.collected)).toBe(false);
    expect(o.canAdminister).toBe(false);
    expect(o.rules.minDelaySeconds).toBeGreaterThanOrEqual(5);
  });

  it('adds other domains as pending, crawls only after administrator approval, and audits it', async () => {
    expect((await post('analyst', '/api/ci/domains', {})).statusCode).toBe(403);
    for (const [key, host] of [
      [`vendor-${tag}`, HOST],
      [`down-${tag}`, DOWN],
    ])
      expect(
        (
          await post('administrator', '/api/ci/domains', {
            key,
            vendor: `Test vendor ${key}`,
            host,
            category: 'Test only',
            reason: why,
          })
        ).statusCode,
      ).toBe(201);
    expect((await post('administrator', `/api/ci/domains/vendor-${tag}/crawl`)).statusCode).toBe(409);
    for (const k of [`vendor-${tag}`, `down-${tag}`])
      expect(
        (await post('administrator', `/api/ci/domains/${k}/status`, { status: 'approved', reason: why }))
          .statusCode,
      ).toBe(200);
    const log: AuditPage = (await get('auditor', '/api/audit?action=ci.domain_')).json();
    expect(log.events.map((e) => e.action)).toEqual(
      expect.arrayContaining(['ci.domain_added', 'ci.domain_approved']),
    );
  });
});

describe('polite crawler (FR-46, FR-47)', () => {
  it('obeys robots.txt and scope, waits at least the crawl delay, stores pages and candidate claims', async () => {
    expect((await post('analyst', `/api/ci/domains/vendor-${tag}/crawl`)).statusCode).toBe(403);
    const res = await post('administrator', `/api/ci/domains/vendor-${tag}/crawl`);
    expect(res.statusCode).toBe(201);
    expect(res.json().status).toBe('succeeded');
    expect(requested[0]).toBe(`https://${HOST}/robots.txt`);
    expect(requested.some((u) => u.includes('/private'))).toBe(false);
    expect(
      requested.some((u) => u.includes('elsewhere.example') || u.includes('.pdf') || u.includes('?')),
    ).toBe(false);
    expect(Math.min(...delays)).toBe(7000);

    const o: CiOverview = (await get('analyst', '/api/ci')).json();
    const d = o.domains.find((x) => x.key === `vendor-${tag}`)!;
    expect(d).toMatchObject({ collected: true, pages: 1 });
    expect(d.claims.candidate).toBe(2);
    const run = o.runs.find((r) => r.domainKey === d.key)!;
    expect(run).toMatchObject({ status: 'succeeded', pagesFetched: 1, pagesSkipped: 1, pagesChanged: 1 });
    expect(o.changes.find((c) => c.url === `https://${HOST}/platform`)?.kind).toBe('new_page');
  });

  it('stores a new version only when the text changes', async () => {
    await post('administrator', `/api/ci/domains/vendor-${tag}/crawl`);
    let o: CiOverview = (await get('analyst', '/api/ci')).json();
    expect(o.runs[0]!.pagesChanged).toBe(0);
    page2 = 'Our platform now automates due diligence questionnaires for allocators and consultants.';
    await post('administrator', `/api/ci/domains/vendor-${tag}/crawl`);
    o = (await get('analyst', '/api/ci')).json();
    expect(o.runs[0]!.pagesChanged).toBe(1);
    expect(o.changes.find((c) => c.url === `https://${HOST}/platform` && c.version === 2)?.kind).toBe(
      'changed',
    );
  });

  it('records a network refusal as blocked, with the real error, and never as collected', async () => {
    const res = await post('administrator', `/api/ci/domains/down-${tag}/crawl`);
    expect(res.json().status).toBe('blocked');
    const o: CiOverview = (await get('executive', '/api/ci')).json();
    const d = o.domains.find((x) => x.key === `down-${tag}`)!;
    expect(d.collected).toBe(false);
    expect(d.lastError).toContain('ECONNREFUSED');
    expect(o.runs.find((r) => r.domainKey === d.key)!.status).toBe('blocked');
  });
});

describe('claims and the CI report (FR-48, FR-50)', () => {
  it('lets analysts curate candidates, keeps them vendor-published unless independently verified', async () => {
    const claims: CiClaimItem[] = (await get('analyst', `/api/ci/claims?domain=vendor-${tag}`)).json();
    const c = claims[0]!;
    expect(c).toMatchObject({ status: 'candidate', verification: 'vendor_published' });
    expect(c.sourceUrl).toBe(`https://${HOST}/platform`);
    const url = `/api/ci/claims/${c.key}/curate`;
    expect((await post('administrator', url, { decision: 'accept', note: why })).statusCode).toBe(403);
    expect(
      (
        await post('analyst', url, {
          decision: 'accept',
          verified: true,
          note: 'Looks right to me, honestly.',
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await post('analyst', url, { decision: 'accept', paraphrase: 'Unifies portfolio data.', note: why }))
        .statusCode,
    ).toBe(200);
    const after: CiClaimItem[] = (
      await get('auditor', `/api/ci/claims?status=accepted&domain=vendor-${tag}`)
    ).json();
    expect(after[0]).toMatchObject({
      verification: 'vendor_published',
      paraphrase: 'Unifies portfolio data.',
    });

    const report = (await get('executive', '/api/ci/report')).json();
    const v = report.vendors.find((x: { host: string }) => x.host === HOST);
    expect(v.claims).toHaveLength(1);
    expect(report.label).toContain('separate from cases');
  });
});
