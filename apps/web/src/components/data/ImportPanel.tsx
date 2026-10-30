/** File import (FR-10): choose a connector and dataset, upload, and see the run with every row-level issue. */
import {
  DATASET_FIELDS,
  DATASET_LABEL,
  TABULAR_DATASETS,
  type AuthContext,
  type Dataset,
  type TabularDataset,
} from '@tigeris/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileUp } from 'lucide-react';
import { useId, useState } from 'react';
import { LoadState } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { UploadFailed, api } from '@/lib/api';
import { RunDetail } from './RunsPanel';

const field =
  'mt-1.5 h-10 w-full rounded-lg border border-line-strong bg-panel px-3 text-sm text-ink focus:border-brand';

export function ImportPanel({ ctx }: { ctx: AuthContext }) {
  const admin = ctx.principal.roles.includes('administrator');
  const qc = useQueryClient();
  const conns = useQuery({ queryKey: ['connectors'], queryFn: api.connectors });
  const usable = (conns.data ?? []).filter(
    (c) =>
      (c.connectionType === 'file' || c.connectionType === 'document') &&
      c.status !== 'paused' &&
      c.status !== 'retired' &&
      c.status !== 'sample',
  );
  const [key, setKey] = useState('');
  const connector = usable.find((c) => c.key === key) ?? usable[0];
  const [dataset, setDataset] = useState<Dataset | ''>('');
  const ds = (dataset && connector?.datasets.includes(dataset) ? dataset : connector?.datasets[0]) as
    Dataset | undefined;
  const [file, setFile] = useState<File | null>(null);
  const m = useMutation({
    mutationFn: () => api.upload(connector!.key, ds!, file!),
    onSuccess: () => qc.invalidateQueries(),
  });
  const ids = { c: useId(), d: useId(), f: useId() };
  const tabular = ds && (TABULAR_DATASETS as readonly string[]).includes(ds);

  return (
    <div className="space-y-6">
      <Panel aria-labelledby="import-heading">
        <PanelHeader
          id="import-heading"
          title="Import a file"
          description="CSV, XLSX or JSON for positions, managers and due diligence; PDF, DOCX or TXT for documents. Up to 10 MB. Each row is validated against the dataset's versioned mapping; rejected rows are reported with their row number and reason."
        />
        <div className="border-t border-line px-5 py-4">
          {!admin ? (
            <p className="text-sm text-ink-muted">Only the Governance Administrator imports files.</p>
          ) : (
            <>
              <LoadState isPending={conns.isPending} error={conns.error} />
              {conns.data && usable.length === 0 ? (
                <p className="text-sm text-ink-muted">
                  No active file or document connector. Register one on the Connectors tab and approve its
                  source.
                </p>
              ) : null}
              {connector ? (
                <form
                  className="grid gap-4 md:grid-cols-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (file && ds) m.mutate();
                  }}
                >
                  <div>
                    <label htmlFor={ids.c} className="text-sm font-medium text-ink">
                      Connector
                    </label>
                    <select
                      id={ids.c}
                      value={connector.key}
                      onChange={(e) => setKey(e.target.value)}
                      className={field}
                    >
                      {usable.map((c) => (
                        <option key={c.key} value={c.key}>
                          {c.key} · {c.name}
                        </option>
                      ))}
                    </select>
                    {connector.source.approvalStatus !== 'approved' ? (
                      <p className="mt-1 text-xs text-amber">
                        Its source is pending approval: an import will be refused.
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <label htmlFor={ids.d} className="text-sm font-medium text-ink">
                      Dataset
                    </label>
                    <select
                      id={ids.d}
                      value={ds}
                      onChange={(e) => setDataset(e.target.value as Dataset)}
                      className={field}
                    >
                      {connector.datasets
                        .filter((d) => d !== 'signals')
                        .map((d) => (
                          <option key={d} value={d}>
                            {DATASET_LABEL[d]}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor={ids.f} className="text-sm font-medium text-ink">
                      File
                    </label>
                    <input
                      id={ids.f}
                      type="file"
                      required
                      accept={tabular ? '.csv,.xlsx,.json' : '.pdf,.docx,.txt'}
                      onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                      className="mt-1.5 block w-full text-sm text-ink file:me-3 file:h-10 file:rounded-md file:border file:border-line-strong file:bg-panel file:px-3 file:text-sm file:text-ink"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-3 md:col-span-3">
                    <Button type="submit" variant="primary" disabled={!file || !ds || m.isPending}>
                      <FileUp className="h-4 w-4" aria-hidden /> {m.isPending ? 'Importing…' : 'Import file'}
                    </Button>
                    {m.isError ? (
                      <p role="alert" className="text-sm text-red">
                        {m.error instanceof UploadFailed && m.error.detail
                          ? m.error.detail
                          : 'The file could not be imported. Nothing was recorded.'}
                      </p>
                    ) : null}
                  </div>
                </form>
              ) : null}
            </>
          )}
        </div>
        {m.data ? (
          <div className="border-t border-line px-5 py-4">
            <RunDetail runKey={m.data.runKey} />
          </div>
        ) : null}
      </Panel>

      <Panel aria-labelledby="templates-heading">
        <PanelHeader
          id="templates-heading"
          title="Dataset mappings"
          description="The columns each import expects. Download a sample file to start from; its rows are labelled as samples."
        />
        <div className="grid gap-px border-t border-line bg-line md:grid-cols-3">
          {TABULAR_DATASETS.map((d: TabularDataset) => (
            <section key={d} aria-labelledby={`map-${d}`} className="bg-panel px-5 py-4">
              <div className="flex items-start justify-between gap-2">
                <h3 id={`map-${d}`} className="text-base text-ink">
                  {DATASET_LABEL[d]}
                </h3>
                <a
                  href={`/api/templates/${d}`}
                  className="inline-flex min-h-6 items-center gap-1 text-sm font-medium text-cyan underline underline-offset-2"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden /> Sample CSV
                </a>
              </div>
              <ul className="mt-2 space-y-1 text-xs">
                {DATASET_FIELDS[d].map((f) => (
                  <li key={f.name}>
                    <span className="tabular font-medium text-ink">{f.name}</span>
                    {f.required ? <span className="text-red"> *</span> : null}{' '}
                    <span className="text-ink-muted">{f.description}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-ink-faint">* required</p>
            </section>
          ))}
        </div>
      </Panel>
    </div>
  );
}
