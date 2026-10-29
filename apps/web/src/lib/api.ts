import type {
  AuthContext,
  CaseDetail,
  CaseSummary,
  CommandCentre,
  DemoPrincipal,
  EvidenceItem,
  SourceSummary,
} from '@tigeris/shared';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`${status} ${code}`);
  }
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const payload = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, payload.error ?? 'request_failed');
  }
  return (await res.json()) as T;
}

export const api = {
  demoPrincipals: () =>
    request<{ institution: { key: string; name: string }; principals: DemoPrincipal[] }>(
      'GET',
      '/api/auth/demo-principals',
    ),
  startDemoSession: (principalId: string) =>
    request<{ ok: true }>('POST', '/api/auth/demo-session', { principalId }),
  logout: () => request<{ ok: true }>('POST', '/api/auth/logout'),
  context: () => request<AuthContext>('GET', '/api/auth/context'),
  commandCentre: () => request<CommandCentre>('GET', '/api/command-centre'),
  cases: () => request<CaseSummary[]>('GET', '/api/cases'),
  case: (key: string) => request<CaseDetail>('GET', `/api/cases/${encodeURIComponent(key)}`),
  evidence: (id: string) => request<EvidenceItem>('GET', `/api/evidence/${encodeURIComponent(id)}`),
  sources: () => request<SourceSummary[]>('GET', '/api/sources'),
};
