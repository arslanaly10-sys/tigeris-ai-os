/**
 * Validation tasking and desk roll-up (Phase 5E, FR-56): ask desks or people to confirm or dispute a finding by a due
 * date; answer with reasoning and assumptions; see every desk's answer side by side. Counts, never averages. Status
 * is words plus an icon, never colour alone.
 */
import {
  VALIDATION_SUBJECTS,
  VALIDATION_VERDICTS,
  VERDICT_LABEL,
  type ValidationAssumption,
  type ValidationRequestItem,
  type ValidationVerdict,
} from '@tigeris/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlarmClock,
  CheckCircle2,
  CircleDashed,
  CircleSlash,
  HelpCircle,
  Network,
  ShieldQuestion,
  XCircle,
} from 'lucide-react';
import { useId, useState } from 'react';
import { Link } from 'react-router';
import { LoadState } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/data';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { ApiError, api } from '@/lib/api';
import { formatRelative } from '@/lib/format';

const field =
  'mt-1 block min-h-10 w-full rounded-md border border-line-strong bg-panel px-3 text-sm text-ink focus-visible:border-brand';

const SUBJECT_LABEL = {
  case: 'Case',
  scenario_run: 'Scenario run',
  recommendation: 'Recommendation',
  intervention: 'Intervention',
} as const;

function StatePill({ r }: { r: ValidationRequestItem }) {
  if (r.state === 'answered' && r.verdict) {
    const [tone, Icon] =
      r.verdict === 'confirmed'
        ? (['ok', CheckCircle2] as const)
        : r.verdict === 'disputed'
          ? (['high', XCircle] as const)
          : (['medium', HelpCircle] as const);
    return (
      <StatusPill tone={tone}>
        <span className="inline-flex items-center gap-1">
          <Icon className="h-3.5 w-3.5" aria-hidden />
          {VERDICT_LABEL[r.verdict]}
        </span>
      </StatusPill>
    );
  }
  const [tone, Icon, label] =
    r.state === 'overdue'
      ? (['high', AlarmClock, `Overdue since ${r.dueOn}`] as const)
      : r.state === 'withdrawn'
        ? (['low', CircleSlash, 'Withdrawn'] as const)
        : (['awaiting', CircleDashed, `Due ${r.dueOn}`] as const);
  return (
    <StatusPill tone={tone}>
      <span className="inline-flex items-center gap-1">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {label}
      </span>
    </StatusPill>
  );
}

function Assumptions({ items }: { items: ValidationAssumption[] }) {
  if (!items.length) return <p className="mt-1 text-xs text-ink-muted">No assumptions stated.</p>;
  return (
    <ul className="mt-1 space-y-0.5 text-xs">
      {items.map((a, i) => (
        <li key={i}>
          <span className="font-medium text-ink">{a.label}:</span>{' '}
          <span className="tabular text-ink">{a.value}</span>{' '}
          <span className="text-ink-muted">({a.basis})</span>
        </li>
      ))}
    </ul>
  );
}

