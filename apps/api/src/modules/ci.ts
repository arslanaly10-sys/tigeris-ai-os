/**
 * Competitive intelligence (slice J, FR-45..FR-50, D-54..D-56). Every signed-in role reads it; only the Governance
 * Administrator adds or approves domains and runs crawls; analysts and domain experts curate claims. Nothing here is
 * linked to cases, portfolios or decision reports (AC-15).
 */
import type { CiChangeItem, CiClaimItem, CiDomainItem, CiOverview, CiRunItem, Role } from '@tigeris/shared';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { appendAudit } from '../audit/audit';
import { CRAWL_RULES, USER_AGENT } from '../ci/crawl-lib';
import { runCrawl } from '../ci/crawler';
import { withInstitution, type Tx } from '../db/client';
import { ciClaims, ciCrawlRuns, ciDomains, ciPages, ciPageVersions, principals } from '../db/schema';
import { QUEUES } from '../jobs';
import { ctxOf, requireSession, type AppDeps, type RequestContext } from './context';

export const CURATE_ROLES: readonly Role[] = ['analyst', 'domain_expert'];
const isAdmin = (ctx: RequestContext) => ctx.roles.includes('administrator');
const KEY = /^[a-z0-9-]{2,40}$/;
const why = z.string().trim().min(10).max(500);

async function names(tx: Tx) {
  const ps = await tx.select({ id: principals.id, name: principals.displayName }).from(principals);
  return new Map(ps.map((p) => [p.id, p.name]));
}

async function domainItems(tx: Tx): Promise<CiDomainItem[]> {
  const ds = await tx.select().from(ciDomains).orderBy(ciDomains.vendor);
  const pageCounts = await tx
    .select({ domainId: ciPages.domainId, n: sql<number>`count(*)::int` })
    .from(ciPages)
    .groupBy(ciPages.domainId);
  const claimCounts = await tx
    .select({ domainId: ciClaims.domainId, status: ciClaims.status, n: sql<number>`count(*)::int` })
    .from(ciClaims)
    .groupBy(ciClaims.domainId, ciClaims.status);
  const who = await names(tx);
  return ds.map((d) => {
    const c = (s: string) => claimCounts.find((x) => x.domainId === d.id && x.status === s)?.n ?? 0;
    const pages = pageCounts.find((x) => x.domainId === d.id)?.n ?? 0;
    return {
      id: d.id,
      key: d.key,
      vendor: d.vendor,
      host: d.host,
      pathPrefix: d.pathPrefix,
      category: d.category,
      status: d.status as CiDomainItem['status'],
      approvalBasis: d.approvalBasis,
      approvedBy: d.approvedBy ? (who.get(d.approvedBy) ?? null) : null,
      approvedAt: d.approvedAt?.toISOString() ?? null,
      lastCrawlAt: d.lastCrawlAt?.toISOString() ?? null,
      lastSuccessAt: d.lastSuccessAt?.toISOString() ?? null,
      lastError: d.lastError,
      collected: d.lastSuccessAt !== null && pages > 0,
      pages,
      claims: { candidate: c('candidate'), accepted: c('accepted'), rejected: c('rejected') },
    };
  });
}

async function runItems(tx: Tx, limit = 30): Promise<CiRunItem[]> {
  const rows = await tx
    .select({ r: ciCrawlRuns, domainKey: ciDomains.key, vendor: ciDomains.vendor })
    .from(ciCrawlRuns)
    .innerJoin(ciDomains, eq(ciDomains.id, ciCrawlRuns.domainId))
    .orderBy(desc(ciCrawlRuns.startedAt))
    .limit(limit);
  const who = await names(tx);
  return rows.map(({ r, domainKey, vendor }) => ({
    key: r.key,
    domainKey,
    vendor,
    trigger: r.trigger as CiRunItem['trigger'],
    status: r.status as CiRunItem['status'],
    rulesVersion: r.rulesVersion,
    robotsStatus: r.robotsStatus,
    pagesSeen: r.pagesSeen,
    pagesFetched: r.pagesFetched,
    pagesChanged: r.pagesChanged,
    pagesSkipped: r.pagesSkipped,
    claimsProposed: r.claimsProposed,
    error: r.error,
    log: r.log,
    startedBy: r.startedBy ? (who.get(r.startedBy) ?? null) : null,
    startedAt: r.startedAt.toISOString(),
    finishedAt: r.finishedAt?.toISOString() ?? null,
  }));
}

