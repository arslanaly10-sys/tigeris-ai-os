import type { AgentRunItem, ConfidenceBasis, DraftOptionItem, MandateCheck } from '@tigeris/shared';
import {
  AlertTriangle,
  Ban,
  Bot,
  CheckCircle2,
  ChevronDown,
  Gavel,
  ShieldCheck,
  Users,
  XOctagon,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { CONFIDENCE_LABEL, ConfidenceBandMeter } from '@/components/truth/badges';
import { StatusPill } from '@/components/ui/data';
import { Collapse, DURATION } from '@/components/ui/motion';
import { humanize } from '@/lib/format';
import { ROLE_LABEL } from '@/lib/roles';

const CHECK = {
  within: { icon: CheckCircle2, label: 'Within mandate', className: 'text-emerald' },
  attention: { icon: AlertTriangle, label: 'Needs attention', className: 'text-amber' },
  breach: { icon: XOctagon, label: 'Breach', className: 'text-red' },
} as const;

export function MandateChecks({ checks }: { checks: MandateCheck[] }) {
  if (checks.length === 0)
    return <p className="text-sm text-ink-muted">No mandates with configured limits apply.</p>;
  return (
    <ul className="divide-y divide-line">
      {checks.map((c) => {
        const s = CHECK[c.status];
        const Icon = s.icon;
        return (
          <li key={c.mandateKey} className="flex gap-3 py-2.5">
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${s.className}`} aria-hidden />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-ink">
                {c.title} <span className={`text-xs font-semibold ${s.className}`}>· {s.label}</span>
              </span>
              <span className="block text-xs text-ink-muted">
                <span className="tabular">{c.mandateKey}</span> · {c.detail}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function ConfidenceBasisList({ confidence }: { confidence: ConfidenceBasis }) {
  return (
    <div>
      <ConfidenceBandMeter band={confidence.band} />
      <ul className="mt-3 divide-y divide-line">
        {confidence.factors.map((f) => (
          <li key={f.factor} className="flex items-start justify-between gap-3 py-2">
            <span className="min-w-0">
              <span className="block text-sm text-ink">{humanize(f.factor)}</span>
              <span className="block text-xs text-ink-muted">{f.note}</span>
            </span>
            <span className="shrink-0 text-xs font-semibold text-ink">{CONFIDENCE_LABEL[f.band]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function OptionCard({ option }: { option: DraftOptionItem }) {
  const a = option.authority;
  return (
    <article
      aria-labelledby={`opt-${option.key}`}
      className="flex h-full flex-col rounded-xl border border-line bg-panel p-4"
    >
      <div className="flex items-start gap-3">
        <span
          className="tabular flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-brand/40 bg-brand-soft font-serif text-lg font-semibold text-brand"
          aria-label={`Rank ${option.rank}`}
        >
          {option.rank}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-gold-bright">{option.actionClass}</p>
          <h3 id={`opt-${option.key}`} className="text-base leading-snug text-ink">
            {option.title}
          </h3>
        </div>
      </div>
      <div className="mt-2">
        <StatusPill tone="awaiting">Draft · expert review required</StatusPill>
      </div>
      <p className="mt-3 text-sm text-ink">{option.summary}</p>
      <p className="mt-2 text-xs text-ink-muted">{option.rankBasis}</p>
      <dl className="mt-auto space-y-1.5 border-t border-line pt-3 text-xs">
        <div className="flex items-start gap-2">
          <dt className="sr-only">Authority</dt>
          <Gavel className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold-bright" aria-hidden />
          <dd className="text-ink">
            {a ? (
              <>
                {ROLE_LABEL[a.requiredRole]} · {a.thresholdText}
              </>
            ) : (
              'No authority rule configured for this action class'
            )}
          </dd>
        </div>
        {a ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 ps-5.5 text-ink-muted">
            <dt className="sr-only">Controls</dt>
            <dd className="inline-flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Expert review mandatory
            </dd>
            {a.twoPerson ? (
              <dd className="inline-flex items-center gap-1">
                <Users className="h-3.5 w-3.5" aria-hidden /> Two-person approval
              </dd>
            ) : null}
            <dd className="inline-flex items-center gap-1">
              <Ban className="h-3.5 w-3.5" aria-hidden /> Self-approval blocked
            </dd>
          </div>
        ) : null}
        <div className="flex items-start gap-2">
          <dt className="text-ink-muted">Size</dt>
          <dd className="text-ink">
            {option.magnitude ? (
              <>
                <span className="tabular font-medium">
                  {option.magnitude.value} {option.magnitude.unit}
                </span>{' '}
                <span className="text-ink-muted">· {option.magnitude.label}</span>
              </>
            ) : (
              <span className="text-ink-muted">No size: no numeric limit applies</span>
            )}
          </dd>
        </div>
        <div className="flex items-center gap-2">
          <dt className="text-ink-muted">Confidence</dt>
          <dd>
            <ConfidenceBandMeter band={option.confidence.band} />
          </dd>
        </div>
      </dl>
    </article>
  );
}

export function AgentDraft({ run }: { run: AgentRunItem }) {
  const [open, setOpen] = useState(false);
  const id = `cites-${run.id}`;
  return (
    <article className="py-4">
      <div className="flex flex-wrap items-center gap-2">
        <Bot className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink">{run.agentName}</span>
          <span className="block text-xs text-ink-muted">{run.task}</span>
        </span>
        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
          {run.grounding.numbers.length === 0
            ? 'No numbers quoted'
            : `All ${run.grounding.numbers.length} numbers cited`}
        </span>
      </div>
      <p className="mt-2 text-sm text-ink">{run.outputText}</p>
      <p className="mt-1.5 text-[12px] text-ink-faint">
        Drafted by {run.modelId} {run.modelVersion} (internal deterministic stub, template {run.templateKey}{' '}
        {run.templateVersion}) · triggered by {run.triggeredBy}
      </p>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-cyan hover:underline"
      >
        Cited inputs ({run.inputs.length})
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: DURATION.fast }}
          className="inline-flex"
        >
          <ChevronDown className="h-3.5 w-3.5" aria-hidden />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <Collapse key="cites" id={id}>
            <ul className="mt-2 space-y-1 rounded-lg border border-line bg-raised/40 px-3 py-2 text-xs">
              {run.inputs.map((c) => (
                <li key={c.ref} className="flex flex-wrap justify-between gap-2">
                  <span className="text-ink-muted">{c.label}</span>
                  <span className="tabular text-ink">{c.display}</span>
                </li>
              ))}
            </ul>
          </Collapse>
        ) : null}
      </AnimatePresence>
    </article>
  );
}

export const SEVERITY_TONE = { low: 'low', moderate: 'medium', high: 'high' } as const;
export const severityLabel = (s: 'low' | 'moderate' | 'high') => `${humanize(s)} severity`;
