import type { AttentionItem, AuthContext, CommandCentre } from '@tigeris/shared';
import { useQuery } from '@tanstack/react-query';
import { Brain, ChevronRight, Database, Radar, UserCheck } from 'lucide-react';
import { Link } from 'react-router';
import { LoadState, PageHeader } from '@/components/PageHeader';
import { DataModeBadge, SourceClassBadge, UrgencyBadge } from '@/components/truth/badges';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/format';
import { ROLE_LABEL, ROLE_PURPOSE } from '@/lib/roles';

const KIND = {
  signal: { label: 'Signal', icon: Radar },
  case: { label: 'Case', icon: Brain },
  source: { label: 'Source', icon: Database },
} as const;

function hrefFor(item: AttentionItem) {
  if (item.kind === 'case') return `/cases/${item.ref}`;
  if (item.kind === 'source') return `/sources#${item.ref}`;
  return '/signals';
}

function AttentionRow({ item }: { item: AttentionItem }) {
  const kind = KIND[item.kind];
  const Icon = kind.icon;
  return (
    <li>
      <Link
        to={hrefFor(item)}
        className={cn(
          'group grid gap-x-4 gap-y-2 border-s-2 px-5 py-4 transition-colors hover:bg-ivory sm:grid-cols-[minmax(0,1fr)_auto]',
          item.forYou ? 'border-gold' : 'border-transparent',
        )}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
            <span className="inline-flex items-center gap-1 font-semibold text-navy-700">
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {kind.label}
            </span>
            <span className="tabular font-mono">{item.ref}</span>
            <UrgencyBadge value={item.urgency} />
            <DataModeBadge value={item.dataMode} />
            {item.forYou ? (
              <span className="inline-flex items-center gap-1 rounded bg-navy-800 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                <UserCheck className="h-3 w-3" aria-hidden />
                Your action
              </span>
            ) : null}
          </div>
          <p className="mt-1.5 font-medium text-ink group-hover:underline">{item.title}</p>
          <p className="mt-0.5 text-sm text-ink-muted">{item.reason}</p>
        </div>
        <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end sm:justify-center">
          <p className="text-sm sm:text-end">
            <span className="block font-medium text-ink">{item.nextStep}</span>
            <span className="block text-xs text-ink-muted">
              {item.nextStepRole ? ROLE_LABEL[item.nextStepRole] : '—'} ·{' '}
              {item.updatedAt ? formatRelative(item.updatedAt) : 'Not yet retrieved'}
            </span>
          </p>
          <ChevronRight className="h-4 w-4 shrink-0 text-ink-muted rtl:rotate-180" aria-hidden />
        </div>
      </Link>
    </li>
  );
}

function Counts({ data }: { data: CommandCentre }) {
  const items = [
    { label: 'Open cases', value: data.counts.openCases, to: '/cases' },
    { label: 'Awaiting expert review', value: data.counts.awaitingReview, to: '/cases' },
    { label: 'Awaiting decision', value: data.counts.awaitingDecision, to: '/decisions' },
    { label: 'Stale sources', value: data.counts.staleSources, to: '/sources' },
  ];
  return (
    <ul className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Work counts">
      {items.map((i) => (
        <li key={i.label}>
          <Link
            to={i.to}
            className="block rounded-lg border border-line bg-paper px-4 py-3 hover:border-navy-600"
          >
            <span className="tabular block font-serif text-2xl font-semibold text-ink">{i.value}</span>
            <span className="text-xs text-ink-muted">{i.label}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function CommandCentrePage({ ctx }: { ctx: AuthContext }) {
  const q = useQuery({ queryKey: ['command-centre'], queryFn: api.commandCentre });
  const role = ctx.principal.roles[0]!;
  return (
    <>
      <PageHeader
        title="Command Centre"
        description="What needs attention, why it surfaced, and who acts next. Items for your role are marked and listed first."
      />
      <LoadState isPending={q.isPending} error={q.error} />
      {q.data ? (
        <>
          <Counts data={q.data} />
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <Panel aria-labelledby="attention-heading">
              <PanelHeader
                id="attention-heading"
                title="Attention queue"
                description="Signals, cases and sources that need a human step."
              />
              {q.data.attention.length === 0 ? (
                <p className="px-5 py-6 text-sm text-ink-muted">Nothing needs attention.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {q.data.attention.map((item) => (
                    <AttentionRow key={`${item.kind}:${item.id}`} item={item} />
                  ))}
                </ul>
              )}
            </Panel>

            <div className="space-y-6">
              <Panel aria-labelledby="role-heading">
                <PanelHeader id="role-heading" title="Your authority" />
                <div className="px-5 py-4 text-sm">
                  <p className="font-semibold text-ink">{ROLE_LABEL[role]}</p>
                  <p className="mt-1 text-ink-muted">{ROLE_PURPOSE[role]}</p>
                  <p className="mt-3 text-xs text-ink-muted">
                    TIGERIS prepares and routes options. Only a named, authorised person decides. Nothing is
                    executed automatically.
                  </p>
                </div>
              </Panel>

              <Panel aria-labelledby="sources-heading">
                <PanelHeader
                  id="sources-heading"
                  title="Source health"
                  action={
                    <Link
                      to="/sources"
                      className="text-sm font-medium text-navy-700 underline-offset-2 hover:underline"
                    >
                      Registry
                    </Link>
                  }
                />
                <ul className="divide-y divide-line">
                  {q.data.sourceHealth.map((s) => (
                    <li key={s.id} className="px-5 py-3">
                      <p className="text-sm font-medium text-ink">{s.publisher}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
                        <SourceClassBadge value={s.sourceClass} />
                        {s.approvalStatus !== 'approved' ? (
                          <span className="font-semibold text-amber">Approval {s.approvalStatus}</span>
                        ) : s.freshness === 'stale' ? (
                          <span className="font-semibold text-amber">Stale</span>
                        ) : (
                          <span>{s.freshness === 'fresh' ? 'Fresh' : 'Dated snapshot'}</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </Panel>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
