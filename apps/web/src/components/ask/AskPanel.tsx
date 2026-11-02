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
