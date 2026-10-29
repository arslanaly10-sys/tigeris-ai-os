import {
  CASE_STATES,
  CONFIDENCE_FACTORS,
  type CaseDetail,
  type ConfidenceFactor,
  type EvidenceItem,
} from '@tigeris/shared';
import * as Tabs from '@radix-ui/react-tabs';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ChevronLeft, Lock } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { LineageDrawer, type LineageTarget } from '@/components/LineageDrawer';
import { LoadState } from '@/components/PageHeader';
import {
  ClaimBadge,
  ConfidenceBandMeter,
  CONFIDENCE_LABEL,
  DataModeBadge,
  SourceClassBadge,
  STATE_LABEL,
  StateBadge,
  UrgencyBadge,
  ValidationBadge,
} from '@/components/truth/badges';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDate, formatDateTime, formatFactValue, humanize } from '@/lib/format';
import { ROLE_LABEL } from '@/lib/roles';

const FACTOR_LABEL: Record<ConfidenceFactor, string> = {
  source_quality: 'Source quality',
  corroboration: 'Corroboration',
  freshness: 'Freshness',
  graph_completeness: 'Graph completeness',
  assumption_load: 'Independence from assumptions',
  scenario_stability: 'Scenario stability',
};

const LATER_TABS = [
  { value: 'graph', label: 'Impact graph', phase: 2 },
  { value: 'scenarios', label: 'Scenarios', phase: 3 },
  { value: 'options', label: 'Options', phase: 4 },
  { value: 'decision', label: 'Decision & memory', phase: 4 },
];

function Lifecycle({ state }: { state: CaseDetail['state'] }) {
  const current = CASE_STATES.indexOf(state);
  return (
    <ol className="flex flex-wrap gap-1" aria-label="Case lifecycle">
      {CASE_STATES.map((s, i) => (
        <li
          key={s}
          aria-current={i === current ? 'step' : undefined}
          className={cn(
            'rounded px-2 py-1 text-[11px] font-semibold uppercase tracking-wide',
            i < current && 'bg-navy-100 text-navy-700',
            i === current && 'bg-navy-800 text-white ring-2 ring-gold',
            i > current && 'border border-line text-ink-muted',
          )}
        >
          {i < current ? <span className="sr-only">Completed: </span> : null}
          {STATE_LABEL[s]}
        </li>
      ))}
    </ol>
  );
}

