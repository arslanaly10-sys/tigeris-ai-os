import type {
  AuthContext,
  CaseDetail,
  CaseSummary,
  CommandCentre,
  DemoPrincipal,
  EvidenceItem,
  GraphPayload,
  IngestionJobItem,
  MapLayers,
  SearchResult,
  SignalAction,
  SignalDetail,
  SignalSummary,
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
  signals: () => request<SignalSummary[]>('GET', '/api/signals'),
  signal: (key: string) => request<SignalDetail>('GET', `/api/signals/${encodeURIComponent(key)}`),
  triage: (key: string, action: SignalAction, rationale: string) =>
    request<{ signal: SignalDetail; caseKey: string | null }>(
      'POST',
      `/api/signals/${encodeURIComponent(key)}/actions`,
      { action, rationale },
    ),
  graph: () => request<GraphPayload>('GET', '/api/graph'),
  caseGraph: (key: string) => request<GraphPayload>('GET', `/api/cases/${encodeURIComponent(key)}/graph`),
  mapLayers: () => request<MapLayers>('GET', '/api/map/layers'),
  ingestion: () => request<IngestionJobItem[]>('GET', '/api/ingestion'),
  runSampleIngestion: () => request<{ jobId: string }>('POST', '/api/ingestion/sample'),
  search: (q: string) => request<SearchResult[]>('GET', `/api/search?q=${encodeURIComponent(q)}`),
};
