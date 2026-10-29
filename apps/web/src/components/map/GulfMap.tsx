/**
 * Gulf map (D-15, map spec §2–§8, TRD §13).
 * - Fully offline: Natural Earth 1:50m borders are bundled (public domain); no tile server, no glyph server.
 * - Movement is replay of illustrative tracks only, with a persistent "Illustrative simulation" label.
 * - Motion is user-controlled, paused under reduced-motion, and every item is also listed as text.
 */
import { MapboxOverlay } from '@deck.gl/mapbox';
import { TripsLayer } from '@deck.gl/geo-layers';
import { ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import type { GraphNode, MapLayers, MovementTrack, RelationshipClass } from '@tigeris/shared';
import type { FeatureCollection, LineString } from 'geojson';
import { FlaskConical, Minus, Pause, Play, Plus, RotateCcw } from 'lucide-react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/format';
import { colorToken } from '@/lib/tokens';

type RGBA = [number, number, number, number];

const C = {
  cyan: [22, 101, 106, 255] as RGBA,
  gold: [184, 146, 79, 255] as RGBA,
  emerald: [24, 103, 75, 255] as RGBA,
  red: [162, 57, 46, 255] as RGBA,
  muted: [99, 113, 106, 255] as RGBA,
  ink: [23, 38, 31, 255] as RGBA,
};

const TYPE_COLOR: Partial<Record<GraphNode['type'], RGBA>> = {
  event: C.red,
  chokepoint: C.cyan,
  port: C.cyan,
  terminal: C.emerald,
  holding: C.gold,
  asset: C.gold,
};

const LABELLED_TYPES = new Set<GraphNode['type']>(['event', 'chokepoint', 'port', 'terminal']);

const GEO_LABELS: { text: string; at: [number, number]; sea?: boolean }[] = [
  { text: 'SAUDI ARABIA', at: [46.0, 24.2] },
  { text: 'IRAN', at: [55.0, 29.3] },
  { text: 'IRAQ', at: [45.2, 31.4] },
  { text: 'KUWAIT', at: [47.6, 29.35] },
  { text: 'BAHRAIN', at: [50.15, 26.55] },
  { text: 'QATAR', at: [51.2, 25.25] },
  { text: 'UAE', at: [54.3, 23.6] },
  { text: 'OMAN', at: [57.4, 21.6] },
  { text: 'Arabian Gulf', at: [51.8, 27.4], sea: true },
  { text: 'Gulf of Oman', at: [58.4, 25.0], sea: true },
  { text: 'Arabian Sea', at: [60.2, 21.4], sea: true },
];

const GULF_BOUNDS: [[number, number], [number, number]] = [
  [47.0, 21.5],
  [61.0, 30.8],
];

let countriesPromise: Promise<FeatureCollection> | null = null;
function loadCountries(): Promise<FeatureCollection> {
  countriesPromise ??= Promise.all([
    import('world-atlas/countries-50m.json'),
    import('topojson-client'),
  ]).then(([topo, { feature }]) => {
    const t = (topo as { default: unknown }).default as Parameters<typeof feature>[0] & {
      objects: { countries: Parameters<typeof feature>[1] };
    };
    return feature(t, t.objects.countries) as unknown as FeatureCollection;
  });
  return countriesPromise;
}

function interpolate(track: MovementTrack, t: number): [number, number] | null {
  const pts = track.points;
  if (t < pts[0]![2] || t > pts[pts.length - 1]![2]) return null;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    if (t <= b[2]) {
      const f = b[2] === a[2] ? 0 : (t - a[2]) / (b[2] - a[2]);
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    }
  }
  return null;
}

function edgeGeoJson(layers: MapLayers): FeatureCollection<LineString, { cls: RelationshipClass }> {
  const byId = new Map(layers.entities.map((e) => [e.id, e]));
  return {
    type: 'FeatureCollection',
    features: layers.edges.flatMap((e) => {
      const a = byId.get(e.source);
      const b = byId.get(e.target);
      if (!a || !b || a.lon === null || b.lon === null) return [];
      return [
        {
          type: 'Feature',
          properties: { cls: e.relationshipClass },
          geometry: {
            type: 'LineString',
            coordinates: [
              [a.lon, a.lat!],
              [b.lon, b.lat!],
            ],
          },
        },
      ];
    }),
  };
}

const SPEEDS = [1, 4, 16] as const;

export interface GulfMapProps {
  layers: MapLayers;
  /** Entity keys to emphasise (others are dimmed). */
  focusKeys?: string[];
  interactive?: boolean;
  showTracks?: boolean;
  showControls?: boolean;
  className?: string;
  label: string;
  onSelectEntity?: (e: GraphNode) => void;
}

