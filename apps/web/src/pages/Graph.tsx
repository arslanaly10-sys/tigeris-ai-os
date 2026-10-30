import { SECTOR_KEYS } from '@tigeris/shared';
import { useQuery } from '@tanstack/react-query';
import * as Tabs from '@radix-ui/react-tabs';
import { motion } from 'motion/react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { EntityExplorer } from '@/components/graph/EntityExplorer';
import { ImpactGraph } from '@/components/graph/ImpactGraph';
import { LineageDrawer, type LineageTarget } from '@/components/LineageDrawer';
import { SectorSubnav } from '@/components/layout/SectorSubnav';
import { LoadState, PageHeader } from '@/components/PageHeader';
import { INDICATOR_SPRING } from '@/components/ui/motion';
import { Panel } from '@/components/ui/panel';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

const tabClass =
  'relative px-4 py-2.5 text-sm font-medium text-ink-muted hover:text-ink data-[state=active]:text-ink';

const VIEWS = [
  { value: 'graph', label: 'graph.view.graph' },
  { value: 'entities', label: 'graph.view.entities' },
] as const;

export function GraphPage() {
  const { t } = useI18n();
  const q = useQuery({ queryKey: ['graph'], queryFn: api.graph });
  const [params, setParams] = useSearchParams();
  const [lineage, setLineage] = useState<LineageTarget | null>(null);
  const view = params.get('view') === 'entities' ? 'entities' : 'graph';
  const counts = q.data
    ? q.data.edges.reduce<Record<string, number>>((acc, e) => {
        acc[e.relationshipClass] = (acc[e.relationshipClass] ?? 0) + 1;
        return acc;
      }, {})
    : {};
  return (
    <>
      <SectorSubnav />
      <PageHeader
        title="Intelligence Graph"
        description="The institution's shared entities and causal links. Every link is labelled observed, sourced, inferred, assumed or synthetic and opens its rationale and evidence. The entity view reads each link as a dependency, so you can see what an asset relies on and what is exposed if it is disrupted."
        meta={
          q.data ? (
            <p className="text-sm text-ink-muted">
              {q.data.nodes.length} entities · {q.data.edges.length} links ·{' '}
              {Object.entries(counts)
                .map(([k, v]) => `${v} ${k}`)
                .join(' · ')}
            </p>
          ) : null
        }
      />
      <Tabs.Root
        value={view}
        onValueChange={(v) => setParams(v === 'graph' ? {} : { view: v }, { replace: true })}
      >
        <Tabs.List aria-label="Graph views" className="mb-5 flex flex-wrap gap-1 border-b border-line">
          {VIEWS.map((x) => (
            <Tabs.Trigger key={x.value} value={x.value} className={tabClass}>
              {t(x.label)}
              {view === x.value ? (
                <motion.span
                  layoutId="graph-tab-indicator"
                  className="absolute inset-x-0 -bottom-px h-0.5 bg-gold"
                  transition={INDICATOR_SPRING}
                  aria-hidden
                />
              ) : null}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <Tabs.Content value="graph" className="outline-none">
          <LoadState isPending={q.isPending} error={q.error} />
          {q.data ? (
            <Panel className="p-4">
              <ImpactGraph
                graph={q.data}
                className="h-[42rem]"
                focusKey={params.get('focus')}
                onOpenEvidence={(id) => setLineage({ evidenceId: id, fact: null })}
              />
            </Panel>
          ) : null}
        </Tabs.Content>
        <Tabs.Content value="entities" className="outline-none">
          <EntityExplorer
            selected={params.get('entity')}
            initialSector={SECTOR_KEYS.find((k) => k === params.get('sector'))}
            onSelect={(key) => setParams({ view: 'entities', entity: key }, { replace: true })}
          />
        </Tabs.Content>
      </Tabs.Root>
      <LineageDrawer target={lineage} onClose={() => setLineage(null)} />
    </>
  );
}
