/**
 * Impact graph (FR-14..FR-17, TR-021, UI brief §8): causal paths laid out by hop distance from the case
 * origin. Edge style encodes the relationship class; every edge opens its rationale and evidence.
 */
import type { GraphEdge, GraphNode, GraphPayload, RelationshipClass } from '@tigeris/shared';
import {
  Background,
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  getBezierPath,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Anchor,
  Box,
  Building2,
  Droplets,
  Factory,
  Fuel,
  Landmark,
  MapPin,
  Ship,
  Siren,
  Wallet,
  Waves,
  type LucideIcon,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useId, useMemo, useState } from 'react';
import { ClaimBadge, CONFIDENCE_LABEL } from '@/components/truth/badges';
import { Sheet } from '@/components/ui/sheet';
import { cn } from '@/lib/cn';
import { FadeSwap, INDICATOR_SPRING } from '@/components/ui/motion';

const TYPE_ICON: Record<GraphNode['type'], LucideIcon> = {
  event: Siren,
  vessel: Ship,
  chokepoint: Waves,
  port: Anchor,
  terminal: Fuel,
  commodity: Box,
  asset: Factory,
  institution: Landmark,
  portfolio: Wallet,
  holding: Building2,
  service: Droplets,
  route: MapPin,
  region: MapPin,
};

const EDGE_STYLE: Record<RelationshipClass, { stroke: string; dash?: string; label: string }> = {
  observed: { stroke: '#18674b', label: 'Observed' },
  sourced: { stroke: '#16656a', label: 'Sourced' },
  inferred: { stroke: '#16656a', dash: '6 4', label: 'Inferred' },
  assumed: { stroke: '#8c540e', dash: '2 4', label: 'Assumption' },
  synthetic: { stroke: '#b8924f', dash: '8 4', label: 'Synthetic' },
};

const HOP_LABEL = ['Origin', 'Direct', '2nd order', '3rd order', '4th order'];

type EntityNodeData = { node: GraphNode; dimmed: boolean };
type ImpactEdgeData = { edge: GraphEdge; onOpen: (e: GraphEdge) => void };

function EntityNode({ data }: NodeProps<Node<EntityNodeData>>) {
  const n = data.node;
  const Icon = TYPE_ICON[n.type];
  return (
    <div
      className={cn(
        'w-52 rounded-xl border bg-panel px-3 py-2.5',
        n.hop === 0 ? 'border-red/70' : 'border-line-strong',
        data.dimmed && 'opacity-40',
      )}
    >
      <Handle type="target" position={Position.Left} className="!h-1.5 !w-1.5 !border-0 !bg-line-strong" />
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border',
            n.hop === 0 ? 'border-red/60 bg-red-soft text-red' : 'border-cyan/50 bg-cyan-soft text-cyan',
          )}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-[13px] leading-tight font-semibold text-ink">{n.name}</p>
          <p className="mt-0.5 text-[13px] capitalize text-ink-faint">{n.type}</p>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <ClaimBadge value={n.claimClass} className="text-[13px]" />
        {n.hop !== undefined ? <span className="text-[13px] text-ink-faint">{HOP_LABEL[n.hop]}</span> : null}
      </div>
      <Handle type="source" position={Position.Right} className="!h-1.5 !w-1.5 !border-0 !bg-line-strong" />
    </div>
  );
}

function ImpactEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
  markerStart,
}: EdgeProps<Edge<ImpactEdgeData>>) {
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });
  const e = data!.edge;
  const style = EDGE_STYLE[e.relationshipClass];
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        markerStart={markerStart}
        style={{
          stroke: style.stroke,
          strokeWidth: 1.6,
          strokeDasharray: style.dash,
          opacity: e.status === 'challenged' ? 0.5 : 0.9,
        }}
      />
      <EdgeLabelRenderer>
        <button
          type="button"
          onClick={() => data!.onOpen(e)}
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            borderColor: style.stroke,
          }}
          className="nodrag nopan pointer-events-auto absolute rounded-md border bg-panel px-1.5 py-0.5 text-[13px] font-medium text-ink float-shadow hover:bg-raised"
        >
          {e.predicate}
          <span className="sr-only">, {style.label} link. Open details.</span>
        </button>
      </EdgeLabelRenderer>
    </>
  );
}

const nodeTypes = { entity: EntityNode };
const edgeTypes = { impact: ImpactEdge };

