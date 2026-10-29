import {
  SIGNAL_TYPES,
  type SignalAction,
  type SignalDetail,
  type SignalSummary,
  type SignalType,
} from '@tigeris/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, ExternalLink, FolderOpen } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { LineageDrawer, type LineageTarget } from '@/components/LineageDrawer';
import { SectorSubnav } from '@/components/layout/SectorSubnav';
import { LoadState, PageHeader } from '@/components/PageHeader';
import {
  ConfidenceBandMeter,
  DataModeBadge,
  DispositionBadge,
  SIGNAL_TYPE,
  SignalTypeTile,
  SourceClassBadge,
  UrgencyBadge,
  ValidationBadge,
} from '@/components/truth/badges';
import { Button } from '@/components/ui/button';
import { DURATION, EASE_OUT, FadeSwap, INDICATOR_SPRING } from '@/components/ui/motion';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { Modal } from '@/components/ui/sheet';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDateTime, formatRelative } from '@/lib/format';

const ACTION_LABEL: Record<SignalAction, string> = {
  corroborate: 'Corroborate',
  challenge: 'Challenge',
  monitor: 'Monitor',
  dismiss: 'Dismiss',
  open_case: 'Open case',
};

const ACTION_HELP: Record<SignalAction, string> = {
  corroborate: 'Record that an independent source supports this signal.',
  challenge: 'Record an objection; the signal stays under monitoring with your challenge on file.',
  monitor: 'Keep watching without escalating.',
  dismiss: 'Close the signal as not relevant. The record and your rationale are kept.',
  open_case: 'Promote the signal to an intelligence case with its evidence attached.',
};

function SignalRow({ s, selected, onSelect }: { s: SignalSummary; selected: boolean; onSelect: () => void }) {
  return (
    <motion.tr
      layout="position"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: DURATION.fast } }}
      transition={{ duration: DURATION.base, ease: EASE_OUT }}
      aria-selected={selected}
      className={cn(
        'cursor-pointer border-s-2 transition-colors',
        selected ? 'border-gold bg-gold/[0.06]' : 'border-transparent hover:bg-raised/50',
      )}
      onClick={onSelect}
    >
      <td className="py-3 ps-4 pe-3">
        <div className="flex items-start gap-3">
          <SignalTypeTile value={s.signalType} />
          <div className="min-w-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelect();
              }}
              className="text-start text-sm leading-snug font-semibold text-ink hover:underline"
            >
              {s.title}
            </button>
            <p className="mt-0.5 line-clamp-2 text-xs text-ink-muted">{s.summary}</p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              <DispositionBadge value={s.disposition} />
              <DataModeBadge value={s.dataMode} />
            </div>
          </div>
        </div>
      </td>
      <td className="px-3 py-3 text-xs text-ink-muted">
        {s.primarySource ? (
          <>
            <SourceClassBadge value={s.primarySource.sourceClass} />
            <span className="mt-1 block">{s.primarySource.publisher}</span>
          </>
        ) : (
          '—'
        )}
      </td>
      <td className="tabular px-3 py-3 text-xs text-ink">
        <span className="block">{formatDateTime(s.eventTime)}</span>
        <span className="block text-ink-faint">Retrieved {formatDateTime(s.retrievedAt)}</span>
      </td>
      <td className="px-3 py-3 text-xs text-ink-muted">
        {s.retrievedAt ? formatRelative(s.retrievedAt) : '—'}
      </td>
      <td className="px-3 py-3">
        {s.validationStatus ? <ValidationBadge value={s.validationStatus} /> : null}
      </td>
      <td className="pe-4 text-ink-faint">
        <ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
      </td>
    </motion.tr>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] gap-3 py-1.5 text-sm">
      <dt className="text-ink-faint">{label}</dt>
      <dd className="min-w-0 text-ink">{children}</dd>
    </div>
  );
}

