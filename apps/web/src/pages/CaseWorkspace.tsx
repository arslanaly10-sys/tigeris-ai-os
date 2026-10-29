import {
  CASE_STATES,
  CONFIDENCE_FACTORS,
  type CaseDetail,
  type ConfidenceFactor,
  type EvidenceItem,
  type GraphPayload,
  type MapLayers,
} from '@tigeris/shared';
import * as Tabs from '@radix-ui/react-tabs';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ChevronLeft, FileText, GitCommitVertical, Lock, Radar } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ImpactGraph } from '@/components/graph/ImpactGraph';
import { LineageDrawer, type LineageTarget } from '@/components/LineageDrawer';
import { GulfMap, MapItemList } from '@/components/map/GulfMap';
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
  { value: 'scenarios', label: 'Scenarios', phase: 3 },
  { value: 'options', label: 'Options', phase: 4 },
  { value: 'decision', label: 'Decision & memory', phase: 4 },
];

const tabClass =
  '-mb-px border-b-2 border-transparent px-4 py-2.5 text-sm font-medium text-ink-muted hover:text-ink data-[state=active]:border-gold data-[state=active]:text-ink';

function Lifecycle({ state }: { state: CaseDetail['state'] }) {
  const current = CASE_STATES.indexOf(state);
  return (
    <ol className="flex flex-wrap items-center gap-1" aria-label="Case lifecycle">
      {CASE_STATES.map((s, i) => (
        <li
          key={s}
          aria-current={i === current ? 'step' : undefined}
          className={cn(
            'rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-wide',
            i < current && 'bg-raised text-ink-muted',
            i === current && 'bg-gold text-navy-950',
            i > current && 'border border-line text-ink-faint',
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
    <header className="mb-5">
      <Link to="/cases" className="inline-flex items-center gap-1 text-sm text-cyan hover:underline">
        <ChevronLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />
        All cases
      </Link>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="font-serif text-lg text-ink-muted">Intelligence Case</span>
        <StateBadge value={c.state} />
        <span className="tabular font-mono text-sm text-ink-faint">{c.key}</span>
        <UrgencyBadge value={c.urgency} />
        <DataModeBadge value={c.dataMode} />
      </div>
      <h1 className="mt-1.5 text-2xl text-ink sm:text-3xl">{c.title}</h1>
      <p className="mt-1 max-w-4xl text-sm text-ink-muted">{c.objective}</p>
      <dl className="mt-4 grid gap-x-6 gap-y-3 rounded-t-xl border border-b-0 border-line bg-panel px-5 py-4 text-sm sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <dt className="text-xs text-ink-faint">Owner</dt>
          <dd className="font-medium text-ink">{c.owner}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-faint">Domain</dt>
          <dd className="font-medium text-ink">{c.domain}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-faint">Sensitivity</dt>
          <dd className="inline-flex items-center gap-1 font-medium text-ink">
            <Lock className="h-3.5 w-3.5 text-gold" aria-hidden />
            {humanize(c.sensitivity)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-ink-faint">Next step</dt>
          <dd className="font-medium text-ink">
            {c.nextStep}
            {c.nextStepRole ? (
              <span className="block text-xs font-normal text-ink-faint">{ROLE_LABEL[c.nextStepRole]}</span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-ink-faint">Updated</dt>
          <dd className="font-medium text-ink">
            {formatDate(c.updatedAt)}{' '}
            <span className="text-xs font-normal text-ink-faint">· v{c.version}</span>
          </dd>
        </div>
      </dl>
      <div className="-mt-px rounded-b-xl border border-t-0 border-line bg-panel px-5 pb-4">
        <Lifecycle state={c.state} />
      </div>
    </header>
  );
}

function LineageButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-line-strong px-2 py-1 text-xs font-medium text-cyan hover:border-cyan/60 hover:bg-cyan-soft"
    >
      Lineage<span className="sr-only"> for {label}</span>
    </button>
  );
}

function FactTable({ evidence, onOpen }: { evidence: EvidenceItem; onOpen: (t: LineageTarget) => void }) {
  if (evidence.facts.length === 0) return null;
  return (
    <div className="overflow-x-auto border-t border-line">
      <table className="w-full min-w-[32rem] text-sm">
        <caption className="sr-only">Facts extracted from {evidence.title}</caption>
        <thead>
          <tr className="text-xs text-ink-faint">
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
                <span className="block text-xs text-ink-faint">{f.subject}</span>
                {f.predicate}
              </td>
              <td className="tabular px-3 py-2.5 font-semibold text-ink">{formatFactValue(f)}</td>
              <td className="px-3 py-2.5">
                <ClaimBadge value={f.claimClass} />
              </td>
              <td className="px-5 py-2.5 text-end">
                <LineageButton
                  label={f.predicate}
                  onClick={() => onOpen({ evidenceId: evidence.id, fact: f })}
                />
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
        e.validationStatus === 'disputed' && 'border-red/60',
        e.source.sourceClass === 'synthetic' && 'border-gold/50',
      )}
    >
      <div className="px-5 py-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <SourceClassBadge value={e.source.sourceClass} />
          <ValidationBadge value={e.validationStatus} />
        </div>
        <h3 className="mt-2 text-lg text-ink">{e.title}</h3>
        <p className="text-sm text-ink-faint">
          {e.source.publisher} · Event {e.eventTime ? formatDateTime(e.eventTime) : 'time not applicable'} ·
          Retrieved {formatDate(e.retrievedAt)}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">{e.summary}</p>
        {e.validationNote ? (
          <p className="mt-2 rounded-lg bg-raised/60 px-3 py-2 text-xs text-ink-muted">
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
          className="text-xs font-medium text-cyan underline-offset-2 hover:underline"
        >
          Open record lineage<span className="sr-only"> for {e.title}</span>
        </button>
      </div>
    </Panel>
  );
}

function caseMapLayers(all: MapLayers | undefined, graph: GraphPayload | undefined) {
  if (!all || !graph) return null;
  const keys = graph.nodes.filter((n) => n.lon !== null).map((n) => n.key);
  return keys.length >= 2 ? { layers: all, focusKeys: keys } : null;
}

function OverviewTab({
  c,
  graph,
  mapLayers,
  onOpen,
}: {
  c: CaseDetail;
  graph: GraphPayload | undefined;
  mapLayers: MapLayers | undefined;
  onOpen: (t: LineageTarget) => void;
}) {
  const keyFacts = c.evidence.flatMap((e) =>
    e.facts.filter((f) => f.valueNum !== null).map((f) => ({ e, f })),
  );
  const map = caseMapLayers(mapLayers, graph);
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="space-y-6">
        <Panel>
          <PanelHeader title="Situation" />
          <div className="space-y-4 border-t border-line px-5 py-4 text-sm leading-relaxed">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">What changed</h3>
              <p className="mt-1 text-ink">{c.summary}</p>
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Why it matters</h3>
              <p className="mt-1 text-ink">{c.whyItMatters}</p>
            </div>
          </div>
        </Panel>

        {map ? (
          <Panel aria-labelledby="case-map-heading">
            <PanelHeader
              id="case-map-heading"
              title="Regional activity map"
              description="Case entities with their modelled links. Movement is an illustrative replay, not real vessel identities or positions."
            />
            <div className="px-4 pb-4">
              <GulfMap
                layers={map.layers}
                focusKeys={map.focusKeys}
                className="h-[24rem]"
                label={`Map of entities in case ${c.key} and their dependency links, with illustrative movement.`}
              />
              <MapItemList layers={map.layers} focusKeys={map.focusKeys} />
            </div>
          </Panel>
        ) : null}

        <Panel aria-labelledby="cited-heading">
          <PanelHeader
            id="cited-heading"
            title="Figures cited in this case"
            description="Every figure resolves to a source record or a labelled synthetic or assumed value."
          />
          <ul className="divide-y divide-line border-t border-line">
            {keyFacts.map(({ e, f }) => (
              <li key={f.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
                <span className="tabular min-w-[7.5rem] font-serif text-lg font-semibold text-ink">
                  {formatFactValue(f)}
                </span>
                <span className="min-w-0 flex-1 text-sm text-ink">
                  {f.predicate}
                  <span className="block text-xs text-ink-faint">{e.source.publisher}</span>
                </span>
                <ClaimBadge value={f.claimClass} />
                {e.validationStatus !== 'validated' ? <ValidationBadge value={e.validationStatus} /> : null}
                <LineageButton label={f.predicate} onClick={() => onOpen({ evidenceId: e.id, fact: f })} />
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="space-y-6">
        <Panel aria-labelledby="confidence-heading">
          <PanelHeader
            id="confidence-heading"
            title="Confidence"
            description="A band with its basis — never a single unexplained score."
          />
          <div className="border-t border-line px-5 py-4">
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
                        <span className="block text-xs font-normal text-ink-faint">{entry.note}</span>
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
          <ul className="list-disc space-y-2 border-t border-line px-5 py-4 ps-9 text-sm text-ink marker:text-gold">
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
          className="flex gap-3 rounded-xl border border-red/60 bg-red-soft px-4 py-3 text-sm text-red"
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

interface TimelineItem {
  at: string;
  kind: 'state' | 'evidence-event' | 'evidence-retrieved';
  title: string;
  detail: string;
}

function TimelineTab({ c }: { c: CaseDetail }) {
  const items = useMemo<TimelineItem[]>(() => {
    const out: TimelineItem[] = [];
    c.events.forEach((ev) =>
      out.push({
        at: ev.occurredAt,
        kind: 'state',
        title: ev.toState
          ? `${ev.fromState ? `${STATE_LABEL[ev.fromState]} → ` : 'Created as '}${STATE_LABEL[ev.toState]}`
          : humanize(ev.eventType),
        detail: `${ev.actor}${ev.rationale ? ` — ${ev.rationale}` : ''}`,
      }),
    );
    c.evidence.forEach((e) => {
      if (e.eventTime)
        out.push({
          at: e.eventTime,
          kind: 'evidence-event',
          title: e.title,
          detail: `Event time · ${e.source.publisher}`,
        });
      if (e.retrievedAt)
        out.push({
          at: e.retrievedAt,
          kind: 'evidence-retrieved',
          title: `Retrieved: ${e.title}`,
          detail: e.source.publisher,
        });
    });
    return out.sort((a, b) => b.at.localeCompare(a.at));
  }, [c]);
  const ICON = { state: GitCommitVertical, 'evidence-event': Radar, 'evidence-retrieved': FileText } as const;
  const DOT = { state: 'bg-gold', 'evidence-event': 'bg-red', 'evidence-retrieved': 'bg-cyan' } as const;
  return (
    <Panel>
      <PanelHeader
        title="Case timeline"
        description="Event times, evidence retrieval and state transitions — newest first. Event time and retrieval time are kept separate."
      />
      <ol className="border-t border-line px-5 py-4">
        {items.map((it, i) => {
          const Icon = ICON[it.kind];
          return (
            <li key={i} className="relative border-s border-line-strong ps-6 pb-5 last:pb-0">
              <span
                className={cn('absolute -start-[5px] top-1.5 h-2.5 w-2.5 rounded-full', DOT[it.kind])}
                aria-hidden
              />
              <p className="tabular text-xs text-ink-faint">{formatDateTime(it.at)}</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-sm font-medium text-ink">
                <Icon className="h-3.5 w-3.5 text-ink-faint" aria-hidden />
                {it.title}
              </p>
              <p className="text-sm text-ink-muted">{it.detail}</p>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}

export function CaseWorkspacePage() {
  const { key = '' } = useParams();
  const q = useQuery({ queryKey: ['case', key], queryFn: () => api.case(key) });
  const graph = useQuery({
    queryKey: ['case-graph', key],
    queryFn: () => api.caseGraph(key),
    enabled: q.isSuccess,
  });
  const mapLayers = useQuery({ queryKey: ['map-layers'], queryFn: api.mapLayers, enabled: q.isSuccess });
  const [lineage, setLineage] = useState<LineageTarget | null>(null);

  if (q.error instanceof ApiError && q.error.status === 404) {
    return (
      <div className="rounded-xl border border-line bg-panel px-5 py-10 text-center">
        <h1 className="text-2xl text-ink">Case not found</h1>
        <p className="mt-2 text-sm text-ink-muted">No case with this reference exists in your institution.</p>
        <Link to="/cases" className="mt-4 inline-block text-sm font-medium text-cyan underline">
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
      <Tabs.Root defaultValue="overview">
        <Tabs.List aria-label="Case workspace" className="mb-5 flex flex-wrap gap-1 border-b border-line">
          <Tabs.Trigger value="overview" className={tabClass}>
            Overview
          </Tabs.Trigger>
          <Tabs.Trigger value="evidence" className={tabClass}>
            Evidence ({c.evidence.length})
          </Tabs.Trigger>
          <Tabs.Trigger value="graph" className={tabClass}>
            Impact graph
          </Tabs.Trigger>
          <Tabs.Trigger value="timeline" className={tabClass}>
            Timeline
          </Tabs.Trigger>
          {LATER_TABS.map((t) => (
            <Tabs.Trigger
              key={t.value}
              value={t.value}
              disabled
              className="px-4 py-2.5 text-sm text-ink-faint"
              title={`Arrives in Phase ${t.phase}`}
            >
              {t.label} <span className="text-[11px]">· P{t.phase}</span>
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <Tabs.Content value="overview" className="outline-none">
          <OverviewTab c={c} graph={graph.data} mapLayers={mapLayers.data} onOpen={setLineage} />
        </Tabs.Content>
        <Tabs.Content value="evidence" className="outline-none">
          <EvidenceTab c={c} onOpen={setLineage} />
        </Tabs.Content>
        <Tabs.Content value="graph" className="outline-none">
          <Panel className="p-4">
            <p className="mb-3 text-sm text-ink-muted">
              Direct, second- and third-order paths from the case origin. Links are analytical, not proof of
              causation; open any link for its rationale and evidence.
            </p>
            {graph.data ? (
              graph.data.nodes.length > 0 ? (
                <ImpactGraph
                  graph={graph.data}
                  className="h-[34rem]"
                  onOpenEvidence={(id) => setLineage({ evidenceId: id, fact: null })}
                />
              ) : (
                <p className="text-sm text-ink-muted">No entities are linked to this case yet.</p>
              )
            ) : (
              <LoadState isPending={graph.isPending} error={graph.error} />
            )}
          </Panel>
        </Tabs.Content>
        <Tabs.Content value="timeline" className="outline-none">
          <TimelineTab c={c} />
        </Tabs.Content>
      </Tabs.Root>
      <LineageDrawer target={lineage} onClose={() => setLineage(null)} />
    </>
  );
}