async function claimItems(tx: Tx, where?: ReturnType<typeof and>): Promise<CiClaimItem[]> {
  const rows = await tx
    .select({
      c: ciClaims,
      vendor: ciDomains.vendor,
      domainKey: ciDomains.key,
      url: ciPages.url,
      title: ciPageVersions.title,
      retrievedAt: ciPageVersions.retrievedAt,
    })
    .from(ciClaims)
    .innerJoin(ciDomains, eq(ciDomains.id, ciClaims.domainId))
    .innerJoin(ciPageVersions, eq(ciPageVersions.id, ciClaims.pageVersionId))
    .innerJoin(ciPages, eq(ciPages.id, ciPageVersions.pageId))
    .where(where)
    .orderBy(ciDomains.vendor, ciClaims.key)
    .limit(500);
  const who = await names(tx);
  return rows.map(({ c, vendor, domainKey, url, title, retrievedAt }) => ({
    id: c.id,
    key: c.key,
    vendor,
    domainKey,
    kind: c.kind as CiClaimItem['kind'],
    passage: c.passage,
    paraphrase: c.paraphrase,
    status: c.status as CiClaimItem['status'],
    verification: c.verification as CiClaimItem['verification'],
    sourceUrl: url,
    pageTitle: title,
    retrievedAt: retrievedAt.toISOString(),
    curationNote: c.curationNote,
    curatedBy: c.curatedBy ? (who.get(c.curatedBy) ?? null) : null,
    curatedAt: c.curatedAt?.toISOString() ?? null,
  }));
}

