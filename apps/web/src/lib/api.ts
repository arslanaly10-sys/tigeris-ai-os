import type {
  AgentRunItem,
  CaseGovernance,
  DecisionLogItem,
  DecisionOutcome,
  HandoffAction,
  HandoffItem,
  MemoryItem,
  PolicyEvaluation,
  RecommendationItem,
  ReviewVerdict,
  ScenarioRunDetail,
  ScenarioRunSummary,
  ScenarioSetup,
  Drivers,
  AuthContext,
  CaseDetail,
  CaseSummary,
  CommandCentre,
  DemoPrincipal,
  EvidenceItem,
  AuthorityRuleItem,
  GraphPayload,
  MandateItem,
  PendingApprovals,
  SectorDetail,
  SectorKey,
  SectorSummary,
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
  resolveInstitution: (identifier: string) =>
    request<{ institution: { key: string; name: string }; identityProvider: 'demo' }>(
      'POST',
      '/api/auth/resolve-institution',
      { identifier },
    ),
  sectors: () => request<SectorSummary[]>('GET', '/api/sectors'),
  sector: (key: SectorKey) => request<SectorDetail>('GET', `/api/sectors/${key}`),
  mandates: () =>
    request<{ mandates: MandateItem[]; authority: AuthorityRuleItem[] }>('GET', '/api/mandates'),
  pendingApprovals: () => request<PendingApprovals>('GET', '/api/approvals/pending'),
  scenarioSetup: () => request<ScenarioSetup>('GET', '/api/scenarios/setup'),
  scenarios: (caseKey?: string) =>
    request<ScenarioRunSummary[]>(
      'GET',
      `/api/scenarios${caseKey ? `?case=${encodeURIComponent(caseKey)}` : ''}`,
    ),
  scenario: (key: string) => request<ScenarioRunDetail>('GET', `/api/scenarios/${encodeURIComponent(key)}`),
  runScenario: (caseKey: string, drivers: Drivers) =>
    request<{ key: string }>('POST', '/api/scenarios', { caseKey, drivers }),
  agentRuns: () => request<AgentRunItem[]>('GET', '/api/agent-runs'),
  governance: (caseKey: string) =>
    request<CaseGovernance>('GET', `/api/cases/${encodeURIComponent(caseKey)}/governance`),
  recommend: (caseKey: string, optionId: string, rationale: string) =>
    request<{ key: string }>('POST', `/api/cases/${encodeURIComponent(caseKey)}/recommendations`, {
      optionId,
      rationale,
    }),
  review: (recKey: string, verdict: ReviewVerdict, rationale: string) =>
    request<{ ok: true }>('POST', `/api/recommendations/${encodeURIComponent(recKey)}/reviews`, {
      verdict,
      rationale,
    }),
  decide: (recKey: string, outcome: DecisionOutcome, rationale: string) =>
    request<{ key: string; evaluation: PolicyEvaluation; handoffKey: string | null }>(
      'POST',
      `/api/recommendations/${encodeURIComponent(recKey)}/decisions`,
      { outcome, rationale },
    ),
  openRecommendations: () => request<RecommendationItem[]>('GET', '/api/recommendations'),
  decisions: () => request<DecisionLogItem[]>('GET', '/api/decisions'),
  handoffs: () => request<HandoffItem[]>('GET', '/api/handoffs'),
  handoffAction: (
    key: string,
    body: { action: HandoffAction; note?: string; outcome?: string; lesson?: string },
  ) =>
    request<{ status: string; memoryKey: string | null }>(
      'POST',
      `/api/handoffs/${encodeURIComponent(key)}/actions`,
      body,
    ),
  memory: (q: string) => request<MemoryItem[]>('GET', `/api/memory${q ? `?q=${encodeURIComponent(q)}` : ''}`),
};
