/**
 * Entity and dependency explorer (slice E). Lists the shared graph's entities by sector workspace and type; for one
 * entity it shows what it relies on, what is exposed if it is disrupted, context links, the positions held through
 * it and the cases that cite it. Dependencies are read from each link's predicate in shared code; positions and
 * cases arrive already filtered to the reader's clearance and workspaces.
 */
import {
  ENTITY_TYPES,
  SECTORS,
  SECTOR_BY_KEY,
  type DependencyStep,
  type EntityDetail,
  type EntityType,
  type GraphEdge,
  type SectorKey,
} from '@tigeris/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownRight, ArrowUpLeft, Network, Search } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { RecordModeBadge } from '@/components/data/badges';
import { LoadState } from '@/components/PageHeader';
import { ClaimBadge, StateBadge } from '@/components/truth/badges';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { humanize } from '@/lib/format';

const field =
  'min-h-10 w-full rounded-md border border-line-strong bg-panel px-3 text-sm text-ink focus-visible:border-brand';

function linkSentence(edge: GraphEdge, names: Map<string, string>) {
  return `${names.get(edge.source) ?? 'Unknown'} ${edge.predicate} ${names.get(edge.target) ?? 'Unknown'}`;
}

function LinkFacts({ edge }: { edge: GraphEdge }) {
  return (
    <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
      <ClaimBadge value={edge.relationshipClass} />
      <span>{humanize(edge.confidenceBand)} confidence</span>
      <span aria-hidden>·</span>
      <span>
        {edge.evidence.length} evidence {edge.evidence.length === 1 ? 'item' : 'items'}
      </span>
      {edge.status === 'challenged' ? <span className="font-semibold text-amber">Challenged</span> : null}
    </span>
  );
}

