import { describe, expect, it } from 'vitest';
import { extractClaims, extractPage, inScope, parseRobots, parseSitemap, robotsAllows } from './crawl-lib';

describe('robots.txt', () => {
  const robots = parseRobots(`
# comment
User-agent: Googlebot
Disallow: /

User-agent: *
Disallow: /private
Disallow: /*.pdf$
Allow: /private/press
Crawl-delay: 10
Sitemap: https://www.example.com/sitemap.xml
`);
  it('applies the * group when we are not named, with longest match and Allow on ties', () => {
    expect(robots.crawlDelaySeconds).toBe(10);
    expect(robots.sitemaps).toEqual(['https://www.example.com/sitemap.xml']);
    expect(robotsAllows(robots, '/products')).toBe(true);
    expect(robotsAllows(robots, '/private/team')).toBe(false);
    expect(robotsAllows(robots, '/private/press/2026')).toBe(true);
    expect(robotsAllows(robots, '/files/brochure.pdf')).toBe(false);
  });
  it('prefers a group naming us, and an empty Disallow allows everything', () => {
    const r = parseRobots('User-agent: *\nDisallow: /\n\nUser-agent: TIGERIS-CI\nDisallow:\n');
    expect(robotsAllows(r, '/anything')).toBe(true);
    expect(robotsAllows(parseRobots('User-agent: *\nDisallow: /\n'), '/x')).toBe(false);
  });
});

describe('scope and sitemaps', () => {
  it('keeps to https, the host and the path prefix, without query strings or files', () => {
    expect(inScope('https://www.blackrock.com/aladdin/products', 'www.blackrock.com', '/aladdin')).toBe(true);
    expect(inScope('https://www.blackrock.com/corporate/about', 'www.blackrock.com', '/aladdin')).toBe(false);
    expect(inScope('http://www.blackrock.com/aladdin', 'www.blackrock.com', '/aladdin')).toBe(false);
    expect(inScope('https://evil.example/aladdin', 'www.blackrock.com', '/aladdin')).toBe(false);
    expect(inScope('https://www.blackrock.com/aladdin?x=1', 'www.blackrock.com', '/aladdin')).toBe(false);
    expect(inScope('https://www.blackrock.com/aladdin/a.pdf', 'www.blackrock.com', '/aladdin')).toBe(false);
  });
  it('reads page lists and sitemap indexes, and survives junk', () => {
    expect(
      parseSitemap(
        '<urlset><url><loc> https://a.example/x </loc></url><url><loc>https://a.example/y</loc></url></urlset>',
      ).pages,
    ).toEqual(['https://a.example/x', 'https://a.example/y']);
    expect(
      parseSitemap('<sitemapindex><sitemap><loc>https://a.example/s1.xml</loc></sitemap></sitemapindex>')
        .sitemaps,
    ).toEqual(['https://a.example/s1.xml']);
    expect(parseSitemap('not xml at all')).toEqual({ pages: [], sitemaps: [] });
  });
});

describe('page text and claims', () => {
  const html = `<html><head><title>Platform &amp; Data | Vendor</title>
<link rel="canonical" href="/platform">
<meta property="article:published_time" content="2026-09-01T00:00:00Z">
<script>var secret = 1;</script><style>.x{}</style></head>
<body><nav>Home About</nav><h1>Our platform</h1>
<p>Our platform enables investment teams to unify portfolio data across every asset class.</p>
<p>Trusted by more than 200 institutions worldwide, including pension funds.</p>
<p>Short line.</p><footer>Cookie policy</footer></body></html>`;
  const page = extractPage(html, 'https://www.vendor.example/platform?utm=1');

  it('keeps visible body text only, with title, canonical URL, date and a content hash', () => {
    expect(page.title).toBe('Platform & Data | Vendor');
    expect(page.canonicalUrl).toBe('https://www.vendor.example/platform');
    expect(page.publishedAt).toBe('2026-09-01T00:00:00.000Z');
    expect(page.text).toContain('Our platform enables');
    expect(page.text).not.toMatch(/secret|Cookie policy|Home About/);
    expect(page.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(extractPage(html, 'https://www.vendor.example/platform').contentHash).toBe(page.contentHash);
  });

  it('proposes whole-sentence candidates in the vendor’s own words, classified by rule', () => {
    const claims = extractClaims(page.text);
    expect(claims.map((c) => c.kind)).toEqual(['capability', 'customer']);
    expect(claims[1]!.passage).toBe(
      'Trusted by more than 200 institutions worldwide, including pension funds.',
    );
    expect(claims.every((c) => c.passage.length >= 40)).toBe(true);
  });
});
