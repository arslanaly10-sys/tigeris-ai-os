import type { AttentionItem, AuthContext, CommandCentre, SignalSummary } from '@tigeris/shared';
import { useQuery } from '@tanstack/react-query';
import { Brain, ChevronRight, Database, Gavel, Globe2, Radar, UserCheck } from 'lucide-react';
import { Link } from 'react-router';
import { GulfMap, MapItemList } from '@/components/map/GulfMap';
import { LoadState, PageHeader } from '@/components/PageHeader';
import {
  DataModeBadge,
  SignalTypeTile,
  SourceClassBadge,
  StateBadge,
  UrgencyBadge,
  ValidationBadge,
} from '@/components/truth/badges';
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
  return `/signals?selected=${item.ref}`;
}

function AttentionRow({ item }: { item: AttentionItem }) {
  const kind = KIND[item.kind];
  const Icon = kind.icon;
  return (
    <li>
      <Link
        to={hrefFor(item)}
        className={cn(
          'group block border-s-2 px-5 py-3.5 transition-colors hover:bg-raised/60',
          item.forYou ? 'border-gold bg-gold/[0.04]' : 'border-transparent',
        )}
      >
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-faint">
          <span className="inline-flex items-center gap-1 font-semibold text-ink-muted">
            <Icon className="h-3.5 w-3.5 text-gold" aria-hidden />
            {kind.label}
          </span>
          <span className="tabular font-mono">{item.ref}</span>
          {item.forYou ? (
            <span className="inline-flex items-center gap-1 rounded bg-gold px-1.5 py-0.5 text-[10.5px] font-semibold text-navy-950">
              <UserCheck className="h-3 w-3" aria-hidden />
              Your action
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-sm font-medium text-ink group-hover:underline">{item.title}</p>
        <p className="mt-0.5 line-clamp-2 text-xs text-ink-muted">{item.reason}</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <UrgencyBadge value={item.urgency} />
          <DataModeBadge value={item.dataMode} />
          <span className="ms-auto text-[11px] text-ink-faint">
            {item.nextStep} · {item.nextStepRole ? ROLE_LABEL[item.nextStepRole] : '—'} ·{' '}
            {item.updatedAt ? formatRelative(item.updatedAt) : 'Not yet retrieved'}
          </span>
        </div>
      </Link>
    </li>
  );
}

function Counts({ data }: { data: CommandCentre }) {
  const items = [
    { label: 'Open cases', value: data.counts.openCases, to: '/cases', icon: Brain },
    { label: 'Awaiting expert review', value: data.counts.awaitingReview, to: '/cases', icon: UserCheck },
    { label: 'Awaiting decision', value: data.counts.awaitingDecision, to: '/decisions', icon: Gavel },
    { label: 'Stale sources', value: data.counts.staleSources, to: '/sources', icon: Database },
  ];
  return (
    <ul className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="Work counts">
      {items.map((i) => {
        const Icon = i.icon;
        return (
          <li key={i.label}>
            <Link
              to={i.to}
              className="flex items-center gap-4 rounded-xl border border-line bg-panel px-4 py-3.5 transition-colors hover:border-gold/50"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-line-strong bg-raised text-gold-bright">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <span>
                <span className="tabular block font-serif text-2xl leading-none font-semibold text-ink">
                  {i.value}
                </span>
                <span className="mt-1 block text-xs text-ink-muted">{i.label}</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function SignalRow({ s }: { s: SignalSummary }) {
  return (
    <li>
      <Link to={`/signals?selected=${s.key}`} className="flex items-start gap-3 px-5 py-3 hover:bg-raised/60">
        <SignalTypeTile value={s.signalType} className="h-10 w-10" />
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-sm font-medium text-ink">{s.title}</span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            {s.validationStatus ? <ValidationBadge value={s.validationStatus} /> : null}
            <span className="text-[11px] text-ink-faint">{formatRelative(s.detectedAt)}</span>
          </span>
        </span>
        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-ink-faint rtl:rotate-180" aria-hidden />
      </Link>
    </li>
  );
}

export function CommandCentrePage({ ctx }: { ctx: AuthContext }) {
  const cc = useQuery({ queryKey: ['command-centre'], queryFn: api.commandCentre });
  const map = useQuery({ queryKey: ['map-layers'], queryFn: api.mapLayers });
  const signals = useQuery({ queryKey: ['signals'], queryFn: api.signals });
  const cases = useQuery({ queryKey: ['cases'], queryFn: api.cases });
  const role = ctx.principal.roles[0]!;
  const newSignals = (signals.data ?? []).filter(
    (s) => s.disposition === 'new' || s.disposition === 'monitoring',
  );

  return (
    <>
      <PageHeader
        title="Command Centre"
        description={
          <>
            What needs attention, why it surfaced, and who acts next.{' '}
            <span className="text-ink-faint">
              Signed in as {ROLE_LABEL[role]}: {ROLE_PURPOSE[role]}
            </span>
          </>
        }
        meta={
          <span className="inline-flex items-center gap-2 rounded-lg border border-line-strong bg-panel px-3 py-2 text-sm text-ink-muted">
            <Globe2 className="h-4 w-4 text-gold" aria-hidden />
            Gulf region
          </span>
        }
      />
      <LoadState isPending={cc.isPending} error={cc.error} />
      {cc.data ? (
        <>
          <Counts data={cc.data} />
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_25rem]">
            <Panel aria-labelledby="map-heading">
              <PanelHeader
                id="map-heading"
                title="Gulf Strategic View"
                description="Chokepoints, ports, terminals and modelled dependencies. Vessel and truck movement is an illustrative replay."
              />
              <div className="px-4 pb-4">
                {map.data ? (
                  <>
                    <GulfMap
                      layers={map.data}
                      className="h-[30rem]"
                      label="Map of the Gulf region showing chokepoints, ports, terminals, dependency links and illustrative vessel and truck movement."
                    />
                    <MapItemList layers={map.data} />
                  </>
                ) : (
                  <LoadState isPending={map.isPending} error={map.error} />
                )}
              </div>
            </Panel>

            <Panel aria-labelledby="attention-heading" className="flex flex-col">
              <PanelHeader
                id="attention-heading"
                title="Attention queue"
                description="Items for your role are marked and listed first."
              />
              {cc.data.attention.length === 0 ? (
                <p className="px-5 py-6 text-sm text-ink-muted">Nothing needs attention.</p>
              ) : (
                <ul className="max-h-[36rem] flex-1 divide-y divide-line overflow-y-auto border-t border-line">
                  {cc.data.attention.map((item) => (
                    <AttentionRow key={`${item.kind}:${item.id}`} item={item} />
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <Panel aria-labelledby="signals-heading">
              <PanelHeader
                id="signals-heading"
                icon={<Radar className="h-4 w-4" aria-hidden />}
                title="Priority signals"
                action={
                  <Link to="/signals" className="text-sm text-cyan hover:underline">
                    Signal review
                  </Link>
                }
              />
              <ul className="divide-y divide-line border-t border-line">
                {newSignals.slice(0, 4).map((s) => (
                  <SignalRow key={s.id} s={s} />
                ))}
              </ul>
            </Panel>

            <Panel aria-labelledby="cases-heading">
              <PanelHeader
                id="cases-heading"
                icon={<Brain className="h-4 w-4" aria-hidden />}
                title="Open cases"
                action={
                  <Link to="/cases" className="text-sm text-cyan hover:underline">
                    All cases
                  </Link>
                }
              />
              <ul className="divide-y divide-line border-t border-line">
                {(cases.data ?? [])
                  .filter((c) => c.state !== 'closed')
                  .slice(0, 4)
                  .map((c) => (
                    <li key={c.id}>
                      <Link to={`/cases/${c.key}`} className="block px-5 py-3 hover:bg-raised/60">
                        <span className="flex items-center gap-2">
                          <span className="tabular font-mono text-[11px] text-ink-faint">{c.key}</span>
                          <StateBadge value={c.state} />
                        </span>
                        <span className="mt-1 block text-sm font-medium text-ink">{c.title}</span>
                        <span className="text-[11px] text-ink-faint">
                          {c.nextStep} · {formatRelative(c.updatedAt)}
                        </span>
                      </Link>
                    </li>
                  ))}
              </ul>
            </Panel>

            <Panel aria-labelledby="sources-heading">
              <PanelHeader
                id="sources-heading"
                icon={<Database className="h-4 w-4" aria-hidden />}
                title="Source health"
                action={
                  <Link to="/sources" className="text-sm text-cyan hover:underline">
                    Registry
                  </Link>
                }
              />
              <ul className="divide-y divide-line border-t border-line">
                {cc.data.sourceHealth.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-ink">{s.publisher}</span>
                      <span className="text-[11px] text-ink-faint">
                        {s.approvalStatus !== 'approved'
                          ? `Approval ${s.approvalStatus}`
                          : s.freshness === 'stale'
                            ? 'Stale'
                            : s.freshness === 'fresh'
                              ? 'Fresh'
                              : 'Dated snapshot'}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span
                        className={cn(
                          'h-2 w-2 rounded-full',
                          s.approvalStatus !== 'approved' || s.freshness === 'stale'
                            ? 'bg-amber'
                            : 'bg-emerald',
                        )}
                        aria-hidden
                      />
                      <SourceClassBadge value={s.sourceClass} />
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </>
      ) : null}
    </>
  );
}
