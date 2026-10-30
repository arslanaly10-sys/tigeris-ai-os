/**
 * Governance building blocks (Phase 4): recommendation, mandatory expert review, policy-checked decision,
 * manual handoff and institutional memory. Every status is words plus an icon, never colour alone.
 */
import type {
  CaseGovernance,
  DecisionItem,
  DecisionOutcome,
  ExpertReviewItem,
  HandoffItem,
  MemoryItem,
  PolicyEvaluation,
  PolicyResult,
  RecommendationItem,
  RecommendationStatus,
  ReviewVerdict,
} from '@tigeris/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Ban,
  CheckCircle2,
  Circle,
  CircleDot,
  Clock,
  Gavel,
  Library,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { MandateChecks } from '@/components/scenario/Drafts';
import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/data';
import { ApiError, api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/format';
import { ROLE_LABEL } from '@/lib/roles';

export const REC_STATUS: Record<
  RecommendationStatus,
  { label: string; tone: 'awaiting' | 'high' | 'medium' | 'ok' }
> = {
  in_review: { label: 'In expert review', tone: 'awaiting' },
  changes_requested: { label: 'Changes requested', tone: 'medium' },
  endorsed: { label: 'Endorsed · awaiting decision', tone: 'awaiting' },
  awaiting_second_approval: { label: 'Awaiting second approval', tone: 'awaiting' },
  approved: { label: 'Approved', tone: 'ok' },
  rejected: { label: 'Rejected', tone: 'high' },
  deferred: { label: 'Deferred', tone: 'medium' },
  evidence_requested: { label: 'Evidence requested', tone: 'medium' },
};

export const OUTCOME_LABEL: Record<DecisionOutcome, string> = {
  approve: 'Approve',
  reject: 'Reject',
  defer: 'Defer',
  request_evidence: 'Request evidence',
};

const OUTCOME_HELP: Record<DecisionOutcome, string> = {
  approve: 'Hand the action to the operations owner. Nothing is executed by TIGERIS.',
  reject: 'Close the case without action.',
  defer: 'Return the case to analysis and revisit later.',
  request_evidence: 'Return the case to analysis with a request for more evidence.',
};

export const VERDICT_LABEL: Record<ReviewVerdict, string> = {
  endorse: 'Endorse for decision',
  request_changes: 'Request changes',
};

export const HANDOFF_LABEL: Record<HandoffItem['status'], string> = {
  awaiting_acknowledgement: 'Awaiting acknowledgement',
  acknowledged: 'Acknowledged',
  in_progress: 'In progress',
  completed: 'Outcome recorded',
};

const RESULT: Record<PolicyResult, { label: string; icon: typeof Ban; cls: string }> = {
  pass: { label: 'Pass', icon: CheckCircle2, cls: 'border-emerald/60 bg-emerald-soft text-emerald' },
  hold: { label: 'Hold', icon: Clock, cls: 'border-amber/60 bg-amber-soft text-amber' },
  block: { label: 'Block', icon: Ban, cls: 'border-red/60 bg-red-soft text-red' },
};

export function RecStatusPill({ value }: { value: RecommendationStatus }) {
  return <StatusPill tone={REC_STATUS[value].tone}>{REC_STATUS[value].label}</StatusPill>;
}

export function PolicyResultBadge({ value, className }: { value: PolicyResult; className?: string }) {
  const r = RESULT[value];
  const Icon = r.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-0.5 text-[12px] font-semibold',
        r.cls,
        className,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {r.label}
    </span>
  );
}

