/**
 * Intervention Inbox (Phase 5B, FR-53): what needs a person now, raised by versioned watch rules. Each intervention
 * names its rule, inputs and lineage. People acknowledge, resolve or dismiss; the engine never closes anything.
 * Status is words plus an icon, never colour alone.
 */
import {
  WATCH_KIND_LABEL,
  type InterventionItem,
  type InterventionStatus,
  type WatchRuleItem,
} from '@tigeris/shared';
import * as Tabs from '@radix-ui/react-tabs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  CircleSlash,
  Eye,
  OctagonAlert,
  RefreshCw,
  Siren,
} from 'lucide-react';
import { useId, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { LoadState, PageHeader } from '@/components/PageHeader';
import { ClaimBadge } from '@/components/truth/badges';
import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/data';
import { INDICATOR_SPRING } from '@/components/ui/motion';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { ApiError, api } from '@/lib/api';
import { formatRelative } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { ROLE_LABEL } from '@/lib/roles';

const tabClass =
  'relative px-4 py-2.5 text-sm font-medium text-ink-muted hover:text-ink data-[state=active]:text-ink';
const field =
  'mt-1 block min-h-10 w-full rounded-md border border-line-strong bg-panel px-3 text-sm text-ink focus-visible:border-brand';

const VIEWS = [
  { value: 'inbox', label: 'interventions.view.inbox' },
  { value: 'rules', label: 'interventions.view.rules' },
] as const;

const STATUS: Record<InterventionStatus, { label: string; tone: 'awaiting' | 'ok' | 'low' | 'medium' }> = {
  open: { label: 'Open', tone: 'awaiting' },
  acknowledged: { label: 'Acknowledged', tone: 'medium' },
  resolved: { label: 'Resolved', tone: 'ok' },
  dismissed: { label: 'Dismissed', tone: 'low' },
};

function SeverityPill({ severity }: { severity: InterventionItem['severity'] }) {
  return severity === 'breach' ? (
    <StatusPill tone="high">
      <span className="inline-flex items-center gap-1">
        <OctagonAlert className="h-3.5 w-3.5" aria-hidden />
        Breach
      </span>
    </StatusPill>
  ) : (
    <StatusPill tone="medium">
      <span className="inline-flex items-center gap-1">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
        Attention
      </span>
    </StatusPill>
  );
}

function StatusLabel({ status }: { status: InterventionStatus }) {
  const s = STATUS[status];
  const Icon =
    status === 'open' ? BellRing : status === 'acknowledged' ? Eye : status === 'resolved' ? CheckCircle2 : CircleSlash;
  return (
    <StatusPill tone={s.tone}>
      <span className="inline-flex items-center gap-1">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {s.label}
      </span>
    </StatusPill>
  );
}

function Actions({ item }: { item: InterventionItem }) {
  const id = useId();
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const m = useMutation({
    mutationFn: (action: 'acknowledge' | 'resolve' | 'dismiss') =>
      api.actOnIntervention(item.key, action, action === 'acknowledge' ? undefined : reason),
    onSuccess: () => setReason(''),
    onSettled: () => qc.invalidateQueries({ queryKey: ['interventions'] }),
  });
  if (!item.routedToMe || (item.status !== 'open' && item.status !== 'acknowledged')) return null;
  return (
    <div className="mt-3 grid gap-2 border-t border-line pt-3">
      {item.status === 'open' ? (
        <div>
          <Button size="sm" variant="primary" disabled={m.isPending} onClick={() => m.mutate('acknowledge')}>
            Acknowledge
          </Button>
        </div>
      ) : null}
      <label className="text-sm font-medium text-ink" htmlFor={`${id}-reason`}>
        Reason for closing (recorded)
        <input id={`${id}-reason`} className={field} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={m.isPending || reason.trim().length < 10} onClick={() => m.mutate('resolve')}>
          Resolve
        </Button>
        <Button size="sm" variant="ghost" disabled={m.isPending || reason.trim().length < 10} onClick={() => m.mutate('dismiss')}>
          Dismiss
        </Button>
      </div>
      {m.error ? (
        <p role="alert" className="text-xs text-red">
          {m.error instanceof ApiError && m.error.code === 'not_routed'
            ? 'This intervention is routed to other roles.'
            : 'Not recorded. Refresh and try again.'}
        </p>
      ) : null}
    </div>
  );
}

function InterventionCard({ item }: { item: InterventionItem }) {
  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <SeverityPill severity={item.severity} />
        <StatusLabel status={item.status} />
        <span className="tabular text-xs text-ink-faint">{item.key}</span>
      </div>
      <h3 className="mt-2 text-sm font-semibold text-ink">{item.title}</h3>
      <p className="mt-1 text-sm text-ink-muted">{item.detail}</p>
      <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[8rem_minmax(0,1fr)]">
        {item.inputs.map((i, n) => (
          <div key={n} className="contents">
            <dt className="text-ink-faint">{i.label}</dt>
            <dd className="min-w-0 break-words text-ink">
              {i.value}
              {i.ref !== i.value ? <span className="text-ink-faint"> · {i.ref}</span> : null}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-ink-faint">
        <span>
          Rule {item.ruleKey} v{item.ruleVersion} · {item.ruleLabel}
        </span>
        <span>{item.engineVersion}</span>
        <span>Routed to {item.routeRoles.map((r) => ROLE_LABEL[r]).join(', ')}</span>
        <span>
          First seen {formatRelative(item.firstSeenAt)} · last seen {formatRelative(item.lastSeenAt)}
        </span>
        {item.caseKey ? (
          <Link className="text-brand underline-offset-2 hover:underline" to={`/cases/${item.caseKey}`}>
            Case {item.caseKey}
          </Link>
        ) : null}
      </p>
      {item.conditionClearedAt ? (
        <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-emerald">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
          Condition no longer observed since {formatRelative(item.conditionClearedAt)}. A person still closes it.
        </p>
      ) : null}
      {item.acknowledgedBy ? (
        <p className="mt-1 text-xs text-ink-muted">
          Acknowledged by {item.acknowledgedBy} {item.acknowledgedAt ? formatRelative(item.acknowledgedAt) : ''}
        </p>
      ) : null}
      {item.closedBy ? (
        <p className="mt-1 text-xs text-ink-muted">
          {STATUS[item.status].label} by {item.closedBy}: {item.closeReason}
        </p>
      ) : null}
      <Actions item={item} />
    </li>
  );
}

function Inbox() {
  const qc = useQueryClient();
  const [mine, setMine] = useState(true);
  const [status, setStatus] = useState<'live' | 'resolved' | 'dismissed' | 'all'>('live');
  const q = useQuery({ queryKey: ['interventions', mine, status], queryFn: () => api.interventions({ mine, status }) });
  const sweep = useMutation({
    mutationFn: api.sweepInterventions,
    onSettled: () => qc.invalidateQueries({ queryKey: ['interventions'] }),
  });
  const items = q.data?.items ?? [];
  const breaches = items.filter((i) => i.severity === 'breach').length;
  return (
    <Panel aria-labelledby="inbox-heading">
      <PanelHeader
        id="inbox-heading"
        icon={<Siren className="h-4 w-4" aria-hidden />}
        title="Interventions"
        description={
          q.data
            ? `${items.length} shown · ${breaches} breach${breaches === 1 ? '' : 'es'} · ${q.data.engine} · last sweep ${
                q.data.lastSweepAt ? formatRelative(q.data.lastSweepAt) : 'never'
              }`
            : undefined
        }
      />
      <div className="flex flex-wrap items-end gap-3 border-t border-line px-5 py-3">
        <fieldset className="flex flex-wrap gap-1">
          <legend className="sr-only">Whose interventions</legend>
          {[
            [true, 'Routed to my roles'],
            [false, 'Everything I may read'],
          ].map(([v, label]) => (
            <Button
              key={String(v)}
              size="sm"
              variant={mine === v ? 'primary' : 'secondary'}
              aria-pressed={mine === v}
              onClick={() => setMine(v as boolean)}
            >
              {label as string}
            </Button>
          ))}
        </fieldset>
        <label className="text-sm font-medium text-ink">
          Status
          <select
            className={field}
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
          >
            <option value="live">Open and acknowledged</option>
            <option value="resolved">Resolved</option>
            <option value="dismissed">Dismissed</option>
            <option value="all">All</option>
          </select>
        </label>
        <Button size="sm" onClick={() => sweep.mutate()} disabled={sweep.isPending} className="ms-auto">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          Run sweep now
        </Button>
        {sweep.data ? (
          <span role="status" className="basis-full text-xs text-ink-muted">
            Sweep checked {sweep.data.rules} rules: {sweep.data.raised} raised, {sweep.data.refreshed} still present,{' '}
            {sweep.data.cleared} no longer observed.
          </span>
        ) : null}
      </div>
      <LoadState isPending={q.isPending} error={q.error} />
      {q.data ? (
        items.length ? (
          <ul className="divide-y divide-line border-t border-line">
            {items.map((i) => (
              <InterventionCard key={i.key} item={i} />
            ))}
          </ul>
        ) : (
          <p className="border-t border-line px-5 py-6 text-sm text-ink-muted">
            Nothing here. No approved watch rule currently finds anything{mine ? ' routed to your roles' : ''}.
          </p>
        )
      ) : null}
    </Panel>
  );
}

function paramsText(r: WatchRuleItem) {
  const p = r.params as Record<string, unknown>;
  switch (r.kind) {
    case 'semantic':
      return `Statuses: ${((p.statuses as string[] | undefined) ?? ['attention', 'breach']).join(', ')}`;
    case 'signal_untriaged':
      return `Urgency ${((p.urgencies as string[] | undefined) ?? ['critical']).join(', ')}, new for more than ${
        (p.maxHours as number | undefined) ?? 24
      } hours`;
    case 'connector_stale':
      return `Failing, or scheduled and not synced for ${(p.maxDays as number | undefined) ?? 7} days`;
    case 'decision_drift':
      return 'Outcome reviews with the verdict "missed"';
  }
}

function RuleActions({ r, canApprove }: { r: WatchRuleItem; canApprove: boolean }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (action: 'approve' | 'retire') => api.actOnWatchRule(r.key, r.version, action),
    onSettled: () => qc.invalidateQueries({ queryKey: ['watch-rules'] }),
  });
  if (!canApprove || r.status === 'retired') return null;
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant={r.status === 'draft' ? 'primary' : 'secondary'}
        disabled={m.isPending}
        onClick={() => m.mutate(r.status === 'draft' ? 'approve' : 'retire')}
      >
        {r.status === 'draft' ? `Approve version ${r.version}` : 'Retire'}
      </Button>
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

function WatchRules() {
  const q = useQuery({ queryKey: ['watch-rules'], queryFn: api.watchRules });
  if (!q.data) return <LoadState isPending={q.isPending} error={q.error} />;
  const order = { approved: 0, draft: 1, retired: 2 } as const;
  const rules = [...q.data.rules].sort((a, b) => order[a.status] - order[b.status] || a.key.localeCompare(b.key));
  return (
    <Panel aria-labelledby="watch-heading">
      <PanelHeader
        id="watch-heading"
        icon={<BellRing className="h-4 w-4" aria-hidden />}
        title="Watch rules"
        description="What the engine watches, how it judges it and who is told. A new version is drafted by one person and approved by another; approving it retires the previous version."
      />
      <ul className="divide-y divide-line border-t border-line">
        {rules.map((r) => (
          <li key={`${r.key}-${r.version}`} className="grid gap-2 px-5 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,16rem)]">
            <div className="min-w-0">
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="tabular text-xs text-ink-faint">
                  {r.key} · v{r.version}
                </span>
                <span className="text-sm font-medium text-ink">{r.label}</span>
              </p>
              <p className="mt-1 text-sm text-ink">
                {WATCH_KIND_LABEL[r.kind]} · {paramsText(r)}
              </p>
              <p className="mt-1 text-xs text-ink-muted">{r.rationale}</p>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-faint">
                <span>{r.status === 'approved' ? 'Approved' : r.status === 'draft' ? 'Draft' : 'Retired'}</span>
                <span>Routed to {r.routeRoles.map((x) => ROLE_LABEL[x]).join(', ')}</span>
                <span>Default severity {r.severity}</span>
                <span>
                  {r.createdBy ? `Drafted by ${r.createdBy}` : 'Seeded'}
                  {r.status !== 'draft' ? (r.approvedBy ? ` · approved by ${r.approvedBy}` : ' · owner-approved') : ''}
                </span>
                <ClaimBadge value={r.claimClass} />
              </p>
            </div>
            <div className="flex items-start">
              <RuleActions r={r} canApprove={q.data.canApprove} />
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function InterventionsPage() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'rules' ? 'rules' : 'inbox';
  return (
    <>
      <PageHeader
        title={t('nav.interventions')}
        description="What needs a person now. Versioned watch rules raise interventions from codified rules, untriaged signals, failing connectors and decision outcomes, each with its rule, inputs and lineage. Nothing here acts on its own."
      />
      <Tabs.Root value={view} onValueChange={(v) => setParams(v === 'inbox' ? {} : { view: v }, { replace: true })}>
        <Tabs.List aria-label="Intervention views" className="mb-5 flex flex-wrap gap-1 border-b border-line">
          {VIEWS.map((x) => (
            <Tabs.Trigger key={x.value} value={x.value} className={tabClass}>
              {t(x.label)}
              {view === x.value ? (
                <motion.span
                  layoutId="intervention-tab-indicator"
                  className="absolute inset-x-0 -bottom-px h-0.5 bg-gold"
                  transition={INDICATOR_SPRING}
                  aria-hidden
                />
              ) : null}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <Tabs.Content value="inbox" className="outline-none">
          <Inbox />
        </Tabs.Content>
        <Tabs.Content value="rules" className="outline-none">
          <WatchRules />
        </Tabs.Content>
      </Tabs.Root>
    </>
  );
}
