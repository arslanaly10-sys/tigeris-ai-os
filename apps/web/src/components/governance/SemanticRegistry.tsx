/**
 * Semantic registry (Phase 5A, FR-52): codified rules with their current evaluation and lineage, the definitions
 * they judge, drafting by one person and approval by another, and the JSON-LD export. Status is words plus an icon.
 */
import {
  RULE_OPERATORS,
  ROLES,
  describeRule,
  type RuleEvaluation,
  type SemanticDefinitionItem,
  type SemanticRegistry,
  type SemanticRuleItem,
} from '@tigeris/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Download,
  FileCode2,
  OctagonAlert,
  Scale,
} from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { LoadState } from '@/components/PageHeader';
import { ClaimBadge } from '@/components/truth/badges';
import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/data';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { ApiError, api } from '@/lib/api';
import { formatRelative } from '@/lib/format';
import { ROLE_LABEL } from '@/lib/roles';

const field =
  'mt-1 block min-h-10 w-full rounded-md border border-line-strong bg-panel px-3 text-sm text-ink focus-visible:border-brand';

const EVAL: Record<
  RuleEvaluation['status'],
  { label: string; tone: 'ok' | 'medium' | 'high' | 'awaiting'; icon: ReactNode }
> = {
  within: { label: 'Within', tone: 'ok', icon: <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> },
  attention: {
    label: 'Attention',
    tone: 'medium',
    icon: <AlertTriangle className="h-3.5 w-3.5" aria-hidden />,
  },
  breach: { label: 'Breach', tone: 'high', icon: <OctagonAlert className="h-3.5 w-3.5" aria-hidden /> },
  not_evaluable: {
    label: 'Not evaluable',
    tone: 'awaiting',
    icon: <CircleDashed className="h-3.5 w-3.5" aria-hidden />,
  },
};

const STATUS_LABEL = { draft: 'Draft', approved: 'Approved', retired: 'Retired' } as const;

function EvalPill({ status }: { status: RuleEvaluation['status'] }) {
  const e = EVAL[status];
  return (
    <StatusPill tone={e.tone}>
      <span className="inline-flex items-center gap-1">
        {e.icon}
        {e.label}
      </span>
    </StatusPill>
  );
}

const num = (v: number) => Number(v.toFixed(2)).toString();

function useRegistry() {
  return useQuery({ queryKey: ['semantic'], queryFn: api.semantic });
}

function ActButtons({
  kind,
  item,
  canApprove,
}: {
  kind: 'rules' | 'definitions';
  item: { key: string; version: number | string; status: string };
  canApprove: boolean;
}) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (action: 'approve' | 'retire') => api.semanticAct(kind, item.key, item.version, action),
    onSettled: () => qc.invalidateQueries({ queryKey: ['semantic'] }),
  });
  if (!canApprove || item.status === 'retired') return null;
  return (
    <span className="flex flex-wrap items-center gap-2">
      {item.status === 'draft' ? (
        <Button size="sm" variant="primary" disabled={m.isPending} onClick={() => m.mutate('approve')}>
          Approve version {item.version}
        </Button>
      ) : (
        <Button size="sm" disabled={m.isPending} onClick={() => m.mutate('retire')}>
          Retire
        </Button>
      )}
      {m.error ? (
        <span role="alert" className="text-xs text-red">
          {m.error instanceof ApiError && m.error.code === 'self_approval'
            ? 'You drafted this version; another person must approve it.'
            : 'Not recorded. Try again.'}
        </span>
      ) : null}
    </span>
  );
}

