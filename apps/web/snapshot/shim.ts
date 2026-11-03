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
const current = () => {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
};

export function installSnapshotFetch(s: Snapshot) {
  const real = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      location.href,
    );
    if (!url.pathname.startsWith('/api/')) return real(input, init);
    const method = (init?.method ?? 'GET').toUpperCase();
    const path = url.pathname + url.search;
    if (path === '/api/auth/demo-principals') return json(200, s.principals);
    if (path === '/api/auth/resolve-institution') return json(200, s.institution);
    if (path === '/api/auth/oidc/status') return json(200, { enabled: false, issuer: null });
    if (path === '/api/auth/demo-session' && method === 'POST') {
      const id = JSON.parse(String(init?.body ?? '{}')).principalId as string;
      if (!s.byPrincipal[id]) return json(404, { error: 'not_found' });
      try {
        sessionStorage.setItem(KEY, id);
      } catch {
        /* private mode: the session lasts for this page only */
      }
      return json(200, { ok: true });
    }
    if (path === '/api/auth/logout') {
      try {
        sessionStorage.removeItem(KEY);
      } catch {
        /* nothing stored */
      }
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
