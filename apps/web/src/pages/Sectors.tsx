import type { SectorKey, SectorKpi } from '@tigeris/shared';
import { SECTOR_BY_KEY, SECTOR_KEYS } from '@tigeris/shared';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  Bot,
  Brain,
  Compass,
  Gauge,
  GitFork,
  Layers,
  Map as MapIcon,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { SectorBanner } from '@/components/illustrations/Scenes';
import { SectorSubnav } from '@/components/layout/SectorSubnav';
import { LineageDrawer, type LineageTarget } from '@/components/LineageDrawer';
import { GulfMap, MapItemList } from '@/components/map/GulfMap';
import { LoadState, PageHeader } from '@/components/PageHeader';
import { SignalTypeTile, StateBadge, UrgencyBadge, ValidationBadge } from '@/components/truth/badges';
import { ConnectDataChart, KpiCard, ListRow, StatusPill } from '@/components/ui/data';
import { StaggerItem, StaggerList } from '@/components/ui/motion';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { api } from '@/lib/api';
import { formatRelative } from '@/lib/format';
import { SECTOR_LABEL_AR, useI18n } from '@/lib/i18n';
import { ROLE_LABEL } from '@/lib/roles';
import { SectorTile } from '@/pages/Overview';

const KPI_ICONS = [Gauge, Activity, Layers, Compass];

/** Sector index: the eight configured sector packs over one graph and one governed workflow. */
export function SectorsIndexPage() {
  const { t } = useI18n();
  const sectors = useQuery({ queryKey: ['sectors'], queryFn: api.sectors });
  return (
    <>
      <SectorSubnav />
      <PageHeader title={t('sector.index')} description={t('sector.indexLead')} />
      <LoadState isPending={sectors.isPending} error={sectors.error} />
      {sectors.data ? (
        <StaggerList className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {sectors.data.map((s) => (
            <StaggerItem key={s.key}>
              <div className="h-full overflow-hidden rounded-xl">
                <SectorBanner
                  sector={s.key}
                  className="h-24 w-full rounded-t-xl border border-b-0 border-line"
                />
                <div className="-mt-px h-[calc(100%-6rem)]">
                  <SectorTile s={s} />
                </div>
              </div>
            </StaggerItem>
          ))}
        </StaggerList>
      ) : null}
    </>
  );
}

function isSectorKey(k: string | undefined): k is SectorKey {
  return !!k && (SECTOR_KEYS as readonly string[]).includes(k);
}

/** Sector Command Centre template (approved light concepts). Every panel is real data or an honest empty state. */
export function SectorCentrePage() {
  const { key } = useParams();
  if (!isSectorKey(key)) return <Navigate to="/sectors" replace />;
  return <SectorCentre key={key} sectorKey={key} />;
}

