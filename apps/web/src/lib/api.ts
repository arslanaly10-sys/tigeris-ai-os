import type {
  AgentRunItem,
  ConnectorItem,
  ConnectorRunDetail,
  ConnectorRunItem,
  DataQualitySummary,
  Dataset,
  DocumentItem,
  ManagerItem,
  PositionsPayload,
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
  CaseAnalysisPayload,
  CaseReport,
  CiOverview,
  CiClaimItem,
  CiReport,
  OutcomeReviewPayload,
  AuditPage,
  AuditVerification,
  AdminOverview,
  Role,
  HorizonKey,
  ReviewNoteItem,
  SensitivityPayload,
  EntityDetail,
  EntityListItem,
  EntityType,
  SectorSummary,
  IngestionJobItem,
  MapLayers,
  SearchResult,
  SignalAction,
  SignalDetail,
  SignalSummary,
  SourceSummary,
  GuardrailItem,
  InterventionInbox,
  RuleOperator,
  SemanticRegistry,
  WatchRuleList,
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
  decide: (recKey: string, outcome: DecisionOutcome, rationale: string, acknowledgeDissent = false) =>
    request<{ key: string; evaluation: PolicyEvaluation; handoffKey: string | null }>(
      'POST',
      `/api/recommendations/${encodeURIComponent(recKey)}/decisions`,
      { outcome, rationale, acknowledgeDissent },
    ),
  addNote: (recKey: string, stance: ReviewNoteItem['stance'], body: string) =>
    request<{ ok: true }>('POST', `/api/recommendations/${encodeURIComponent(recKey)}/notes`, {
      stance,
      body,
    }),
  outcomes: (memoryKey: string) =>
    request<OutcomeReviewPayload>('GET', `/api/memory/${encodeURIComponent(memoryKey)}/outcomes`),
  reviewOutcome: (
    memoryKey: string,
    body: {
      figureRef: string;
      observedValue: number;
      observedOn: string;
      source: string;
      sourceUrl?: string;
      notComparable: boolean;
      note: string;
    },
  ) => request<{ key: string }>('POST', `/api/memory/${encodeURIComponent(memoryKey)}/outcomes`, body),
  audit: (filter: { before?: number; action?: string; caseKey?: string } = {}) => {
    const q = new URLSearchParams(
      Object.entries(filter)
        .filter((e) => e[1] !== undefined && e[1] !== '')
        .map(([k, v]) => [k, String(v)]),
    );
    return request<AuditPage>('GET', `/api/audit${q.size ? `?${q}` : ''}`);
  },
  verifyAudit: () => request<AuditVerification>('POST', '/api/audit/verify', {}),
  admin: () => request<AdminOverview>('GET', '/api/admin'),
  changeAccess: (
    principalId: string,
    body:
      | { kind: 'role'; role: Role; grant: boolean; reason: string }
      | { kind: 'workspace'; sectorKey: SectorKey; grant: boolean; reason: string },
  ) => request<{ ok: true }>('POST', `/api/admin/principals/${encodeURIComponent(principalId)}/access`, body),
  provision: (body: { displayName: string; title: string; idpSubject: string; role: Role; reason: string }) =>
    request<{ id: string }>('POST', '/api/admin/principals', body),
  ci: () => request<CiOverview>('GET', '/api/ci'),
  ciClaims: (filter: { status?: CiClaimItem['status']; domain?: string } = {}) => {
    const q = new URLSearchParams(Object.entries(filter).filter((e): e is [string, string] => !!e[1]));
    return request<CiClaimItem[]>('GET', `/api/ci/claims${q.size ? `?${q}` : ''}`);
  },
  ciReport: () => request<CiReport>('GET', '/api/ci/report'),
  semantic: () => request<SemanticRegistry>('GET', '/api/semantic'),
  interventions: (f: { mine: boolean; status: 'live' | 'resolved' | 'dismissed' | 'all' }) =>
    request<InterventionInbox>('GET', `/api/interventions?mine=${f.mine}&status=${f.status}`),
  sweepInterventions: () =>
    request<{ engine: string; rules: number; raised: number; refreshed: number; cleared: number }>(
      'POST',
      '/api/interventions/sweep',
      {},
    ),
  actOnIntervention: (key: string, action: 'acknowledge' | 'resolve' | 'dismiss', reason?: string) =>
    request<{ status: string }>('POST', `/api/interventions/${encodeURIComponent(key)}/act`, {
      action,
      reason,
    }),
  watchRules: () => request<WatchRuleList>('GET', '/api/watch-rules'),
  guardrails: () => request<{ canLift: boolean; guardrails: GuardrailItem[] }>('GET', '/api/guardrails'),
  recordGuardrail: (
    decisionKey: string,
    body: {
      effect: 'block' | 'require_role';
      requiredRole?: Role;
      thresholdValue?: number;
      thresholdUnit?: string;
      statement: string;
      expiresOn?: string;
    },
  ) =>
    request<{ key: string; actionClass: string }>(
      'POST',
      `/api/decisions/${encodeURIComponent(decisionKey)}/guardrails`,
      body,
    ),
  liftGuardrail: (key: string, reason: string) =>
    request<{ status: string }>('POST', `/api/guardrails/${encodeURIComponent(key)}/lift`, { reason }),
  actOnWatchRule: (key: string, version: number, action: 'approve' | 'retire') =>
    request<{ status: string }>(
      'POST',
      `/api/watch-rules/${encodeURIComponent(key)}/${version}/${action}`,
      {},
    ),
  semanticExport: () => request<Record<string, unknown>>('GET', '/api/semantic/export'),
  semanticDraftRule: (body: {
    key: string;
    label: string;
    subject: string;
    operator: RuleOperator;
    threshold: number;
    attentionMargin: number;
    mandateKey?: string;
    jurisdiction?: string;
    rationale: string;
  }) => request<{ key: string; version: number }>('POST', '/api/semantic/rules', body),
  semanticDraftDefinition: (body: {
    key: string;
    kind: 'metric' | 'term';
    label: string;
    description: string;
    unit?: string;
    formula?: string;
    ownerRole: Role;
    sourceRef?: string;
    jurisdiction?: string;
  }) => request<{ key: string; version: number }>('POST', '/api/semantic/definitions', body),
  semanticAct: (
    kind: 'rules' | 'definitions',
    key: string,
    version: number | string,
    action: 'approve' | 'retire',
  ) =>
    request<{ status: string }>(
      'POST',
      `/api/semantic/${kind}/${encodeURIComponent(key)}/${encodeURIComponent(String(version))}/${action}`,
      {},
    ),
  ciAddDomain: (body: {
    key: string;
    vendor: string;
    host: string;
    pathPrefix: string;
    category: string;
    reason: string;
  }) => request<{ key: string }>('POST', '/api/ci/domains', body),
  ciDomainStatus: (key: string, status: 'approved' | 'paused', reason: string) =>
    request<{ ok: true }>('POST', `/api/ci/domains/${encodeURIComponent(key)}/status`, { status, reason }),
  ciCrawl: (key: string) =>
    request<{ queued?: true; key?: string; status?: string }>(
      'POST',
      `/api/ci/domains/${encodeURIComponent(key)}/crawl`,
      {},
    ),
  ciCurate: (
    key: string,
    body: { decision: 'accept' | 'reject'; paraphrase?: string; verified: boolean; note: string },
  ) => request<{ ok: true }>('POST', `/api/ci/claims/${encodeURIComponent(key)}/curate`, body),
  caseReport: (caseKey: string) =>
    request<CaseReport>('GET', `/api/cases/${encodeURIComponent(caseKey)}/report?format=print`),
  caseAnalysis: (caseKey: string) =>
    request<CaseAnalysisPayload>('GET', `/api/cases/${encodeURIComponent(caseKey)}/analysis`),
  runAnalysis: (caseKey: string) =>
    request<{ key: string }>('POST', `/api/cases/${encodeURIComponent(caseKey)}/analysis`, {}),
  sensitivity: (scenarioKey: string, metric: string, horizon: HorizonKey) =>
    request<SensitivityPayload>(
      'GET',
      `/api/scenarios/${encodeURIComponent(scenarioKey)}/sensitivity?metric=${encodeURIComponent(metric)}&horizon=${horizon}`,
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
  connectors: () => request<ConnectorItem[]>('GET', '/api/connectors'),
  registerConnector: (body: Record<string, unknown>) =>
    request<{ key: string }>('POST', '/api/connectors', body),
  approveSource: (key: string) =>
    request<{ ok: true }>('POST', `/api/sources/${encodeURIComponent(key)}/approve`),
  testConnector: (key: string) =>
    request<{ status: string; message: string }>('POST', `/api/connectors/${encodeURIComponent(key)}/test`),
  setConnectorStatus: (key: string, status: 'paused' | 'configured' | 'retired') =>
    request<{ status: string }>('POST', `/api/connectors/${encodeURIComponent(key)}/status`, { status }),
  syncConnector: (key: string) =>
    request<{ status: string; runKey: string; fetched: number; created: number; error: string | null }>(
      'POST',
      `/api/connectors/${encodeURIComponent(key)}/sync`,
    ),
  /** Multipart upload of one file to a file or document connector. */
  upload: async (key: string, dataset: Dataset, file: File) => {
    const form = new FormData();
    form.append('dataset', dataset);
    form.append('file', file, file.name);
    const res = await fetch(`/api/connectors/${encodeURIComponent(key)}/uploads`, {
      method: 'POST',
      credentials: 'same-origin',
      body: form,
    });
    const payload = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    if (!res.ok)
      throw new UploadFailed(res.status, payload.error ?? 'request_failed', payload.message ?? null);
    return payload as {
      status: 'succeeded' | 'partial' | 'failed';
      runKey: string;
      rowsTotal: number;
      rowsAccepted: number;
      rowsWarned: number;
      rowsRejected: number;
      error: string | null;
    };
  },
  connectorRuns: (connector?: string) =>
    request<ConnectorRunItem[]>(
      'GET',
      `/api/connector-runs${connector ? `?connector=${encodeURIComponent(connector)}` : ''}`,
    ),
  connectorRun: (key: string) =>
    request<ConnectorRunDetail>('GET', `/api/connector-runs/${encodeURIComponent(key)}`),
  positions: (filter: { connector?: string; sector?: SectorKey } = {}) => {
    const q = new URLSearchParams(Object.entries(filter).filter((e): e is [string, string] => !!e[1]));
    return request<PositionsPayload>('GET', `/api/positions${q.size ? `?${q}` : ''}`);
  },
  entities: (filter: { sector?: SectorKey; type?: EntityType; q?: string } = {}) => {
    const q = new URLSearchParams(Object.entries(filter).filter((e): e is [string, string] => !!e[1]));
    return request<EntityListItem[]>('GET', `/api/entities${q.size ? `?${q}` : ''}`);
  },
  entity: (key: string) => request<EntityDetail>('GET', `/api/entities/${encodeURIComponent(key)}`),
  managers: (connector?: string) =>
    request<ManagerItem[]>(
      'GET',
      `/api/managers${connector ? `?connector=${encodeURIComponent(connector)}` : ''}`,
    ),
  documents: () => request<DocumentItem[]>('GET', '/api/documents'),
  dataQuality: () => request<DataQualitySummary>('GET', '/api/data-quality'),
};

/** An upload the server refused, with its reason. */
export class UploadFailed extends ApiError {
  constructor(
    status: number,
    code: string,
    readonly detail: string | null,
  ) {
    super(status, code);
  }
}
