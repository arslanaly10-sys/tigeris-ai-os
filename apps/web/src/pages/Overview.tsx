import type { AttentionItem, AuthContext, CommandCentre, SectorSummary } from '@tigeris/shared';
import { useQuery } from '@tanstack/react-query';
import { Brain, Database, Gavel, Radar, UserCheck, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router';
import { SkylineHero } from '@/components/illustrations/Scenes';
import { GulfMap, MapItemList } from '@/components/map/GulfMap';
import { LoadState, PageHeader } from '@/components/PageHeader';
import { DataModeBadge, SourceClassBadge, StateBadge, UrgencyBadge } from '@/components/truth/badges';
import { ListRow, StatusPill } from '@/components/ui/data';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { Reveal } from '@/components/ui/reveal';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/format';
import { SECTOR_LABEL_AR, useI18n, type MessageKey } from '@/lib/i18n';
import { ROLE_LABEL, ROLE_PURPOSE } from '@/lib/roles';
import { SECTOR_ICON } from '@/pages/sectorIcons';

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
    <li>
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
          <span className="tabular font-mono">{item.ref}</span>
          {item.forYou ? (
            <span className="inline-flex items-center gap-1 rounded border border-gold/50 bg-gold-soft px-1.5 py-0.5 text-[10.5px] font-semibold text-gold-bright">
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
  const { t } = useI18n();
  const items: { key: MessageKey; value: number; to: string; icon: LucideIcon }[] = [
    { key: 'kpi.openCases', value: data.counts.openCases, to: '/cases', icon: Brain },
    { key: 'kpi.awaitingReview', value: data.counts.awaitingReview, to: '/decisions', icon: UserCheck },
    { key: 'kpi.awaitingDecision', value: data.counts.awaitingDecision, to: '/decisions', icon: Gavel },
    { key: 'kpi.staleSources', value: data.counts.staleSources, to: '/sources', icon: Database },
  ];
  return (
    <ul className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="Work counts">
      {items.map((i) => {
        const Icon = i.icon;
        return (
          <li key={i.key}>
            <Link
              to={i.to}
              className="card-shadow flex items-center gap-4 rounded-xl border border-line bg-panel px-4 py-3.5 transition-colors hover:border-gold/60"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-gold-soft text-gold-bright">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="tabular block font-serif text-2xl leading-none font-semibold text-ink">
                  {i.value}
                </span>
                <span className="mt-1 block text-xs text-ink-muted">{t(i.key)}</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function SectorTile({ s }: { s: SectorSummary }) {
  const { lang } = useI18n();
  const Icon = SECTOR_ICON[s.key];
  return (
    <Link
      to={`/sectors/${s.key}`}
      className="card-shadow group flex h-full flex-col rounded-xl border border-line bg-panel p-4 transition-colors hover:border-gold/60"
    >
      <span className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0 text-sm font-semibold text-ink group-hover:underline">
          {lang === 'ar' ? SECTOR_LABEL_AR[s.key] : s.label}
        </span>
      </span>
      <span className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
        <span>
          <span className="tabular font-semibold text-ink">{s.openCases}</span> open cases
        </span>
        <span>
          <span className="tabular font-semibold text-ink">{s.newSignals}</span> new signals
        </span>
      </span>
      <span className="mt-auto pt-3 text-[11px] text-ink-faint">
        {s.depth === 'shell'
          ? 'Configured — no institutional data connected'
          : `${s.kpisConnected} of ${s.kpisTotal} indicators sourced`}
      </span>
    </Link>
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
  const review = open.filter((c) => c.state === 'review');
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
        illustration={
          <SkylineHero className="h-full w-full opacity-70 [mask-image:linear-gradient(to_left,black_45%,transparent)]" />
        }
      />
      <LoadState isPending={cc.isPending} error={cc.error} />
      {cc.data ? (
        <>
          <Reveal>
            <Counts data={cc.data} />
          </Reveal>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_25rem]">
            <Panel aria-labelledby="map-heading">
              <PanelHeader id="map-heading" title={t('overview.map')} description={t('overview.mapLead')} />
              <div className="px-4 pb-4">
                {map.data ? (
                  <>
                    <GulfMap
                      layers={map.data}
                      className="h-[28rem]"
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
                <ul className="max-h-[34rem] flex-1 divide-y divide-line overflow-y-auto border-t border-line">
                  {cc.data.attention.map((item) => (
                    <AttentionRow key={`${item.kind}:${item.id}`} item={item} />
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          <section aria-labelledby="sectors-heading" className="mt-8">
            <div className="mb-3 flex items-end justify-between gap-3">
              <h2 id="sectors-heading" className="text-xl text-ink">
                {t('overview.sectors')}
              </h2>
              <Link to="/sectors" className="text-sm text-cyan hover:underline">
                {t('common.viewAll')}
              </Link>
            </div>
            {sectors.data ? (
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {sectors.data.map((s) => (
                  <li key={s.key}>
                    <SectorTile s={s} />
                  </li>
                ))}
              </ul>
            ) : (
              <LoadState isPending={sectors.isPending} error={sectors.error} />
            )}
          </section>

          <div className="mt-8 grid gap-6 lg:grid-cols-3">
            <Panel aria-labelledby="cases-heading">
              <PanelHeader
                id="cases-heading"
                icon={<Brain className="h-4 w-4" aria-hidden />}
                title={t('overview.cases')}
                action={
                  <Link to="/cases" className="text-sm text-cyan hover:underline">
                    {t('common.viewAll')}
                  </Link>
                }
              />
              <ul className="divide-y divide-line border-t border-line">
                {open.slice(0, 4).map((c) => (
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

            <Panel aria-labelledby="review-heading">
              <PanelHeader
                id="review-heading"
                icon={<UserCheck className="h-4 w-4" aria-hidden />}
                title={t('overview.review')}
                action={
                  <Link to="/decisions" className="text-sm text-cyan hover:underline">
                    {t('common.viewAll')}
                  </Link>
                }
              />
              <div className="divide-y divide-line border-t border-line">
                {review.length === 0 ? (
                  <p className="px-5 py-4 text-sm text-ink-muted">{t('sector.noReview')}</p>
                ) : (
                  review.map((c) => (
                    <ListRow
                      key={c.id}
                      icon={UserCheck}
                      to={`/cases/${c.key}`}
                      title={c.title}
                      description={`${c.key} · ${c.domain}`}
                      trailing={<StatusPill tone="awaiting">Awaiting review</StatusPill>}
                    />
                  ))
                )}
              </div>
            </Panel>

            <Panel aria-labelledby="sources-heading">
              <PanelHeader
                id="sources-heading"
                icon={<Database className="h-4 w-4" aria-hidden />}
                title={t('overview.sources')}
                action={
                  <Link to="/sources" className="text-sm text-cyan hover:underline">
                    {t('common.viewAll')}
                  </Link>
                }
              />
              <ul className="divide-y divide-line border-t border-line">
                {cc.data.sourceHealth.map((s) => {
                  const warn = s.approvalStatus !== 'approved' || s.freshness === 'stale';
                  return (
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
                          className={cn('h-2 w-2 rounded-full', warn ? 'bg-amber' : 'bg-emerald')}
                          aria-hidden
                        />
                        <SourceClassBadge value={s.sourceClass} />
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          </div>
        </>
      ) : null}
    </>
  );
}
