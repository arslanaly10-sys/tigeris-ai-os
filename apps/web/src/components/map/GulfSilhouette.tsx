import type { FeatureCollection, Geometry, Position } from 'geojson';
import { useEffect, useState } from 'react';

/** Decorative, non-interactive Gulf silhouette (Natural Earth 1:50m, equirectangular). aria-hidden by caller. */
const VIEW = { minLon: 34, maxLon: 64, minLat: 11, maxLat: 34 };
const W = 1000;
const H = Math.round(
  (W * (VIEW.maxLat - VIEW.minLat)) / ((VIEW.maxLon - VIEW.minLon) * Math.cos((22 * Math.PI) / 180)),
);

const project = ([lon, lat]: Position) =>
  `${(((lon! - VIEW.minLon) / (VIEW.maxLon - VIEW.minLon)) * W).toFixed(1)},${(((VIEW.maxLat - lat!) / (VIEW.maxLat - VIEW.minLat)) * H).toFixed(1)}`;

function ringPath(ring: Position[]) {
  return `M${ring.map(project).join('L')}Z`;
}

function geometryPath(g: Geometry): string {
  if (g.type === 'Polygon') return g.coordinates.map(ringPath).join('');
  if (g.type === 'MultiPolygon') return g.coordinates.flatMap((p) => p.map(ringPath)).join('');
  return '';
}

// Decorative accents at real city locations; no data is implied.
const CITIES: Position[] = [
  [46.7, 24.7],
  [55.3, 25.2],
  [54.4, 24.5],
  [51.5, 25.3],
  [47.98, 29.37],
  [50.58, 26.22],
  [58.4, 23.6],
  [39.2, 21.5],
  [50.1, 26.4],
  [44.4, 33.3],
  [51.4, 35.7],
];

export function GulfSilhouette({ className }: { className?: string }) {
  const [d, setD] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    Promise.all([import('world-atlas/countries-50m.json'), import('topojson-client')]).then(
      ([topo, { feature }]) => {
        const t = (topo as { default: unknown }).default as Parameters<typeof feature>[0] & {
          objects: { countries: Parameters<typeof feature>[1] };
        };
        const fc = feature(t, t.objects.countries) as unknown as FeatureCollection;
        const path = fc.features
          .filter((f) => {
            const g = f.geometry;
            const first =
              g.type === 'Polygon'
                ? g.coordinates[0]?.[0]
                : g.type === 'MultiPolygon'
                  ? g.coordinates[0]?.[0]?.[0]
                  : null;
            return first ? first[0]! > 20 && first[0]! < 80 && first[1]! > -5 && first[1]! < 50 : false;
          })
          .map((f) => geometryPath(f.geometry))
          .join('');
        if (alive) setD(path);
      },
    );
    return () => {
      alive = false;
    };
  }, []);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" className={className}>
      <defs>
        <radialGradient id="sea" cx="55%" cy="45%" r="75%">
          <stop offset="0%" stopColor="#0b1a30" />
          <stop offset="100%" stopColor="#040a14" />
        </radialGradient>
        <filter id="glow" x="-5%" y="-5%" width="110%" height="110%">
          <feGaussianBlur stdDeviation="2.4" />
        </filter>
        <radialGradient id="city">
          <stop offset="0%" stopColor="#f6dfa6" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#c9ad72" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width={W} height={H} fill="url(#sea)" />
      {d ? (
        <>
          <path d={d} fill="#0f1e35" />
          <path
            d={d}
            fill="none"
            stroke="#c9ad72"
            strokeOpacity="0.35"
            strokeWidth="2.5"
            filter="url(#glow)"
          />
          <path d={d} fill="none" stroke="#c9ad72" strokeOpacity="0.55" strokeWidth="0.6" />
        </>
      ) : null}
      {CITIES.map((c, i) => {
        const [x, y] = project(c).split(',').map(Number);
        return <circle key={i} cx={x} cy={y} r={9} fill="url(#city)" />;
      })}
    </svg>
  );
}
