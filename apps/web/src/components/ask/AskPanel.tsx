/**
 * Ask TIGERIS (Phase 5G, FR-58): questions answered only from records the reader may read, each statement cited.
 * Retrieval is deterministic and no model is called; the panel says so.
 */
import type { NotificationChannel } from '@tigeris/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { BellRing, CheckCircle2, CircleOff, MessageSquareText, Radio } from 'lucide-react';
import { useId, useState } from 'react';
import { Link } from 'react-router';
import { LoadState } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/data';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { api } from '@/lib/api';
import { formatRelative } from '@/lib/format';

const field =
  'mt-1 block min-h-10 w-full rounded-md border border-line-strong bg-panel px-3 text-sm text-ink focus-visible:border-brand';

export function AskPanel() {
  const id = useId();
  const [question, setQuestion] = useState('');
  const m = useMutation({ mutationFn: () => api.ask(question) });
  return (
    <Panel aria-labelledby="ask-heading">
      <PanelHeader
        id="ask-heading"
        icon={<MessageSquareText className="h-4 w-4" aria-hidden />}
        title="Ask TIGERIS"
        description="Answers come only from records you may read (cases, institutional memory, evidence, signals and approved definitions), each one cited. No model is called and nothing is guessed."
      />
      <form
        className="flex flex-col gap-3 border-t border-line px-5 py-4 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
      >
        <label className="grow text-sm font-medium text-ink" htmlFor={`${id}-q`}>
          Your question
          <input
            id={`${id}-q`}
            className={field}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="What did we learn about deferring commitments?"
          />
        </label>
        <Button type="submit" variant="primary" disabled={m.isPending || question.trim().length < 3}>
          Ask
        </Button>
      </form>
      {m.error ? (
        <p role="alert" className="border-t border-line px-5 py-3 text-sm text-red">
          Not answered. Try again.
        </p>
      ) : null}
      {m.data ? (
        <div className="border-t border-line px-5 py-4" aria-live="polite">
          <p className="text-sm text-ink">
            {m.data.citations.length
              ? `${m.data.citations.length} record${m.data.citations.length === 1 ? '' : 's'} you may read match this question.`
              : m.data.answer}
          </p>
          {m.data.citations.length ? (
            <ol className="mt-3 space-y-2">
              {m.data.citations.map((c, i) => (
                <li key={`${c.kind}-${c.ref}`} className="rounded-md border border-line px-3 py-2">
                  <p className="text-xs text-ink-faint">
                    [{i + 1}] {c.label} · <span className="tabular">{c.ref}</span>
                  </p>
                  <p className="text-sm font-medium text-ink">
                    {c.href ? (
                      <Link className="text-brand underline-offset-2 hover:underline" to={c.href}>
                        {c.title}
                      </Link>
                    ) : (
                      c.title
                    )}
                  </p>
                  <p className="text-sm text-ink-muted">“{c.excerpt}”</p>
                </li>
              ))}
            </ol>
          ) : null}
          <p className="mt-3 text-[12px] text-ink-faint">
            {m.data.version} · matched on: {m.data.terms.join(', ') || 'no usable words'} · drafted by{' '}
            {m.data.drafter}
          </p>
        </div>
      ) : null}
    </Panel>
  );
}

function ChannelPill({ c }: { c: NotificationChannel }) {
  const [tone, Icon, label] =
    c.status === 'on'
      ? (['ok', CheckCircle2, 'On'] as const)
      : c.status === 'configured'
        ? (['awaiting', Radio, 'Configured'] as const)
        : (['low', CircleOff, 'Off'] as const);
  return (
    <StatusPill tone={tone}>
      <span className="inline-flex items-center gap-1">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {label}
      </span>
    </StatusPill>
  );
}

