/** Connector registry (FR-06): status earned by fetches, credentials referenced by name only, admin actions. */
import {
  AUTH_TYPES,
  CONNECTION_TYPE_LABEL,
  CONNECTION_TYPES,
  DATASET_LABEL,
  DATASETS,
  SECTORS,
  SENSITIVITIES,
  type AuthContext,
  type ConnectorItem,
  type Dataset,
} from '@tigeris/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Plus } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { LoadState } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { Modal } from '@/components/ui/sheet';
import { ApiError, api } from '@/lib/api';
import { formatDateTime, humanize } from '@/lib/format';
import { ApprovalBadge, ConnectorStatusBadge } from './badges';

const field =
  'mt-1.5 h-10 w-full rounded-lg border border-line-strong bg-panel px-3 text-sm text-ink focus:border-brand';

function Field({
  label,
  hint,
  children,
  id,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  id: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label} {hint ? <span className="font-normal text-ink-faint">({hint})</span> : null}
      </label>
      {children}
    </div>
  );
}

function RegisterConnector({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const ids = {
    provider: useId(),
    name: useId(),
    type: useId(),
    auth: useId(),
    ref: useId(),
    endpoint: useId(),
    sector: useId(),
    cls: useId(),
    src: useId(),
    schedule: useId(),
  };
  const [f, setF] = useState({
    provider: '',
    name: '',
    connectionType: 'file',
    authType: 'none',
    authRef: '',
    endpoint: '',
    datasets: ['positions'] as Dataset[],
    sectorKey: '',
    classification: 'restricted',
    sourceClass: 'client',
    schedule: '',
  });
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const remote = f.connectionType === 'rest' || f.connectionType === 'rss';
  const m = useMutation({
    mutationFn: () =>
      api.registerConnector({
        ...f,
        authRef: f.authType === 'none' ? null : f.authRef || null,
        endpoint: f.endpoint || null,
        sectorKey: f.sectorKey || null,
        schedule: remote && f.schedule ? f.schedule : null,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries();
      onClose();
    },
  });
  return (
    <Modal
      open={open}
      onOpenChange={(o) => (o ? null : onClose())}
      title="Register a connector"
      description="Read-only. Its source starts pending approval; nothing is ingested until it is approved. Credentials are referenced by environment-variable name, never entered here."
    >
      <form
        className="max-h-[70vh] space-y-3 overflow-y-auto pe-1"
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id={ids.provider} label="Provider">
            <input
              id={ids.provider}
              required
              minLength={2}
              value={f.provider}
              onChange={(e) => set('provider', e.target.value)}
              className={field}
            />
          </Field>
          <Field id={ids.name} label="Name">
            <input
              id={ids.name}
              required
              minLength={2}
              value={f.name}
              onChange={(e) => set('name', e.target.value)}
              className={field}
            />
          </Field>
          <Field id={ids.type} label="Connection type">
            <select
              id={ids.type}
              value={f.connectionType}
              onChange={(e) => set('connectionType', e.target.value)}
              className={field}
            >
              {CONNECTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {CONNECTION_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </Field>
          <Field id={ids.auth} label="Authentication">
            <select
              id={ids.auth}
              value={f.authType}
              onChange={(e) => set('authType', e.target.value)}
              className={field}
            >
              {AUTH_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t === 'none' ? 'None' : humanize(t)}
                </option>
              ))}
            </select>
          </Field>
          {f.authType !== 'none' ? (
            <Field id={ids.ref} label="Credential reference" hint="environment variable name">
              <input
                id={ids.ref}
                required
                pattern="[A-Z][A-Z0-9_]{2,63}"
                placeholder="e.g. PORTFOLIO_API_KEY"
                value={f.authRef}
                onChange={(e) => set('authRef', e.target.value.toUpperCase())}
                className={field}
              />
            </Field>
          ) : null}
          {remote ? (
            <Field id={ids.endpoint} label="Endpoint" hint="https">
              <input
                id={ids.endpoint}
                required
                type="url"
                placeholder="https://"
                value={f.endpoint}
                onChange={(e) => set('endpoint', e.target.value)}
                className={field}
              />
            </Field>
          ) : null}
          <Field id={ids.sector} label="Sector workspace" hint="optional">
            <select
              id={ids.sector}
              value={f.sectorKey}
              onChange={(e) => set('sectorKey', e.target.value)}
              className={field}
            >
              <option value="">Whole institution</option>
              {SECTORS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
          <Field id={ids.cls} label="Classification">
            <select
              id={ids.cls}
              value={f.classification}
              onChange={(e) => set('classification', e.target.value)}
              className={field}
            >
              {SENSITIVITIES.map((s) => (
                <option key={s} value={s}>
                  {humanize(s)}
                </option>
              ))}
            </select>
          </Field>
          <Field id={ids.src} label="Source class">
            <select
              id={ids.src}
              value={f.sourceClass}
              onChange={(e) => set('sourceClass', e.target.value)}
              className={field}
            >
              <option value="client">Client (the institution's own)</option>
              <option value="public">Public</option>
              <option value="third_party">Third party</option>
              <option value="licensed">Licensed</option>
            </select>
          </Field>
          {remote ? (
            <Field id={ids.schedule} label="Schedule" hint="cron, every 15 min or less often">
              <input
                id={ids.schedule}
                placeholder="0 */6 * * *"
                value={f.schedule}
                onChange={(e) => set('schedule', e.target.value)}
                className={field}
              />
            </Field>
          ) : null}
        </div>
        <fieldset>
          <legend className="text-sm font-medium text-ink">Datasets</legend>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
            {DATASETS.map((d) => (
              <label key={d} className="inline-flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  className="accent-brand"
                  checked={f.datasets.includes(d)}
                  onChange={(e) =>
                    setF((x) => ({
                      ...x,
                      datasets: e.target.checked ? [...x.datasets, d] : x.datasets.filter((y) => y !== d),
                    }))
                  }
                />
                {DATASET_LABEL[d]}
              </label>
            ))}
          </div>
        </fieldset>
        {m.isError ? (
          <p role="alert" className="text-sm text-red">
            {m.error instanceof ApiError && m.error.status === 400
              ? 'Some fields need attention: check the credential reference, endpoint and schedule.'
              : 'The connector could not be registered.'}
          </p>
        ) : null}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={m.isPending || f.datasets.length === 0}>
            Register connector
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ConnectorRow({ c, admin }: { c: ConnectorItem; admin: boolean }) {
  const qc = useQueryClient();
  const [note, setNote] = useState<string | null>(null);
  const act = (fn: () => Promise<unknown>, done: (v: unknown) => string) =>
    ({
      mutationFn: fn,
      onSuccess: async (v: unknown) => {
        setNote(done(v));
        await qc.invalidateQueries();
      },
      onError: (e: unknown) =>
        setNote(e instanceof ApiError ? `Refused: ${humanize(e.code)}.` : 'The action failed.'),
    }) as const;
  const test = useMutation(
    act(
      () => api.testConnector(c.key),
      (v) => (v as { message: string }).message,
    ),
  );
  const sync = useMutation(
    act(
      () => api.syncConnector(c.key),
      (v) => {
        const r = v as { status: string; created: number; fetched: number; error: string | null };
        return r.error ? `Sync failed: ${r.error}` : `Fetched ${r.fetched} items; ${r.created} new signals.`;
      },
    ),
  );
  const status = useMutation({
    mutationFn: (s: 'paused' | 'configured' | 'retired') => api.setConnectorStatus(c.key, s),
    onSuccess: () => qc.invalidateQueries(),
  });
  const approve = useMutation(
    act(
      () => api.approveSource(c.source.key),
      () => 'Source approved: imports are now allowed.',
    ),
  );
  const busy = test.isPending || sync.isPending || status.isPending || approve.isPending;
  const remote = c.connectionType === 'rest' || c.connectionType === 'rss';
  const inactive = c.status === 'paused' || c.status === 'retired';
  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="tabular text-[13px] text-ink-faint">
            {c.key} · {c.provider}
          </p>
          <h3 className="text-base leading-snug text-ink">{c.name}</h3>
          <p className="mt-0.5 text-xs text-ink-muted">
            {CONNECTION_TYPE_LABEL[c.connectionType]}
            {c.support === 'adapter_boundary' ? ' · adapter boundary only in this build' : ''} ·{' '}
            {c.datasets.map((d) => DATASET_LABEL[d]).join(', ')} · {humanize(c.classification)}
            {c.sectorKey ? ` · ${SECTORS.find((s) => s.key === c.sectorKey)?.label}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <ConnectorStatusBadge value={c.status} />
          <ApprovalBadge value={c.source.approvalStatus} />
        </div>
      </div>
      <dl className="mt-2 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2 xl:grid-cols-4">
        <div>
          <dt className="inline text-ink-faint">Last success: </dt>
          <dd className="inline text-ink">{c.lastSuccessAt ? formatDateTime(c.lastSuccessAt) : 'Never'}</dd>
        </div>
        <div>
          <dt className="inline text-ink-faint">Runs: </dt>
          <dd className="inline text-ink">
            {c.runs.total}
            {c.runs.lastKey ? ` · last ${c.runs.lastKey}` : ''}
          </dd>
        </div>
        <div>
          <dt className="inline text-ink-faint">Schedule: </dt>
          <dd className="inline text-ink">{c.schedule ?? (remote ? 'Manual only' : 'On upload')}</dd>
        </div>
        <div>
          <dt className="inline text-ink-faint">Credential: </dt>
          <dd className="inline-flex items-center gap-1 text-ink">
            {c.authRef ? (
              <>
                <KeyRound className="h-3 w-3" aria-hidden /> {c.authRef} ·{' '}
                {c.credentialPresent ? 'set' : 'not set on server'}
              </>
            ) : (
              'None needed'
            )}
          </dd>
        </div>
      </dl>
      {c.lastError ? (
        <p
          className="mt-2 rounded-md border border-red/40 bg-red-soft px-3 py-2 text-xs text-red"
          role="note"
        >
          Last error {c.lastErrorAt ? `(${formatDateTime(c.lastErrorAt)})` : ''}: {c.lastError}
          {c.nextRetryAt ? ` Next retry after ${formatDateTime(c.nextRetryAt)}.` : ''}
        </p>
      ) : null}
      {admin && c.status !== 'retired' ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {c.source.approvalStatus === 'pending' ? (
            <Button size="sm" variant="primary" disabled={busy} onClick={() => approve.mutate()}>
              Approve source
            </Button>
          ) : null}
          <Button size="sm" disabled={busy || inactive} onClick={() => test.mutate()}>
            Test connection
          </Button>
          {remote ? (
            <Button size="sm" disabled={busy || inactive} onClick={() => sync.mutate()}>
              Sync now
            </Button>
          ) : null}
          {c.status === 'paused' ? (
            <Button size="sm" disabled={busy} onClick={() => status.mutate('configured')}>
              Resume
            </Button>
          ) : (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => status.mutate('paused')}>
              Pause
            </Button>
          )}
          <Button size="sm" variant="danger" disabled={busy} onClick={() => status.mutate('retired')}>
            Retire
          </Button>
        </div>
      ) : null}
      {note ? (
        <p className="mt-2 text-xs text-ink-muted" role="status">
          {note}
        </p>
      ) : null}
    </li>
  );
}

export function ConnectorsPanel({ ctx }: { ctx: AuthContext }) {
  const q = useQuery({ queryKey: ['connectors'], queryFn: api.connectors });
  const admin = ctx.principal.roles.includes('administrator');
  const [open, setOpen] = useState(false);
  return (
    <Panel aria-labelledby="connectors-heading">
      <PanelHeader
        id="connectors-heading"
        title="Connector registry"
        description="Every connector is read-only. A connector shows Connected only after an authenticated fetch has succeeded; sample and configured connectors are never live."
        action={
          admin ? (
            <Button size="sm" variant="primary" onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden /> Register connector
            </Button>
          ) : null
        }
      />
      {!admin ? (
        <p className="border-t border-line px-5 py-3 text-xs text-ink-muted">
          Only the Governance Administrator registers connectors, approves sources and runs imports.
        </p>
      ) : null}
      <LoadState isPending={q.isPending} error={q.error} />
      {q.data ? (
        q.data.length === 0 ? (
          <p className="border-t border-line px-5 py-4 text-sm text-ink-muted">
            No connectors you can see are registered.
          </p>
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {q.data.map((c) => (
              <ConnectorRow key={c.id} c={c} admin={admin} />
            ))}
          </ul>
        )
      ) : null}
      <RegisterConnector open={open} onClose={() => setOpen(false)} />
    </Panel>
  );
}