/** Hop of every node: from payload when present, otherwise BFS from event nodes (whole-graph view). */
function hops(g: GraphPayload): Map<string, number> {
  if (g.nodes.every((n) => n.hop !== undefined)) return new Map(g.nodes.map((n) => [n.id, n.hop!]));
  const hop = new Map<string, number>();
  let frontier = g.nodes.filter((n) => n.type === 'event').map((n) => n.id);
  frontier.forEach((id) => hop.set(id, 0));
  for (let d = 1; frontier.length; d++) {
    const next: string[] = [];
    for (const id of frontier)
      for (const e of g.edges) {
        const o = e.source === id ? e.target : e.target === id ? e.source : null;
        if (o && !hop.has(o)) {
          hop.set(o, d);
          next.push(o);
        }
      }
    frontier = next;
  }
  const maxHop = Math.max(0, ...hop.values());
  g.nodes.forEach((n) => !hop.has(n.id) && hop.set(n.id, maxHop + 1));
  return hop;
}

export function ImpactGraph({
  graph,
  className,
  focusKey,
  onOpenEvidence,
}: {
  graph: GraphPayload;
  className?: string;
  focusKey?: string | null;
  onOpenEvidence?: (evidenceId: string) => void;
}) {
  const [openEdge, setOpenEdge] = useState<GraphEdge | null>(null);
  const [view, setView] = useState<'graph' | 'list'>('graph');
  const toggleId = useId();
  const nameOf = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n.name])), [graph]);

  const { nodes, edges } = useMemo(() => {
    const hop = hops(graph);
    const columns = new Map<number, GraphNode[]>();
    graph.nodes.forEach((n) => columns.set(hop.get(n.id)!, [...(columns.get(hop.get(n.id)!) ?? []), n]));
    const focusId = focusKey ? graph.nodes.find((n) => n.key === focusKey)?.id : undefined;
    const neighbours = new Set(
      focusId
        ? graph.edges.flatMap((e) =>
            e.source === focusId || e.target === focusId ? [e.source, e.target] : [],
          )
        : [],
    );
    // Barycentric ordering: place each node near the average row of its neighbours in earlier columns.
    const row = new Map<string, number>();
    const rfNodes: Node<EntityNodeData>[] = [];
    for (const [h, list] of [...columns.entries()].sort((a, b) => a[0] - b[0])) {
      const score = (n: GraphNode) => {
        const rows = graph.edges
          .flatMap((e) => (e.source === n.id ? [e.target] : e.target === n.id ? [e.source] : []))
          .flatMap((id) => (row.has(id) && hop.get(id)! < h ? [row.get(id)!] : []));
        return rows.length ? rows.reduce((a, b) => a + b, 0) / rows.length : Number.MAX_SAFE_INTEGER;
      };
      list
        .sort((a, b) => score(a) - score(b) || a.name.localeCompare(b.name))
        .forEach((n, i) => row.set(n.id, i - (list.length - 1) / 2));
      list.forEach((n, i) =>
        rfNodes.push({
          id: n.id,
          type: 'entity',
          position: { x: h * 300, y: i * 130 - ((list.length - 1) * 130) / 2 },
          data: {
            node: { ...n, hop: n.hop ?? h },
            dimmed: !!focusId && n.id !== focusId && !neighbours.has(n.id),
          },
          draggable: true,
        }),
      );
    }
    // Lay every link out left-to-right by hop; the arrowhead stays on the relationship's real object.
    const rfEdges: Edge<ImpactEdgeData>[] = graph.edges.map((e) => {
      const reversed = hop.get(e.source)! > hop.get(e.target)!;
      const marker = {
        type: MarkerType.ArrowClosed,
        color: EDGE_STYLE[e.relationshipClass].stroke,
        width: 14,
        height: 14,
      };
      return {
        id: e.id,
        source: reversed ? e.target : e.source,
        target: reversed ? e.source : e.target,
        type: 'impact',
        ...(reversed ? { markerStart: marker } : { markerEnd: marker }),
        data: { edge: e, onOpen: setOpenEdge },
      };
    });
    return { nodes: rfNodes, edges: rfEdges };
  }, [graph, focusKey]);

  return (
    <div className={cn('flex flex-col', className)}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-muted" aria-label="Link legend">
          {Object.entries(EDGE_STYLE).map(([cls, s]) => (
            <li key={cls} className="flex items-center gap-1.5">
              <svg width="22" height="6" aria-hidden>
                <line
                  x1="0"
                  y1="3"
                  x2="22"
                  y2="3"
                  stroke={s.stroke}
                  strokeWidth="2"
                  strokeDasharray={s.dash}
                />
              </svg>
              {s.label}
            </li>
          ))}
        </ul>
        <div
          className="flex rounded-md border border-line-strong p-0.5 text-xs"
          role="group"
          aria-label="Graph view"
        >
          {(['graph', 'list'] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={cn('relative rounded px-2.5 py-1', view === v ? 'text-ink' : 'text-ink-muted')}
            >
              {view === v ? (
                <motion.span
                  layoutId={`graph-view-${toggleId}`}
                  className="absolute inset-0 rounded bg-raised"
                  transition={INDICATOR_SPRING}
                  aria-hidden
                />
              ) : null}
              <span className="relative">{v === 'graph' ? 'Graph' : 'Table'}</span>
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {view === 'graph' ? (
          <FadeSwap
            key="graph"
            className="min-h-[26rem] flex-1 rounded-lg border border-line bg-canvas"
            role="group"
            aria-label="Impact graph canvas. Use the Table view for a keyboard-friendly list of every link."
          >
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              fitView
              fitViewOptions={{ padding: 0.15 }}
              minZoom={0.3}
              maxZoom={1.6}
              proOptions={{ hideAttribution: true }}
              colorMode="light"
              style={{ background: 'transparent' }}
              nodesConnectable={false}
            >
              <Background color="#ddd3bf" gap={22} size={1} />
            </ReactFlow>
          </FadeSwap>
        ) : (
          <FadeSwap key="list" className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-[44rem] text-sm">
              <caption className="sr-only">Every link in the graph with its class and confidence</caption>
              <thead>
                <tr className="border-b border-line bg-raised/50 text-xs text-ink-muted">
                  <th scope="col" className="px-4 py-2 text-start font-medium">
                    From
                  </th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">
                    Link
                  </th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">
                    To
                  </th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">
                    Class
                  </th>
                  <th scope="col" className="px-4 py-2 text-start font-medium">
                    Confidence
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {graph.edges.map((e) => (
                  <tr key={e.id}>
                    <td className="px-4 py-2 text-ink">{nameOf.get(e.source)}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => setOpenEdge(e)}
                        className="text-cyan underline-offset-2 hover:underline"
                      >
                        {e.predicate}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-ink">{nameOf.get(e.target)}</td>
                    <td className="px-3 py-2">
                      <ClaimBadge value={e.relationshipClass} />
                    </td>
                    <td className="px-4 py-2 text-ink-muted">{CONFIDENCE_LABEL[e.confidenceBand]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </FadeSwap>
        )}
      </AnimatePresence>

      <Sheet
        open={openEdge !== null}
        onOpenChange={(o) => !o && setOpenEdge(null)}
        title="Causal link"
        description={
          openEdge
            ? `${nameOf.get(openEdge.source)} → ${openEdge.predicate} → ${nameOf.get(openEdge.target)}`
            : undefined
        }
      >
        {openEdge ? (
          <div className="space-y-4 px-5 py-4 text-sm">
            <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-y-2.5">
              <dt className="text-ink-muted">Class</dt>
              <dd>
                <ClaimBadge value={openEdge.relationshipClass} />
              </dd>
              <dt className="text-ink-muted">Confidence</dt>
              <dd className="text-ink">{CONFIDENCE_LABEL[openEdge.confidenceBand]}</dd>
              <dt className="text-ink-muted">Status</dt>
              <dd className="capitalize text-ink">{openEdge.status}</dd>
              <dt className="text-ink-muted">Rationale</dt>
              <dd className="text-ink">{openEdge.rationale}</dd>
            </dl>
            <div>
              <h3 className="text-xs font-semibold text-ink-faint">Evidence</h3>
              {openEdge.evidence.length === 0 ? (
                <p className="mt-1 text-ink-muted">
                  No evidence record. This link is {openEdge.relationshipClass} and must be read as such.
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {openEdge.evidence.map((ev) => (
                    <li key={ev.evidenceId} className="rounded-lg border border-line bg-raised/40 px-3 py-2">
                      <p className="text-ink">{ev.title}</p>
                      <p className="text-xs capitalize text-ink-faint">{ev.stance}</p>
                      {onOpenEvidence ? (
                        <button
                          type="button"
                          onClick={() => {
                            setOpenEdge(null);
                            onOpenEvidence(ev.evidenceId);
                          }}
                          className="mt-1 text-xs font-medium text-cyan hover:underline"
                        >
                          Open lineage
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <p className="text-xs text-ink-faint">
              Causal links are analytical, not proof of causation. Challenging links arrives with expert
              review (Phase 4).
            </p>
          </div>
        ) : null}
      </Sheet>
    </div>
  );
}