export function NotificationChannels() {
  const q = useQuery({ queryKey: ['notification-channels'], queryFn: api.notificationChannels });
  return (
    <Panel aria-labelledby="channels-heading">
      <PanelHeader
        id="channels-heading"
        icon={<BellRing className="h-4 w-4" aria-hidden />}
        title="Alert channels"
        description="New interventions are always in the inbox. Teams and email alerts carry the key, severity and a link; a title only for internal interventions, so no restricted or confidential detail leaves TIGERIS."
      />
      <LoadState isPending={q.isPending} error={q.error} />
      <ul className="divide-y divide-line border-t border-line">
        {(q.data ?? []).map((c) => (
          <li key={c.key} className="flex flex-wrap items-start justify-between gap-2 px-5 py-3">
            <span>
              <span className="block text-sm font-medium text-ink">{c.label}</span>
              <span className="block text-xs text-ink-muted">{c.detail}</span>
              {c.lastDelivery ? (
                <span className="block text-[12px] text-ink-faint">
                  Last {c.lastDelivery.ok ? 'delivered' : 'failed'} {formatRelative(c.lastDelivery.at)} (
                  {c.lastDelivery.detail})
                </span>
              ) : null}
            </span>
            <ChannelPill c={c} />
          </li>
        ))}
      </ul>
    </Panel>
  );
}

const OUTCOME_LABEL = {
  used: 'Drafted by the model',
  fallback_budget: 'Skipped: budget reached',
  fallback_error: 'Skipped: call failed',
  fallback_grounding: 'Skipped: failed grounding',
} as const;

/** Model use and budget (Phase 5I, FR-44): what the gateway may call, what it cost this month, and every fallback. */
export function ModelUsagePanel() {
  const q = useQuery({ queryKey: ['models'], queryFn: api.models });
  const m = q.data;
  return (
    <Panel aria-labelledby="models-heading">
      <PanelHeader
        id="models-heading"
        icon={<Radio className="h-4 w-4" aria-hidden />}
        title="Model use and budget"
        description="External models only draft prose from cited records; code computes every quantity. Each call and each fallback is recorded with its tokens and cost."
      />
      <LoadState isPending={q.isPending} error={q.error} />
      {m ? (
        <div className="grid gap-3 border-t border-line px-5 py-4 text-sm">
          <p className="flex flex-wrap items-center gap-2">
            <ChannelPill
              c={{
                key: 'inbox',
                label: '',
                status: m.enabled ? 'configured' : 'off',
                detail: '',
                lastDelivery: null,
              }}
            />
            <span className="text-ink">{m.model}</span>
            <span className="text-ink-muted">{m.reason}</span>
          </p>
          <p className="tabular text-ink">
            Spent this month: USD {m.spentThisMonthUsd.toFixed(4)}
            {m.monthlyBudgetUsd ? ` of USD ${m.monthlyBudgetUsd} budget` : ' (no budget set)'} · prices{' '}
            {m.prices.inputPerMTok && m.prices.outputPerMTok
              ? `USD ${m.prices.inputPerMTok} in / ${m.prices.outputPerMTok} out per million tokens`
              : 'not set'}
          </p>
          {m.byCase.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold text-ink-muted">By case (all time)</p>
                <ul className="mt-1 space-y-0.5 text-xs">
                  {m.byCase.map((c) => (
                    <li key={c.caseKey} className="tabular text-ink">
                      {c.caseKey}: USD {c.costUsd.toFixed(4)} · {c.calls} call{c.calls === 1 ? '' : 's'}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold text-ink-muted">
                  By decision (case spend before deciding)
                </p>
                <ul className="mt-1 space-y-0.5 text-xs">
                  {m.byDecision.length ? (
                    m.byDecision.map((d) => (
                      <li key={d.decisionKey} className="tabular text-ink">
                        {d.decisionKey} ({d.caseKey}): USD {d.costUsd.toFixed(4)}
                      </li>
                    ))
                  ) : (
                    <li className="text-ink-muted">No decisions on cases with model use yet.</li>
                  )}
                </ul>
              </div>
            </div>
          ) : null}
          {m.recent.length ? (
            <ul className="divide-y divide-line rounded-md border border-line">
              {m.recent.map((r, i) => (
                <li key={i} className="flex flex-wrap justify-between gap-2 px-3 py-2 text-xs">
                  <span className="text-ink">
                    {OUTCOME_LABEL[r.outcome]} · {r.feature}
                  </span>
                  <span className="tabular text-ink-muted">
                    {r.inputTokens} in / {r.outputTokens} out tokens · USD {r.costUsd.toFixed(4)} ·{' '}
                    {formatRelative(r.at)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-ink-muted">No model calls this month.</p>
          )}
        </div>
      ) : null}
    </Panel>
  );
}