export async function ciRoutes(app: FastifyInstance, deps: AppDeps) {
  const guard = { preHandler: requireSession(deps) };
  const net = deps.ciNetwork;

  if (deps.jobs.enabled)
    await deps.jobs.work(QUEUES.ciCrawl, async (data) => {
      const d = data as { institutionId: string; domainId: string; actorId: string | null };
      await runCrawl(deps.db, d.institutionId, d.domainId, { trigger: 'manual', actorId: d.actorId });
    });

  app.get('/api/ci', guard, async (request): Promise<CiOverview> => {
    const ctx = ctxOf(request);
    return withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const changes = await tx
        .select({
          vendor: ciDomains.vendor,
          url: ciPages.url,
          title: ciPageVersions.title,
          version: ciPageVersions.version,
          retrievedAt: ciPageVersions.retrievedAt,
          runKey: ciCrawlRuns.key,
        })
        .from(ciPageVersions)
        .innerJoin(ciPages, eq(ciPages.id, ciPageVersions.pageId))
        .innerJoin(ciDomains, eq(ciDomains.id, ciPages.domainId))
        .innerJoin(ciCrawlRuns, eq(ciCrawlRuns.id, ciPageVersions.runId))
        .orderBy(desc(ciPageVersions.retrievedAt))
        .limit(50);
      return {
        domains: await domainItems(tx),
        runs: await runItems(tx),
        changes: changes.map((c): CiChangeItem => ({
          ...c,
          retrievedAt: c.retrievedAt.toISOString(),
          kind: c.version === 1 ? 'new_page' : 'changed',
        })),
        canAdminister: isAdmin(ctx),
        canCurate: CURATE_ROLES.some((r) => ctx.roles.includes(r)),
        rules: {
          version: CRAWL_RULES.version,
          minDelaySeconds: CRAWL_RULES.minDelayMs / 1000,
          maxPagesPerRun: CRAWL_RULES.maxPagesPerRun,
          userAgent: USER_AGENT,
        },
      };
    });
  });

  app.get('/api/ci/claims', guard, async (request) => {
    const ctx = ctxOf(request);
    const q = z
      .object({
        status: z.enum(['candidate', 'accepted', 'rejected']).optional(),
        domain: z.string().regex(KEY).optional(),
      })
      .safeParse(request.query);
    const f = q.success ? q.data : {};
    return withInstitution(deps.db, ctx.institutionId, (tx) =>
      claimItems(
        tx,
        and(
          f.status ? eq(ciClaims.status, f.status) : undefined,
          f.domain ? eq(ciDomains.key, f.domain) : undefined,
        ),
      ),
    );
  });

  /** Any domain beyond the approved set starts as pending until the administrator approves it (FR-45). */
  app.post('/api/ci/domains', guard, async (request, reply) => {
    const ctx = ctxOf(request);
    if (!isAdmin(ctx)) return reply.code(403).send({ error: 'not_permitted' });
    const b = z
      .object({
        key: z.string().regex(KEY),
        vendor: z.string().trim().min(2).max(80),
        host: z
          .string()
          .trim()
          .toLowerCase()
          .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/),
        pathPrefix: z
          .string()
          .trim()
          .regex(/^\/[A-Za-z0-9/_-]*$/)
          .default('/'),
        category: z.string().trim().min(2).max(80),
        reason: why,
      })
      .safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'invalid_domain' });
    const res = await withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const [dup] = await tx
        .select({ id: ciDomains.id })
        .from(ciDomains)
        .where(eq(ciDomains.key, b.data.key));
      if (dup) return null;
      const [d] = await tx
        .insert(ciDomains)
        .values({
          institutionId: ctx.institutionId,
          key: b.data.key,
          vendor: b.data.vendor,
          host: b.data.host,
          pathPrefix: b.data.pathPrefix,
          category: b.data.category,
          status: 'pending_approval',
          createdBy: ctx.principalId,
        })
        .returning({ id: ciDomains.id });
      await appendAudit(tx, {
        institutionId: ctx.institutionId,
        actorPrincipalId: ctx.principalId,
        actorType: 'human',
        action: 'ci.domain_added',
        objectType: 'ci_domain',
        objectId: d!.id,
        payload: { key: b.data.key, host: b.data.host, pathPrefix: b.data.pathPrefix, reason: b.data.reason },
      });
      return d!.id;
    });
    if (!res) return reply.code(409).send({ error: 'domain_exists' });
    return reply.code(201).send({ key: b.data.key });
  });

  app.post('/api/ci/domains/:key/status', guard, async (request, reply) => {
    const p = z.object({ key: z.string().regex(KEY) }).safeParse(request.params);
    const b = z.object({ status: z.enum(['approved', 'paused']), reason: why }).safeParse(request.body);
    if (!p.success) return reply.code(404).send({ error: 'not_found' });
    if (!b.success) return reply.code(400).send({ error: 'reason_required' });
    const ctx = ctxOf(request);
    if (!isAdmin(ctx)) return reply.code(403).send({ error: 'not_permitted' });
    const res = await withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const [d] = await tx.select().from(ciDomains).where(eq(ciDomains.key, p.data.key));
      if (!d) return 404;
      if (d.status === b.data.status) return 409;
      const approving = b.data.status === 'approved' && d.status === 'pending_approval';
      await tx
        .update(ciDomains)
        .set({
          status: b.data.status,
          ...(approving
            ? { approvalBasis: b.data.reason, approvedBy: ctx.principalId, approvedAt: new Date() }
            : {}),
        })
        .where(eq(ciDomains.id, d.id));
      await appendAudit(tx, {
        institutionId: ctx.institutionId,
        actorPrincipalId: ctx.principalId,
        actorType: 'human',
        action: approving
          ? 'ci.domain_approved'
          : `ci.domain_${b.data.status === 'paused' ? 'paused' : 'resumed'}`,
        objectType: 'ci_domain',
        objectId: d.id,
        payload: { key: d.key, reason: b.data.reason },
      });
      return 200;
    });
    if (res !== 200) return reply.code(res).send({ error: res === 404 ? 'not_found' : 'no_change' });
    return { ok: true };
  });

  /** Manual crawl. Queued when background jobs run; otherwise run now and the result returned. */
  app.post('/api/ci/domains/:key/crawl', guard, async (request, reply) => {
    const p = z.object({ key: z.string().regex(KEY) }).safeParse(request.params);
    if (!p.success) return reply.code(404).send({ error: 'not_found' });
    const ctx = ctxOf(request);
    if (!isAdmin(ctx)) return reply.code(403).send({ error: 'not_permitted' });
    const [d] = await withInstitution(deps.db, ctx.institutionId, (tx) =>
      tx.select().from(ciDomains).where(eq(ciDomains.key, p.data.key)),
    );
    if (!d) return reply.code(404).send({ error: 'not_found' });
    if (d.status !== 'approved') return reply.code(409).send({ error: 'domain_not_approved' });
    if (deps.jobs.enabled && !net) {
      await deps.jobs.send(QUEUES.ciCrawl, {
        institutionId: ctx.institutionId,
        domainId: d.id,
        actorId: ctx.principalId,
      });
      return reply.code(202).send({ queued: true });
    }
    const r = await runCrawl(deps.db, ctx.institutionId, d.id, {
      trigger: 'manual',
      actorId: ctx.principalId,
      fetcher: net?.fetch,
      sleep: net?.sleep,
    });
    return reply.code(201).send(r);
  });

  /** Analysts and domain experts accept or reject candidates; "verified" needs an independent source (D-55). */
  app.post('/api/ci/claims/:key/curate', guard, async (request, reply) => {
    const p = z.object({ key: z.string().regex(/^CLM-\d{8}-\d{4,}$/) }).safeParse(request.params);
    const b = z
      .object({
        decision: z.enum(['accept', 'reject']),
        paraphrase: z.string().trim().min(10).max(400).optional(),
        verified: z.boolean().default(false),
        note: z.string().trim().min(10).max(1000),
      })
      .refine((x) => !x.verified || (x.decision === 'accept' && /https:\/\//.test(x.note)), {
        message: 'verification needs an independent https source in the note',
      })
      .safeParse(request.body);
    if (!p.success) return reply.code(404).send({ error: 'not_found' });
    if (!b.success) return reply.code(400).send({ error: 'invalid_curation' });
    const ctx = ctxOf(request);
    if (!CURATE_ROLES.some((r) => ctx.roles.includes(r)))
      return reply.code(403).send({ error: 'not_permitted' });
    const ok = await withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const [c] = await tx.select().from(ciClaims).where(eq(ciClaims.key, p.data.key));
      if (!c) return false;
      await tx
        .update(ciClaims)
        .set({
          status: b.data.decision === 'accept' ? 'accepted' : 'rejected',
          verification: b.data.verified ? 'verified' : 'vendor_published',
          paraphrase: b.data.paraphrase ?? null,
          curationNote: b.data.note,
          curatedBy: ctx.principalId,
          curatedAt: new Date(),
        })
        .where(eq(ciClaims.id, c.id));
      await appendAudit(tx, {
        institutionId: ctx.institutionId,
        actorPrincipalId: ctx.principalId,
        actorType: 'human',
        action: `ci.claim_${b.data.decision === 'accept' ? 'accepted' : 'rejected'}`,
        objectType: 'ci_claim',
        objectId: c.id,
        payload: { key: c.key, verified: b.data.verified },
      });
      return true;
    });
    if (!ok) return reply.code(404).send({ error: 'not_found' });
    return { ok: true };
  });

  /** Competitive-intelligence report (FR-50): accepted claims only, each citing its vendor-public source. */
  app.get('/api/ci/report', guard, async (request) => {
    const ctx = ctxOf(request);
    return withInstitution(deps.db, ctx.institutionId, async (tx) => {
      const domains = await domainItems(tx);
      const claims = await claimItems(tx, and(eq(ciClaims.status, 'accepted')));
      await appendAudit(tx, {
        institutionId: ctx.institutionId,
        actorPrincipalId: ctx.principalId,
        actorType: 'human',
        action: 'ci.report_exported',
        objectType: 'ci_report',
        payload: { claims: claims.length },
      });
      return {
        version: 'ci-report 1.0.0',
        generatedAt: new Date().toISOString(),
        label:
          'Competitive intelligence from vendor-public web pages. Claims are the vendor’s own statements unless marked verified. Kept separate from cases, portfolios and decision reports.',
        vendors: domains.map((d) => ({
          vendor: d.vendor,
          host: d.host,
          pathPrefix: d.pathPrefix,
          category: d.category,
          collected: d.collected,
          lastSuccessAt: d.lastSuccessAt,
          lastError: d.lastError,
          claims: claims.filter((c) => c.domainKey === d.key),
        })),
      };
    });
  });
}