function Chain({
  title,
  description,
  icon,
  steps,
  names,
  empty,
  onSelect,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  steps: DependencyStep[];
  names: Map<string, string>;
  empty: string;
  onSelect: (key: string) => void;
}) {
  const id = `chain-${title.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <section aria-labelledby={id} className="min-w-0">
      <h3 id={id} className="flex items-center gap-2 text-sm font-semibold text-ink">
        {icon}
        {title}
      </h3>
      <p className="mt-0.5 text-xs text-ink-muted">{description}</p>
      {steps.length === 0 ? (
        <p className="mt-3 text-sm text-ink-muted">{empty}</p>
      ) : (
        <ol className="mt-3 space-y-2">
          {steps.map((s) => (
            <li
              key={s.node.id}
              className="rounded-lg border border-line bg-panel px-3 py-2"
              style={{ marginInlineStart: `${Math.min(s.hop - 1, 3) * 0.75}rem` }}
            >
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="tabular text-xs text-ink-faint">
                  {s.hop} {s.hop === 1 ? 'step' : 'steps'}
                </span>
                <button
                  type="button"
                  onClick={() => onSelect(s.node.key)}
                  className="text-start text-sm font-medium text-cyan underline underline-offset-2"
                >
                  {s.node.name}
                </button>
                <span className="text-xs text-ink-faint">{humanize(s.node.type)}</span>
              </span>
              <span className="mt-0.5 block text-xs text-ink">{linkSentence(s.edge, names)}</span>
              <LinkFacts edge={s.edge} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Detail({ d, onSelect }: { d: EntityDetail; onSelect: (key: string) => void }) {
  const names = useMemo(() => {
    const m = new Map<string, string>([[d.entity.id, d.entity.name]]);
    for (const s of [...d.upstream, ...d.downstream]) m.set(s.node.id, s.node.name);
    for (const r of d.related) m.set(r.node.id, r.node.name);
    return m;
  }, [d]);
  const p = d.positions;
  return (
    <div className="space-y-6 px-5 pb-5">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-ink-muted">{humanize(d.entity.type)}</span>
          <ClaimBadge value={d.entity.claimClass} />
        </div>
        <h2 className="mt-1 text-xl text-ink">{d.entity.name}</h2>
        <p className="mt-1 max-w-prose text-sm text-ink">{d.entity.description}</p>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          {d.sectors.length ? (
            d.sectors.map((k) => (
              <Link key={k} to={`/sectors/${k}`} className="text-cyan underline underline-offset-2">
                {SECTOR_BY_KEY[k].label}
              </Link>
            ))
          ) : (
            <span className="text-ink-muted">Not configured in a sector workspace</span>
          )}
          <Link
            to={`/graph?focus=${encodeURIComponent(d.entity.key)}`}
            className="text-cyan underline underline-offset-2"
          >
            Show on the graph
          </Link>
        </p>
      </div>

      <div className={cn('grid gap-6', d.upstream.length && d.downstream.length && 'xl:grid-cols-2')}>
        <Chain
          title="Relies on"
          description={`What this depends on, then what those depend on, up to ${d.maxHops} steps.`}
          icon={<ArrowUpLeft className="h-4 w-4 text-brand" aria-hidden />}
          steps={d.upstream}
          names={names}
          empty="No recorded dependencies."
          onSelect={onSelect}
        />
        <Chain
          title="Exposed if disrupted"
          description={`What depends on this, directly or through others, up to ${d.maxHops} steps.`}
          icon={<ArrowDownRight className="h-4 w-4 text-brand" aria-hidden />}
          steps={d.downstream}
          names={names}
          empty="Nothing recorded depends on this."
          onSelect={onSelect}
        />
      </div>

      {d.related.length ? (
        <section aria-labelledby="related-heading">
          <h3 id="related-heading" className="text-sm font-semibold text-ink">
            Context and alternatives
          </h3>
          <p className="mt-0.5 text-xs text-ink-muted">
            Direct links that state a place, an event or an alternative, not a dependency.
          </p>
          <ul className="mt-3 grid gap-2 md:grid-cols-2">
            {d.related.map((r) => (
              <li key={r.edge.id} className="rounded-lg border border-line bg-panel px-3 py-2">
                <button
                  type="button"
                  onClick={() => onSelect(r.node.key)}
                  className="text-start text-sm font-medium text-cyan underline underline-offset-2"
                >
                  {r.node.name}
                </button>
                <span className="mt-0.5 block text-xs text-ink">{linkSentence(r.edge, names)}</span>
                <LinkFacts edge={r.edge} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="held-heading">
        <h3 id="held-heading" className="text-sm font-semibold text-ink">
          Positions held through this entity
        </h3>
        {p.positions.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">
            No positions are held through this entity within your clearance and workspaces.
          </p>
        ) : (
          <>
            <p className="tabular mt-0.5 text-xs text-ink-muted">
              {p.totals.rows} {p.totals.rows === 1 ? 'row' : 'rows'} · {p.totals.navSharePct}% of NAV ·{' '}
              {p.totals.routeDependentCount} route-dependent. Totals cover the rows you are cleared to read.
            </p>
            <div
              className="mt-2 overflow-x-auto rounded-lg border border-line"
              tabIndex={0}
              role="region"
              aria-label="Positions held through this entity"
            >
              <table className="w-full min-w-[36rem] text-sm">
                <caption className="sr-only">Positions held through {d.entity.name}</caption>
                <thead>
                  <tr className="bg-raised text-xs text-ink-muted">
                    <th scope="col" className="px-3 py-2 text-start font-semibold">
                      Position
                    </th>
                    <th scope="col" className="px-3 py-2 text-start font-semibold">
                      Workspace
                    </th>
                    <th scope="col" className="whitespace-nowrap px-3 py-2 text-end font-semibold">
                      % NAV
                    </th>
                    <th scope="col" className="px-3 py-2 text-start font-semibold">
                      Record
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {p.positions.map((x) => (
                    <tr key={x.id}>
                      <td className="px-3 py-2 align-top">
                        <span className="text-ink">{x.name}</span>
                        <span className="block text-xs text-ink-faint">
                          {x.key} · as of {x.asOf}
                          {x.routeDependent ? ' · route-dependent' : ''}
                        </span>
                      </td>
                      <td className="px-3 py-2 align-top text-ink">
                        {x.sectorKey ? SECTOR_BY_KEY[x.sectorKey].label : 'Institution'}
                      </td>
                      <td className="tabular px-3 py-2 text-end align-top text-ink">{x.navSharePct}</td>
                      <td className="px-3 py-2 align-top">
                        <RecordModeBadge value={x.provenance.recordMode} />
                        <span className="block text-xs text-ink-faint">{x.provenance.sourcePublisher}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section aria-labelledby="ent-cases-heading">
        <h3 id="ent-cases-heading" className="text-sm font-semibold text-ink">
          Cases citing this entity
        </h3>
        {d.cases.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">No cases you may open cite this entity.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
            {d.cases.map((c) => (
              <li key={c.key}>
                <Link
                  to={`/cases/${c.key}`}
                  className="flex flex-wrap items-center gap-2 px-3 py-2 hover:bg-raised/60"
                >
                  <span className="tabular text-xs text-ink-faint">{c.key}</span>
                  <StateBadge value={c.state} />
                  <span className="min-w-0 flex-1 text-sm font-medium text-ink">{c.title}</span>
                  <span className="text-xs text-ink-muted">{humanize(c.role)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function EntityExplorer({
  selected,
  onSelect,
  initialSector,
}: {
  selected: string | null;
  onSelect: (key: string) => void;
  initialSector?: SectorKey;
}) {
  const [sector, setSector] = useState<SectorKey | ''>(initialSector ?? '');
  const [type, setType] = useState<EntityType | ''>('');
  const [text, setText] = useState('');
  const detailRef = useRef<HTMLDivElement>(null);
  const list = useQuery({
    queryKey: ['entities', sector, type],
    queryFn: () => api.entities({ sector: sector || undefined, type: type || undefined }),
  });
  const needle = text.trim().toLowerCase();
  const rows = (list.data ?? []).filter((e) => !needle || e.name.toLowerCase().includes(needle));
  const active = selected ?? rows[0]?.key ?? null;
  const detail = useQuery({
    queryKey: ['entity', active],
    queryFn: () => api.entity(active!),
    enabled: !!active,
  });
  const select = (key: string) => {
    onSelect(key);
    if (window.matchMedia('(max-width: 1023px)').matches)
      detailRef.current?.scrollIntoView({ block: 'start' });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
      <Panel aria-labelledby="entities-heading" className="self-start">
        <PanelHeader
          id="entities-heading"
          icon={<Network className="h-4 w-4" aria-hidden />}
          title="Entities"
          description="The shared graph, by sector workspace and type."
        />
        <div className="space-y-2 border-t border-line px-4 py-3">
          <label className="block text-xs font-medium text-ink-muted">
            Sector workspace
            <select
              className={cn(field, 'mt-1')}
              value={sector}
              onChange={(e) => setSector(e.target.value as SectorKey | '')}
            >
              <option value="">All workspaces</option>
              {SECTORS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium text-ink-muted">
            Entity type
            <select
              className={cn(field, 'mt-1')}
              value={type}
              onChange={(e) => setType(e.target.value as EntityType | '')}
            >
              <option value="">All types</option>
              {ENTITY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {humanize(t)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium text-ink-muted">
            Find by name
            <span className="relative mt-1 block">
              <Search
                className="pointer-events-none absolute start-3 top-3 h-4 w-4 text-ink-faint"
                aria-hidden
              />
              <input
                type="search"
                className={cn(field, 'ps-9')}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </span>
          </label>
        </div>
        <LoadState isPending={list.isPending} error={list.error} />
        {list.data ? (
          rows.length === 0 ? (
            <p className="border-t border-line px-4 py-3 text-sm text-ink-muted">No entities match.</p>
          ) : (
            <ul
              className="max-h-[36rem] divide-y divide-line overflow-y-auto border-t border-line"
              tabIndex={0}
              aria-label="Entity list"
            >
              {rows.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    aria-current={e.key === active ? 'true' : undefined}
                    onClick={() => select(e.key)}
                    className={cn(
                      'block w-full px-4 py-2.5 text-start hover:bg-raised/60',
                      e.key === active && 'bg-brand-soft',
                    )}
                  >
                    <span
                      className={cn(
                        'block text-sm font-medium',
                        e.key === active ? 'text-brand' : 'text-ink',
                      )}
                    >
                      {e.name}
                    </span>
                    <span className="tabular block text-xs text-ink-muted">
                      {humanize(e.type)} · relies on {e.dependsOn} · {e.dependents} depend on it
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : null}
        {list.data ? (
          <p className="tabular border-t border-line px-4 py-2 text-xs text-ink-muted">
            {rows.length} of {list.data.length} entities
          </p>
        ) : null}
      </Panel>

      <div ref={detailRef} className="scroll-mt-4">
        <Panel aria-label="Entity detail" className="pt-5">
          {active ? (
            detail.data ? (
              <Detail d={detail.data} onSelect={select} />
            ) : (
              <LoadState isPending={detail.isPending} error={detail.error} />
            )
          ) : (
            <p className="px-5 pb-5 text-sm text-ink-muted">Choose an entity to see its dependencies.</p>
          )}
        </Panel>
      </div>
    </div>
  );
}