function CaseHeader({ c }: { c: CaseDetail }) {
  return (
    <header className="mb-6 rounded-lg border border-line bg-paper">
      <div className="border-b border-line px-5 py-4">
        <Link to="/cases" className="inline-flex items-center gap-1 text-sm text-navy-700 hover:underline">
          <ChevronLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />
          All cases
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="tabular font-mono text-sm text-ink-muted">{c.key}</span>
          <StateBadge value={c.state} />
          <UrgencyBadge value={c.urgency} />
          <DataModeBadge value={c.dataMode} />
        </div>
        <h1 className="mt-2 text-2xl text-ink sm:text-3xl">{c.title}</h1>
      </div>
      <dl className="grid gap-x-6 gap-y-3 px-5 py-4 text-sm sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <dt className="text-xs text-ink-muted">Owner</dt>
          <dd className="font-medium text-ink">{c.owner}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-muted">Domain</dt>
          <dd className="font-medium text-ink">{c.domain}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-muted">Sensitivity</dt>
          <dd className="inline-flex items-center gap-1 font-medium text-ink">
            <Lock className="h-3.5 w-3.5" aria-hidden />
            {humanize(c.sensitivity)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-ink-muted">Next step</dt>
          <dd className="font-medium text-ink">
            {c.nextStep}
            {c.nextStepRole ? (
              <span className="block text-xs font-normal text-ink-muted">{ROLE_LABEL[c.nextStepRole]}</span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-ink-muted">Updated</dt>
          <dd className="font-medium text-ink">
            {formatDate(c.updatedAt)}{' '}
            <span className="text-xs font-normal text-ink-muted">· v{c.version}</span>
          </dd>
        </div>
      </dl>
      <div className="border-t border-line px-5 py-3">
        <Lifecycle state={c.state} />
      </div>
    </header>
  );
}

function FactTable({ evidence, onOpen }: { evidence: EvidenceItem; onOpen: (t: LineageTarget) => void }) {
  if (evidence.facts.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] text-sm">
        <caption className="sr-only">Facts extracted from {evidence.title}</caption>
        <thead>
          <tr className="border-y border-line bg-ivory text-start text-xs text-ink-muted">
            <th scope="col" className="px-5 py-2 text-start font-medium">
              Fact
            </th>
            <th scope="col" className="px-3 py-2 text-start font-medium">
              Value
            </th>
            <th scope="col" className="px-3 py-2 text-start font-medium">
              Class
            </th>
            <th scope="col" className="px-5 py-2 text-end font-medium">
              <span className="sr-only">Lineage</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {evidence.facts.map((f) => (
            <tr key={f.id}>
              <td className="px-5 py-2.5 text-ink">
                <span className="block text-xs text-ink-muted">{f.subject}</span>
                {f.predicate}
              </td>
              <td className="tabular px-3 py-2.5 font-semibold text-ink">{formatFactValue(f)}</td>
              <td className="px-3 py-2.5">
                <ClaimBadge value={f.claimClass} />
              </td>
              <td className="px-5 py-2.5 text-end">
                <button
                  type="button"
                  onClick={() => onOpen({ evidenceId: evidence.id, fact: f })}
                  className="rounded border border-line-strong px-2 py-1 text-xs font-medium text-navy-700 hover:border-navy-600 hover:bg-navy-100"
                >
                  Lineage<span className="sr-only"> for {f.predicate}</span>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EvidenceCard({ e, onOpen }: { e: EvidenceItem; onOpen: (t: LineageTarget) => void }) {
  return (
    <Panel
      className={cn(
        e.validationStatus === 'disputed' && 'border-red',
        e.source.sourceClass === 'synthetic' && 'border-gold',
      )}
    >
      <div className="px-5 py-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <SourceClassBadge value={e.source.sourceClass} />
          <ValidationBadge value={e.validationStatus} />
        </div>
        <h3 className="mt-2 text-lg text-ink">{e.title}</h3>
        <p className="text-sm text-ink-muted">
          {e.source.publisher} · Event {e.eventTime ? formatDateTime(e.eventTime) : 'time not applicable'} ·
          Retrieved {formatDate(e.retrievedAt)}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-ink">{e.summary}</p>
        {e.validationNote ? (
          <p className="mt-2 rounded-md bg-ivory px-3 py-2 text-xs text-ink-muted">
            <span className="font-semibold text-ink">Validation note: </span>
            {e.validationNote}
          </p>
        ) : null}
      </div>
      <FactTable evidence={e} onOpen={onOpen} />
      <div className="border-t border-line px-5 py-2.5">
        <button
          type="button"
          onClick={() => onOpen({ evidenceId: e.id, fact: null })}
          className="text-xs font-medium text-navy-700 underline-offset-2 hover:underline"
        >
          Open record lineage<span className="sr-only"> for {e.title}</span>
        </button>
      </div>
    </Panel>
  );
}

function SituationTab({ c, onOpen }: { c: CaseDetail; onOpen: (t: LineageTarget) => void }) {
  const keyFacts = c.evidence.flatMap((e) =>
    e.facts.filter((f) => f.valueNum !== null).map((f) => ({ e, f })),
  );
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="space-y-6">
        <Panel>
          <PanelHeader title="Situation" />
          <div className="space-y-4 px-5 py-4 text-sm leading-relaxed">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Objective</h3>
              <p className="mt-1 text-ink">{c.objective}</p>
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">What changed</h3>
              <p className="mt-1 text-ink">{c.summary}</p>
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Why it matters</h3>
              <p className="mt-1 text-ink">{c.whyItMatters}</p>
            </div>
          </div>
        </Panel>

        <Panel aria-labelledby="cited-heading">
          <PanelHeader
            id="cited-heading"
            title="Figures cited in this case"
            description="Every figure above resolves to a source record or a labelled synthetic value."
          />
          <ul className="divide-y divide-line">
            {keyFacts.map(({ e, f }) => (
              <li key={f.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
                <span className="tabular min-w-[7rem] font-serif text-lg font-semibold text-ink">
                  {formatFactValue(f)}
                </span>
                <span className="min-w-0 flex-1 text-sm text-ink">
                  {f.predicate}
                  <span className="block text-xs text-ink-muted">{e.source.publisher}</span>
                </span>
                <ClaimBadge value={f.claimClass} />
                {e.validationStatus !== 'validated' ? <ValidationBadge value={e.validationStatus} /> : null}
                <button
                  type="button"
                  onClick={() => onOpen({ evidenceId: e.id, fact: f })}
                  className="rounded border border-line-strong px-2 py-1 text-xs font-medium text-navy-700 hover:border-navy-600 hover:bg-navy-100"
                >
                  Lineage<span className="sr-only"> for {f.predicate}</span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel>
          <PanelHeader
            title="Case history"
            description="Append-only state transitions with actor and rationale."
          />
          <ol className="space-y-0 px-5 py-4">
            {c.events.map((ev) => (
              <li key={ev.id} className="relative border-s border-line ps-5 pb-4 last:pb-0">
                <span className="absolute -start-[5px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-paper bg-navy-700" />
                <p className="text-sm text-ink">
                  {ev.toState ? (
                    <>
                      {ev.fromState ? `${STATE_LABEL[ev.fromState]} → ` : 'Created as '}
                      <span className="font-semibold">{STATE_LABEL[ev.toState]}</span>
                    </>
                  ) : (
                    humanize(ev.eventType)
                  )}
                </p>
                <p className="text-xs text-ink-muted">
                  {ev.actor} · {formatDateTime(ev.occurredAt)}
                </p>
                {ev.rationale ? <p className="mt-1 text-sm text-ink-muted">{ev.rationale}</p> : null}
              </li>
            ))}
          </ol>
        </Panel>
      </div>

      <div className="space-y-6">
        <Panel aria-labelledby="confidence-heading">
          <PanelHeader
            id="confidence-heading"
            title="Confidence"
            description="A band with its basis — never a single unexplained score."
          />
          <div className="px-5 py-4">
            <ConfidenceBandMeter band={c.confidence.band} />
            <table className="mt-4 w-full text-sm">
              <caption className="sr-only">Confidence factors</caption>
              <tbody className="divide-y divide-line">
                {CONFIDENCE_FACTORS.map((factor) => {
                  const entry = c.confidence.factors.find((x) => x.factor === factor);
                  if (!entry) return null;
                  return (
                    <tr key={factor}>
                      <th scope="row" className="py-2 pe-3 text-start align-top font-medium text-ink">
                        {FACTOR_LABEL[factor]}
                        <span className="block text-xs font-normal text-ink-muted">{entry.note}</span>
                      </th>
                      <td className="py-2 text-end align-top text-xs font-semibold text-ink">
                        {CONFIDENCE_LABEL[entry.band]}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel aria-labelledby="questions-heading">
          <PanelHeader id="questions-heading" title="Unresolved questions" />
          <ul className="list-disc space-y-2 px-5 py-4 ps-9 text-sm text-ink">
            {c.unresolvedQuestions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

function EvidenceTab({ c, onOpen }: { c: CaseDetail; onOpen: (t: LineageTarget) => void }) {
  const disputed = c.evidence.filter((e) => e.validationStatus === 'disputed');
  return (
    <div className="space-y-4">
      {disputed.length > 0 ? (
        <div
          role="note"
          className="flex gap-3 rounded-lg border border-red bg-red-soft px-4 py-3 text-sm text-red"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            <strong className="font-semibold">Conflicting sources.</strong> {disputed.length} record
            {disputed.length === 1 ? '' : 's'} conflict with other evidence. Both values are preserved; an
            analyst disposition is required before either is cited in a decision.
          </p>
        </div>
      ) : null}
      {c.evidence.map((e) => (
        <EvidenceCard key={e.id} e={e} onOpen={onOpen} />
      ))}
    </div>
  );
}

export function CaseWorkspacePage() {
  const { key = '' } = useParams();
  const q = useQuery({ queryKey: ['case', key], queryFn: () => api.case(key) });
  const [lineage, setLineage] = useState<LineageTarget | null>(null);

  if (q.error instanceof ApiError && q.error.status === 404) {
    return (
      <div className="rounded-lg border border-line bg-paper px-5 py-8 text-center">
        <h1 className="text-2xl text-ink">Case not found</h1>
        <p className="mt-2 text-sm text-ink-muted">No case with this reference exists in your institution.</p>
        <Link to="/cases" className="mt-4 inline-block text-sm font-medium text-navy-700 underline">
          Back to cases
        </Link>
      </div>
    );
  }
  if (!q.data) return <LoadState isPending={q.isPending} error={q.error} />;
  const c = q.data;

  return (
    <>
      <CaseHeader c={c} />
      <Tabs.Root defaultValue="situation">
        <Tabs.List aria-label="Case workspace" className="mb-5 flex flex-wrap gap-1 border-b border-line">
          {[
            { value: 'situation', label: 'Situation' },
            { value: 'evidence', label: `Evidence (${c.evidence.length})` },
          ].map((t) => (
            <Tabs.Trigger
              key={t.value}
              value={t.value}
              className="-mb-px border-b-2 border-transparent px-4 py-2.5 text-sm font-medium text-ink-muted hover:text-ink data-[state=active]:border-gold data-[state=active]:text-ink"
            >
              {t.label}
            </Tabs.Trigger>
          ))}
          {LATER_TABS.map((t) => (
            <Tabs.Trigger
              key={t.value}
              value={t.value}
              disabled
              className="px-4 py-2.5 text-sm text-ink-muted/70"
              title={`Arrives in Phase ${t.phase}`}
            >
              {t.label} <span className="text-[11px]">· P{t.phase}</span>
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <Tabs.Content value="situation" className="outline-none">
          <SituationTab c={c} onOpen={setLineage} />
        </Tabs.Content>
        <Tabs.Content value="evidence" className="outline-none">
          <EvidenceTab c={c} onOpen={setLineage} />
        </Tabs.Content>
      </Tabs.Root>
      <LineageDrawer target={lineage} onClose={() => setLineage(null)} />
    </>
  );
}