function SectorCentre({ sectorKey }: { sectorKey: SectorKey }) {
  const { t, lang } = useI18n();
  const def = SECTOR_BY_KEY[sectorKey];
  const q = useQuery({ queryKey: ['sector', sectorKey], queryFn: () => api.sector(sectorKey) });
  const map = useQuery({ queryKey: ['map-layers'], queryFn: api.mapLayers });
  const mandates = useQuery({ queryKey: ['mandates'], queryFn: api.mandates });
  const [lineage, setLineage] = useState<LineageTarget | null>(null);

  const openLineage = (kpi: SectorKpi) => {
    if (!kpi.value) return;
    const predicate = def.kpis.find((k) => k.key === kpi.key)?.binding?.predicate;
    setLineage({ evidenceId: kpi.value.evidenceId, fact: null, predicate });
  };

  const d = q.data;
  const label = lang === 'ar' ? SECTOR_LABEL_AR[sectorKey] : def.label;
  const mapKeys = map.data ? def.entityKeys.filter((k) => map.data.entities.some((e) => e.key === k)) : [];

  return (
    <>
      <SectorSubnav />
      <PageHeader
        eyebrow={label}
        title={def.title}
        description={def.tagline}
        lastUpdated={d ? d.lastUpdated : undefined}
        sourceStatus={
          d
            ? d.kpisConnected === 0
              ? 'not_connected'
              : d.kpisConnected < d.kpisTotal
                ? 'partial'
                : 'connected'
            : undefined
        }
        illustration={
          <SectorBanner
            sector={sectorKey}
            className="h-full w-full [mask-image:linear-gradient(to_left,black_55%,transparent)]"
          />
        }
      />
      {def.depth === 'shell' ? (
        <p className="mb-5 rounded-lg border border-line-strong bg-raised px-4 py-3 text-sm text-ink-muted">
          {t('sector.shell')}
        </p>
      ) : null}
      <LoadState isPending={q.isPending} error={q.error} />
      {d ? (
        <>
          <section aria-labelledby="glance-heading">
            <h2 id="glance-heading" className="mb-3 text-xl text-ink">
              {t('sector.atGlance')}
            </h2>
            <StaggerList className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {d.kpis.map((k, i) => (
                <StaggerItem key={k.key}>
                  <KpiCard kpi={k} icon={KPI_ICONS[i % KPI_ICONS.length]!} onLineage={openLineage} />
                </StaggerItem>
              ))}
            </StaggerList>
          </section>

          <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <Panel aria-labelledby="asset-heading">
              <PanelHeader
                id="asset-heading"
                icon={<MapIcon className="h-4 w-4" aria-hidden />}
                title={t('sector.assetMap')}
              />
              <div className="px-4 pb-4">
                {map.data && mapKeys.length > 0 ? (
                  <>
                    <GulfMap
                      layers={map.data}
                      focusKeys={mapKeys}
                      showTracks={sectorKey === 'energy' || sectorKey === 'supply_chain'}
                      className="h-[22rem]"
                      label={`Map of ${def.label} assets in the Arabian Gulf region.`}
                    />
                    <MapItemList layers={map.data} focusKeys={mapKeys} />
                  </>
                ) : map.isPending ? (
                  <LoadState isPending error={null} />
                ) : (
                  <div className="flex h-56 flex-col items-center justify-center rounded-lg border border-dashed border-line-strong bg-raised/50 text-center">
                    <MapIcon className="h-6 w-6 text-brand/70" aria-hidden />
                    <p className="mt-1.5 text-sm font-medium text-ink">{t('sector.noAssets')}</p>
                    <p className="max-w-xs text-xs text-ink-faint">{t('common.connectDataHint')}</p>
                  </div>
                )}
              </div>
            </Panel>

            <Panel aria-labelledby="areas-heading">
              <PanelHeader
                id="areas-heading"
                icon={<Compass className="h-4 w-4" aria-hidden />}
                title={t('sector.areas')}
              />
              <StaggerList className="divide-y divide-line border-t border-line">
                {def.intelligenceAreas.map((a) => (
                  <StaggerItem key={a.title} className="px-5 py-3">
                    <p className="text-sm font-medium text-ink">{a.title}</p>
                    <p className="text-xs text-ink-muted">{a.description}</p>
                  </StaggerItem>
                ))}
              </StaggerList>
            </Panel>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
            <Panel aria-labelledby="sc-cases-heading">
              <PanelHeader
                id="sc-cases-heading"
                icon={<Brain className="h-4 w-4" aria-hidden />}
                title={t('sector.cases')}
                action={
                  <Link to="/cases" className="text-sm text-cyan hover:underline">
                    {t('common.viewAll')}
                  </Link>
                }
              />
              <StaggerList className="divide-y divide-line border-t border-line">
                {d.cases.length === 0 ? (
                  <StaggerItem className="px-5 py-4 text-sm text-ink-muted">
                    {t('sector.noCases')}
                  </StaggerItem>
                ) : (
                  d.cases.map((c) => (
                    <StaggerItem key={c.id}>
                      <Link to={`/cases/${c.key}`} className="block px-5 py-3 hover:bg-raised/60">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="tabular font-mono text-[11px] text-ink-faint">{c.key}</span>
                          <StateBadge value={c.state} />
                          <UrgencyBadge value={c.urgency} />
                        </span>
                        <span className="mt-1 block text-sm font-medium text-ink">{c.title}</span>
                        <span className="text-[11px] text-ink-faint">
                          {c.nextStep} · {formatRelative(c.updatedAt)}
                        </span>
                      </Link>
                    </StaggerItem>
                  ))
                )}
              </StaggerList>
            </Panel>

            <Panel aria-labelledby="sc-signals-heading">
              <PanelHeader
                id="sc-signals-heading"
                icon={<Activity className="h-4 w-4" aria-hidden />}
                title={t('sector.signals')}
                action={
                  <Link to="/signals" className="text-sm text-cyan hover:underline">
                    {t('common.viewAll')}
                  </Link>
                }
              />
              <StaggerList className="divide-y divide-line border-t border-line">
                {d.signals.length === 0 ? (
                  <StaggerItem className="px-5 py-4 text-sm text-ink-muted">
                    No signals for this sector.
                  </StaggerItem>
                ) : (
                  d.signals.slice(0, 5).map((s) => (
                    <StaggerItem key={s.id}>
                      <Link
                        to={`/signals?selected=${s.key}`}
                        className="flex items-start gap-3 px-5 py-3 hover:bg-raised/60"
                      >
                        <SignalTypeTile value={s.signalType} className="h-9 w-9" />
                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-2 text-sm font-medium text-ink">{s.title}</span>
                          <span className="mt-1 flex flex-wrap items-center gap-1.5">
                            {s.validationStatus ? <ValidationBadge value={s.validationStatus} /> : null}
                            <span className="text-[11px] text-ink-faint">{formatRelative(s.detectedAt)}</span>
                          </span>
                        </span>
                      </Link>
                    </StaggerItem>
                  ))
                )}
              </StaggerList>
            </Panel>

            <Panel aria-labelledby="sc-review-heading">
              <PanelHeader
                id="sc-review-heading"
                icon={<UserCheck className="h-4 w-4" aria-hidden />}
                title={t('sector.review')}
              />
              <div className="divide-y divide-line border-t border-line">
                {d.reviewQueue.length === 0 ? (
                  <p className="px-5 py-4 text-sm text-ink-muted">{t('sector.noReview')}</p>
                ) : (
                  d.reviewQueue.map((c) => (
                    <ListRow
                      key={c.id}
                      icon={UserCheck}
                      to={`/cases/${c.key}`}
                      title={c.title}
                      description={`${c.key} · ${c.nextStepRole ? ROLE_LABEL[c.nextStepRole] : '—'}`}
                      trailing={<StatusPill tone="awaiting">Awaiting review</StatusPill>}
                    />
                  ))
                )}
              </div>
            </Panel>

            <Panel aria-labelledby="sc-agents-heading">
              <PanelHeader
                id="sc-agents-heading"
                icon={<Bot className="h-4 w-4" aria-hidden />}
                title={t('sector.agents')}
                action={
                  <Link to="/ai" className="text-sm text-cyan hover:underline">
                    {t('nav.ai')}
                  </Link>
                }
              />
              <div className="divide-y divide-line border-t border-line">
                {def.agents.map((a) => (
                  <ListRow
                    key={a.key}
                    icon={Bot}
                    title={a.name}
                    description={a.description}
                    trailing={<StatusPill tone="awaiting">{t('common.noRunsYet')}</StatusPill>}
                  />
                ))}
              </div>
            </Panel>

            <Panel aria-labelledby="sc-scen-heading">
              <PanelHeader
                id="sc-scen-heading"
                icon={<GitFork className="h-4 w-4" aria-hidden />}
                title={t('sector.scenarios')}
                description={t('common.phase').replace('{n}', '3')}
              />
              <StaggerList className="divide-y divide-line border-t border-line">
                {def.scenarios.map((s) => (
                  <StaggerItem key={s.key} className="flex items-center gap-3 px-5 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-ink">{s.title}</span>
                      <span className="block text-xs text-ink-muted">{s.description}</span>
                    </span>
                    <button
                      type="button"
                      disabled
                      className="rounded-md border border-line-strong px-2.5 py-1 text-xs text-ink-faint"
                      aria-describedby="sc-scen-heading"
                    >
                      Launch
                      <span className="sr-only"> {s.title} (available in Phase 3)</span>
                    </button>
                  </StaggerItem>
                ))}
              </StaggerList>
            </Panel>

            <Panel aria-labelledby="sc-mandates-heading">
              <PanelHeader
                id="sc-mandates-heading"
                icon={<ShieldCheck className="h-4 w-4" aria-hidden />}
                title={t('sector.mandates')}
                action={
                  <Link to="/mandates" className="text-sm text-cyan hover:underline">
                    {t('common.viewAll')}
                  </Link>
                }
              />
              <div className="divide-y divide-line border-t border-line">
                {(mandates.data?.mandates ?? []).slice(0, 3).map((m) => (
                  <ListRow key={m.id} icon={ShieldCheck} title={m.title} description={m.limitText} />
                ))}
                {mandates.isPending ? (
                  <p className="px-5 py-4 text-sm text-ink-muted">{t('common.loading')}</p>
                ) : null}
              </div>
            </Panel>
          </div>

          <Panel aria-labelledby="sc-trend-heading" className="mt-6">
            <PanelHeader
              id="sc-trend-heading"
              title={t('sector.trend')}
              description="Sector indicators over time"
            />
            <div className="px-5 pb-5">
              <ConnectDataChart
                xLabels={['2021', '2022', '2023', '2024', '2025']}
                yLabel={`${def.label} trend`}
              />
            </div>
          </Panel>
        </>
      ) : null}
      <LineageDrawer target={lineage} onClose={() => setLineage(null)} />
    </>
  );
}
