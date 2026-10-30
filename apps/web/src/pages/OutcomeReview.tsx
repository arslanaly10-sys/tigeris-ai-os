/**
 * Expected-versus-observed outcome review (slice H, FR-31). For each figure a decision expected, a reviewer records
 * what was observed, with its source and date; the server computes the variance and whether the analysis held.
 * Every review is kept; the latest is shown first.
 */
import { OUTCOME_VERDICT_LABEL, type OutcomeFigure, type OutcomeVerdict } from '@tigeris/shared';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { CircleCheck, CircleSlash, CircleX } from 'lucide-react';
import { useId, useState } from 'react';
import { Link, useParams } from 'react-router';
import { LoadState, PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { api, ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useI18n } from '@/lib/i18n';

const VERDICT: Record<OutcomeVerdict, { short: string; icon: typeof CircleCheck; className: string }> = {
  held: {
    short: 'Analysis held',
    icon: CircleCheck,
    className: 'border-emerald/40 bg-emerald-soft text-emerald',
  },
  missed: { short: 'Analysis missed', icon: CircleX, className: 'border-red/40 bg-red-soft text-red' },
  not_comparable: {
    short: 'Not comparable',
    icon: CircleSlash,
    className: 'border-line-strong bg-raised text-ink-muted',
  },
};

export function VerdictBadge({ v }: { v: OutcomeVerdict }) {
  const s = VERDICT[v];
  const Icon = s.icon;
  return (
    <span
      title={OUTCOME_VERDICT_LABEL[v]}
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium ${s.className}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {s.short}
    </span>
  );
}

const field =
  'mt-1 block min-h-10 w-full rounded-md border border-line-strong bg-panel px-3 text-sm text-ink focus-visible:border-brand';

function ReviewForm({ memoryKey, f }: { memoryKey: string; f: OutcomeFigure }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const id = useId();
  const today = new Date().toISOString().slice(0, 10);
  const [observed, setObserved] = useState('');
  const [on, setOn] = useState(today);
  const [source, setSource] = useState('');
  const [url, setUrl] = useState('');
  const [notComparable, setNotComparable] = useState(false);
  const [note, setNote] = useState('');
  const m = useMutation({
    mutationFn: () =>
      api.reviewOutcome(memoryKey, {
        figureRef: f.ref,
        observedValue: Number(observed),
        observedOn: on,
        source,
        sourceUrl: url || undefined,
        notComparable,
        note,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries();
      setObserved('');
      setSource('');
      setUrl('');
      setNote('');
      setNotComparable(false);
    },
  });
  const valid =
    observed.trim() !== '' &&
    Number.isFinite(Number(observed)) &&
    source.trim().length >= 5 &&
    note.trim().length >= 10;
  return (
    <form
      className="grid gap-3 border-t border-line px-5 py-4 md:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) m.mutate();
      }}
    >
      <h3 className="text-base text-ink md:col-span-2">Record what was observed</h3>
      <label className="text-sm font-medium text-ink" htmlFor={`${id}-v`}>
        Observed value <span className="font-normal text-ink-faint">({f.unit || 'number'})</span>
        <input
          id={`${id}-v`}
          className={field}
          inputMode="decimal"
          value={observed}
          onChange={(e) => setObserved(e.target.value)}
        />
      </label>
      <label className="text-sm font-medium text-ink" htmlFor={`${id}-d`}>
        Observed on
        <input
          id={`${id}-d`}
          type="date"
          max={today}
          className={field}
          value={on}
          onChange={(e) => setOn(e.target.value)}
        />
      </label>
      <label className="text-sm font-medium text-ink" htmlFor={`${id}-s`}>
        Source <span className="font-normal text-ink-faint">(publisher and document)</span>
        <input id={`${id}-s`} className={field} value={source} onChange={(e) => setSource(e.target.value)} />
      </label>
      <label className="text-sm font-medium text-ink" htmlFor={`${id}-u`}>
        Source link <span className="font-normal text-ink-faint">(optional, https)</span>
        <input
          id={`${id}-u`}
          type="url"
          className={field}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </label>
      <label className="text-sm font-medium text-ink md:col-span-2" htmlFor={`${id}-n`}>
        Note{' '}
        <span className="font-normal text-ink-faint">(what the observation covers; kept on the record)</span>
        <textarea
          id={`${id}-n`}
          rows={2}
          className={`${field} py-2`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <label className="flex items-start gap-2 text-sm text-ink md:col-span-2">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 accent-[var(--color-brand)]"
          checked={notComparable}
          onChange={(e) => setNotComparable(e.target.checked)}
        />
        The observation does not measure what the scenario expected (record it as not comparable; the
        arithmetic is still shown).
      </label>
      {m.error ? (
        <p role="alert" className="text-sm text-red md:col-span-2">
          {m.error instanceof ApiError && m.error.code === 'observed_in_future'
            ? 'The observation date cannot be in the future.'
            : 'The review could not be recorded. Check the source link is https and try again.'}
        </p>
      ) : null}
      <div className="md:col-span-2">
        <Button type="submit" variant="primary" disabled={!valid || m.isPending}>
          {t('outcome.record')}
        </Button>
      </div>
    </form>
  );
}

function FigurePanel({
  memoryKey,
  f,
  canReview,
}: {
  memoryKey: string;
  f: OutcomeFigure;
  canReview: boolean;
}) {
  const [latest, ...older] = f.reviews;
  const hid = `fig-${f.ref.replace(/\W+/g, '-')}`;
  return (
    <Panel aria-labelledby={hid}>
      <PanelHeader
        id={hid}
        title={f.label}
        description={`Expected ${f.expected.display}, from scenario ${f.scenarioRunKey}.`}
      />
      <div className="border-t border-line px-5 py-4">
        {latest ? (
          <div className="space-y-1.5">
            <p className="flex flex-wrap items-center gap-2 text-sm text-ink">
              <VerdictBadge v={latest.verdict} />
              <span className="tabular">
                Observed <strong>{latest.observedDisplay}</strong> on {latest.observedOn} · variance{' '}
                {latest.varianceDisplay}
                {latest.variancePct !== null
                  ? ` (${latest.variancePct > 0 ? '+' : ''}${latest.variancePct}%)`
                  : ''}{' '}
                against the central estimate · {latest.withinRange ? 'inside' : 'outside'} the expected range
              </span>
            </p>
            <p className="text-sm text-ink-muted">
              Source: {latest.source}
              {latest.sourceUrl ? (
                <>
                  {' · '}
                  <a
                    href={latest.sourceUrl}
                    className="text-cyan underline underline-offset-2"
                    rel="noreferrer"
                  >
                    link
                  </a>
                </>
              ) : null}{' '}
              · entered by {latest.reviewer}, {formatDateTime(latest.createdAt)} · {latest.version}
            </p>
            <p className="text-sm text-ink">{latest.note}</p>
          </div>
        ) : (
          <p className="text-sm text-ink-muted">No observation recorded yet.</p>
        )}
        {older.length ? (
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer font-medium text-cyan">
              {older.length} earlier {older.length === 1 ? 'review' : 'reviews'}, kept unchanged
            </summary>
            <ul className="mt-2 space-y-1 text-ink-muted">
              {older.map((r) => (
                <li key={r.key}>
                  {r.key}: {r.observedDisplay} on {r.observedOn}, {VERDICT[r.verdict].short.toLowerCase()}, by{' '}
                  {r.reviewer} ({r.source})
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
      {canReview ? <ReviewForm memoryKey={memoryKey} f={f} /> : null}
    </Panel>
  );
}

export function OutcomeReviewPage() {
  const { key = '' } = useParams();
  const q = useQuery({ queryKey: ['outcomes', key], queryFn: () => api.outcomes(key) });
  if (q.error instanceof ApiError && q.error.status === 404)
    return (
      <div className="rounded-xl border border-line bg-panel px-5 py-10 text-center">
        <h1 className="text-2xl text-ink">Memory entry not found</h1>
        <Link to="/memory" className="mt-4 inline-block text-sm font-medium text-cyan underline">
          Back to institutional memory
        </Link>
      </div>
    );
  if (!q.data) return <LoadState isPending={q.isPending} error={q.error} />;
  const d = q.data;
  const s = d.summary;
  return (
    <>
      <Link to="/memory" className="mb-2 inline-flex text-sm text-cyan hover:underline">
        ← Institutional memory
      </Link>
      <PageHeader
        eyebrow={`Outcome review · ${d.memoryKey}`}
        title={d.title}
        description="What the scenario expected against what was observed. Variance and verdict are computed on the server from the recorded observation; a reviewer can only mark a figure not comparable."
        meta={
          <p className="tabular text-sm text-ink-muted">
            <Link to={`/cases/${d.caseKey}?tab=decision`} className="text-cyan underline underline-offset-2">
              {d.caseKey}
            </Link>{' '}
            · {s.reviewed} of {s.total} figures reviewed · {s.held} held · {s.missed} missed ·{' '}
            {s.notComparable} not comparable
          </p>
        }
      />
      {!d.canReview.allowed ? <p className="mb-4 text-sm text-ink-muted">{d.canReview.reason}</p> : null}
      {d.figures.length === 0 ? (
        <p className="text-sm text-ink-muted">This decision recorded no scenario figures to compare.</p>
      ) : (
        <div className="space-y-6">
          {d.figures.map((f) => (
            <FigurePanel key={f.ref} memoryKey={d.memoryKey} f={f} canReview={d.canReview.allowed} />
          ))}
        </div>
      )}
    </>
  );
}
