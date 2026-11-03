/** Answers /api requests from a recorded snapshot. Reads only; every write is refused. */
export interface Snapshot {
  recordedAt: string;
  principals: { principals: { id: string }[] };
  institution: unknown;
  byPrincipal: Record<string, Record<string, { status: number; body: unknown }>>;
}

const KEY = 'tigeris-snapshot-principal';
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
// In a sandboxed preview the browser may refuse storage; the session then lives in memory for this page.
let memory: string | null = null;
const current = () => {
  try {
    return sessionStorage.getItem(KEY) ?? memory;
  } catch {
    return memory;
  }
};
const remember = (id: string | null) => {
  memory = id;
  try {
    if (id) sessionStorage.setItem(KEY, id);
    else sessionStorage.removeItem(KEY);
  } catch {
    /* storage refused: memory only */
  }
};

/** Path and query of a request, without relying on the page's own address (previews have none). */
function requestPath(input: RequestInfo | URL): { pathname: string; search: string } | null {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const m = /^(?:[a-z][a-z0-9+.-]*:\/\/[^/]*)?(\/[^?#]*)(\?[^#]*)?/i.exec(raw);
  return m ? { pathname: m[1]!, search: m[2] ?? '' } : null;
}

export function installSnapshotFetch(s: Snapshot) {
  const real = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestPath(input);
    if (!url || !url.pathname.startsWith('/api/')) return real(input, init);
    const method = (init?.method ?? 'GET').toUpperCase();
    const path = url.pathname + url.search;
    if (path === '/api/auth/demo-principals') return json(200, s.principals);
    if (path === '/api/auth/resolve-institution') return json(200, s.institution);
    if (path === '/api/auth/oidc/status') return json(200, { enabled: false, issuer: null });
    if (path === '/api/auth/demo-session' && method === 'POST') {
      const id = JSON.parse(String(init?.body ?? '{}')).principalId as string;
      if (!s.byPrincipal[id]) return json(404, { error: 'not_found' });
      remember(id);
      return json(200, { ok: true });
    }
    if (path === '/api/auth/logout') {
      remember(null);
      return json(200, { ok: true });
    }
    const who = current();
    if (!who) return json(401, { error: 'unauthenticated' });
    if (method !== 'GET')
      return json(403, {
        error: 'read_only_snapshot',
        message: 'This is a read-only snapshot. Run the full TIGERIS deployment to act.',
      });
    const hit = s.byPrincipal[who]?.[path] ?? s.byPrincipal[who]?.[url.pathname];
    return hit ? json(hit.status, hit.body) : json(404, { error: 'not_in_snapshot' });
  };
}
