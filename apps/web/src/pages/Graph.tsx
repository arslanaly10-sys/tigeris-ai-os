import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { ImpactGraph } from '@/components/graph/ImpactGraph';
import { LineageDrawer, type LineageTarget } from '@/components/LineageDrawer';
import { LoadState, PageHeader } from '@/components/PageHeader';
import { Panel } from '@/components/ui/panel';
import { api } from '@/lib/api';

export function GraphPage() {
  const q = useQuery({ queryKey: ['graph'], queryFn: api.graph });
  const [params] = useSearchParams();
  const [lineage, setLineage] = useState<LineageTarget | null>(null);
  const counts = q.data
    ? q.data.edges.reduce<Record<string, number>>((acc, e) => {
        acc[e.relationshipClass] = (acc[e.relationshipClass] ?? 0) + 1;
        return acc;
      }, {})
    : {};
  return (
    <>
      <PageHeader
        title="Intelligence Graph"
        description="The institution's shared entities and causal links. Columns show distance from events; every link is labelled observed, sourced, inferred, assumed or synthetic and opens its rationale and evidence."
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
      <LineageDrawer target={lineage} onClose={() => setLineage(null)} />
    </>
  );
}
