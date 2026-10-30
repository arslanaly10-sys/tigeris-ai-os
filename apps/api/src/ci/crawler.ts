/**
 * Polite competitive-intelligence crawler (slice J, FR-46, D-54). robots.txt first; then sitemaps (from robots or
 * /sitemap.xml); if none, the domain's start page and its internal links. Only the approved host and path scope,
 * HTML pages only, at most `maxPagesPerRun`, and never faster than the larger of the crawl delay and our minimum.
 *
 * Network failures are recorded exactly as they happened. A domain the network cannot reach is "blocked", and
 * nothing from it is shown as collected. Each write is its own short transaction so a long run holds no locks.
 */
import { and, desc, eq, sql } from 'drizzle-orm';
import { appendAudit } from '../audit/audit';
import { withInstitution, type Db, type Tx } from '../db/client';
import { ciClaims, ciCrawlRuns, ciDomains, ciPages, ciPageVersions } from '../db/schema';
import {
  CRAWL_RULES,
  USER_AGENT,
  extractClaims,
  extractPage,
  inScope,
  parseRobots,
  parseSitemap,
  robotsAllows,
  type Robots,
} from './crawl-lib';

export type Fetcher = typeof fetch;

export interface CrawlOptions {
  fetcher?: Fetcher;
  sleep?: (ms: number) => Promise<void>;
  trigger: 'manual' | 'schedule';
  actorId: string | null;
  maxPages?: number;
}

class FetchError extends Error {
  constructor(
    message: string,
    readonly network: boolean,
    readonly status?: number,
  ) {
    super(message);
  }
}

/** The real reason a request failed, including the cause a proxy or resolver gave. */
function networkMessage(e: unknown): string {
  const err = e as { message?: string; cause?: { code?: string; message?: string } };
  const cause = err.cause ? ` (${[err.cause.code, err.cause.message].filter(Boolean).join(': ')})` : '';
  return `${err.message ?? String(e)}${cause}`;
}

async function get(fetcher: Fetcher, url: string): Promise<{ status: number; type: string; text: string }> {
  let res: Response;
  try {
    res = await fetcher(url, {
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xml,text/plain;q=0.9' },
      redirect: 'follow',
      signal: AbortSignal.timeout(CRAWL_RULES.timeoutMs),
    });
  } catch (e) {
    const via = process.env.HTTPS_PROXY || process.env.https_proxy ? ' through the configured network proxy' : '';
    throw new FetchError(`Request to ${url} failed${via}: ${networkMessage(e)}`, true);
  }
  const len = Number(res.headers.get('content-length') ?? 0);
  if (len > CRAWL_RULES.maxBytes)
    throw new FetchError(`${url} is larger than ${CRAWL_RULES.maxBytes} bytes`, false);
  const text = await res.text();
  if (text.length > CRAWL_RULES.maxBytes)
    throw new FetchError(`${url} is larger than ${CRAWL_RULES.maxBytes} bytes`, false);
  return { status: res.status, type: res.headers.get('content-type') ?? '', text };
}

async function nextKey(
  tx: Tx,
  table: typeof ciCrawlRuns | typeof ciClaims,
  prefix: string,
  now: Date,
  pad = 2,
) {
  const day = now.toISOString().slice(0, 10).replace(/-/g, '');
  const [r] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(table)
    .where(sql`${table.key} like ${prefix + '-' + day + '-%'}`);
  return `${prefix}-${day}-${String((r?.n ?? 0) + 1).padStart(pad, '0')}`;
}

