/**
 * Observation parsers (D-127, slice L1). Each turns one provider's documented response format into dated values. They
 * are pure: the same body always yields the same observations, and anything they cannot read is reported, never
 * guessed. Missing values (FRED's ".", World Bank nulls) are skipped, not turned into zero.
 */
import type { ObservationFormat } from '@tigeris/shared';

export interface Observation {
  /** Provider series identifier, e.g. FRED "DCOILBRENTEU" or "PortWatch:chokepoint6:n_total". */
  seriesKey: string;
  /** Observation date, YYYY-MM-DD (annual data uses the first day of the year). */
  observedOn: string;
  value: number;
  unit: string | null;
}

/** For ArcGIS feature services, whose field names differ per service: named by the connector, never assumed. */
export interface ArcgisFields {
  dateField: string;
  valueFields: string[];
  seriesField: string;
  seriesPrefix: string;
}

export class ParseError extends Error {}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
function day(raw: unknown): string | null {
  if (typeof raw === 'number') return isoDay(new Date(raw)); // epoch milliseconds (ArcGIS)
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}$/.test(s)) return `${s}-01`;
  if (/^\d{4}$/.test(s)) return `${s}-01-01`;
  return null;
}
const num = (raw: unknown): number | null => {
  if (raw === null || raw === undefined || raw === '' || raw === '.') return null;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
};

/** Splits one CSV line, honouring double quotes. Provider CSVs here are simple; no embedded newlines. */
function csvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}
const rows = (body: string) =>
  body
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map(csvLine);

/** FRED graph CSV: a date column ("observation_date" or "DATE") then one column per series; "." is missing. */
function fred(body: string, unit: string | null): Observation[] {
  const [head, ...data] = rows(body);
  if (!head || head.length < 2 || !/date/i.test(head[0]!)) throw new ParseError('Not a FRED series CSV.');
  const out: Observation[] = [];
  for (const r of data)
    for (let c = 1; c < head.length; c++) {
      const d = day(r[0]);
      const v = num(r[c]);
      if (d && v !== null) out.push({ seriesKey: head[c]!.trim(), observedOn: d, value: v, unit });
    }
  return out;
}

/** ECB Data Portal SDMX CSV: KEY, TIME_PERIOD and OBS_VALUE columns, plus UNIT when present. */
function ecb(body: string): Observation[] {
  const [head, ...data] = rows(body);
  const ix = (n: string) => head?.indexOf(n) ?? -1;
  const [k, t, v, u] = [ix('KEY'), ix('TIME_PERIOD'), ix('OBS_VALUE'), ix('UNIT')];
  if (k < 0 || t < 0 || v < 0)
    throw new ParseError('Not an ECB SDMX CSV (needs KEY, TIME_PERIOD, OBS_VALUE).');
  return data.flatMap((r) => {
    const d = day(r[t]);
    const val = num(r[v]);
    return d && val !== null
      ? [{ seriesKey: `ECB:${r[k]}`, observedOn: d, value: val, unit: u >= 0 ? r[u] || null : null }]
      : [];
  });
}

/** World Bank Indicators API: [paging, [{ indicator: { id }, countryiso3code, date, value, unit }]]. */
function worldbank(body: string): Observation[] {
  const j = JSON.parse(body) as unknown;
  if (!Array.isArray(j) || !Array.isArray(j[1])) {
    const msg = Array.isArray(j) ? (j[0] as { message?: { value?: string }[] })?.message?.[0]?.value : null;
    throw new ParseError(msg ? `World Bank: ${msg}` : 'Not a World Bank Indicators response.');
  }
  return (j[1] as Record<string, unknown>[]).flatMap((r) => {
    const ind = (r.indicator as { id?: string } | undefined)?.id;
    const d = day(r.date);
    const v = num(r.value);
    return ind && d && v !== null
      ? [
          {
            seriesKey: `WB:${r.countryiso3code || (r.country as { id?: string })?.id}:${ind}`,
            observedOn: d,
            value: v,
            unit: (r.unit as string) || null,
          },
        ]
      : [];
  });
}