export function GulfMap({
  layers,
  focusKeys,
  interactive = true,
  showTracks = true,
  showControls = true,
  className,
  label,
  onSelectEntity,
}: GulfMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const timeRef = useRef(0);
  const reduced = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    [],
  );
  const [playing, setPlaying] = useState(!reduced && showTracks);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(4);
  const [time, setTime] = useState(0);
  const [failed, setFailed] = useState(false);
  const focus = useMemo(() => new Set(focusKeys ?? []), [focusKeys]);
  const duration = Math.max(layers.durationSeconds, 1);

  const buildLayers = useMemo(
    () => (t: number) => {
      const dim = (key: string) => focus.size > 0 && !focus.has(key);
      const result: unknown[] = [];
      if (showTracks) {
        result.push(
          new TripsLayer<MovementTrack>({
            id: 'trips',
            data: layers.tracks,
            getPath: (d) => d.points.map((p) => [p[0], p[1]] as [number, number]),
            getTimestamps: (d) => d.points.map((p) => p[2]),
            getColor: (d) => (d.kind === 'vessel' ? C.cyan : C.gold),
            widthMinPixels: 2.5,
            capRounded: true,
            jointRounded: true,
            fadeTrail: true,
            trailLength: 900,
            currentTime: t,
          }),
          new ScatterplotLayer<{ p: [number, number]; kind: MovementTrack['kind'] }>({
            id: 'heads',
            data: layers.tracks.flatMap((tr) => {
              const p = interpolate(tr, t);
              return p ? [{ p, kind: tr.kind }] : [];
            }),
            getPosition: (d) => d.p,
            getFillColor: (d) => (d.kind === 'vessel' ? C.cyan : C.gold),
            getLineColor: [255, 255, 255, 255],
            stroked: true,
            lineWidthMinPixels: 1.5,
            radiusMinPixels: 4.5,
            updateTriggers: { getPosition: t },
          }),
        );
      }
      const events = layers.entities.filter((e) => e.type === 'event');
      result.push(
        new ScatterplotLayer<GraphNode>({
          id: 'event-halo',
          data: [...events, ...events],
          getPosition: (d) => [d.lon!, d.lat!],
          getRadius: (_d, { index }) => (index < events.length ? 14 : 26),
          radiusUnits: 'pixels',
          stroked: true,
          filled: false,
          getLineColor: [162, 57, 46, 140],
          lineWidthMinPixels: 1.2,
        }),
        new ScatterplotLayer<GraphNode>({
          id: 'entities',
          data: layers.entities,
          pickable: interactive,
          getPosition: (d) => [d.lon!, d.lat!],
          getFillColor: (d) => {
            const c = TYPE_COLOR[d.type] ?? C.muted;
            return dim(d.key) ? [c[0], c[1], c[2], 90] : c;
          },
          getLineColor: [255, 255, 255, 255],
          stroked: true,
          lineWidthMinPixels: 2,
          radiusMinPixels: 6,
          radiusMaxPixels: 9,
          getRadius: 5000,
          onClick: (info) => {
            if (info.object && onSelectEntity) onSelectEntity(info.object as GraphNode);
          },
          updateTriggers: { getFillColor: [...focus].join() },
        }),
        new TextLayer<(typeof GEO_LABELS)[number]>({
          id: 'geo-labels',
          data: GEO_LABELS,
          getPosition: (d) => d.at,
          getText: (d) => d.text,
          getColor: (d) => (d.sea ? [22, 90, 96, 190] : [96, 84, 58, 200]),
          getSize: (d) => (d.sea ? 12 : 11),
          fontFamily: 'Inter Variable, Inter, Arial, sans-serif',
          fontWeight: 500,
          characterSet: 'auto',
          getTextAnchor: 'middle',
        }),
        new TextLayer<GraphNode>({
          id: 'entity-labels',
          data: layers.entities.filter((e) =>
            focus.size > 0 ? focus.has(e.key) : LABELLED_TYPES.has(e.type),
          ),
          getPosition: (d) => [d.lon!, d.lat!],
          getText: (d) => d.name,
          getColor: C.ink,
          getSize: 11.5,
          getPixelOffset: [10, 0],
          getTextAnchor: 'start',
          fontFamily: 'Inter Variable, Inter, Arial, sans-serif',
          fontWeight: 600,
          characterSet: 'auto',
          outlineWidth: 3,
          outlineColor: [255, 255, 255, 235],
          fontSettings: { sdf: true },
        }),
      );
      return result;
    },
    [layers, focus, showTracks, interactive, onSelectEntity],
  );

  // Create the map once.
  useEffect(() => {
    if (!container.current) return;
    let disposed = false;
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: container.current,
        style: {
          version: 8,
          sources: {},
          layers: [{ id: 'sea', type: 'background', paint: { 'background-color': colorToken('sea') } }],
        },
        bounds: GULF_BOUNDS,
        fitBoundsOptions: { padding: 12 },
        interactive,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
      });
    } catch {
      setFailed(true);
      return;
    }
    mapRef.current = map;
    map.on('error', () => {});
    map.on('load', async () => {
      const countries = await loadCountries();
      if (disposed) return;
      map.addSource('countries', { type: 'geojson', data: countries });
      map.addLayer({
        id: 'land',
        type: 'fill',
        source: 'countries',
        paint: { 'fill-color': colorToken('land') },
      });
      map.addLayer({
        id: 'coast-glow',
        type: 'line',
        source: 'countries',
        paint: { 'line-color': colorToken('coast'), 'line-opacity': 0.9, 'line-width': 5, 'line-blur': 3 },
      });
      map.addLayer({
        id: 'borders',
        type: 'line',
        source: 'countries',
        paint: { 'line-color': colorToken('border-gilt'), 'line-width': 0.8, 'line-dasharray': [3, 2] },
      });
      map.addSource('edges', { type: 'geojson', data: edgeGeoJson(layers) });
      const edgeLayer = (id: string, cls: RelationshipClass[], color: string, dash?: number[]) =>
        map.addLayer({
          id,
          type: 'line',
          source: 'edges',
          filter: ['in', ['get', 'cls'], ['literal', cls]],
          paint: {
            'line-color': color,
            'line-width': 1.8,
            'line-opacity': 0.85,
            ...(dash ? { 'line-dasharray': dash } : {}),
          },
        });
      edgeLayer('edges-solid', ['sourced', 'observed'], colorToken('cyan'));
      edgeLayer('edges-inferred', ['inferred'], colorToken('cyan'), [3, 2]);
      edgeLayer('edges-assumed', ['assumed'], colorToken('amber'), [1, 2]);
      edgeLayer('edges-synthetic', ['synthetic'], colorToken('gold'), [4, 3]);
      const overlay = new MapboxOverlay({ interleaved: true, layers: buildLayers(timeRef.current) as never });
      map.addControl(overlay as unknown as maplibregl.IControl);
      overlayRef.current = overlay;
      if (focus.size > 0) {
        const pts = layers.entities.filter((e) => focus.has(e.key));
        if (pts.length > 1) {
          const b = new maplibregl.LngLatBounds();
          pts.forEach((p) => b.extend([p.lon!, p.lat!]));
          map.fitBounds(b, { padding: 70, maxZoom: 7, duration: 0 });
        }
      }
    });
    return () => {
      disposed = true;
      overlayRef.current = null;
      map.remove();
      mapRef.current = null;
    };
    // The map instance is created once per layers payload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers]);

  // Animation loop (replay only).
  useEffect(() => {
    if (!playing) {
      overlayRef.current?.setProps({ layers: buildLayers(timeRef.current) as never });
      return;
    }
    let raf = 0;
    let last = performance.now();
    let lastUi = 0;
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      timeRef.current = (timeRef.current + dt * 60 * speed) % duration;
      overlayRef.current?.setProps({ layers: buildLayers(timeRef.current) as never });
      if (now - lastUi > 250) {
        setTime(timeRef.current);
        lastUi = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, duration, buildLayers]);

  const scrub = (v: number) => {
    timeRef.current = v;
    setTime(v);
    overlayRef.current?.setProps({ layers: buildLayers(v) as never });
  };

  const mm = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`; // taste-skill-ignore: replay clock (T+hh:mm)
  const source = layers.movementSource;

  return (
    <div className={cn('relative overflow-hidden rounded-lg border border-line bg-sea', className)}>
      {failed ? (
        <div className="flex h-full min-h-64 items-center justify-center p-6 text-center text-sm text-ink-muted">
          The map needs WebGL, which is unavailable in this browser. Use the list below.
        </div>
      ) : (
        <div ref={container} className="h-full w-full" role="img" aria-label={label} />
      )}

      {showTracks ? (
        <div className="pointer-events-none absolute end-3 top-3 flex flex-col items-end gap-1">
          <span className="pattern-synthetic inline-flex items-center gap-1.5 rounded-md border border-gold bg-gold-soft px-2.5 py-1 text-xs font-semibold text-gold-bright float-shadow">
            <FlaskConical className="h-3.5 w-3.5" aria-hidden />
            Illustrative simulation
          </span>
          {source ? (
            <span className="rounded bg-panel/90 px-2 py-0.5 text-[12px] text-ink-muted float-shadow">
              {source.publisher} ·{' '}
              {source.freshness === 'stale' ? (
                <span className="font-semibold text-amber">stale</span>
              ) : (
                'fresh'
              )}
              {source.lastRetrievedAt ? ` · generated ${formatRelative(source.lastRetrievedAt)}` : ''}
            </span>
          ) : null}
        </div>
      ) : null}

      {interactive && !failed ? (
        <div
          className={cn(
            'absolute end-3 flex flex-col overflow-hidden rounded-md border border-line bg-panel float-shadow',
            // The replay bar wraps to two rows on phones; keep the zoom pair clear of it.
            showTracks && showControls ? 'bottom-[6.5rem] sm:bottom-16' : 'bottom-16',
          )}
        >
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => mapRef.current?.zoomIn()}
            className="p-2 text-ink-muted hover:text-ink"
          >
            <Plus className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => mapRef.current?.zoomOut()}
            className="border-t border-line p-2 text-ink-muted hover:text-ink"
          >
            <Minus className="h-4 w-4" aria-hidden />
          </button>
        </div>
      ) : null}

      {showTracks && showControls && !failed ? (
        <div className="absolute inset-x-3 bottom-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-line bg-panel/95 px-3 py-2 float-shadow sm:flex-nowrap sm:gap-3">
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? 'Pause replay' : 'Play replay'}
            className="flex h-8 w-8 items-center justify-center rounded text-brand hover:bg-raised hover:text-brand-hover"
          >
            {playing ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
          </button>
          <button
            type="button"
            onClick={() => scrub(0)}
            aria-label="Restart replay"
            className="flex h-8 w-8 items-center justify-center rounded text-ink-muted hover:bg-raised hover:text-ink"
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
          </button>
          <input
            type="range"
            min={0}
            max={duration}
            step={10}
            value={Math.round(time)}
            onChange={(e) => scrub(Number(e.target.value))}
            aria-label="Replay position"
            aria-valuetext={`Replay minute ${mm(time)} of ${mm(duration)}`}
            className="order-last h-8 min-w-0 basis-full accent-brand sm:order-none sm:basis-auto sm:flex-1"
          />
          <span className="tabular ms-auto w-24 shrink-0 text-end text-[12px] text-ink-muted sm:ms-0">
            T+{mm(time)} replay
          </span>
          <label className="sr-only" htmlFor="replay-speed">
            Replay speed
          </label>
          <select
            id="replay-speed"
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value) as (typeof SPEEDS)[number])}
            className="h-8 rounded border border-line-strong bg-panel px-1.5 text-[12px] text-ink"
          >
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </div>
  );
}

export function MapLegend({ showTracks = true }: { showTracks?: boolean }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-muted" aria-label="Map legend">
      <li className="flex items-center gap-1.5">
        <span className="h-0.5 w-5 bg-cyan" aria-hidden /> Sourced / observed link
      </li>
      <li className="flex items-center gap-1.5">
        <span className="h-0 w-5 border-t-2 border-dashed border-cyan" aria-hidden /> Inferred
      </li>
      <li className="flex items-center gap-1.5">
        <span className="h-0 w-5 border-t-2 border-dotted border-amber" aria-hidden /> Assumption
      </li>
      <li className="flex items-center gap-1.5">
        <span className="h-0 w-5 border-t-2 border-dashed border-gold-bright" aria-hidden /> Synthetic
      </li>
      <li className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-red" aria-hidden /> Event
      </li>
      <li className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-cyan" aria-hidden /> Port / chokepoint
      </li>
      <li className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-emerald" aria-hidden /> Terminal
      </li>
      <li className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-gold-bright" aria-hidden /> Synthetic asset
      </li>
      {showTracks ? (
        <li className="flex items-center gap-1.5">
          <span className="h-0.5 w-5 bg-cyan" aria-hidden /> Vessel ·{' '}
          <span className="h-0.5 w-5 bg-gold-bright" aria-hidden /> Truck (illustrative)
        </li>
      ) : null}
    </ul>
  );
}

/** Text alternative for everything the map draws (WCAG 1.1.1), with the legend. */
export function MapItemList({ layers, focusKeys }: { layers: MapLayers; focusKeys?: string[] }) {
  const shown = focusKeys?.length
    ? layers.entities.filter((e) => focusKeys.includes(e.key))
    : layers.entities;
  return (
    <div className="mt-3 space-y-2">
      <MapLegend showTracks={layers.tracks.length > 0} />
      <details className="text-sm">
        <summary className="cursor-pointer text-ink-muted hover:text-ink">Map contents as a list</summary>
        <ul className="mt-2 grid gap-1 sm:grid-cols-2">
          {shown.map((e) => (
            <li key={e.id} className="text-ink-muted">
              <span className="text-ink">{e.name}</span>: {e.type}, {e.geoPrecision} location, {e.claimClass}
            </li>
          ))}
          {layers.tracks.map((t) => (
            <li key={t.id} className="text-ink-muted">
              <span className="text-ink">{t.label}</span>: {t.kind} track, illustrative replay
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