/** The policy's reasons, in order, each with its own result. */
export function PolicyReasons({ evaluation }: { evaluation: Pick<PolicyEvaluation, 'reasons' | 'version'> }) {
  return (
    <div>
      <ul className="space-y-1.5">
        {evaluation.reasons.map((r) => {
          const Icon = RESULT[r.result].icon;
          return (
            <li key={r.code} className="flex items-start gap-2 text-sm">
              <Icon
                className={cn(
                  'mt-0.5 h-4 w-4 shrink-0',
                  r.result === 'pass' ? 'text-emerald' : r.result === 'hold' ? 'text-amber' : 'text-red',
                )}
                aria-label={RESULT[r.result].label}
              />
              <span className="text-ink">{r.text}</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-ink-faint">Checked by {evaluation.version}</p>
    </div>
  );
}

export function RationaleField({
  value,
  onChange,
  label = 'Rationale',
  hint = 'required, recorded in the audit trail',
  rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  hint?: string;
  rows?: number;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label} <span className="font-normal text-ink-faint">({hint})</span>
      </label>
      <textarea
        id={id}
        required
        minLength={10}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full rounded-lg border border-line-strong bg-panel px-3 py-2 text-sm text-ink focus:border-brand"
      />
      <p className="mt-1 text-xs text-ink-faint">At least 10 characters.</p>
    </div>
  );
}

function ErrorLine({ error, map }: { error: unknown; map?: Record<string, string> }) {
  if (!error) return null;
  const code = error instanceof ApiError ? error.code : '';
  return (
    <p role="alert" className="mt-2 text-sm text-red">
      {map?.[code] ?? 'This could not be recorded. Nothing was changed.'}
    </p>
  );
}

/** Mutations refresh every view that shows governance state. */
function useGovernanceMutation<T>(fn: () => Promise<T>, onDone?: (v: T) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (v) => {
      await qc.invalidateQueries();
      onDone?.(v);
    },
  });
}

// ───────────────────────────── Steps ─────────────────────────────

const STEPS = ['Recommendation', 'Expert review', 'Decision', 'Handoff', 'Memory'] as const;

function currentStep(g: CaseGovernance): number {
  if (g.memory) return 5;
  if (g.handoff) return 3;
  if (g.open?.status === 'endorsed' || g.open?.status === 'awaiting_second_approval') return 2;
  if (g.open?.status === 'in_review') return 1;
  return 0;
}

export function GovernanceSteps({ g }: { g: CaseGovernance }) {
  const at = currentStep(g);
  return (
    <ol
      className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-5"
      aria-label="Governance steps"
    >
      {STEPS.map((name, i) => {
        const state = i < at ? 'done' : i === at ? 'current' : 'next';
        const Icon = state === 'done' ? CheckCircle2 : state === 'current' ? CircleDot : Circle;
        return (
          <li
            key={name}
            aria-current={state === 'current' ? 'step' : undefined}
            className={cn(
              'flex items-center gap-2 bg-panel px-3 py-2.5 text-sm',
              state === 'current' && 'bg-brand-soft',
            )}
          >
            <Icon
              className={cn('h-4 w-4 shrink-0', state === 'next' ? 'text-ink-faint' : 'text-brand')}
              aria-hidden
            />
            <span
              className={cn(
                state === 'current'
                  ? 'font-semibold text-brand'
                  : state === 'done'
                    ? 'text-ink'
                    : 'text-ink-muted',
              )}
            >
              {name}
            </span>
            <span className="sr-only">
              {state === 'done' ? '(done)' : state === 'current' ? '(current)' : '(not started)'}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// ───────────────────────────── Recommendation ─────────────────────────────

function Person({ name, title }: { name: string; title: string }) {
  return (
    <>
      <span className="font-medium text-ink">{name}</span> <span className="text-ink-faint">· {title}</span>
    </>
  );
}

function ReviewEntry({ r }: { r: ExpertReviewItem }) {
  return (
    <li className="border-s-2 border-line-strong ps-3">
      <p className="text-sm">
        <span className="inline-flex items-center gap-1 font-medium text-ink">
          <ShieldCheck className="h-3.5 w-3.5 text-brand" aria-hidden /> {VERDICT_LABEL[r.verdict]}
        </span>{' '}
        <span className="text-ink-faint">· {formatDateTime(r.createdAt)}</span>
      </p>
      <p className="text-xs text-ink-muted">
        <Person name={r.reviewer.name} title={r.reviewer.title} />
      </p>
      <p className="mt-1 text-sm text-ink">{r.rationale}</p>
    </li>
  );
}

function DecisionEntry({ d }: { d: DecisionItem }) {
  return (
    <li className="border-s-2 border-line-strong ps-3">
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <span className="inline-flex items-center gap-1 font-medium text-ink">
          <Gavel className="h-3.5 w-3.5 text-gold-bright" aria-hidden /> {OUTCOME_LABEL[d.outcome]}
        </span>
        <PolicyResultBadge value={d.policyResult} />
        <span className="tabular text-xs text-ink-faint">
          {d.key} · {formatDateTime(d.createdAt)}
        </span>
      </p>
      <p className="text-xs text-ink-muted">
        <Person name={d.approver.name} title={d.approver.title} />
        {d.policyResult === 'hold' ? ' · first of two approvals' : ''}
      </p>
      <p className="mt-1 text-sm text-ink">{d.rationale}</p>
    </li>
  );
}

export function RecommendationCard({ rec, children }: { rec: RecommendationItem; children?: ReactNode }) {
  const a = rec.option.authority;
  return (
    <article aria-labelledby={`rec-${rec.key}`} className="rounded-xl border border-line bg-panel">
      <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4 pb-3">
        <div className="min-w-0">
          <p className="tabular text-[13px] text-ink-faint">
            {rec.key} · from{' '}
            <Link to={`/scenarios/${rec.scenarioRunKey}`} className="text-cyan underline underline-offset-2">
              {rec.scenarioRunKey}
            </Link>
          </p>
          <h3 id={`rec-${rec.key}`} className="text-lg leading-snug text-ink">
            {rec.option.title}
          </h3>
          <p className="text-xs font-semibold text-gold-bright">{rec.option.actionClass}</p>
        </div>
        <RecStatusPill value={rec.status} />
      </header>
      <div className="space-y-3 border-t border-line px-5 py-4">
        <p className="text-sm text-ink">{rec.rationale}</p>
        <p className="text-xs text-ink-muted">
          Recommended by <Person name={rec.createdBy.name} title={rec.createdBy.title} /> ·{' '}
          {formatDateTime(rec.createdAt)}
        </p>
        {a ? (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
            <span className="inline-flex items-center gap-1">
              <Gavel className="h-3.5 w-3.5 text-gold-bright" aria-hidden /> {ROLE_LABEL[a.requiredRole]} ·{' '}
              {a.thresholdText}
            </span>
            {a.twoPerson ? (
              <span className="inline-flex items-center gap-1">
                <Users className="h-3.5 w-3.5" aria-hidden /> Two-person approval
              </span>
            ) : null}
          </p>
        ) : null}
        <MandateChecks checks={rec.option.mandateChecks} />
      </div>
      {rec.reviews.length || rec.decisions.length ? (
        <div className="border-t border-line px-5 py-4">
          <h4 className="text-[13px] font-semibold text-ink">Record</h4>
          <ol className="mt-2 space-y-3">
            {rec.reviews.map((r) => (
              <ReviewEntry key={r.id} r={r} />
            ))}
            {rec.decisions.map((d) => (
              <DecisionEntry key={d.id} d={d} />
            ))}
          </ol>
        </div>
      ) : null}
      {children}
    </article>
  );
}

export function RecommendForm({ g }: { g: CaseGovernance }) {
  const [optionId, setOptionId] = useState(g.candidateOptions[0]?.id ?? '');
  const [rationale, setRationale] = useState('');
  const m = useGovernanceMutation(
    () => api.recommend(g.caseKey, optionId, rationale),
    () => setRationale(''),
  );
  const legend = useId();
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (rationale.trim().length >= 10 && optionId) m.mutate();
      }}
    >
      <fieldset aria-labelledby={legend}>
        <legend id={legend} className="text-sm font-medium text-ink">
          Option to recommend <span className="font-normal text-ink-faint">(from {g.latestRunKey})</span>
        </legend>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          {g.candidateOptions.map((o) => (
            <label
              key={o.id}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-gold',
                optionId === o.id
                  ? 'border-brand bg-brand-soft'
                  : 'border-line-strong bg-panel hover:bg-raised/60',
              )}
            >
              <input
                type="radio"
                name="option"
                value={o.id}
                checked={optionId === o.id}
                onChange={() => setOptionId(o.id)}
                className="mt-1 accent-brand focus-visible:outline-none"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink">
                  {o.rank}. {o.title}
                </span>
                <span className="block text-xs text-ink-muted">
                  {o.actionClass}
                  {o.authority ? ` · ${ROLE_LABEL[o.authority.requiredRole]}` : ''}
                  {o.authority?.twoPerson ? ' · two-person approval' : ''}
                  {o.magnitude ? ` · ${o.magnitude.value} ${o.magnitude.unit}` : ''}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <RationaleField value={rationale} onChange={setRationale} label="Why this option" />
      <ErrorLine
        error={m.error}
        map={{ not_recommendable: 'Another recommendation is already open for this case.' }}
      />
      <Button
        type="submit"
        variant="primary"
        disabled={rationale.trim().length < 10 || !optionId || m.isPending}
      >
        Route for expert review
      </Button>
    </form>
  );
}

export function ReviewForm({ rec }: { rec: RecommendationItem }) {
  const [verdict, setVerdict] = useState<ReviewVerdict>('endorse');
  const [rationale, setRationale] = useState('');
  const m = useGovernanceMutation(
    () => api.review(rec.key, verdict, rationale),
    () => setRationale(''),
  );
  const legend = useId();
  return (
    <form
      className="space-y-3 border-t border-line px-5 py-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (rationale.trim().length >= 10) m.mutate();
      }}
    >
      <h4 className="text-base text-ink">Your expert review</h4>
      <fieldset aria-labelledby={legend}>
        <legend id={legend} className="sr-only">
          Verdict
        </legend>
        <div className="flex flex-wrap gap-2">
          {(['endorse', 'request_changes'] as const).map((v) => (
            <Choice key={v} name="verdict" checked={verdict === v} onChange={() => setVerdict(v)}>
              {VERDICT_LABEL[v]}
            </Choice>
          ))}
        </div>
      </fieldset>
      <p className="text-xs text-ink-muted">
        {verdict === 'endorse'
          ? 'The case moves to a decision by the named authority.'
          : 'The case returns to analysis; the analyst can recommend again.'}
      </p>
      <RationaleField value={rationale} onChange={setRationale} />
      <ErrorLine error={m.error} />
      <Button type="submit" variant="primary" disabled={rationale.trim().length < 10 || m.isPending}>
        Record review
      </Button>
    </form>
  );
}

function Choice({
  name,
  checked,
  onChange,
  children,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  children: ReactNode;
}) {
  return (
    <label
      className={cn(
        'inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-gold',
        checked
          ? 'border-brand bg-brand-soft font-semibold text-brand'
          : 'border-line-strong bg-panel text-ink hover:bg-raised',
      )}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="accent-brand focus-visible:outline-none"
      />
      {children}
    </label>
  );
}

export function DecisionForm({
  rec,
  preview,
}: {
  rec: RecommendationItem;
  preview: Record<DecisionOutcome, PolicyEvaluation>;
}) {
  const [outcome, setOutcome] = useState<DecisionOutcome>('approve');
  const [rationale, setRationale] = useState('');
  const m = useGovernanceMutation(
    () => api.decide(rec.key, outcome, rationale),
    () => setRationale(''),
  );
  const evaluation = preview[outcome];
  const legend = useId();
  const blocked = evaluation.result === 'block';
  return (
    <form
      className="space-y-3 border-t border-line px-5 py-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!blocked && rationale.trim().length >= 10) m.mutate();
      }}
    >
      <h4 className="text-base text-ink">Your decision</h4>
      <fieldset aria-labelledby={legend}>
        <legend id={legend} className="sr-only">
          Outcome
        </legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(OUTCOME_LABEL) as DecisionOutcome[]).map((o) => (
            <Choice key={o} name="outcome" checked={outcome === o} onChange={() => setOutcome(o)}>
              {OUTCOME_LABEL[o]}
            </Choice>
          ))}
        </div>
      </fieldset>
      <p className="text-xs text-ink-muted">{OUTCOME_HELP[outcome]}</p>
      <section aria-label="Policy check" className="rounded-lg border border-line bg-raised/50 px-4 py-3">
        <p className="mb-2 flex items-center gap-2 text-sm font-medium text-ink">
          Policy check for you <PolicyResultBadge value={evaluation.result} />
        </p>
        <PolicyReasons evaluation={evaluation} />
      </section>
      {!blocked ? <RationaleField value={rationale} onChange={setRationale} /> : null}
      <ErrorLine
        error={m.error}
        map={{
          policy_blocked:
            'The policy blocked this decision. Nothing was recorded; the attempt is in the audit trail.',
        }}
      />
      <Button
        type="submit"
        variant="primary"
        disabled={blocked || rationale.trim().length < 10 || m.isPending}
      >
        {blocked
          ? 'Blocked by policy'
          : evaluation.result === 'hold'
            ? 'Record first approval'
            : `Record: ${OUTCOME_LABEL[outcome]}`}
      </Button>
    </form>
  );
}