/** EIA Open Data v2: { response: { data: [{ period, series | product, value, units }] } }. */
function eia(body: string): Observation[] {
  const j = JSON.parse(body) as { response?: { data?: Record<string, unknown>[] }; error?: string };
  if (j.error) throw new ParseError(`EIA: ${j.error}`);
  if (!Array.isArray(j.response?.data)) throw new ParseError('Not an EIA v2 response.');
  return j.response.data.flatMap((r) => {
    const id = (r.series ?? r['series-id'] ?? r.product ?? r.seriesId) as string | undefined;
    const d = day(r.period);
    const v = num(r.value);
    return id && d && v !== null
      ? [{ seriesKey: `EIA:${id}`, observedOn: d, value: v, unit: (r.units as string) || null }]
      : [];
  });
}

/** ArcGIS feature service query (f=json): { features: [{ attributes }] }, fields named by the connector. */
function arcgis(body: string, f: ArcgisFields | undefined): Observation[] {
  if (!f) throw new ParseError('An ArcGIS connector must name its date, value and series fields.');
  const j = JSON.parse(body) as {
    features?: { attributes?: Record<string, unknown> }[];
    error?: { message?: string };
  };
  if (j.error) throw new ParseError(`ArcGIS: ${j.error.message ?? 'query failed'}`);
  if (!Array.isArray(j.features)) throw new ParseError('Not an ArcGIS feature query response.');
  const first = j.features[0]?.attributes;
  if (first) {
    const missing = [f.dateField, f.seriesField, ...f.valueFields].filter((n) => !(n in first));
    if (missing.length) throw new ParseError(`ArcGIS response has no field(s): ${missing.join(', ')}.`);
  }
  return j.features.flatMap(({ attributes: a = {} }) => {
    const d = day(a[f.dateField]);
    return d
      ? f.valueFields.flatMap((vf) => {
          const v = num(a[vf]);
          return v === null
            ? []
            : [
                {
                  seriesKey: `${f.seriesPrefix}:${a[f.seriesField]}:${vf}`,
                  observedOn: d,
                  value: v,
                  unit: null,
                },
              ];
        })
      : [];
  });
}

export function parseObservations(
  format: ObservationFormat,
  body: string,
  opts: { unit?: string | null; arcgis?: ArcgisFields } = {},
): Observation[] {
  try {
    switch (format) {
      case 'fred_csv':
        return fred(body, opts.unit ?? null);
      case 'ecb_csv':
        return ecb(body);
      case 'worldbank_json':
        return worldbank(body);
      case 'eia_v2':
        return eia(body);
      case 'arcgis_features':
        return arcgis(body, opts.arcgis);
    }
  } catch (e) {
    if (e instanceof ParseError) throw e;
    throw new ParseError(
      e instanceof SyntaxError
        ? `The response is not valid ${format.endsWith('csv') ? 'CSV' : 'JSON'}.`
        : (e as Error).message,
    );
  }
}

/**
 * The request for an observation connector. EIA expects its key as the `api_key` query parameter rather than a
 * header, so it is added to the URL from the named environment variable at the moment of use, never stored.
 */
export function observationRequest(c: {
  endpoint: string | null;
  authType: string;
  authRef: string | null;
  format: ObservationFormat;
}): { endpoint: string | null; authType: string; accept: string } {
  const accept = c.format.endsWith('csv') ? 'text/csv' : 'application/json';
  if (c.format !== 'eia_v2' || c.authType !== 'api_key' || !c.endpoint)
    return { endpoint: c.endpoint, authType: c.authType, accept };
  const key = c.authRef ? process.env[c.authRef] : undefined;
  if (!key)
    throw new ParseError(`Credential ${c.authRef ?? '(none named)'} is not set in the server environment.`);
  const url = new URL(c.endpoint);
  url.searchParams.set('api_key', key);
  return { endpoint: url.toString(), authType: 'none', accept };
}
