/**
 * Connector adapters (FR-07). Each connection type implements the same small, read-only interface, so a new
 * provider is a new adapter plus a mapping, without changes elsewhere. Credentials are read from the environment
 * variable a connector names (`auth_ref`) at the moment of use and never stored, logged or returned.
 *
 * A test reports `connected` only after an authenticated fetch has actually succeeded.
 */
import type { AuthType, ConnectionType } from '@tigeris/shared';
import { XMLParser } from 'fast-xml-parser';

export interface ConnectorConfig {
  key: string;
  connectionType: ConnectionType;
  authType: AuthType;
  authRef: string | null;
  endpoint: string | null;
}

export interface TestResult {
  status: 'connected' | 'failed' | 'configured';
  message: string;
  items?: number;
}

export interface FeedItem {
  externalId: string;
  title: string;
  link: string | null;
  summary: string;
  publishedAt: string | null;
}

export interface ConnectorAdapter {
  readonly type: ConnectionType;
  test(c: ConnectorConfig): Promise<TestResult>;
  /** Read-only fetch of the latest items. Only feed-type adapters produce items in this build. */
  fetchItems?(c: ConnectorConfig): Promise<FeedItem[]>;
}

const TIMEOUT_MS = 10_000;

/** The credential header for a connector, from the environment only. Never logged. */
function authHeaders(c: ConnectorConfig): Record<string, string> {
  if (c.authType === 'none') return {};
  if (!c.authRef)
    throw new AdapterError(`This connector uses ${c.authType} but names no credential reference.`);
  const secret = process.env[c.authRef];
  if (!secret) throw new AdapterError(`Credential ${c.authRef} is not set in the server environment.`);
  if (c.authType === 'api_key') return { authorization: `Bearer ${secret}` };
  if (c.authType === 'basic') return { authorization: `Basic ${Buffer.from(secret).toString('base64')}` };
  throw new AdapterError(
    `${c.authType} authentication is an adapter boundary in this build; it is not implemented.`,
  );
}

export class AdapterError extends Error {}

async function get(c: ConnectorConfig, accept: string): Promise<{ body: string; contentType: string }> {
  if (!c.endpoint) throw new AdapterError('No endpoint is configured.');
  let url: URL;
  try {
    url = new URL(c.endpoint);
  } catch {
    throw new AdapterError('The endpoint is not a valid URL.');
  }
  if (url.protocol !== 'https:') throw new AdapterError('Only https endpoints are allowed.');
  const res = await fetch(url, {
    headers: { accept, 'user-agent': 'TIGERIS-AI-OS connector (read-only)', ...authHeaders(c) },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: 'follow',
  }).catch((err: unknown) => {
    const cause = (err as { cause?: { code?: string; message?: string } }).cause;
    throw new AdapterError(
      `Could not reach ${url.host}: ${cause?.code ?? cause?.message ?? (err as Error).message}. ` +
        'Check the network policy allows this host.',
    );
  });
  if (!res.ok)
    throw new AdapterError(
      res.status === 403
        ? `${url.host} refused the request (HTTP 403). The network policy or the provider denied access.`
        : `${url.host} answered HTTP ${res.status}.`,
    );
  return { body: await res.text(), contentType: res.headers.get('content-type') ?? '' };
}

const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
const text = (v: unknown): string =>
  typeof v === 'string'
    ? v
    : typeof v === 'number'
      ? String(v)
      : v && typeof v === 'object' && '#text' in v
        ? String((v as { '#text': unknown })['#text'])
        : '';

/** Parses RSS 2.0, Atom or a JSON Feed into items. Exported for tests. */
export function parseFeed(body: string): FeedItem[] {
  const trimmed = body.trim();
  if (trimmed.startsWith('{')) {
    const j = JSON.parse(trimmed) as { items?: Record<string, unknown>[] };
    return (j.items ?? []).map((i) => ({
      externalId: String(i.id ?? i.url ?? i.title ?? ''),
      title: String(i.title ?? '(untitled)'),
      link: typeof i.url === 'string' ? i.url : null,
      summary: String(i.summary ?? i.content_text ?? '').slice(0, 2000),
      publishedAt: typeof i.date_published === 'string' ? i.date_published : null,
    }));
  }
  const doc = xml.parse(trimmed) as {
    rss?: { channel?: { item?: unknown } };
    feed?: { entry?: unknown };
  };
  const list = (x: unknown) => (Array.isArray(x) ? x : x ? [x] : []);
  if (doc.rss)
    return list(doc.rss.channel?.item).map((i: Record<string, unknown>) => ({
      externalId: text(i.guid) || text(i.link) || text(i.title),
      title: text(i.title) || '(untitled)',
      link: text(i.link) || null,
      summary: text(i.description)
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 2000),
      publishedAt: text(i.pubDate) ? new Date(text(i.pubDate)).toISOString() : null,
    }));
  if (doc.feed)
    return list(doc.feed.entry).map((e: Record<string, unknown>) => {
      const link = list(e.link).find(
        (l: Record<string, string>) => !l['@_rel'] || l['@_rel'] === 'alternate',
      );
      return {
        externalId: text(e.id) || text(e.title),
        title: text(e.title) || '(untitled)',
        link: link?.['@_href'] ?? null,
        summary: text(e.summary || e.content)
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 2000),
        publishedAt: text(e.updated || e.published)
          ? new Date(text(e.updated || e.published)).toISOString()
          : null,
      };
    });
  throw new AdapterError('The response is not an RSS, Atom or JSON feed.');
}

const fileAdapter = (type: ConnectionType): ConnectorAdapter => ({
  type,
  async test() {
    return {
      status: 'configured',
      message:
        'Upload-based connector: files are imported on demand; there is no remote system to connect to.',
    };
  },
});

const restAdapter: ConnectorAdapter = {
  type: 'rest',
  async test(c) {
    try {
      const { body } = await get(c, 'application/json');
      JSON.parse(body);
      return { status: 'connected', message: 'Authenticated read succeeded and returned JSON.' };
    } catch (e) {
      return {
        status: 'failed',
        message: e instanceof SyntaxError ? 'The endpoint did not return JSON.' : (e as Error).message,
      };
    }
  },
};

const feedAdapter: ConnectorAdapter = {
  type: 'rss',
  async test(c) {
    try {
      const items = parseFeed(
        (await get(c, 'application/rss+xml, application/atom+xml, application/json')).body,
      );
      return {
        status: 'connected',
        message: `Feed read succeeded with ${items.length} items.`,
        items: items.length,
      };
    } catch (e) {
      return { status: 'failed', message: (e as Error).message };
    }
  },
  async fetchItems(c) {
    return parseFeed((await get(c, 'application/rss+xml, application/atom+xml, application/json')).body);
  },
};

const boundary = (type: ConnectionType): ConnectorAdapter => ({
  type,
  async test() {
    return {
      status: 'configured',
      message: `${type} connections are an adapter boundary in this build: registered and governed, not yet implemented (docs/architecture.md §5).`,
    };
  },
});

export const ADAPTERS: Record<ConnectionType, ConnectorAdapter> = {
  file: fileAdapter('file'),
  document: fileAdapter('document'),
  rest: restAdapter,
  rss: feedAdapter,
  webhook: boundary('webhook'),
  sql: boundary('sql'),
  sftp: boundary('sftp'),
  stream: boundary('stream'),
};