function TriageDialog({
  signal,
  action,
  onClose,
}: {
  signal: SignalDetail;
  action: SignalAction | null;
  onClose: () => void;
}) {
  const [rationale, setRationale] = useState('');
  const qc = useQueryClient();
  const navigate = useNavigate();
  const m = useMutation({
    mutationFn: () => api.triage(signal.key, action!, rationale),
    onSuccess: async (res) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['signals'] }),
        qc.invalidateQueries({ queryKey: ['signal', signal.key] }),
        qc.invalidateQueries({ queryKey: ['command-centre'] }),
        qc.invalidateQueries({ queryKey: ['cases'] }),
      ]);
      setRationale('');
      onClose();
      if (res.caseKey) navigate(`/cases/${res.caseKey}`);
    },
  });
  return (
    <Modal
      open={action !== null}
      onOpenChange={(o) => {
        if (!o) {
          setRationale('');
          m.reset();
          onClose();
        }
      }}
      title={action ? `${ACTION_LABEL[action]}: ${signal.key}` : ''}
      description={action ? ACTION_HELP[action] : undefined}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (rationale.trim().length >= 3) m.mutate();
        }}
      >
        <label htmlFor="rationale" className="text-sm font-medium text-ink">
          Rationale <span className="text-ink-faint">(required, recorded in the audit trail)</span>
        </label>
        <textarea
          id="rationale"
          required
          minLength={3}
          rows={4}
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-line-strong bg-panel px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none"
        />
        {m.isError ? (
          <p role="alert" className="mt-2 text-sm text-red">
            {m.error instanceof ApiError && m.error.status === 409
              ? 'This signal has already been settled by someone else.'
              : 'The action could not be recorded.'}
          </p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              setRationale('');
              onClose();
            }}
          >
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={rationale.trim().length < 3 || m.isPending}>
            Record {action ? ACTION_LABEL[action].toLowerCase() : ''}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function SignalDetailPanel({ signalKey }: { signalKey: string }) {
  const q = useQuery({ queryKey: ['signal', signalKey], queryFn: () => api.signal(signalKey) });
  const [action, setAction] = useState<SignalAction | null>(null);
  const [lineage, setLineage] = useState<LineageTarget | null>(null);
  if (!q.data) return <LoadState isPending={q.isPending} error={q.error} />;
  const s = q.data;
  const primary = s.evidence[0];
  return (
    <Panel aria-labelledby="signal-detail-heading">
      <PanelHeader
        id="signal-detail-heading"
        title="Evidence"
        description="Source material, metadata and triage history for the selected signal."
        action={
          s.caseKey ? (
            <Link
              to={`/cases/${s.caseKey}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-cyan/60 bg-cyan-soft px-3 py-1.5 text-sm font-medium text-cyan"
            >
              <FolderOpen className="h-4 w-4" aria-hidden /> Open {s.caseKey}
            </Link>
          ) : null
        }
      />
      <div className="border-t border-line px-5 py-4">
        <div className="flex items-start gap-3">
          <SignalTypeTile value={s.signalType} className="h-14 w-14" />
          <div className="min-w-0">
            <h3 className="text-lg leading-snug text-ink">{s.title}</h3>
            <p className="mt-1 text-sm text-ink-muted">{s.summary}</p>
          </div>
        </div>
        <dl className="mt-4 divide-y divide-line/70">
          <Meta label="Publisher">
            {s.primarySource ? (
              <span className="inline-flex flex-wrap items-center gap-1.5">
                {s.primarySource.publisher}
                {s.primarySource.url ? (
                  <a
                    href={s.primarySource.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-cyan"
                    aria-label={`Open ${s.primarySource.publisher} source (opens in a new tab)`}
                  >
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  </a>
                ) : null}
              </span>
            ) : (
              '—'
            )}
          </Meta>
          <Meta label="Event time">{formatDateTime(s.eventTime)}</Meta>
          <Meta label="Retrieval time">{formatDateTime(s.retrievedAt)}</Meta>
          <Meta label="Freshness">{s.retrievedAt ? formatRelative(s.retrievedAt) : '—'}</Meta>
          <Meta label="Source type">
            {s.primarySource ? <SourceClassBadge value={s.primarySource.sourceClass} /> : '—'}
          </Meta>
          <Meta label="Source status">
            {s.validationStatus ? <ValidationBadge value={s.validationStatus} /> : '—'}
          </Meta>
          <Meta label="Location">{s.locationLabel ?? '—'}</Meta>
          <Meta label="Urgency">
            <UrgencyBadge value={s.urgency} />
          </Meta>
          <Meta label="Confidence">
            <ConfidenceBandMeter band={s.confidenceBand} />
          </Meta>
        </dl>
        {primary ? (
          <button
            type="button"
            onClick={() => setLineage({ evidenceId: primary.id, fact: null })}
            className="mt-3 w-full rounded-lg border border-line-strong px-3 py-2 text-sm font-medium text-ink hover:border-gold/60"
          >
            View full record lineage
          </button>
        ) : null}
      </div>

      <div className="border-t border-line px-5 py-4">
        <h3 className="text-xs font-semibold text-ink-faint">Triage</h3>
        {s.allowedActions.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">
            {s.disposition === 'dismissed' || s.disposition === 'case_opened'
              ? 'This signal is settled. Its history is kept below.'
              : 'Your role cannot triage this signal.'}
          </p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {s.allowedActions.map((a) => (
              <Button
                key={a}
                size="sm"
                variant={a === 'open_case' ? 'primary' : a === 'dismiss' ? 'danger' : 'secondary'}
                onClick={() => setAction(a)}
              >
                {ACTION_LABEL[a]}
              </Button>
            ))}
          </div>
        )}
        {s.events.length > 0 ? (
          <ol className="mt-4 space-y-2">
            {s.events.map((e) => (
              <li key={e.id} className="rounded-lg border border-line bg-raised/40 px-3 py-2 text-sm">
                <p className="text-ink">
                  <span className="font-semibold">{ACTION_LABEL[e.action]}</span> by {e.actor}
                  <span className="text-ink-faint"> · {formatDateTime(e.occurredAt)}</span>
                </p>
                <p className="text-ink-muted">{e.rationale}</p>
              </li>
            ))}
          </ol>
        ) : null}
      </div>
      <TriageDialog signal={s} action={action} onClose={() => setAction(null)} />
      <LineageDrawer target={lineage} onClose={() => setLineage(null)} />
    </Panel>
  );
}

export function SignalReviewPage() {
  const q = useQuery({ queryKey: ['signals'], queryFn: api.signals });
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<SignalType | 'all'>('all');
  const list = q.data ?? [];
  const shown = filter === 'all' ? list : list.filter((s) => s.signalType === filter);
  const selected = params.get('selected') ?? shown[0]?.key ?? null;
  const select = (key: string) => setParams({ selected: key }, { replace: true });

  return (
    <>
      <SectorSubnav />
      <PageHeader
        title="Signal Review"
        description="Signals for analyst triage. Inspect source and freshness, then corroborate, challenge, monitor, dismiss or open a case. Every action needs a rationale."
      />
      <LoadState isPending={q.isPending} error={q.error} />
      {q.data ? (
        <>
          <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter by signal type">
            {(['all', ...SIGNAL_TYPES] as const).map((t) => {
              const count = t === 'all' ? list.length : list.filter((s) => s.signalType === t).length;
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={filter === t}
                  onClick={() => setFilter(t)}
                  className={cn(
                    'relative rounded-lg border px-3 py-1.5 text-sm transition-colors',
                    filter === t
                      ? 'border-gold/70 text-ink'
                      : 'border-line-strong text-ink-muted hover:text-ink',
                  )}
                >
                  {filter === t ? (
                    <motion.span
                      layoutId="signal-filter-active"
                      className="absolute inset-0 rounded-[7px] bg-gold-soft"
                      transition={INDICATOR_SPRING}
                      aria-hidden
                    />
                  ) : null}
                  <span className="relative">{t === 'all' ? 'All signals' : SIGNAL_TYPE[t].label}</span>
                  <span className="tabular relative ms-2 rounded bg-raised px-1.5 text-xs text-ink-muted">
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_28rem]">
            <Panel className="overflow-x-auto">
              <table className="w-full min-w-[46rem] text-sm">
                <caption className="sr-only">
                  Signals awaiting or past triage. Select a row to review its evidence.
                </caption>
                <thead>
                  <tr className="border-b border-line text-xs text-ink-faint">
                    <th scope="col" className="py-3 ps-4 pe-3 text-start font-medium">
                      Signal
                    </th>
                    <th scope="col" className="px-3 py-3 text-start font-medium">
                      Source
                    </th>
                    <th scope="col" className="px-3 py-3 text-start font-medium">
                      Event time (UTC)
                    </th>
                    <th scope="col" className="px-3 py-3 text-start font-medium">
                      Freshness
                    </th>
                    <th scope="col" className="px-3 py-3 text-start font-medium">
                      Status
                    </th>
                    <th scope="col" className="pe-4">
                      <span className="sr-only">Open</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  <AnimatePresence initial={false}>
                    {shown.map((s) => (
                      <SignalRow
                        key={s.id}
                        s={s}
                        selected={s.key === selected}
                        onSelect={() => select(s.key)}
                      />
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </Panel>
            <AnimatePresence mode="wait" initial={false}>
              {selected ? (
                <FadeSwap key={selected} className="min-w-0">
                  <SignalDetailPanel signalKey={selected} />
                </FadeSwap>
              ) : null}
            </AnimatePresence>
          </div>
        </>
      ) : null}
    </>
  );
}
