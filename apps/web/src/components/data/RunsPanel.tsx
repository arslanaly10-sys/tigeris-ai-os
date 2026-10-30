/** Connector runs and their row-level issues (ingestion history). */
import { DATASET_LABEL } from '@tigeris/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { LoadState } from '@/components/PageHeader';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { Sheet } from '@/components/ui/sheet';
import { api } from '@/lib/api';
import { formatDateTime, humanize } from '@/lib/format';
import { RunStatusBadge } from './badges';

const kb = (n: number) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`);

/** One run: counts, file fingerprint, accepted records and every row-level issue. */
export function RunDetail({ runKey }: { runKey: string }) {
  const q = useQuery({ queryKey: ['connector-run', runKey], queryFn: () => api.connectorRun(runKey) });
  if (!q.data) return <LoadState isPending={q.isPending} error={q.error} />;
  const r = q.data;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="tabular text-sm font-medium text-ink">{r.key}</span>
        <RunStatusBadge value={r.status} />
        <span className="text-xs text-ink-muted">
          {DATASET_LABEL[r.dataset]} · {r.mappingVersion} · {humanize(r.trigger)} ·{' '}
          {formatDateTime(r.startedAt)}
          {r.actor ? ` · ${r.actor}` : ''}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line text-sm sm:grid-cols-4">
        {[
          ['Rows read', r.rowsTotal],
          ['Accepted', r.rowsAccepted],
          ['Accepted with warnings', r.rowsWarned],
          ['Rejected', r.rowsRejected],
        ].map(([label, n]) => (
          <div key={label as string} className="bg-panel px-3 py-2">
            <dt className="text-xs text-ink-muted">{label}</dt>
            <dd className="tabular text-lg font-semibold text-ink">{n}</dd>
          </div>
        ))}
      </dl>
      {r.file ? (
        <p className="break-all text-xs text-ink-faint">
          {r.file.name} · {r.file.mediaType} · {kb(r.file.sizeBytes)} · SHA-256 {r.file.sha256}
        </p>
      ) : null}
      {r.error ? (
        <p role="note" className="rounded-md border border-red/40 bg-red-soft px-3 py-2 text-sm text-red">
          {r.error}
        </p>
      ) : null}
      {r.issues.length ? (
        <div
          className="overflow-x-auto rounded-lg border border-line"
          tabIndex={0}
          role="region"
          aria-label="Row-level issues"
        >
          <table className="w-full min-w-[36rem] text-sm">
            <caption className="sr-only">Row-level issues</caption>
            <thead>
              <tr className="bg-raised text-xs text-ink-muted">
                <th scope="col" className="px-3 py-2 text-start font-semibold">
                  Row
                </th>
                <th scope="col" className="px-3 py-2 text-start font-semibold">
                  Field
                </th>
                <th scope="col" className="px-3 py-2 text-start font-semibold">
                  Severity
                </th>
                <th scope="col" className="px-3 py-2 text-start font-semibold">
                  Issue
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {r.issues.map((i, n) => (
                <tr key={n}>
                  <td className="tabular px-3 py-2 align-top text-ink">{i.row === 1 ? 'Header' : i.row}</td>
                  <td className="px-3 py-2 align-top text-ink">{i.field ?? '—'}</td>
                  <td
                    className={`px-3 py-2 align-top font-medium ${i.severity === 'error' ? 'text-red' : 'text-amber'}`}
                  >
                    {i.severity === 'error' ? 'Rejected' : 'Warning'}
                  </td>
                  <td className="px-3 py-2 align-top text-ink">
                    {i.message} <span className="text-xs text-ink-faint">({i.code})</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-ink-muted">No row-level issues.</p>
      )}
      {r.acceptedKeys.length ? (
        <p className="text-xs text-ink-muted">
          Records created: <span className="tabular text-ink">{r.acceptedKeys.join(', ')}</span>
        </p>
      ) : null}
    </div>
  );
}

export function RunsPanel() {
  const q = useQuery({ queryKey: ['connector-runs'], queryFn: () => api.connectorRuns() });
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Panel aria-labelledby="runs-heading" className="overflow-x-auto" tabIndex={0}>
      <PanelHeader
        id="runs-heading"
        title="Connector runs"
        description="Every import and sync, its counts and its row-level issues. Runs are kept; nothing is overwritten."
      />
      <LoadState isPending={q.isPending} error={q.error} />
      {q.data ? (
        q.data.length === 0 ? (
          <p className="border-t border-line px-5 py-4 text-sm text-ink-muted">No connector runs yet.</p>
        ) : (
          <table className="w-full min-w-[52rem] border-t border-line text-sm">
            <caption className="sr-only">Connector runs</caption>
            <thead>
              <tr className="text-xs text-ink-faint">
                <th scope="col" className="px-5 py-3 text-start font-medium">
                  Run
                </th>
                <th scope="col" className="px-3 py-3 text-start font-medium">
                  Connector
                </th>
                <th scope="col" className="px-3 py-3 text-start font-medium">
                  Dataset
                </th>
                <th scope="col" className="px-3 py-3 text-start font-medium">
                  Status
                </th>
                <th scope="col" className="px-3 py-3 text-end font-medium">
                  Accepted
                </th>
                <th scope="col" className="px-5 py-3 text-end font-medium">
                  Rejected
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {q.data.map((r) => (
                <tr key={r.id}>
                  <td className="px-5 py-3 align-top">
                    <button
                      type="button"
                      onClick={() => setOpen(r.key)}
                      className="tabular font-medium text-cyan underline underline-offset-2"
                    >
                      {r.key}
                    </button>
                    <span className="block text-xs text-ink-faint">{formatDateTime(r.startedAt)}</span>
                  </td>
                  <td className="tabular px-3 py-3 align-top text-ink">{r.connectorKey}</td>
                  <td className="px-3 py-3 align-top text-ink">
                    {DATASET_LABEL[r.dataset]}
                    {r.file ? <span className="block text-xs text-ink-faint">{r.file.name}</span> : null}
                  </td>
                  <td className="px-3 py-3 align-top">
                    <RunStatusBadge value={r.status} />
                  </td>
                  <td className="tabular px-3 py-3 text-end align-top text-ink">{r.rowsAccepted}</td>
                  <td className="tabular px-5 py-3 text-end align-top text-ink">{r.rowsRejected}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      ) : null}
      <Sheet
        open={open !== null}
        onOpenChange={(o) => (o ? null : setOpen(null))}
        title={open ? `Run ${open}` : ''}
      >
        {open ? <RunDetail runKey={open} /> : null}
      </Sheet>
    </Panel>
  );
}