function RuleRow({ r, canApprove }: { r: SemanticRuleItem; canApprove: boolean }) {
  const ev = r.evaluation;
  return (
    <li className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]">
      <div className="min-w-0">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="tabular text-xs text-ink-faint">
            {r.key} · v{r.version}
          </span>
          <span className="text-sm font-medium text-ink">{r.label}</span>
        </p>
        <p className="mt-1 text-sm text-ink">
          <span className="tabular">{describeRule(r.subjectLabel ?? r.subject, r, r.unit)}</span>
          <span className="text-ink-muted">
            {' '}
            · {r.severity === 'breach' ? 'breach' : 'attention'} when crossed
            {r.attentionMargin > 0
              ? `; attention within ${num(r.attentionMargin * 100)}% of the threshold`
              : ''}
          </span>
        </p>
        <p className="mt-1 text-xs text-ink-muted">{r.rationale}</p>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-faint">
          <span>{STATUS_LABEL[r.status]}</span>
          {r.mandateKey ? <span>Mandate {r.mandateKey}</span> : null}
          {r.jurisdiction ? <span>Jurisdiction: {r.jurisdiction}</span> : null}
          <span>Subject {r.subject}</span>
          <span>
            {r.createdBy ? `Drafted by ${r.createdBy}` : 'Seeded'}
            {r.status !== 'draft'
              ? r.approvedBy
                ? ` · approved by ${r.approvedBy}`
                : ' · owner-approved'
              : ''}
          </span>
          <ClaimBadge value={r.claimClass} />
        </p>
        {r.basis ? <p className="mt-1 text-[12px] text-ink-faint">{r.basis}</p> : null}
      </div>
      <div className="flex flex-col items-start gap-1.5 text-sm">
        {ev ? (
          <>
            <EvalPill status={ev.status} />
            {ev.value !== null ? (
              <span className="tabular text-ink">
                Current {num(ev.value)} {r.unit} · headroom {num(ev.headroom!)}
              </span>
            ) : (
              <span className="text-xs text-ink-muted">
                {r.subject.startsWith('sector:')
                  ? 'No records you may read in this sector dataset.'
                  : 'No scenario run you may read yet. Run a scenario to evaluate this rule.'}
              </span>
            )}
            {ev.observedFrom ? (
              <span className="text-xs text-ink-muted">
                From {ev.observedFrom}
                {ev.asOf ? ` · as of ${ev.asOf.slice(0, 10)}` : ''}
                {ev.inputKeys.length ? ` · records ${ev.inputKeys.join(', ')}` : ''}
              </span>
            ) : null}
            <span className="text-[12px] text-ink-faint">{ev.version}</span>
          </>
        ) : (
          <span className="text-xs text-ink-muted">
            {r.status === 'draft' ? 'Not evaluated until approved.' : 'Retired; not evaluated.'}
          </span>
        )}
        <ActButtons kind="rules" item={r} canApprove={canApprove} />
      </div>
    </li>
  );
}

