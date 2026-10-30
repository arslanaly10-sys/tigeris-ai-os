import type { AttentionItem, AuthContext, CommandCentre, SectorSummary } from '@tigeris/shared';
import { useQuery } from '@tanstack/react-query';
import { Brain, Clock, Database, Radar, UserCheck, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router';
import { GulfMap, MapItemList } from '@/components/map/GulfMap';
import { LoadState, PageHeader } from '@/components/PageHeader';
import { DataModeBadge, SourceClassBadge, StateBadge, UrgencyBadge } from '@/components/truth/badges';
import { StaggerItem, StaggerList } from '@/components/ui/motion';
import { Panel, PanelFooter, PanelHeader } from '@/components/ui/panel';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/format';
import { SECTOR_LABEL_AR, useI18n, type MessageKey } from '@/lib/i18n';
import { ROLE_LABEL, ROLE_PURPOSE } from '@/lib/roles';

const KIND: Record<AttentionItem['kind'], { label: string; icon: LucideIcon }> = {
  signal: { label: 'Signal', icon: Radar },
  case: { label: 'Case', icon: Brain },
  source: { label: 'Source', icon: Database },
};

export function hrefFor(item: AttentionItem) {
  if (item.kind === 'case') return `/cases/${item.ref}`;
  if (item.kind === 'source') return `/sources#${item.ref}`;
  return `/signals?selected=${item.ref}`;
}

export function AttentionRow({ item }: { item: AttentionItem }) {
  const kind = KIND[item.kind];
  const Icon = kind.icon;
  return (
    <StaggerItem>
      <Link
        to={hrefFor(item)}
        className={cn(
          'group block border-s-[3px] px-5 py-3.5 transition-colors hover:bg-raised/60',
          item.forYou ? 'border-gold bg-gold-soft/50' : 'border-transparent',
        )}
      >
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-faint">
          <span className="inline-flex items-center gap-1 font-semibold text-ink-muted">
            <Icon className="h-3.5 w-3.5 text-gold-bright" aria-hidden />
            {kind.label}
          </span>
          <span className="tabular">{item.ref}</span>
          {item.forYou ? (
            <span className="inline-flex items-center gap-1 rounded border border-gold/50 bg-gold-soft px-1.5 py-0.5 text-[12px] font-semibold text-gold-bright">
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
          <span className="ms-auto text-[12px] text-ink-faint">
            {item.nextStep} · {item.nextStepRole ? ROLE_LABEL[item.nextStepRole] : '—'} ·{' '}
            {item.updatedAt ? formatRelative(item.updatedAt) : 'Not yet retrieved'}
          </span>
        </div>
      </Link>
    </StaggerItem>
  );
}

function Counts({ data }: { data: CommandCentre }) {
  const { t } = useI18n();
  const items: { key: MessageKey; value: number; to: string }[] = [
    { key: 'kpi.openCases', value: data.counts.openCases, to: '/cases' },
    { key: 'kpi.awaitingReview', value: data.counts.awaitingReview, to: '/decisions' },
    { key: 'kpi.awaitingDecision', value: data.counts.awaitingDecision, to: '/decisions' },
    { key: 'kpi.staleSources', value: data.counts.staleSources, to: '/sources' },
  ];
  // One container split by dividers: a KPI is a label and a number, not a tile.
  return (
    <ul
      className="mb-6 grid grid-cols-2 divide-line overflow-hidden rounded-xl border border-line bg-panel xl:grid-cols-4 xl:divide-x [&>li:nth-child(n+3)]:border-t [&>li:nth-child(n+3)]:border-line xl:[&>li:nth-child(n+3)]:border-t-0 [&>li:nth-child(even)]:border-s [&>li:nth-child(even)]:border-line xl:[&>li]:border-s-0"
      aria-label="Work counts"
    >
      {items.map((i) => (
        <li key={i.key}>
          <Link to={i.to} className="block px-5 py-3.5 transition-colors hover:bg-raised/60">
            <span className="block text-[13px] text-ink-muted">{t(i.key)}</span>
            <span className="tabular mt-0.5 block font-serif text-2xl font-semibold text-ink">{i.value}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function SectorTile({ s }: { s: SectorSummary }) {
  const { lang } = useI18n();
  return (
    <Link
      to={`/sectors/${s.key}`}
      className="group flex h-full flex-col rounded-xl border border-line bg-panel p-4 transition-colors hover:border-gold/60"
    >
      <span className="text-sm font-semibold text-ink group-hover:underline">
        {lang === 'ar' ? SECTOR_LABEL_AR[s.key] : s.label}
      </span>
      <span className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-muted">
        <span>
          <span className="tabular font-semibold text-ink">{s.openCases}</span> open cases
        </span>
        <span>
          <span className="tabular font-semibold text-ink">{s.newSignals}</span> new signals
        </span>
      </span>
      <span className="mt-auto pt-3 text-[13px] text-ink-faint">
        {s.depth === 'shell'
          ? 'Configured, no institutional data connected'
          : `${s.kpisConnected} of ${s.kpisTotal} indicators sourced`}
      </span>
    </Link>
  );
}

/** Compact sector list for the Overview: one row per sector, figures right-aligned. */
function SectorList({ sectors }: { sectors: SectorSummary[] }) {
  const { lang } = useI18n();
  return (
    <>
      <p
        className="flex justify-end gap-3 border-t border-line px-5 pt-2 pb-1 text-[12px] text-ink-faint"
        aria-hidden
      >
        <span className="w-14 text-end">Cases</span>
        <span className="w-14 text-end">Signals</span>
      </p>
      <ul className="divide-y divide-line" aria-label="Sectors with open cases and new signals">
        {sectors.map((s) => (
          <li key={s.key}>
            <Link to={`/sectors/${s.key}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-raised/60">
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                {lang === 'ar' ? SECTOR_LABEL_AR[s.key] : s.label}
                {s.depth === 'shell' ? (
                  <span className="font-normal text-ink-faint"> · not connected</span>
                ) : null}
              </span>
              <span className="tabular w-14 text-end text-sm text-ink">{s.openCases}</span>
              <span className="tabular w-14 text-end text-sm text-ink">{s.newSignals}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Governed steps past their (synthetic) service level. Listed only; nothing is escalated automatically. */
function OverduePanel({ data }: { data: CommandCentre }) {
  const { t } = useI18n();
  const items = data.overdue;
  const days = (h: number) => (h < 48 ? `${h} h` : `${Math.floor(h / 24)} days`);
  return (
    <Panel aria-labelledby="overdue-heading" className="mb-6">
      <PanelHeader
        id="overdue-heading"
        icon={<Clock className="h-4 w-4" aria-hidden />}
        title={t('overdue.title')}
        description={t('overdue.basis')}
      />
      {items.length === 0 ? (
        <p className="border-t border-line px-5 py-3 text-sm text-ink-muted">{t('overdue.none')}</p>
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {items.map((o) => (
            <li key={`${o.kind}:${o.ref}`}>
              <Link
                to={`/cases/${o.caseKey}?tab=decision`}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 hover:bg-raised/60"
              >
                <span className="inline-flex items-center gap-1 rounded-md border border-amber/50 bg-amber-soft px-1.5 py-0.5 text-xs font-medium text-amber">
                  <Clock className="h-3.5 w-3.5" aria-hidden />
                  {days(o.overdueHours)} {t('overdue.late')}
                </span>
                <span className="min-w-0 flex-1 text-sm">
                  <span className="font-medium text-ink">{o.label}</span>
                  <span className="text-ink-muted">
                    {' '}
                    · {o.ref} · {o.title}
                  </span>
                </span>
                <span className="text-xs text-ink-muted">
                  {ROLE_LABEL[o.role]}
                  {o.forYou ? ' · for you' : ''}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function OverviewPage({ ctx }: { ctx: AuthContext }) {
  const { t } = useI18n();
  const cc = useQuery({ queryKey: ['command-centre'], queryFn: api.commandCentre });
  const map = useQuery({ queryKey: ['map-layers'], queryFn: api.mapLayers });
  const sectors = useQuery({ queryKey: ['sectors'], queryFn: api.sectors });
  const cases = useQuery({ queryKey: ['cases'], queryFn: api.cases });
  const role = ctx.principal.roles[0]!;
  const open = (cases.data ?? []).filter((c) => c.state !== 'closed');
  const lastUpdated =
    open
      .map((c) => c.updatedAt)
      .sort()
      .at(-1) ?? null;

  return (
    <>
      <PageHeader
        eyebrow={ctx.institution.name}
        title={t('overview.title')}
        description={
          <>
            {t('overview.lead')}{' '}
            <span className="text-ink-faint">
              {ROLE_LABEL[role]}: {ROLE_PURPOSE[role]}
            </span>
          </>
        }
        lastUpdated={lastUpdated}
        sourceStatus="partial"
      />
      <LoadState isPending={cc.isPending} error={cc.error} />
      {cc.data ? (
        <>
          <Counts data={cc.data} />
          <OverduePanel data={cc.data} />
          <div className="grid gap-6 xl:grid-cols-3">
            <Panel aria-labelledby="map-heading" className="xl:col-span-2">
              <PanelHeader id="map-heading" title={t('overview.map')} description={t('overview.mapLead')} />
              <div className="px-4 pb-4">
                {map.data ? (
                  <>
                    <GulfMap
                      layers={map.data}
                      className="h-[19rem]"
                      label="Map of the Arabian Gulf region showing chokepoints, ports, terminals, dependency links and illustrative vessel and truck movement."
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
                title={t('overview.attention')}
                description={t('overview.attentionLead')}
              />
              {cc.data.attention.length === 0 ? (
                <p className="px-5 py-6 text-sm text-ink-muted">Nothing needs attention.</p>
              ) : (
                <StaggerList className="max-h-[23rem] flex-1 divide-y divide-line overflow-y-auto border-t border-line">
                  {cc.data.attention.map((item) => (
                    <AttentionRow key={`${item.kind}:${item.id}`} item={item} />
                  ))}
                </StaggerList>
              )}
            </Panel>
          </div>

          {/* Three columns sized to end level: four cases, six sources, eight one-line sectors. The expert review
              queue is not repeated here: the attention queue and the "Awaiting expert review" count carry it. */}
          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <Panel aria-labelledby="cases-heading" className="flex flex-col">
              <PanelHeader
                id="cases-heading"
                icon={<Brain className="h-4 w-4" aria-hidden />}
                title={t('overview.cases')}
              />
              <StaggerList className="divide-y divide-line border-t border-line">
                {open.slice(0, 4).map((c) => (
                  <StaggerItem key={c.id}>
                    <Link to={`/cases/${c.key}`} className="block px-5 py-3 hover:bg-raised/60">
                      <span className="flex items-center gap-2">
                        <span className="tabular text-[12px] text-ink-faint">{c.key}</span>
                        <StateBadge value={c.state} />
                      </span>
                      <span className="mt-1 block text-sm font-medium text-ink">{c.title}</span>
                      <span className="text-[12px] text-ink-faint">
                        {c.nextStep} · {formatRelative(c.updatedAt)}
                      </span>
                    </Link>
                  </StaggerItem>
                ))}
              </StaggerList>
              <PanelFooter>
                <span className="tabular">{open.length} open cases</span>
                <Link
                  to="/cases"
                  className="inline-flex min-h-6 items-center font-medium text-cyan hover:underline"
                >
                  {t('common.viewAll')}
                </Link>
              </PanelFooter>
            </Panel>

            <Panel aria-labelledby="sources-heading" className="flex flex-col">
              <PanelHeader
                id="sources-heading"
                icon={<Database className="h-4 w-4" aria-hidden />}
                title={t('overview.sources')}
              />
              <StaggerList className="divide-y divide-line border-t border-line">
                {cc.data.sourceHealth.slice(0, 6).map((s) => {
                  const warn = s.approvalStatus !== 'approved' || s.freshness === 'stale';
                  return (
                    <StaggerItem key={s.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-ink">{s.publisher}</span>
                        <span className="text-[12px] text-ink-faint">
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
                          className={cn('h-2 w-2 rounded-full', warn ? 'bg-amber' : 'bg-emerald')}
                          aria-hidden
                        />
                        <SourceClassBadge value={s.sourceClass} />
                      </span>
                    </StaggerItem>
                  );
                })}
              </StaggerList>
              <PanelFooter>
                <span className="tabular">
                  {Math.min(6, cc.data.sourceHealth.length)} of {cc.data.sourceHealth.length} sources shown
                </span>
                <Link
                  to="/sources"
                  className="inline-flex min-h-6 items-center font-medium text-cyan hover:underline"
                >
                  {t('common.viewAll')}
                </Link>
              </PanelFooter>
            </Panel>

            <Panel aria-labelledby="sectors-heading" className="flex flex-col">
              <PanelHeader id="sectors-heading" title={t('overview.sectors')} />
              {sectors.data ? (
                <SectorList sectors={sectors.data} />
              ) : (
                <LoadState isPending={sectors.isPending} error={sectors.error} />
              )}
              <PanelFooter>
                <span className="tabular">{sectors.data?.length ?? 0} sector configurations</span>
                <Link
                  to="/sectors"
                  className="inline-flex min-h-6 items-center font-medium text-cyan hover:underline"
                >
                  {t('common.viewAll')}
                </Link>
              </PanelFooter>
            </Panel>
          </div>
        </>
      ) : null}
    </>
  );
}
