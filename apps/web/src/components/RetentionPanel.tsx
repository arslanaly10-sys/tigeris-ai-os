/**
 * Data retention (D-126) on Audit & Administration. Shows each purgeable data class, its period and how many rows a
 * purge would remove now. The administrator sets periods and runs a purge, each with a reason; the Auditor reads.
 */
import type { RetentionClass, RetentionPolicyItem } from '@tigeris/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive } from 'lucide-react';
import { useId, useState } from 'react';
import { LoadState } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { api } from '@/lib/api';
import { formatDateTime, humanize } from '@/lib/format';

const field =
  'mt-1 block min-h-10 w-full rounded-md border border-line-strong bg-panel px-3 text-sm text-ink focus-visible:border-brand';

function PolicyForm({ p }: { p: RetentionPolicyItem }) {
  const qc = useQueryClient();
  const id = useId();
  const [days, setDays] = useState(String(p.keepDays ?? 365));
  const [reason, setReason] = useState('');
  const m = useMutation({
    mutationFn: () => api.setRetention(p.dataClass, { keepDays: Number(days), reason }),
    onSuccess: async () => {
      setReason('');
      await qc.invalidateQueries({ queryKey: ['retention'] });
    },
  });
  const n = Number(days);
  const valid = Number.isInteger(n) && n >= 30 && n <= 3650 && reason.trim().length >= 10;
  return (
    <form
      className="mt-3 grid gap-3 sm:grid-cols-[8rem_1fr_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) m.mutate();
      }}
    >
      <label className="text-sm font-medium text-ink" htmlFor={`${id}-d`}>
        Keep (days)
        <input
          id={`${id}-d`}
          className={field}
          inputMode="numeric"
          value={days}
          onChange={(e) => setDays(e.target.value)}
        />
      </label>
      <label className="text-sm font-medium text-ink" htmlFor={`${id}-r`}>
        Reason <span className="font-normal text-ink-faint">(recorded in the audit trail)</span>
        <input id={`${id}-r`} className={field} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <Button type="submit" disabled={!valid || m.isPending}>
        Set period<span className="sr-only"> for {humanize(p.dataClass)}</span>
      </Button>
      {m.error ? (
        <p role="alert" className="text-sm text-red sm:col-span-3">
          The period could not be set. Use 30 to 3650 days and a reason of ten characters or more.
        </p>
      ) : null}
    </form>
  );
}

export function RetentionPanel() {
  const qc = useQueryClient();
  const id = useId();
  const q = useQuery({ queryKey: ['retention'], queryFn: api.retention });
  const [reason, setReason] = useState('');
  const purge = useMutation({
    mutationFn: () => api.purgeRetention(reason),
    onSuccess: async () => {
      setReason('');
      await qc.invalidateQueries({ queryKey: ['retention'] });
    },
  });
  if (!q.data) return <LoadState isPending={q.isPending} error={q.error} />;
  const d = q.data;
  const anyPolicy = d.policies.some((p) => p.keepDays !== null);
  const purged = purge.data?.purged as Partial<Record<RetentionClass, number>> | undefined;
  return (
    <Panel aria-labelledby="retention-heading">
      <PanelHeader
        id="retention-heading"
        icon={<Archive className="h-4 w-4" aria-hidden />}
        title="Data retention"
        description={`Nothing is purged until an administrator sets a period and runs a purge. ${d.note}`}
      />
      <ul className="divide-y divide-line border-t border-line">
        {d.policies.map((p) => (
          <li key={p.dataClass} className="px-5 py-4 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-medium text-ink">{humanize(p.dataClass)}</h3>
              <span className="text-ink-muted">
                {p.keepDays === null ? (
                  'No period set: kept indefinitely'
                ) : (
                  <>
                    Kept <span className="tabular text-ink">{p.keepDays}</span> days ·{' '}
                    <span className="tabular text-ink">{p.eligibleNow}</span> past it now
                  </>
                )}
              </span>
            </div>
            <p className="mt-1 text-ink-muted">{p.description}</p>
            {p.reason && p.setAt ? (
              <p className="mt-1 text-xs text-ink-faint">
                Set {formatDateTime(p.setAt)}: {p.reason}
              </p>
            ) : null}
            {d.canManage ? <PolicyForm p={p} /> : null}
          </li>
        ))}
      </ul>
      {d.canManage ? (
        <form
          className="grid gap-3 border-t border-line px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (reason.trim().length >= 10) purge.mutate();
          }}
        >
          <label className="text-sm font-medium text-ink" htmlFor={`${id}-why`}>
            Reason for purging <span className="font-normal text-ink-faint">(recorded with the counts)</span>
            <input
              id={`${id}-why`}
              className={field}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <Button
            type="submit"
            variant="primary"
            disabled={!anyPolicy || reason.trim().length < 10 || purge.isPending}
          >
            Purge past their period
          </Button>
          {purged ? (
            <p role="status" className="text-sm text-emerald sm:col-span-2">
              Purged {purged.import_row_issues ?? 0} import row issues and {purged.closed_interventions ?? 0}{' '}
              closed interventions. The purge is in the audit trail.
            </p>
          ) : null}
          {purge.error ? (
            <p role="alert" className="text-sm text-red sm:col-span-2">
              The purge did not run. Nothing was removed.
            </p>
          ) : null}
        </form>
      ) : null}
    </Panel>
  );
}