function AnswerForm({ r }: { r: ValidationRequestItem }) {
  const id = useId();
  const qc = useQueryClient();
  const [verdict, setVerdict] = useState<ValidationVerdict>('confirmed');
  const [response, setResponse] = useState('');
  const [a, setA] = useState({ label: '', value: '', basis: '' });
  const m = useMutation({
    mutationFn: () =>
      api.answerValidation(r.key, {
        verdict,
        response,
        assumptions: a.label && a.value && a.basis ? [a] : [],
      }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['validation'] }),
  });
  return (
    <form
      className="mt-3 grid gap-2 border-t border-line pt-3 md:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate();
      }}
    >
      <label className="text-sm font-medium text-ink" htmlFor={`${id}-v`}>
        Your answer
        <select
          id={`${id}-v`}
          className={field}
          value={verdict}
          onChange={(e) => setVerdict(e.target.value as ValidationVerdict)}
        >
          {VALIDATION_VERDICTS.map((v) => (
            <option key={v} value={v}>
              {VERDICT_LABEL[v]}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-medium text-ink md:col-span-2" htmlFor={`${id}-r`}>
        Reasoning (recorded)
        <input
          id={`${id}-r`}
          className={field}
          value={response}
          onChange={(e) => setResponse(e.target.value)}
        />
      </label>
      <label className="text-sm font-medium text-ink" htmlFor={`${id}-al`}>
        Assumption relied on (optional)
        <input
          id={`${id}-al`}
          className={field}
          value={a.label}
          onChange={(e) => setA({ ...a, label: e.target.value })}
        />
      </label>
      <label className="text-sm font-medium text-ink" htmlFor={`${id}-av`}>
        Value
        <input
          id={`${id}-av`}
          className={field}
          value={a.value}
          onChange={(e) => setA({ ...a, value: e.target.value })}
        />
      </label>
      <label className="text-sm font-medium text-ink" htmlFor={`${id}-ab`}>
        Basis
        <input
          id={`${id}-ab`}
          className={field}
          value={a.basis}
          onChange={(e) => setA({ ...a, basis: e.target.value })}
        />
      </label>
      {m.error ? (
        <p role="alert" className="text-sm text-red md:col-span-3">
          Give reasoning of at least 10 characters; an assumption needs a label, a value and a basis.
        </p>
      ) : null}
      <div className="md:col-span-3">
        <Button
          type="submit"
          size="sm"
          variant="primary"
          disabled={m.isPending || response.trim().length < 10}
        >
          Record answer
        </Button>
      </div>
    </form>
  );
}

function Withdraw({ r }: { r: ValidationRequestItem }) {
  const id = useId();
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const m = useMutation({
    mutationFn: () => api.withdrawValidation(r.key, reason),
    onSettled: () => qc.invalidateQueries({ queryKey: ['validation'] }),
  });
  return (
    <div className="mt-3 grid gap-2 border-t border-line pt-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      <label className="text-sm font-medium text-ink" htmlFor={`${id}-w`}>
        Reason for withdrawing (recorded)
        <input id={`${id}-w`} className={field} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <Button size="sm" disabled={m.isPending || reason.trim().length < 10} onClick={() => m.mutate()}>
        Withdraw
      </Button>
    </div>
  );
}

function RequestRow({ r }: { r: ValidationRequestItem }) {
  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatePill r={r} />
        <span className="tabular text-xs text-ink-faint">{r.key}</span>
        <span className="text-xs text-ink-muted">
          to {r.assignee.name} · from {r.requestedBy}
        </span>
      </div>
      <p className="mt-2 text-sm font-medium text-ink">{r.question}</p>
      <p className="mt-1 text-xs text-ink-muted">
        {r.caseKey ? (
          <Link className="text-brand underline-offset-2 hover:underline" to={`/cases/${r.caseKey}`}>
            {r.subjectLabel}
          </Link>
        ) : (
          r.subjectLabel
        )}{' '}
        · asked {formatRelative(r.createdAt)}
      </p>
      {r.state === 'answered' ? (
        <div className="mt-2 rounded-md border border-line bg-raised px-3 py-2">
          <p className="text-sm text-ink">{r.response}</p>
          <Assumptions items={r.assumptions} />
          <p className="mt-1 text-[12px] text-ink-faint">Answered by {r.answeredBy}</p>
        </div>
      ) : null}
      {r.withdrawnReason ? (
        <p className="mt-1 text-xs text-ink-muted">Withdrawn: {r.withdrawnReason}</p>
      ) : null}
      {r.canAnswer ? <AnswerForm r={r} /> : null}
      {r.canWithdraw ? <Withdraw r={r} /> : null}
    </li>
  );
}

