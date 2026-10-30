/** Data-quality view (slice D): quality and record mode per dataset, connector health, problem runs, sources. */
import { DATASET_LABEL } from '@tigeris/shared';
import { useQuery } from '@tanstack/react-query';
import { LoadState } from '@/components/PageHeader';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { api } from '@/lib/api';
import { formatDateTime, humanize } from '@/lib/format';
import { ConnectorStatusBadge, RunStatusBadge } from './badges';

export function QualityPanel() {
  const q = useQuery({ queryKey: ['data-quality'], queryFn: api.dataQuality });
  if (!q.data) return <LoadState isPending={q.isPending} error={q.error} />;
  const d = q.data;
  return (
    <div className="space-y-6">
      <Panel aria-labelledby="dq-datasets" className="overflow-x-auto" tabIndex={0}>
        <PanelHeader
          id="dq-datasets"
          title="Records by quality and mode"
          description="Counts of the records you are cleared to read. Warnings are kept and labelled; quarantined records never reach analysis."
        />
        <table className="w-full min-w-[44rem] border-t border-line text-sm">
          <caption className="sr-only">Records by quality status and record mode</caption>
          <thead>
            <tr className="text-xs text-ink-faint">
              <th scope="col" className="px-5 py-3 text-start font-medium">
                Dataset
              </th>
              <th scope="col" className="px-3 py-3 text-end font-medium">
                Records
              </th>
              <th scope="col" className="px-3 py-3 text-end font-medium">
                Valid
              </th>
              <th scope="col" className="px-3 py-3 text-end font-medium">
                Warning
              </th>
              <th scope="col" className="px-3 py-3 text-end font-medium">
                Quarantined
              </th>
              <th scope="col" className="px-5 py-3 text-start font-medium">
                Mode
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {d.datasets.map((x) => (
              <tr key={x.dataset}>
                <th scope="row" className="px-5 py-3 text-start font-medium text-ink">
                  {DATASET_LABEL[x.dataset]}
                </th>
                <td className="tabular px-3 py-3 text-end text-ink">{x.total}</td>
                <td className="tabular px-3 py-3 text-end text-ink">{x.byQuality.valid}</td>
                <td className="tabular px-3 py-3 text-end text-ink">{x.byQuality.warning}</td>
                <td className="tabular px-3 py-3 text-end text-ink">{x.byQuality.quarantined}</td>
                <td className="px-5 py-3 text-ink-muted">
                  {Object.entries(x.byMode)
                    .map(([m, n]) => `${n} ${humanize(m).toLowerCase()}`)
                    .join(' · ') || 'None'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel aria-labelledby="dq-runs">
          <PanelHeader
            id="dq-runs"
            title="Runs needing attention"
            description={`${d.runs.total} runs: ${d.runs.succeeded} succeeded, ${d.runs.partial} partial, ${d.runs.failed} failed · ${d.runs.rowsRejected} rows rejected, ${d.runs.rowsWarned} accepted with warnings.`}
          />
          {d.recentProblemRuns.length === 0 ? (
            <p className="border-t border-line px-5 py-4 text-sm text-ink-muted">
              No failed, partial or warned runs.
            </p>
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {d.recentProblemRuns.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                  <span>
                    <span className="tabular font-medium text-ink">{r.key}</span>
                    <span className="block text-xs text-ink-muted">
                      {r.connectorKey} · {DATASET_LABEL[r.dataset]} · {r.rowsRejected} rejected ·{' '}
                      {r.rowsWarned} warned
                    </span>
                  </span>
                  <RunStatusBadge value={r.status} />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel aria-labelledby="dq-health">
          <PanelHeader id="dq-health" title="Connector and source health" />
          <ul className="divide-y divide-line border-t border-line">
            {d.connectors.length === 0 && d.sources.stale.length === 0 && d.sources.pending.length === 0 ? (
              <li className="px-5 py-4 text-sm text-ink-muted">
                No failed or paused connectors, stale or unapproved sources.
              </li>
            ) : null}
            {d.connectors.map((c) => (
              <li key={c.key} className="px-5 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-ink">
                    {c.key} · {c.name}
                  </span>
                  <ConnectorStatusBadge value={c.status} />
                </div>
                {c.lastError ? (
                  <p className="mt-1 text-xs text-red">
                    {c.lastError} {c.lastErrorAt ? `(${formatDateTime(c.lastErrorAt)})` : ''}
                  </p>
                ) : null}
              </li>
            ))}
            {d.sources.stale.map((s) => (
              <li key={s.id} className="px-5 py-3 text-sm">
                <span className="font-medium text-ink">{s.publisher}</span>{' '}
                <span className="font-semibold text-amber">Stale</span>
                <span className="block text-xs text-ink-muted">
                  Past its {s.freshnessLimitHours}-hour freshness limit.
                </span>
              </li>
            ))}
            {d.sources.pending.map((s) => (
              <li key={s.id} className="px-5 py-3 text-sm">
                <span className="font-medium text-ink">{s.publisher}</span>{' '}
                <span className="font-semibold text-amber">Pending approval</span>
                <span className="block text-xs text-ink-muted">
                  Nothing from this source can be ingested until approved.
                </span>
              </li>
            ))}
            <li className="px-5 py-3 text-xs text-ink-muted">
              {d.quarantinedPackageRecords} package records held in quarantine (see Sources).
            </li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}