/** Runs one crawl of one approved domain and returns the run key. */
export async function runCrawl(db: Db, institutionId: string, domainId: string, opts: CrawlOptions) {
  const fetcher = opts.fetcher ?? fetch;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const maxPages = Math.min(opts.maxPages ?? CRAWL_RULES.maxPagesPerRun, CRAWL_RULES.maxPagesPerRun);
  const scoped = <T>(fn: (tx: Tx) => Promise<T>) => withInstitution(db, institutionId, fn);

  const start = await scoped(async (tx) => {
    const [d] = await tx.select().from(ciDomains).where(eq(ciDomains.id, domainId));
    if (!d) throw new Error('domain not found');
    if (d.status !== 'approved')
      throw new Error(`domain ${d.key} is ${d.status}; only approved domains are crawled`);
    const now = new Date();
    const key = await nextKey(tx, ciCrawlRuns, 'CI-RUN', now);
    const [run] = await tx
      .insert(ciCrawlRuns)
      .values({
        institutionId,
        key,
        domainId,
        trigger: opts.trigger,
        status: 'running',
        rulesVersion: CRAWL_RULES.version,
        startedBy: opts.actorId,
        startedAt: now,
      })
      .returning({ id: ciCrawlRuns.id });
    await appendAudit(tx, {
      institutionId,
      actorPrincipalId: opts.actorId,
      actorType: opts.actorId ? 'human' : 'service',
      action: 'ci.crawl_started',
      objectType: 'ci_domain',
      objectId: d.id,
      payload: { run: key, domain: d.key, host: d.host, rules: CRAWL_RULES.version },
    });
    return { d, runId: run!.id, key };
  });

  const { d, runId, key } = start;
  const origin = `https://${d.host}`;
  const log: string[] = [];
  const counts = { seen: 0, fetched: 0, changed: 0, skipped: 0, claims: 0, errors: 0 };
  let status: 'succeeded' | 'partial' | 'failed' | 'blocked' = 'succeeded';
  let error: string | null = null;
  let robotsStatus = 'not read';
  let robots: Robots = { allow: [], disallow: [], crawlDelaySeconds: null, sitemaps: [] };
  let delay: number = CRAWL_RULES.minDelayMs;

  try {
    // 1. robots.txt: a network failure blocks the run; 401/403 means we may not crawl; 5xx means try later.
    try {
      const r = await get(fetcher, `${origin}/robots.txt`);
      if (r.status === 200) {
        robots = parseRobots(r.text);
        robotsStatus = `read (${robots.disallow.length} disallow rules)`;
      } else if (r.status === 401 || r.status === 403) {
        throw new FetchError(
          `robots.txt answered ${r.status}; the site does not permit crawling`,
          false,
          r.status,
        );
      } else if (r.status >= 500) {
        throw new FetchError(
          `robots.txt answered ${r.status}; not crawling until the site recovers`,
          false,
          r.status,
        );
      } else robotsStatus = `none (${r.status}); default rules apply`;
      delay = Math.max(CRAWL_RULES.minDelayMs, (robots.crawlDelaySeconds ?? 0) * 1000);
      log.push(`robots.txt ${robotsStatus}; delay ${delay / 1000}s between requests`);
    } catch (e) {
      if (e instanceof FetchError && e.network) status = 'blocked';
      else status = 'failed';
      throw e;
    }

    // 2. Discover pages: sitemaps first, else the start page and its internal links.
    const pages: string[] = [];
    const add = (u: string) => {
      const clean = u.split('#')[0]!;
      counts.seen++;
      if (!inScope(clean, d.host, d.pathPrefix) || !robotsAllows(robots, new URL(clean).pathname)) return;
      if (!pages.includes(clean) && pages.length < maxPages) pages.push(clean);
    };
    const sitemapQueue = robots.sitemaps.length ? [...robots.sitemaps] : [`${origin}/sitemap.xml`];
    for (let i = 0; i < CRAWL_RULES.maxSitemaps && sitemapQueue.length && pages.length < maxPages; i++) {
      const sm = sitemapQueue.shift()!;
      if (!sm.startsWith(origin)) continue;
      await sleep(delay);
      try {
        const r = await get(fetcher, sm);
        if (r.status !== 200) {
          log.push(`${sm}: ${r.status}`);
          continue;
        }
        const parsed = parseSitemap(r.text);
        sitemapQueue.push(...parsed.sitemaps);
        parsed.pages.forEach(add);
        log.push(`${sm}: ${parsed.pages.length} pages, ${parsed.sitemaps.length} nested sitemaps`);
      } catch (e) {
        log.push(e instanceof Error ? e.message : String(e));
      }
    }
    if (pages.length === 0) add(`${origin}${d.pathPrefix}`);

    // 3. Fetch each page politely; store a new version only when the text changed.
    for (let i = 0; i < pages.length; i++) {
      const url = pages[i]!;
      await sleep(delay);
      let r: Awaited<ReturnType<typeof get>>;
      try {
        r = await get(fetcher, url);
      } catch (e) {
        counts.errors++;
        log.push(e instanceof Error ? e.message : String(e));
        continue;
      }
      if (r.status !== 200 || !r.type.includes('text/html')) {
        counts.skipped++;
        log.push(`${url}: skipped (${r.status}, ${r.type || 'no type'})`);
        continue;
      }
      counts.fetched++;
      const page = extractPage(r.text, url);
      // On a site without sitemaps, follow internal links from the first page only (one level).
      if (i === 0 && pages.length < maxPages && !robots.sitemaps.length)
        for (const m of r.text.matchAll(/<a[^>]+href=["']([^"'#]+)["']/gi)) {
          try {
            add(new URL(m[1]!, url).toString());
          } catch {
            /* not a URL */
          }
        }
      await scoped(async (tx) => {
        let [p] = await tx.select().from(ciPages).where(eq(ciPages.url, url));
        if (!p) [p] = await tx.insert(ciPages).values({ institutionId, domainId, url }).returning();
        const [last] = await tx
          .select()
          .from(ciPageVersions)
          .where(eq(ciPageVersions.pageId, p!.id))
          .orderBy(desc(ciPageVersions.version))
          .limit(1);
        if (last?.contentHash === page.contentHash) return;
        counts.changed++;
        const [v] = await tx
          .insert(ciPageVersions)
          .values({
            institutionId,
            pageId: p!.id,
            runId,
            version: (last?.version ?? 0) + 1,
            canonicalUrl: page.canonicalUrl,
            title: page.title || url,
            publishedAt: page.publishedAt ? new Date(page.publishedAt) : null,
            retrievedAt: new Date(),
            contentHash: page.contentHash,
            text: page.text,
          })
          .returning({ id: ciPageVersions.id });
        for (const c of extractClaims(page.text)) {
          await tx.insert(ciClaims).values({
            institutionId,
            key: await nextKey(tx, ciClaims, 'CLM', new Date(), 4),
            domainId,
            pageVersionId: v!.id,
            kind: c.kind,
            passage: c.passage,
            rule: c.rule,
          });
          counts.claims++;
        }
      });
    }
    if (counts.fetched === 0) {
      status = 'failed';
      error = 'No page in scope could be fetched.';
    } else if (counts.errors > 0) status = 'partial';
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    if (status === 'succeeded') status = 'failed';
  }

  await scoped(async (tx) => {
    const now = new Date();
    await tx
      .update(ciCrawlRuns)
      .set({
        status,
        robotsStatus,
        pagesSeen: counts.seen,
        pagesFetched: counts.fetched,
        pagesChanged: counts.changed,
        pagesSkipped: counts.skipped,
        claimsProposed: counts.claims,
        error,
        log: log.slice(0, 200),
        finishedAt: now,
      })
      .where(eq(ciCrawlRuns.id, runId));
    const ok = status === 'succeeded' || status === 'partial';
    await tx
      .update(ciDomains)
      .set({ lastCrawlAt: now, ...(ok ? { lastSuccessAt: now } : {}), lastError: ok ? null : error })
      .where(and(eq(ciDomains.id, domainId)));
    await appendAudit(tx, {
      institutionId,
      actorPrincipalId: opts.actorId,
      actorType: opts.actorId ? 'human' : 'service',
      action: 'ci.crawl_finished',
      objectType: 'ci_crawl_run',
      objectId: runId,
      payload: {
        run: key,
        status,
        fetched: counts.fetched,
        changed: counts.changed,
        claims: counts.claims,
        error,
      },
    });
  });
  return { key, status };
}
