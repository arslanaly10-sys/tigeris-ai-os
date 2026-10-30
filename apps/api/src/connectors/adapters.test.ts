import { describe, expect, it } from 'vitest';
import { ADAPTERS, parseFeed } from './adapters';

describe('feed parsing', () => {
  it('reads RSS 2.0 items with dates and strips markup from descriptions', () => {
    const items = parseFeed(`<?xml version="1.0"?><rss version="2.0"><channel><title>T</title>
      <item><title>Transit advisory</title><link>https://example.org/a</link><guid>a-1</guid>
      <description>&lt;p&gt;Vessels advised to &lt;b&gt;report&lt;/b&gt;.&lt;/p&gt;</description>
      <pubDate>Tue, 28 Oct 2026 08:00:00 GMT</pubDate></item></channel></rss>`);
    expect(items).toEqual([
      {
        externalId: 'a-1',
        title: 'Transit advisory',
        link: 'https://example.org/a',
        summary: 'Vessels advised to report .',
        publishedAt: '2026-10-28T08:00:00.000Z',
      },
    ]);
  });

  it('reads Atom entries and JSON Feed items', () => {
    const atom =
      parseFeed(`<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>urn:x</id><title>Atom entry</title>
      <link rel="alternate" href="https://example.org/x"/><updated>2026-10-29T10:00:00Z</updated><summary>S</summary></entry></feed>`);
    expect(atom[0]).toMatchObject({ externalId: 'urn:x', link: 'https://example.org/x', summary: 'S' });
    const json = parseFeed(
      JSON.stringify({
        version: 'https://jsonfeed.org/version/1.1',
        items: [{ id: '9', title: 'J', url: 'https://example.org/j' }],
      }),
    );
    expect(json[0]).toMatchObject({ externalId: '9', title: 'J' });
  });

  it('refuses anything that is not a feed', () => {
    expect(() => parseFeed('<html><body>no</body></html>')).toThrow(/not an RSS, Atom or JSON feed/);
  });
});

describe('adapters never claim a connection they did not make', () => {
  it('reports a missing credential without reaching out', async () => {
    const r = await ADAPTERS.rest.test({
      key: 'CON-T',
      connectionType: 'rest',
      authType: 'api_key',
      authRef: 'TIGERIS_TEST_UNSET_KEY',
      endpoint: 'https://example.org/api',
    });
    expect(r).toEqual({
      status: 'failed',
      message: 'Credential TIGERIS_TEST_UNSET_KEY is not set in the server environment.',
    });
  });

  it('refuses plain http and keeps boundary types configured, not connected', async () => {
    expect(
      (
        await ADAPTERS.rss.test({
          key: 'X',
          connectionType: 'rss',
          authType: 'none',
          authRef: null,
          endpoint: 'http://example.org/f',
        })
      ).message,
    ).toContain('Only https');
    expect(
      (
        await ADAPTERS.sql.test({
          key: 'X',
          connectionType: 'sql',
          authType: 'basic',
          authRef: 'X_DB',
          endpoint: null,
        })
      ).status,
    ).toBe('configured');
  });
});