// ───────────────────────────── Handoff ─────────────────────────────

const HANDOFF_ORDER: HandoffItem['status'][] = [
  'awaiting_acknowledgement',
  'acknowledged',
  'in_progress',
  'completed',
];

export function HandoffCard({
  h,
  canAct,
  showCase = false,
}: {
  h: HandoffItem;
  canAct: boolean;
  showCase?: boolean;
}) {
  const at = HANDOFF_ORDER.indexOf(h.status);
  const [note, setNote] = useState('');
  const [outcome, setOutcome] = useState('');
  const [lesson, setLesson] = useState('');
  const ack = useGovernanceMutation(() => api.handoffAction(h.key, { action: 'acknowledge' }));
  const start = useGovernanceMutation(() =>
    api.handoffAction(h.key, { action: 'start', note: note || undefined }),
  );
  const record = useGovernanceMutation(() =>
    api.handoffAction(h.key, { action: 'record_outcome', outcome, lesson }),
  );
  const noteId = useId();
  return (
    <article aria-labelledby={`ho-${h.key}`} className="rounded-xl border border-line bg-panel">
      <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4 pb-3">
        <div className="min-w-0">
          <p className="tabular text-[13px] text-ink-faint">
            {h.key} · {h.decisionKey}
            {showCase ? (
              <>
                {' · '}
                <Link to={`/cases/${h.caseKey}`} className="text-cyan underline underline-offset-2">
                  {h.caseKey}
                </Link>
              </>
            ) : null}
          </p>
          <h3 id={`ho-${h.key}`} className="text-lg leading-snug text-ink">
            {showCase ? h.caseTitle : 'Manual handoff'}
          </h3>
          <p className="text-xs font-semibold text-gold-bright">{h.actionClass} · Operations Owner</p>
        </div>
        <StatusPill tone={h.status === 'completed' ? 'ok' : 'awaiting'}>{HANDOFF_LABEL[h.status]}</StatusPill>
      </header>
      <div className="space-y-3 border-t border-line px-5 py-4">
        <p className="text-sm text-ink">{h.scope}</p>
        <ol className="grid gap-2 sm:grid-cols-3">
          {[
            { name: 'Acknowledged', who: h.acknowledgedBy, at: h.acknowledgedAt, done: at >= 1 },
            { name: 'Started', who: h.startedBy, at: h.startedAt, done: at >= 2, note: h.statusNote },
            { name: 'Outcome recorded', who: h.completedBy, at: h.completedAt, done: at >= 3 },
          ].map((s) => (
            <li key={s.name} className="border-s-2 border-line-strong py-0.5 ps-3 text-sm">
              <span className="inline-flex items-center gap-1.5 font-medium text-ink">
                {s.done ? (
                  <CheckCircle2 className="h-4 w-4 text-brand" aria-hidden />
                ) : (
                  <Circle className="h-4 w-4 text-ink-faint" aria-hidden />
                )}
                {s.name}
                <span className="sr-only">{s.done ? '(done)' : '(not yet)'}</span>
              </span>
              <span className="block text-xs text-ink-muted">
                {s.done && s.who ? `${s.who.name} · ${formatDateTime(s.at)}` : 'Not yet'}
              </span>
              {s.note ? <span className="block text-xs text-ink-muted">{s.note}</span> : null}
            </li>
          ))}
        </ol>
        {h.outcomeText ? (
          <p className="text-sm text-ink">
            <span className="font-medium">Outcome:</span> {h.outcomeText}
          </p>
        ) : null}
      </div>
      {canAct && h.status !== 'completed' ? (
        <div className="space-y-3 border-t border-line px-5 py-4">
          {h.status === 'awaiting_acknowledgement' ? (
            <>
              <p className="text-sm text-ink-muted">Acknowledge that you own this handoff and its scope.</p>
              <ErrorLine error={ack.error} />
              <Button variant="primary" disabled={ack.isPending} onClick={() => ack.mutate()}>
                Acknowledge handoff
              </Button>
            </>
          ) : null}
          {h.status === 'acknowledged' ? (
            <>
              <div>
                <label htmlFor={noteId} className="text-sm font-medium text-ink">
                  Status note <span className="font-normal text-ink-faint">(optional)</span>
                </label>
                <input
                  id={noteId}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="mt-1.5 h-10 w-full rounded-lg border border-line-strong bg-panel px-3 text-sm text-ink focus:border-brand"
                />
              </div>
              <ErrorLine error={start.error} />
              <Button variant="primary" disabled={start.isPending} onClick={() => start.mutate()}>
                Mark as started
              </Button>
            </>
          ) : null}
          {h.status === 'in_progress' ? (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (outcome.trim().length >= 10 && lesson.trim().length >= 10) record.mutate();
              }}
            >
              <RationaleField value={outcome} onChange={setOutcome} label="What happened" hint="required" />
              <RationaleField
                value={lesson}
                onChange={setLesson}
                label="Lesson for institutional memory"
                hint="required, kept as precedent"
                rows={2}
              />
              <ErrorLine error={record.error} />
              <Button
                type="submit"
                variant="primary"
                disabled={outcome.trim().length < 10 || lesson.trim().length < 10 || record.isPending}
              >
                Record outcome and close
              </Button>
            </form>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

// ───────────────────────────── Memory ─────────────────────────────

export function MemoryCard({ m, showCase = true }: { m: MemoryItem; showCase?: boolean }) {
  return (
    <article aria-labelledby={`mem-${m.key}`} className="rounded-xl border border-line bg-panel">
      <header className="px-5 pt-4 pb-3">
        <p className="tabular flex flex-wrap items-center gap-x-1.5 text-[13px] text-ink-faint">
          <Library className="h-3.5 w-3.5 text-gold-bright" aria-hidden />
          {m.key} · {formatDateTime(m.createdAt)}
          {showCase ? (
            <>
              {' · '}
              <Link to={`/cases/${m.caseKey}`} className="text-cyan underline underline-offset-2">
                {m.caseKey}
              </Link>
            </>
          ) : null}
        </p>
        <h3 id={`mem-${m.key}`} className="text-lg leading-snug text-ink">
          {m.title}
        </h3>
        <p className="text-xs font-semibold text-gold-bright">{m.actionClass}</p>
      </header>
      <dl className="grid gap-4 border-t border-line px-5 py-4 md:grid-cols-2">
        <div>
          <dt className="text-[13px] font-semibold text-ink">What the scenario expected</dt>
          <dd>
            {m.expected.length ? (
              <ul className="mt-1 space-y-1">
                {m.expected.map((e) => (
                  <li key={e.ref} className="text-sm">
                    <span className="text-ink-muted">{e.label}:</span>{' '}
                    <span className="tabular font-medium text-ink">{e.display}</span>
                  </li>
                ))}
                <li className="text-xs text-ink-faint">
                  Modelled in{' '}
                  <Link
                    to={`/scenarios/${m.expected[0]!.scenarioRunKey}`}
                    className="text-cyan underline underline-offset-2"
                  >
                    {m.expected[0]!.scenarioRunKey}
                  </Link>{' '}
                  (illustrative scenario, central with range)
                </li>
              </ul>
            ) : (
              <p className="mt-1 text-sm text-ink-muted">Scenario figures not captured.</p>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-[13px] font-semibold text-ink">What happened</dt>
          <dd className="mt-1 text-sm text-ink">{m.outcome}</dd>
        </div>
        <div>
          <dt className="text-[13px] font-semibold text-ink">Lesson</dt>
          <dd className="mt-1 text-sm text-ink">{m.lesson}</dd>
        </div>
        <div>
          <dt className="text-[13px] font-semibold text-ink">Decided by</dt>
          <dd className="mt-1 space-y-0.5 text-sm text-ink">
            {m.approvedBy.map((a) => (
              <span key={a.name + a.at} className="block">
                {a.name} <span className="text-ink-faint">· {a.title}</span>
              </span>
            ))}
            <span className="block text-xs text-ink-muted">Outcome recorded by {m.recordedBy.name}</span>
          </dd>
        </div>
      </dl>
    </article>
  );
}