function RuleForm({ reg }: { reg: SemanticRegistry }) {
  const id = useId();
  const qc = useQueryClient();
  const metrics = reg.definitions.filter((d) => d.kind === 'metric' && d.status === 'approved');
  const [f, setF] = useState({
    key: '',
    label: '',
    subject: metrics[0]?.key ?? '',
    operator: '<=' as (typeof RULE_OPERATORS)[number],
    threshold: '',
    margin: '10',
    mandateKey: '',
    jurisdiction: '',
    rationale: '',
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF({ ...f, [k]: e.target.value });
  const m = useMutation({
    mutationFn: () =>
      api.semanticDraftRule({
        key: f.key.trim().toUpperCase(),
        label: f.label,
        subject: f.subject,
        operator: f.operator,
        threshold: Number(f.threshold),
        attentionMargin: Number(f.margin) / 100,
        mandateKey: f.mandateKey || undefined,
        jurisdiction: f.jurisdiction || undefined,
        rationale: f.rationale,
      }),
    onSuccess: async () => {
      setF({ ...f, key: '', label: '', threshold: '', rationale: '' });
      await qc.invalidateQueries({ queryKey: ['semantic'] });
    },
  });
  const unit = metrics.find((d) => d.key === f.subject)?.unit;
  return (
    <form
      className="grid gap-3 border-t border-line px-5 py-4 md:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate();
      }}
    >
      <label className="text-sm font-medium text-ink" htmlFor={`${id}-key`}>
        Rule key (new key, or an existing one for a new version)
        <input
          id={`${id}-key`}
          className={field}
          value={f.key}
          onChange={set('key')}
          placeholder="M-RISK-03"
        />
      </label>
      <label className="text-sm font-medium text-ink md:col-span-2" htmlFor={`${id}-label`}>
        Label
        <input id={`${id}-label`} className={field} value={f.label} onChange={set('label')} />
      </label>
      <label className="text-sm font-medium text-ink md:col-span-3" htmlFor={`${id}-subject`}>
        Measure judged
        <select id={`${id}-subject`} className={field} value={f.subject} onChange={set('subject')}>
          {metrics.map((d) => (
            <option key={d.key} value={d.key}>
              {d.label} ({d.key})
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-medium text-ink" htmlFor={`${id}-op`}>
        Must be
        <select id={`${id}-op`} className={field} value={f.operator} onChange={set('operator')}>
          {RULE_OPERATORS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-medium text-ink" htmlFor={`${id}-thr`}>
        Threshold{unit ? ` (${unit})` : ''}
        <input
          id={`${id}-thr`}
          className={field}
          inputMode="decimal"
          value={f.threshold}
          onChange={set('threshold')}
        />
      </label>
      <label className="text-sm font-medium text-ink" htmlFor={`${id}-margin`}>
        Attention margin (%)
        <input
          id={`${id}-margin`}
          className={field}
          inputMode="decimal"
          value={f.margin}
          onChange={set('margin')}
        />
      </label>
      <label className="text-sm font-medium text-ink" htmlFor={`${id}-mandate`}>
        Mandate (optional)
        <input id={`${id}-mandate`} className={field} value={f.mandateKey} onChange={set('mandateKey')} />
      </label>
      <label className="text-sm font-medium text-ink" htmlFor={`${id}-jur`}>
        Jurisdiction (optional)
        <input id={`${id}-jur`} className={field} value={f.jurisdiction} onChange={set('jurisdiction')} />
      </label>
      <label className="text-sm font-medium text-ink md:col-span-3" htmlFor={`${id}-why`}>
        Rationale (recorded)
        <input id={`${id}-why`} className={field} value={f.rationale} onChange={set('rationale')} />
      </label>
      {m.error ? (
        <p role="alert" className="text-sm text-red md:col-span-3">
          Check the key (capitals, digits and hyphens), a numeric threshold, a margin below 100% and a
          rationale of at least 10 characters.
        </p>
      ) : null}
      {m.isSuccess ? (
        <p role="status" className="text-sm text-emerald md:col-span-3">
          Draft recorded. Another person with approval authority must approve it before it is evaluated.
        </p>
      ) : null}
      <div className="md:col-span-3">
        <Button type="submit" variant="primary" disabled={m.isPending}>
          Draft rule for approval
        </Button>
      </div>
    </form>
  );
}

export function RulesView() {
  const q = useRegistry();
  const [showRetired, setShowRetired] = useState(false);
  if (!q.data) return <LoadState isPending={q.isPending} error={q.error} />;
  const reg = q.data;
  const order = { approved: 0, draft: 1, retired: 2 } as const;
  const rules = reg.rules
    .filter((r) => showRetired || r.status !== 'retired')
    .sort((a, b) => order[a.status] - order[b.status] || a.key.localeCompare(b.key));
  const retired = reg.rules.filter((r) => r.status === 'retired').length;
  return (
    <div className="grid gap-6">
      <Panel aria-labelledby="rules-heading">
        <PanelHeader
          id="rules-heading"
          icon={<Scale className="h-4 w-4" aria-hidden />}
          title="Codified rules"
          description={`Each rule names the measure it judges, its threshold and when it raises attention. Approved rules are evaluated on every read by ${reg.version}, from the latest scenario run and the sector models you may read.`}
        />
        <ul className="divide-y divide-line border-t border-line">
          {rules.map((r) => (
            <RuleRow key={`${r.key}-${r.version}`} r={r} canApprove={reg.canApprove} />
          ))}
        </ul>
        {retired ? (
          <div className="border-t border-line px-5 py-3">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowRetired((v) => !v)}
              aria-expanded={showRetired}
            >
              {showRetired ? 'Hide' : 'Show'} {retired} retired version{retired === 1 ? '' : 's'}
            </Button>
          </div>
        ) : null}
      </Panel>
      {reg.canAuthor ? (
        <Panel aria-labelledby="rule-form-heading">
          <PanelHeader
            id="rule-form-heading"
            title="Draft a rule or a new version"
            description="A draft changes nothing until a domain expert or the executive, other than you, approves it. Approving a new version retires the previous one."
          />
          <RuleForm reg={reg} />
        </Panel>
      ) : null}
    </div>
  );
}

function DefinitionForm() {
  const id = useId();
  const qc = useQueryClient();
  const [f, setF] = useState({
    key: '',
    kind: 'term' as 'term' | 'metric',
    label: '',
    description: '',
    unit: '',
    formula: '',
    ownerRole: 'domain_expert' as (typeof ROLES)[number],
    sourceRef: '',
    jurisdiction: '',
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF({ ...f, [k]: e.target.value });
  const m = useMutation({
    mutationFn: () =>
      api.semanticDraftDefinition({
        ...f,
        key: f.key.trim().toLowerCase(),
        unit: f.unit || undefined,
        formula: f.formula || undefined,
        sourceRef: f.sourceRef || undefined,
        jurisdiction: f.jurisdiction || undefined,
      }),
    onSuccess: async () => {
      setF({ ...f, key: '', label: '', description: '', formula: '' });
      await qc.invalidateQueries({ queryKey: ['semantic'] });
    },
  });
  return (
    <form
      className="grid gap-3 border-t border-line px-5 py-4 md:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate();
      }}
    >
      <label className="text-sm font-medium text-ink" htmlFor={`${id}-key`}>
        Key (lowercase, e.g. term:essential_plant)
        <input id={`${id}-key`} className={field} value={f.key} onChange={set('key')} />
      </label>
      <label className="text-sm font-medium text-ink" htmlFor={`${id}-kind`}>
        Kind
        <select id={`${id}-kind`} className={field} value={f.kind} onChange={set('kind')}>
          <option value="term">Term</option>
          <option value="metric">Metric</option>
        </select>
      </label>
      <label className="text-sm font-medium text-ink" htmlFor={`${id}-label`}>
        Label
        <input id={`${id}-label`} className={field} value={f.label} onChange={set('label')} />
      </label>
      <label className="text-sm font-medium text-ink md:col-span-3" htmlFor={`${id}-desc`}>
        Definition
        <input id={`${id}-desc`} className={field} value={f.description} onChange={set('description')} />
      </label>
      <label className="text-sm font-medium text-ink" htmlFor={`${id}-unit`}>
        Unit (metrics)
        <input id={`${id}-unit`} className={field} value={f.unit} onChange={set('unit')} />
      </label>
      <label className="text-sm font-medium text-ink md:col-span-2" htmlFor={`${id}-formula`}>
        Formula or method (metrics)
        <input id={`${id}-formula`} className={field} value={f.formula} onChange={set('formula')} />
      </label>
      <label className="text-sm font-medium text-ink" htmlFor={`${id}-owner`}>
        Owner
        <select id={`${id}-owner`} className={field} value={f.ownerRole} onChange={set('ownerRole')}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-medium text-ink" htmlFor={`${id}-src`}>
        Source (optional)
        <input id={`${id}-src`} className={field} value={f.sourceRef} onChange={set('sourceRef')} />
      </label>
      <label className="text-sm font-medium text-ink" htmlFor={`${id}-jur`}>
        Jurisdiction (optional)
        <input id={`${id}-jur`} className={field} value={f.jurisdiction} onChange={set('jurisdiction')} />
      </label>
      {m.error ? (
        <p role="alert" className="text-sm text-red md:col-span-3">
          {m.error instanceof ApiError && m.error.code === 'system_key'
            ? 'Keys starting scenario:, situation: or sector: belong to the engines.'
            : 'Check the key (lowercase letters, digits, colons) and a definition of at least 10 characters.'}
        </p>
      ) : null}
      {m.isSuccess ? (
        <p role="status" className="text-sm text-emerald md:col-span-3">
          Draft recorded. Another person with approval authority must approve it.
        </p>
      ) : null}
      <div className="md:col-span-3">
        <Button type="submit" variant="primary" disabled={m.isPending}>
          Draft definition for approval
        </Button>
      </div>
    </form>
  );
}

function DefinitionRow({ d, canApprove }: { d: SemanticDefinitionItem; canApprove: boolean }) {
  return (
    <li className="grid gap-2 px-5 py-3.5 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)_minmax(0,14rem)]">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{d.label}</span>
        <span className="block break-all text-[12px] text-ink-faint">{d.key}</span>
      </span>
      <span className="min-w-0 text-xs text-ink-muted">
        {d.description}
        {d.formula && d.formula !== d.description ? (
          <span className="mt-1 block">Method: {d.formula}</span>
        ) : null}
        {d.source ? <span className="mt-1 block text-ink-faint">Source: {d.source}</span> : null}
        {d.jurisdiction ? (
          <span className="mt-1 block text-ink-faint">Jurisdiction: {d.jurisdiction}</span>
        ) : null}
      </span>
      <span className="flex flex-col items-start gap-1 text-xs text-ink">
        {d.unit ? <span>Unit: {d.unit}</span> : null}
        <span className="text-ink-muted">
          {d.origin === 'system' ? `Engine ${d.version}` : `Version ${d.version} · ${STATUS_LABEL[d.status]}`}
          {d.ownerRole ? ` · owner ${ROLE_LABEL[d.ownerRole]}` : ''}
        </span>
        {d.origin === 'institution' ? <ClaimBadge value={d.claimClass} /> : null}
        {d.origin === 'institution' ? (
          <ActButtons kind="definitions" item={d} canApprove={canApprove} />
        ) : null}
      </span>
    </li>
  );
}

export function DefinitionsView() {
  const q = useRegistry();
  const [filter, setFilter] = useState('');
  const id = useId();
  if (!q.data) return <LoadState isPending={q.isPending} error={q.error} />;
  const reg = q.data;
  const match = (d: SemanticDefinitionItem) =>
    !filter || `${d.key} ${d.label} ${d.description}`.toLowerCase().includes(filter.toLowerCase());
  const institution = reg.definitions.filter((d) => d.origin === 'institution' && match(d));
  const system = reg.definitions.filter((d) => d.origin === 'system' && match(d));
  return (
    <div className="grid gap-6">
      <label className="max-w-md text-sm font-medium text-ink" htmlFor={`${id}-filter`}>
        Filter definitions
        <input
          id={`${id}-filter`}
          className={field}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </label>
      <Panel aria-labelledby="inst-defs-heading">
        <PanelHeader
          id="inst-defs-heading"
          title="Institution definitions"
          description="Terms and metrics the institution defines, owned by a role, versioned and approved by a second person."
        />
        <ul className="divide-y divide-line border-t border-line">
          {institution.length ? (
            institution.map((d) => (
              <DefinitionRow key={`${d.key}-${d.version}`} d={d} canApprove={reg.canApprove} />
            ))
          ) : (
            <li className="px-5 py-4 text-sm text-ink-muted">No institution definitions match.</li>
          )}
        </ul>
      </Panel>
      <Panel aria-labelledby="sys-defs-heading">
        <PanelHeader
          id="sys-defs-heading"
          title={`System definitions (${system.length})`}
          description="Measures the engines compute or record. Each is defined by its versioned engine in code and changes only with a new engine version."
        />
        <ul className="divide-y divide-line border-t border-line">
          {system.map((d) => (
            <DefinitionRow key={d.key} d={d} canApprove={false} />
          ))}
        </ul>
      </Panel>
      {reg.canAuthor ? (
        <Panel aria-labelledby="def-form-heading">
          <PanelHeader id="def-form-heading" title="Draft a definition or a new version" />
          <DefinitionForm />
        </Panel>
      ) : null}
    </div>
  );
}

export function ExportView() {
  const q = useRegistry();
  const [done, setDone] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: api.semanticExport,
    onSuccess: (doc) => {
      const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/ld+json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tigeris-semantic-registry-${new Date().toISOString().slice(0, 10)}.jsonld`;
      a.click();
      URL.revokeObjectURL(url);
      setDone(new Date().toISOString());
    },
  });
  const reg = q.data;
  const approvedRules = reg?.rules.filter((r) => r.status === 'approved').length ?? 0;
  const approvedDefs = reg?.definitions.filter((d) => d.status === 'approved').length ?? 0;
  return (
    <Panel aria-labelledby="export-heading">
      <PanelHeader
        id="export-heading"
        icon={<FileCode2 className="h-4 w-4" aria-hidden />}
        title="Export the registry as JSON-LD"
        description="A portable, open-format copy of the approved definitions and rules, described with SKOS and Dublin Core terms and the TIGERIS vocabulary. Drafts, retired versions and the names of approvers are left out. Every export is recorded in the audit log."
      />
      <div className="grid gap-3 border-t border-line px-5 py-4 text-sm">
        {reg ? (
          <p className="text-ink">
            <span className="tabular">{approvedDefs}</span> approved definitions and{' '}
            <span className="tabular">{approvedRules}</span> approved rules · vocabulary{' '}
            <code className="text-xs">{reg.vocabulary}</code> · {reg.version}
          </p>
        ) : (
          <LoadState isPending={q.isPending} error={q.error} />
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={() => m.mutate()} disabled={m.isPending}>
            <Download className="h-4 w-4" aria-hidden />
            Download JSON-LD
          </Button>
          {done ? (
            <span role="status" className="text-xs text-ink-muted">
              Exported {formatRelative(done)}; recorded in the audit log.
            </span>
          ) : null}
          {m.error ? (
            <span role="alert" className="text-xs text-red">
              {m.error instanceof ApiError && m.error.status === 403
                ? 'Your role may not export institutional records.'
                : 'Export failed. Try again.'}
            </span>
          ) : null}
        </div>
      </div>
    </Panel>
  );
}
