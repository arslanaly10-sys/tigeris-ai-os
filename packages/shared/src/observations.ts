/**
 * Live data (D-127). Observations are dated values fetched from a public or licensed source. Whether one may be shown
 * as Live is decided here, in one place: only a proven, recent fetch from a connected connector is Live.
 */
import type { ConnectorStatus } from './connectors';

/** Response formats the observation parsers understand. Each maps to one provider's documented format. */
export const OBSERVATION_FORMATS = [
  'fred_csv',
  'ecb_csv',
  'worldbank_json',
  'eia_v2',
  'arcgis_features',
] as const;
export type ObservationFormat = (typeof OBSERVATION_FORMATS)[number];

export const OBSERVATION_FORMAT_LABEL: Record<ObservationFormat, string> = {
  fred_csv: 'FRED series (CSV)',
  ecb_csv: 'ECB Data Portal (SDMX CSV)',
  worldbank_json: 'World Bank Indicators (JSON)',
  eia_v2: 'EIA Open Data v2 (JSON)',
  arcgis_features: 'ArcGIS feature service (JSON), e.g. IMF PortWatch',
};

export type Freshness = 'live' | 'snapshot' | 'stale';

/** Never more than 48 hours, whatever the schedule. */
export const MAX_LIVE_WINDOW_MS = 48 * 3_600_000;

/**
 * Live only when the connector's last fetch succeeded and this value was fetched within twice the schedule interval
 * (capped at 48 hours). A value from a connector that is not connected, or with no schedule, is a Snapshot; a value
 * past its window is Stale. The caller must still show source, observation date and fetch time.
 */
export function freshness(input: {
  connectorStatus: ConnectorStatus;
  fetchedAt: Date;
  scheduleIntervalMs: number | null;
  now?: Date;
}): Freshness {
  const now = input.now ?? new Date();
  const age = now.getTime() - input.fetchedAt.getTime();
  if (input.connectorStatus !== 'connected' || !input.scheduleIntervalMs) return 'snapshot';
  const window = Math.min(2 * input.scheduleIntervalMs, MAX_LIVE_WINDOW_MS);
  return age >= 0 && age <= window ? 'live' : 'stale';
}

export const FRESHNESS_LABEL: Record<Freshness, string> = {
  live: 'Live',
  snapshot: 'Snapshot',
  stale: 'Stale',
};

/**
 * Interval of a cron schedule in milliseconds, for the schedules this product offers (every N minutes, hourly,
 * every N hours, daily, weekly). Null when it cannot be read with confidence, which makes the value a Snapshot.
 */
export function cronIntervalMs(cron: string | null): number | null {
  if (!cron) return null;
  const f = cron.trim().split(/\s+/);
  if (f.length !== 5) return null;
  const [min, hour, dom, mon, dow] = f as [string, string, string, string, string];
  const step = (s: string) => (/^\*\/(\d+)$/.exec(s) ? Number(/^\*\/(\d+)$/.exec(s)![1]) : null);
  if (dom !== '*' || mon !== '*') return null;
  if (dow !== '*') return /^\d$/.test(dow) && /^\d+$/.test(hour) && /^\d+$/.test(min) ? 7 * 86_400_000 : null;
  if (step(min) && hour === '*') return step(min)! * 60_000;
  if (/^\d+$/.test(min) && hour === '*') return 3_600_000;
  if (/^\d+$/.test(min) && step(hour)) return step(hour)! * 3_600_000;
  if (/^\d+$/.test(min) && /^\d+$/.test(hour)) return 86_400_000;
  return null;
}
