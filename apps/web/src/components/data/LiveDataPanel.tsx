/**
 * Live data (D-127) on Data & Integrations. Each public feed shows its source, its last fetch and its series. The
 * label (Live, Snapshot or Stale) comes from the API's shared rule, never from this screen; every value shows both the
 * date it describes and when it was fetched. An administrator can fetch now.
 */
import type { AuthContext, LiveFeedItem } from '@tigeris/shared';
import { SECTOR_BY_KEY } from '@tigeris/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, KeyRound, RefreshCw, TriangleAlert } from 'lucide-react';
import { LoadState } from '@/components/PageHeader';
import { DataModeBadge, ValidationBadge } from '@/components/truth/badges';
import { Button } from '@/components/ui/button';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { api } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/format';

function Freshness({ f }: { f: LiveFeedItem }) {
  if (f.freshness === 'live') return <DataModeBadge value="live" />;
  if (f.freshness === 'stale') return <ValidationBadge value="stale" />;
  if (f.freshness === 'snapshot') return <DataModeBadge value="snapshot" />;
  return <span className="text-xs text-ink-muted">Not fetched yet</span>;
}

const fmt = (v: number) => v.toLocaleString('en-GB', { maximumFractionDigits: 4 });

function Feed({ f, canSync }: { f: LiveFeedItem; canSync: boolean }) {
  const qc = useQueryClient();
  const sync = useMutation({
    mutationFn: () => api.syncConnector(f.connectorKey),
    onSettled: () => qc.invalidateQueries({ queryKey: ['live'] }),
  });
  const headingId = `live-${f.connectorKey}`;
  return (
    <Panel aria-labelledby={headingId}>
      <PanelHeader
        id={headingId}
        icon={<Activity className="h-4 w-4" aria-hidden />}
        title={f.name}
        description={`${f.source.publisher} · ${f.formatLabel}${f.sectorKey ? ` · ${SECTOR_BY_KEY[f.sectorKey].label}` : ''}`}
        action={<Freshness f={f} />}
      />
      <div className="space-y-2 border-t border-line px-5 py-3 text-sm">
        <p className="text-ink-muted">
          Last successful fetch:{' '}
          <span className="text-ink">{f.lastSuccessAt ? formatDateTime(f.lastSuccessAt) : 'never'}</span>
          {f.schedule ? (
            <>
              {' '}
              · schedule <code className="tabular text-xs">{f.schedule}</code> (UTC)
            </>
          ) : null}
          {f.source.terms ? <> · {f.source.terms}</> : null}
        </p>
        {f.needsCredential ? (
          <p className="flex items-start gap-2 text-amber">
            <KeyRound className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            Needs the server setting {f.needsCredential} (a free key from the provider) before it can fetch.
          </p>
        ) : null}
        {f.status === 'failed' && f.lastError ? (
          <p role="status" className="flex items-start gap-2 text-red">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            Last fetch failed: {f.lastError}
          </p>
        ) : null}
        {canSync ? (
          <Button size="sm" onClick={() => sync.mutate()} disabled={sync.isPending}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            {sync.isPending ? 'Fetching…' : 'Fetch now'}
            <span className="sr-only"> {f.name}</span>
          </Button>
        ) : null}
      </div>
      {f.series.length ? (
        <div
          className="overflow-x-auto border-t border-line"
          tabIndex={0}
          role="region"
          aria-label={`Series from ${f.connectorKey}`}
        >
          <table className="w-full min-w-[40rem] text-sm">
            <caption className="sr-only">
              Latest value of each series, with the date it describes and when it was fetched
            </caption>
            <thead>
              <tr className="text-xs text-ink-faint">
                <th scope="col" className="px-5 py-2 text-start font-medium">
                  Series
                </th>
                <th scope="col" className="px-3 py-2 text-end font-medium">
                  Latest value
                </th>
                <th scope="col" className="px-3 py-2 text-start font-medium">
                  Describes
                </th>
                <th scope="col" className="px-3 py-2 text-start font-medium">
                  Fetched
                </th>
                <th scope="col" className="px-5 py-2 text-end font-medium">
                  Points
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {f.series.map((s) => (
                <tr key={s.seriesKey}>
                  <th scope="row" className="px-5 py-2.5 text-start font-normal">
                    <code className="tabular text-xs text-ink">{s.seriesKey}</code>
                  </th>
                  <td className="tabular px-3 py-2.5 text-end text-ink">
                    {fmt(s.latest.value)}
                    {s.unit ? <span className="text-ink-muted"> {s.unit}</span> : null}
                    {s.latest.revised ? (
                      <span className="block text-xs text-ink-muted">revised by provider</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 text-ink">{formatDate(s.latest.observedOn)}</td>
                  <td className="px-3 py-2.5 text-ink-muted">
                    {formatDateTime(s.latest.fetchedAt)} ·{' '}
                    <span className="tabular text-xs">{s.latest.runKey}</span>
                  </td>
                  <td className="tabular px-5 py-2.5 text-end text-ink-muted">{s.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Panel>
  );
}

export function LiveDataPanel({ ctx }: { ctx: AuthContext }) {
  const q = useQuery({ queryKey: ['live'], queryFn: api.live });
  if (!q.data) return <LoadState isPending={q.isPending} error={q.error} />;
  const canSync = ctx.principal.roles.includes('administrator');
  return (
    <div className="space-y-4">
      <p className="max-w-[70ch] text-sm text-ink-muted">
        A value is labelled Live only when its feed's last fetch succeeded within twice its schedule (at most
        48 hours). Otherwise it is a Snapshot or Stale. Each value shows the date it describes and when it was
        fetched.
      </p>
      {q.data.length ? (
        q.data.map((f) => <Feed key={f.connectorKey} f={f} canSync={canSync} />)
      ) : (
        <p className="text-sm text-ink-muted">No live-data feeds are registered within your clearance.</p>
      )}
    </div>
  );
}
