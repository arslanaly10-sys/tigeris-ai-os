/**
 * Competitive-intelligence crawling rules (slice J, FR-46..FR-48, D-54, D-55). Pure functions: robots.txt,
 * sitemaps, scope, HTML text extraction and rule-based claim candidates. Network access lives in `crawler.ts`.
 *
 * Politeness is not optional: robots.txt is read before anything else and obeyed (Disallow, Allow, Crawl-delay);
 * only the domain's own host and path scope are fetched; no logins, forms, paywalls or query-string crawling.
 */
import { createHash } from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';

export const USER_AGENT = 'TIGERIS-CI/1.0 (institutional research crawler; respects robots.txt)';
export const CRAWL_RULES = {
  version: 'ci-crawler 1.0.0',
  minDelayMs: 5_000,
  maxPagesPerRun: 30,
  maxSitemaps: 5,
  maxBytes: 2_000_000,
  timeoutMs: 15_000,
} as const;

export interface Robots {
  allow: string[];
  disallow: string[];
  crawlDelaySeconds: number | null;
  sitemaps: string[];
}

/** Parses the groups that apply to us: our own user agent if named, otherwise `*`. */
export function parseRobots(text: string): Robots {
  const groups: { agents: string[]; lines: [string, string][] }[] = [];
  const sitemaps: string[] = [];
  let current: { agents: string[]; lines: [string, string][] } | null = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    const value = m[2]!.trim();
    if (key === 'sitemap') {
      if (value) sitemaps.push(value);
      continue;
    }
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], lines: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (current) current.lines.push([key, value]);
  }
  const ours = groups.filter((g) => g.agents.some((a) => a !== '*' && 'tigeris-ci'.startsWith(a)));
  const chosen = ours.length ? ours : groups.filter((g) => g.agents.includes('*'));
  const lines = chosen.flatMap((g) => g.lines);
  const delay = lines.find(([k]) => k === 'crawl-delay');
  return {
    allow: lines.filter(([k, v]) => k === 'allow' && v).map(([, v]) => v),
    disallow: lines.filter(([k, v]) => k === 'disallow' && v).map(([, v]) => v),
    crawlDelaySeconds: delay && Number.isFinite(Number(delay[1])) ? Number(delay[1]) : null,
    sitemaps,
  };
}

const ruleMatches = (rule: string, path: string) => {
  const anchored = rule.endsWith('$');
  const body = (anchored ? rule.slice(0, -1) : rule)
    .split('*')
    .map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${body}${anchored ? '$' : ''}`).test(path);
};

/** Longest matching rule wins; Allow wins a tie (RFC 9309). No matching rule means allowed. */
export function robotsAllows(robots: Robots, path: string): boolean {
  const best = (rules: string[]) =>
    rules.filter((r) => ruleMatches(r, path)).reduce((n, r) => Math.max(n, r.length), -1);
  const a = best(robots.allow);
  const d = best(robots.disallow);
  return d < 0 || a >= d;
}

/** In scope: https, the domain's own host, under its path prefix, no query string, an HTML-like path. */
export function inScope(url: string, host: string, pathPrefix: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  return (
    u.protocol === 'https:' &&
    u.hostname === host &&
    u.search === '' &&
    u.pathname.startsWith(pathPrefix) &&
    !/\.(pdf|jpe?g|png|gif|svg|webp|zip|mp4|mp3|xml|json|css|js)$/i.test(u.pathname)
  );
}

const xml = new XMLParser({ ignoreAttributes: true });
const arr = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

/** Page URLs and nested sitemap URLs from a sitemap or sitemap index. */
export function parseSitemap(text: string): { pages: string[]; sitemaps: string[] } {
  try {
    const doc = xml.parse(text) as {
      urlset?: { url?: { loc?: string } | { loc?: string }[] };
      sitemapindex?: { sitemap?: { loc?: string } | { loc?: string }[] };
    };
    return {
      pages: arr(doc.urlset?.url)
        .map((u) => u.loc?.trim())
        .filter((x): x is string => !!x),
      sitemaps: arr(doc.sitemapindex?.sitemap)
        .map((s) => s.loc?.trim())
        .filter((x): x is string => !!x),
    };
  } catch {
    return { pages: [], sitemaps: [] };
  }
}

const decode = (s: string) =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)));

export interface ExtractedPage {
  title: string;
  canonicalUrl: string | null;
  publishedAt: string | null;
  text: string;
  contentHash: string;
}

/** Visible text of the page body without scripts, styles, navigation, headers, footers and forms. */
export function extractPage(html: string, url: string): ExtractedPage {
  const title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  const canonical = html
    .match(/<link[^>]+rel=["']canonical["'][^>]*>/i)?.[0]
    .match(/href=["']([^"']+)["']/i)?.[1];
  const published =
    html
      .match(/<meta[^>]+(?:property|name)=["'](?:article:published_time|date|dc\.date)["'][^>]*>/i)?.[0]
      .match(/content=["']([^"']+)["']/i)?.[1] ?? null;
  const body = html
    .replace(/<(script|style|noscript|svg|nav|header|footer|form|iframe|template)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|section|article|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  const text = decode(body)
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 0)
    .join('\n');
  let canonicalUrl: string | null = null;
  try {
    canonicalUrl = canonical ? new URL(canonical, url).toString() : null;
  } catch {
    canonicalUrl = null;
  }
  const date = published && !Number.isNaN(Date.parse(published)) ? new Date(published).toISOString() : null;
  return {
    title,
    canonicalUrl,
    publishedAt: date,
    text,
    contentHash: createHash('sha256').update(text).digest('hex'),
  };
}

export const CLAIM_KINDS = ['capability', 'scale', 'customer', 'security', 'positioning'] as const;
export type ClaimKind = (typeof CLAIM_KINDS)[number];

const CLAIM_RULES: { kind: ClaimKind; pattern: RegExp }[] = [
  { kind: 'scale', pattern: /\b\d[\d,.]*\s*(%|percent|trillion|billion|million|bn|tn|x\b)|\$\s?\d/i },
  { kind: 'customer', pattern: /\b(customers?|clients?|trusted by|used by|institutions|firms|users)\b/i },
  {
    kind: 'security',
    pattern: /\b(secure|security|compliance|compliant|certified|SOC ?2|ISO ?27001|GDPR|encryption)\b/i,
  },
  {
    kind: 'positioning',
    pattern: /\b(leading|leader|first|only|best|world'?s|industry[- ]standard|unique)\b/i,
  },
  {
    kind: 'capability',
    pattern:
      /\b(enables?|provides?|offers?|delivers?|helps?|automates?|integrates?|supports?|allows?|lets)\b/i,
  },
];

export interface ClaimCandidate {
  kind: ClaimKind;
  passage: string;
  rule: string;
}

/**
 * Rule-based candidate claims (D-55): whole sentences of 40–400 characters matching a claim rule, first rule wins,
 * at most 12 per page, deduplicated. Candidates are the vendor's own words; a person accepts or rejects each one.
 */
export function extractClaims(text: string, max = 12): ClaimCandidate[] {
  const sentences = text
    .split(/\n|(?<=[.!?])\s+(?=[A-Z])/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 40 && s.length <= 400 && /[a-z]/.test(s));
  const seen = new Set<string>();
  const out: ClaimCandidate[] = [];
  for (const s of sentences) {
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    const rule = CLAIM_RULES.find((r) => r.pattern.test(s));
    if (!rule) continue;
    seen.add(key);
    out.push({ kind: rule.kind, passage: s, rule: `${rule.kind}:${rule.pattern.source.slice(0, 40)}` });
    if (out.length >= max) break;
  }
  return out;
}