function RequestForm() {
  const id = useId();
  const qc = useQueryClient();
  const desks = useQuery({ queryKey: ['desks'], queryFn: api.desks });
  const inAWeek = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  const [f, setF] = useState({
    subjectType: 'case' as (typeof VALIDATION_SUBJECTS)[number],
    subjectKey: '',
    question: '',
    dueOn: inAWeek,
  });
  const [chosen, setChosen] = useState<string[]>([]);
  const m = useMutation({
    mutationFn: () => api.requestValidation({ ...f, deskKeys: chosen }),
    onSuccess: async () => {
      setF({ ...f, subjectKey: '', question: '' });
      setChosen([]);
      await qc.invalidateQueries({ queryKey: ['validation'] });
    },
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF({ ...f, [k]: e.target.value });
  return (
    <Panel aria-labelledby="request-validation-heading">
      <PanelHeader
        id="request-validation-heading"
        icon={<ShieldQuestion className="h-4 w-4" aria-hidden />}
        title="Ask desks to validate a finding"
        description="Each desk answers separately, with its reasoning and the assumptions it relied on. You cannot answer your own request."
      />
      <form
        className="grid gap-3 border-t border-line px-5 py-4 md:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
      >
        <label className="text-sm font-medium text-ink" htmlFor={`${id}-t`}>
          Finding
          <select id={`${id}-t`} className={field} value={f.subjectType} onChange={set('subjectType')}>
            {VALIDATION_SUBJECTS.map((s) => (
              <option key={s} value={s}>
                {SUBJECT_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-ink" htmlFor={`${id}-k`}>
          Its key
          <input
            id={`${id}-k`}
            className={field}
            value={f.subjectKey}
            onChange={set('subjectKey')}
            placeholder="HMZ-2024-0413"
          />
        </label>
        <label className="text-sm font-medium text-ink" htmlFor={`${id}-d`}>
          Due on
          <input id={`${id}-d`} type="date" className={field} value={f.dueOn} onChange={set('dueOn')} />
        </label>
        <label className="text-sm font-medium text-ink md:col-span-3" htmlFor={`${id}-q`}>
          Question
          <input id={`${id}-q`} className={field} value={f.question} onChange={set('question')} />
        </label>
        <fieldset className="md:col-span-3">
          <legend className="text-sm font-medium text-ink">Desks</legend>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-2">
            {(desks.data ?? [])
              .filter((d) => d.kind !== 'executive')
              .map((d) => (
                <label key={d.key} className="inline-flex min-h-10 items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={chosen.includes(d.key)}
                    onChange={(e) =>
                      setChosen(e.target.checked ? [...chosen, d.key] : chosen.filter((k) => k !== d.key))
                    }
                  />
                  {d.name}
                </label>
              ))}
          </div>
        </fieldset>
        {m.error ? (
          <p role="alert" className="text-sm text-red md:col-span-3">
            {m.error instanceof ApiError && m.error.code === 'subject_not_found'
              ? 'No finding with that key that you may read.'
              : 'Choose at least one desk, a due date from today and a question of at least 10 characters.'}
          </p>
        ) : null}
        {m.isSuccess ? (
          <p role="status" className="text-sm text-emerald md:col-span-3">
            Sent as {m.data.batchKey}. Answers appear in the roll-up as each desk replies.
          </p>
        ) : null}
        <div className="md:col-span-3">
          <Button type="submit" variant="primary" disabled={m.isPending || !chosen.length}>
            Send for validation
          </Button>
        </div>
      </form>
    </Panel>
  );
}

export function ValidationView() {
  const [mine, setMine] = useState(true);
  const q = useQuery({ queryKey: ['validation', mine], queryFn: () => api.validation(mine) });
  const items = q.data?.requests ?? [];
  return (
    <div className="grid gap-6">
      <Panel aria-labelledby="validation-heading">
        <PanelHeader
          id="validation-heading"
          title="Validation requests"
          description={
            q.data
              ? `${items.filter((r) => r.state === 'open' || r.state === 'overdue').length} awaiting an answer · ${items.filter((r) => r.state === 'overdue').length} overdue`
              : undefined
          }
        />
        <div className="flex flex-wrap gap-1 border-t border-line px-5 py-3">
          {[
            [true, 'Mine and my desks'],
            [false, 'Everything I may read'],
          ].map(([v, label]) => (
            <Button
              key={String(v)}
              size="sm"
              variant={mine === v ? 'primary' : 'secondary'}
              aria-pressed={mine === v}
              onClick={() => setMine(v as boolean)}
            >
              {label as string}
            </Button>
          ))}
        </div>
        <LoadState isPending={q.isPending} error={q.error} />
        {q.data ? (
          items.length ? (
            <ul className="divide-y divide-line border-t border-line">
              {items.map((r) => (
                <RequestRow key={r.key} r={r} />
              ))}
            </ul>
          ) : (
            <p className="border-t border-line px-5 py-4 text-sm text-ink-muted">
              No validation requests{mine ? ' for you or your desks' : ''}.
            </p>
          )
        ) : null}
      </Panel>
      {q.data?.canRequest ? <RequestForm /> : null}
    </div>
  );
}

export function RollupView() {
  const desks = useQuery({ queryKey: ['desks'], queryFn: api.desks });
  const q = useQuery({ queryKey: ['validation', 'rollup'], queryFn: api.validationRollup });
  const committee = desks.data?.find((d) => d.kind === 'committee');
  return (
    <div className="grid gap-6">
      <Panel aria-labelledby="structure-heading">
        <PanelHeader
          id="structure-heading"
          icon={<Network className="h-4 w-4" aria-hidden />}
          title="Desks and committee"
          description="Asset-class desks answer for their books; the Investment Committee and the Executive Office see every answer with its assumptions."
        />
        <LoadState isPending={desks.isPending} error={desks.error} />
        <ul className="grid gap-px border-t border-line sm:grid-cols-2 lg:grid-cols-3">
          {(desks.data ?? []).map((d) => (
            <li key={d.key} className="px-5 py-3">
              <p className="text-sm font-medium text-ink">
                {d.name}
                <span className="ms-2 text-xs font-normal text-ink-faint">
                  {d.kind === 'desk'
                    ? `reports to ${committee?.name ?? 'the committee'}`
                    : d.kind === 'committee'
                      ? 'reports to the Executive Office'
                      : 'institution-wide'}
                </span>
              </p>
              <p className="text-xs text-ink-muted">{d.description}</p>
              <p className="mt-1 text-[12px] text-ink-faint">
                {d.members.length ? d.members.map((m) => m.name).join(', ') : 'No members yet'} ·{' '}
                {d.openRequests} open
              </p>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel aria-labelledby="rollup-heading">
        <PanelHeader
          id="rollup-heading"
          title="Desk roll-up"
          description="Each question with every desk's answer side by side. Counts only: desks answer from different books and assumptions, so nothing is averaged or decided by majority."
        />
        <LoadState isPending={q.isPending} error={q.error} />
        {q.data ? (
          q.data.length ? (
            <ul className="divide-y divide-line border-t border-line">
              {q.data.map((b) => (
                <li key={b.batchKey} className="px-5 py-4">
                  <p className="tabular text-xs text-ink-faint">
                    {b.batchKey} · due {b.dueOn} · from {b.requestedBy}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-ink">{b.question}</p>
                  <p className="text-xs text-ink-muted">{b.subjectLabel}</p>
                  <p className="mt-2 text-sm text-ink">{b.counts.summary}</p>
                  <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {b.requests.map((r) => (
                      <div key={r.key} className="rounded-md border border-line px-3 py-2">
                        <p className="flex flex-wrap items-center justify-between gap-2 text-sm font-medium text-ink">
                          {r.assignee.name}
                          <StatePill r={r} />
                        </p>
                        {r.response ? <p className="mt-1 text-sm text-ink">{r.response}</p> : null}
                        {r.state === 'answered' ? <Assumptions items={r.assumptions} /> : null}
                      </div>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="border-t border-line px-5 py-4 text-sm text-ink-muted">
              No validation requests yet.
            </p>
          )
        ) : null}
      </Panel>
    </div>
  );
}
