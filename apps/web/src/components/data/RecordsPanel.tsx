/** Normalized records with provenance (FR-12): what each record is, where it came from, how and when. */
import { SECTOR_BY_KEY, type RecordProvenance } from '@tigeris/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { LoadState } from '@/components/PageHeader';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { api } from '@/lib/api';
import { formatDateTime, humanize } from '@/lib/format';
import { QualityBadge, RecordModeBadge } from './badges';

const VIEWS = [
  { key: 'positions', label: 'Positions' },
  { key: 'managers', label: 'Managers & due diligence' },
  { key: 'documents', label: 'Documents' },
] as const;
type View = (typeof VIEWS)[number]['key'];

function Provenance({ p }: { p: RecordProvenance }) {
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1">
        <RecordModeBadge value={p.recordMode} />
        <QualityBadge value={p.qualityStatus} />
      </div>
      <p className="text-xs text-ink-muted">
        {p.sourcePublisher} · {p.connectorKey ?? 'seeded'}
        {p.runKey ? ` · ${p.runKey}` : ''}
      </p>
      <p className="break-all text-xs text-ink-faint">
        {p.sourceRecordId} · {p.mappingVersion} · {humanize(p.classification)} ·{' '}
        {formatDateTime(p.ingestedAt)}
      </p>
    </div>
  );
}

const th = 'px-3 py-3 text-start font-medium';

export function RecordsPanel() {
  const [view, setView] = useState<View>('positions');
  const positions = useQuery({
    queryKey: ['positions', 'all'],
    queryFn: () => api.positions(),
    enabled: view === 'positions',
  });
  const managers = useQuery({
    queryKey: ['managers', 'all'],
    queryFn: () => api.managers(),
    enabled: view === 'managers',
  });
  const docs = useQuery({ queryKey: ['documents'], queryFn: api.documents, enabled: view === 'documents' });
  const active = view === 'positions' ? positions : view === 'managers' ? managers : docs;
  return (
    <Panel aria-labelledby="records-heading" className="overflow-x-auto" tabIndex={0}>
      <PanelHeader
        id="records-heading"
        title="Normalized records"
        description="Records you are cleared to read, each with its source, connector, run, mapping version, classification and quality. Synthetic and imported records are labelled; none is live."
        action={
          <div
            role="group"
            aria-label="Record type"
            className="inline-flex rounded-lg border border-line-strong bg-panel p-0.5"
          >
            {VIEWS.map((v) => (
              <button
                key={v.key}
                type="button"
                aria-pressed={view === v.key}
                onClick={() => setView(v.key)}
                className={`rounded-md px-3 py-1.5 text-sm ${view === v.key ? 'bg-raised font-semibold text-brand' : 'text-ink-muted hover:text-ink'}`}
              >
                {v.label}
              </button>
            ))}
          </div>
        }
      />
      <LoadState isPending={active.isPending} error={active.error} />
      {view === 'positions' && positions.data ? (
        positions.data.positions.length === 0 ? (
          <p className="border-t border-line px-5 py-4 text-sm text-ink-muted">
            No positions within your clearance.
          </p>
        ) : (
          <>
            <p className="tabular border-t border-line px-5 py-2 text-xs text-ink-muted">
              {positions.data.totals.rows} rows · {positions.data.totals.navSharePct}% of NAV listed ·{' '}
              {positions.data.totals.routeDependentCount} route-dependent (
              {positions.data.totals.routeDependentNavSharePct}% of NAV). Totals cover the listed rows only.
            </p>
            <table className="w-full min-w-[60rem] border-t border-line text-sm">
              <caption className="sr-only">Positions with provenance</caption>
              <thead>
                <tr className="text-xs text-ink-faint">
                  <th scope="col" className={`${th} ps-5`}>
                    Position
                  </th>
                  <th scope="col" className={th}>
                    Workspace
                  </th>
                  <th scope="col" className={`${th} text-end`}>
                    Value
                  </th>
                  <th scope="col" className={`${th} text-end`}>
                    % NAV
                  </th>
                  <th scope="col" className={`${th} pe-5`}>
                    Provenance
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {positions.data.positions.map((p) => (
                  <tr key={p.id}>
                    <td className="px-5 py-3 align-top">
                      <span className="font-medium text-ink">{p.name}</span>
                      <span className="block text-xs text-ink-muted">
                        {p.key} · {p.assetClass} · {p.country ?? '—'} · as of {p.asOf}
                        {p.routeDependent ? ' · route-dependent' : ''}
                      </span>
                    </td>
                    <td className="px-3 py-3 align-top text-ink">
                      {p.sectorKey ? SECTOR_BY_KEY[p.sectorKey].label : 'Institution'}
                    </td>
                    <td className="tabular px-3 py-3 text-end align-top text-ink">
                      {p.currency} {p.marketValue.toLocaleString('en-US', { maximumFractionDigits: 1 })}
                    </td>
                    <td className="tabular px-3 py-3 text-end align-top text-ink">{p.navSharePct}</td>
                    <td className="px-3 py-3 pe-5 align-top">
                      <Provenance p={p.provenance} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )
      ) : null}
      {view === 'managers' && managers.data ? (
        managers.data.length === 0 ? (
          <p className="border-t border-line px-5 py-4 text-sm text-ink-muted">
            No managers within your clearance.
          </p>
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {managers.data.map((m) => (
              <li
                key={m.id}
                className="grid gap-3 px-5 py-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_18rem]"
              >
                <div>
                  <p className="font-medium text-ink">{m.name}</p>
                  <p className="text-xs text-ink-muted">
                    {m.key} · {m.strategy} · {m.domicile ?? '—'}
                  </p>
                </div>
                <ul className="space-y-1 text-sm">
                  {m.dueDiligence.length === 0 ? (
                    <li className="text-ink-muted">No due-diligence record.</li>
                  ) : null}
                  {m.dueDiligence.map((d) => (
                    <li key={d.key}>
                      <span className="text-ink">
                        {d.reviewType}: {humanize(d.status)}
                      </span>
                      <span className="block text-xs text-ink-muted">
                        {d.openIssues} open issues · {d.reviewedOn ?? 'not yet reviewed'} · {d.summary}
                      </span>
                    </li>
                  ))}
                </ul>
                <Provenance p={m.provenance} />
              </li>
            ))}
          </ul>
        )
      ) : null}
      {view === 'documents' && docs.data ? (
        docs.data.length === 0 ? (
          <p className="border-t border-line px-5 py-4 text-sm text-ink-muted">No documents imported yet.</p>
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {docs.data.map((d) => (
              <li key={d.id} className="grid gap-3 px-5 py-3 md:grid-cols-[minmax(0,1fr)_18rem]">
                <div>
                  <p className="font-medium text-ink">{d.title}</p>
                  <p className="text-xs text-ink-muted">
                    {d.key} · {d.file.name} · {d.pageCount ? `${d.pageCount} pages · ` : ''}
                    {d.charCount.toLocaleString('en-US')} characters
                  </p>
                  <p className="mt-1 line-clamp-3 text-sm text-ink">{d.excerpt || 'No extractable text.'}</p>
                </div>
                <Provenance p={d.provenance} />
              </li>
            ))}
          </ul>
        )
      ) : null}
    </Panel>
  );
}
