/**
 * Connector framework vocabulary and the versioned dataset mappings used by file ingestion (FR-06, FR-07, FR-10).
 * Validation is pure and deterministic: the same file always yields the same accepted rows and row-level issues.
 */
import { SECTOR_DATASET_DEFS, SECTOR_DATASETS } from './sector-models';
import { SECTOR_KEYS, type SectorKey } from './sectors';

export const CONNECTION_TYPES = [
  'file',
  'rest',
  'webhook',
  'sql',
  'sftp',
  'rss',
  'document',
  'stream',
] as const;
export type ConnectionType = (typeof CONNECTION_TYPES)[number];

export const AUTH_TYPES = ['none', 'api_key', 'oauth2', 'basic', 'mtls', 'ssh_key'] as const;
export type AuthType = (typeof AUTH_TYPES)[number];

/** `connected` only after an authenticated fetch has succeeded; never set by registration alone. */
export const CONNECTOR_STATUSES = [
  'sample',
  'configured',
  'connected',
  'paused',
  'failed',
  'retired',
] as const;
export type ConnectorStatus = (typeof CONNECTOR_STATUSES)[number];

export const CONNECTION_TYPE_LABEL: Record<ConnectionType, string> = {
  file: 'File import (CSV, XLSX, JSON)',
  document: 'Document upload (PDF, DOCX, TXT)',
  rest: 'REST API (read-only)',
  rss: 'Public feed (RSS / JSON)',
  webhook: 'Webhook (inbound)',
  sql: 'Relational database',
  sftp: 'Secure file transfer (SFTP)',
  stream: 'Event stream',
};

/** What this build can actually run for each connection type. Everything else is declared, not pretended. */
export const CONNECTION_SUPPORT: Record<ConnectionType, 'implemented' | 'adapter_boundary'> = {
  file: 'implemented',
  document: 'implemented',
  rest: 'implemented',
  rss: 'implemented',
  webhook: 'adapter_boundary',
  sql: 'adapter_boundary',
  sftp: 'adapter_boundary',
  stream: 'adapter_boundary',
};

export const DATASETS = [
  'positions',
  'managers',
  'due_diligence',
  'documents',
  'signals',
  ...SECTOR_DATASETS,
] as const;
export type Dataset = (typeof DATASETS)[number];
export const TABULAR_DATASETS = ['positions', 'managers', 'due_diligence', ...SECTOR_DATASETS] as const;
export type TabularDataset = (typeof TABULAR_DATASETS)[number];

export const DATASET_LABEL: Record<Dataset, string> = {
  positions: 'Portfolio positions',
  managers: 'Managers',
  due_diligence: 'Due-diligence records',
  documents: 'Documents',
  signals: 'Public signals (feed items)',
  ...(Object.fromEntries(SECTOR_DATASETS.map((d) => [d, SECTOR_DATASET_DEFS[d].label])) as Record<
    (typeof SECTOR_DATASETS)[number],
    string
  >),
};

export const MAPPING_VERSIONS: Record<Dataset, string> = {
  positions: 'positions.csv.v1',
  managers: 'managers.csv.v1',
  due_diligence: 'due_diligence.csv.v1',
  documents: 'documents.text.v1',
  signals: 'feed.items.v1',
  ...(Object.fromEntries(SECTOR_DATASETS.map((d) => [d, SECTOR_DATASET_DEFS[d].mappingVersion])) as Record<
    (typeof SECTOR_DATASETS)[number],
    string
  >),
};

export type FieldType =
  'text' | 'key' | 'enum' | 'number' | 'integer' | 'boolean' | 'date' | 'currency' | 'country';

export interface FieldSpec {
  name: string;
  type: FieldType;
  required: boolean;
  description: string;
  values?: readonly string[];
  min?: number;
  max?: number;
  example: string;
}

const KEY_RE = /^[A-Z0-9][A-Z0-9-]{1,39}$/;

export const DATASET_FIELDS: Record<TabularDataset, FieldSpec[]> = {
  positions: [
    {
      name: 'key',
      type: 'key',
      required: true,
      description: 'Stable position identifier (A–Z, 0–9, hyphen).',
      example: 'POS-101',
    },
    {
      name: 'name',
      type: 'text',
      required: true,
      description: 'Holding name.',
      example: 'Gulf terminal stake (Sample)',
    },
    {
      name: 'asset_class',
      type: 'text',
      required: true,
      description: 'Asset class.',
      example: 'Infrastructure equity',
    },
    {
      name: 'sector',
      type: 'enum',
      required: false,
      values: SECTOR_KEYS,
      description: 'Sector workspace key.',
      example: 'energy',
    },
    {
      name: 'country',
      type: 'country',
      required: false,
      description: 'ISO 3166-1 alpha-2 country code.',
      example: 'AE',
    },
    {
      name: 'currency',
      type: 'currency',
      required: true,
      description: 'ISO 4217 currency code.',
      example: 'USD',
    },
    {
      name: 'market_value',
      type: 'number',
      required: true,
      min: 0,
      description: 'Market value in the stated currency.',
      example: '1250.5',
    },
    {
      name: 'nav_share_pct',
      type: 'number',
      required: true,
      min: 0,
      max: 100,
      description: 'Share of net asset value, percent.',
      example: '1.25',
    },
    {
      name: 'route_dependent',
      type: 'boolean',
      required: false,
      description: 'Depends on the Hormuz route (true/false).',
      example: 'true',
    },
    {
      name: 'as_of',
      type: 'date',
      required: true,
      description: 'Valuation date, YYYY-MM-DD.',
      example: '2026-09-30',
    },
  ],
  managers: [
    {
      name: 'key',
      type: 'key',
      required: true,
      description: 'Stable manager identifier.',
      example: 'MGR-101',
    },
    {
      name: 'name',
      type: 'text',
      required: true,
      description: 'Manager name.',
      example: 'Harbour Credit Partners (Sample)',
    },
    {
      name: 'strategy',
      type: 'text',
      required: true,
      description: 'Strategy.',
      example: 'Maritime private credit',
    },
    {
      name: 'domicile',
      type: 'country',
      required: false,
      description: 'ISO 3166-1 alpha-2 domicile.',
      example: 'LU',
    },
    {
      name: 'sector',
      type: 'enum',
      required: false,
      values: SECTOR_KEYS,
      description: 'Sector workspace key.',
      example: 'supply_chain',
    },
  ],
  due_diligence: [
    { name: 'key', type: 'key', required: true, description: 'Stable review identifier.', example: 'DD-101' },
    {
      name: 'manager_key',
      type: 'key',
      required: true,
      description: 'Key of an existing manager.',
      example: 'MGR-101',
    },
    {
      name: 'review_type',
      type: 'text',
      required: true,
      description: 'Type of review.',
      example: 'Operational due diligence',
    },
    {
      name: 'status',
      type: 'enum',
      required: true,
      values: ['not_started', 'in_progress', 'completed', 'escalated'],
      description: 'Review status.',
      example: 'in_progress',
    },
    {
      name: 'open_issues',
      type: 'integer',
      required: false,
      min: 0,
      description: 'Open issues count.',
      example: '1',
    },
    {
      name: 'summary',
      type: 'text',
      required: true,
      description: 'Short finding summary.',
      example: 'Valuation policy outstanding (sample).',
    },
    {
      name: 'reviewed_on',
      type: 'date',
      required: false,
      description: 'Review date, YYYY-MM-DD.',
      example: '2026-08-15',
    },
  ],
  ...(Object.fromEntries(SECTOR_DATASETS.map((d) => [d, SECTOR_DATASET_DEFS[d].fields])) as Record<
    (typeof SECTOR_DATASETS)[number],
    FieldSpec[]
  >),
};

export interface RowIssue {
  row: number;
  field: string | null;
  severity: 'error' | 'warning';
  code: string;
  message: string;
}

export type CleanValue = string | number | boolean | null;

export interface ValidatedFile {
  /** Columns the dataset needs that the file does not have; when non-empty no row is accepted. */
  missingColumns: string[];
  unknownColumns: string[];
  rows: { row: number; values: Record<string, CleanValue>; issues: RowIssue[] }[];
  issues: RowIssue[];
}

/** Lower-case, trimmed, spaces and hyphens to underscores: "NAV Share %" stays unknown, "As Of" becomes as_of. */
export function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

const TRUE = new Set(['true', 'yes', 'y', '1']);
const FALSE = new Set(['false', 'no', 'n', '0']);

function cleanField(
  spec: FieldSpec,
  raw: string,
  row: number,
  today: string,
): { value: CleanValue; issue?: RowIssue } {
  const v = raw.trim();
  const issue = (code: string, message: string, severity: RowIssue['severity'] = 'error'): RowIssue => ({
    row,
    field: spec.name,
    severity,
    code,
    message,
  });
  if (!v)
    return spec.required
      ? { value: null, issue: issue('required', `${spec.name} is required.`) }
      : { value: null };
  switch (spec.type) {
    case 'text':
      return v.length > 500
        ? { value: null, issue: issue('too_long', `${spec.name} is longer than 500 characters.`) }
        : { value: v };
    case 'key':
      return KEY_RE.test(v.toUpperCase())
        ? { value: v.toUpperCase() }
        : {
            value: null,
            issue: issue(
              'invalid_key',
              `${spec.name} "${v}" must use A–Z, 0–9 and hyphens (2–40 characters).`,
            ),
          };
    case 'enum': {
      const low = v.toLowerCase();
      return spec.values!.includes(low)
        ? { value: low }
        : {
            value: null,
            issue: issue('invalid_value', `${spec.name} "${v}" is not one of: ${spec.values!.join(', ')}.`),
          };
    }
    case 'number':
    case 'integer': {
      const n = Number(v.replace(/,/g, ''));
      if (!Number.isFinite(n))
        return { value: null, issue: issue('not_a_number', `${spec.name} "${v}" is not a number.`) };
      if (spec.type === 'integer' && !Number.isInteger(n))
        return { value: null, issue: issue('not_an_integer', `${spec.name} "${v}" must be a whole number.`) };
      if (spec.min !== undefined && n < spec.min)
        return { value: null, issue: issue('below_minimum', `${spec.name} ${n} is below ${spec.min}.`) };
      if (spec.max !== undefined && n > spec.max)
        return { value: null, issue: issue('above_maximum', `${spec.name} ${n} is above ${spec.max}.`) };
      return { value: n };
    }
    case 'boolean': {
      const low = v.toLowerCase();
      if (TRUE.has(low)) return { value: true };
      if (FALSE.has(low)) return { value: false };
      return { value: null, issue: issue('not_a_boolean', `${spec.name} "${v}" must be true or false.`) };
    }
    case 'date': {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`)))
        return {
          value: null,
          issue: issue('invalid_date', `${spec.name} "${v}" must be a date as YYYY-MM-DD.`),
        };
      if (v > today)
        return { value: null, issue: issue('future_date', `${spec.name} ${v} is in the future.`) };
      return { value: v };
    }
    case 'currency':
      return /^[A-Za-z]{3}$/.test(v)
        ? { value: v.toUpperCase() }
        : {
            value: null,
            issue: issue('invalid_currency', `${spec.name} "${v}" must be a three-letter ISO 4217 code.`),
          };
    case 'country':
      return /^[A-Za-z]{2}$/.test(v)
        ? { value: v.toUpperCase() }
        : {
            value: null,
            issue: issue('invalid_country', `${spec.name} "${v}" must be a two-letter ISO 3166 code.`),
          };
  }
}

/** Days after which a valuation date makes a position a quality warning (stale, not rejected). */
export const STALE_AFTER_DAYS = 400;

/**
 * Validates parsed rows against a dataset mapping. Row numbers count the header as row 1, as a spreadsheet does.
 * A row with any error is rejected; warnings keep the row but mark its quality.
 */
export function validateRows(
  dataset: TabularDataset,
  headers: string[],
  rawRows: Record<string, string>[],
  today = new Date().toISOString().slice(0, 10),
): ValidatedFile {
  const fields = DATASET_FIELDS[dataset];
  const names = new Set(fields.map((f) => f.name));
  const normalized = headers.map(normalizeHeader);
  const missingColumns = fields.filter((f) => f.required && !normalized.includes(f.name)).map((f) => f.name);
  const unknownColumns = normalized.filter((h) => h && !names.has(h));
  const issues: RowIssue[] = unknownColumns.map((c) => ({
    row: 1,
    field: c,
    severity: 'warning',
    code: 'unknown_column',
    message: `Column "${c}" is not part of ${MAPPING_VERSIONS[dataset]} and was ignored.`,
  }));
  if (missingColumns.length)
    issues.push({
      row: 1,
      field: null,
      severity: 'error',
      code: 'missing_columns',
      message: `Required columns missing: ${missingColumns.join(', ')}.`,
    });

  const seen = new Map<string, number>();
  const rows = missingColumns.length
    ? []
    : rawRows.map((raw, i) => {
        const row = i + 2;
        const byField: Record<string, string> = {};
        headers.forEach((h, j) => {
          const n = normalized[j]!;
          if (names.has(n)) byField[n] = raw[h] ?? '';
        });
        const values: Record<string, CleanValue> = {};
        const rowIssues: RowIssue[] = [];
        for (const f of fields) {
          const { value, issue } = cleanField(f, byField[f.name] ?? '', row, today);
          values[f.name] = value;
          if (issue) rowIssues.push(issue);
        }
        const key = typeof values.key === 'string' ? values.key : null;
        const dupKey = dataset === 'positions' && key ? `${key}|${values.as_of ?? ''}` : key;
        if (dupKey) {
          if (seen.has(dupKey))
            rowIssues.push({
              row,
              field: 'key',
              severity: 'error',
              code: 'duplicate_in_file',
              message: `key ${key} already appears on row ${seen.get(dupKey)}.`,
            });
          else seen.set(dupKey, row);
        }
        if (dataset === 'positions' && typeof values.as_of === 'string') {
          const age =
            (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${values.as_of}T00:00:00Z`)) / 86_400_000;
          if (age > STALE_AFTER_DAYS)
            rowIssues.push({
              row,
              field: 'as_of',
              severity: 'warning',
              code: 'stale_valuation',
              message: `Valuation date ${values.as_of} is more than ${STALE_AFTER_DAYS} days old.`,
            });
        }
        if (dataset !== 'due_diligence' && values.sector === null)
          rowIssues.push({
            row,
            field: 'sector',
            severity: 'warning',
            code: 'no_workspace',
            message: 'No sector given: the record belongs to the whole institution.',
          });
        return { row, values, issues: rowIssues };
      });
  return { missingColumns, unknownColumns, rows, issues };
}

/** A sample file for a dataset: the header and two clearly labelled sample rows. */
export function templateCsv(dataset: TabularDataset): string {
  const fields = DATASET_FIELDS[dataset];
  const quote = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const header = fields.map((f) => f.name).join(',');
  const row = (n: number) =>
    fields
      .map((f) =>
        quote(f.type === 'key' ? f.example.replace(/\d+$/, (d) => String(Number(d) + n)) : f.example),
      )
      .join(',');
  return `${header}\n${row(0)}\n${row(1)}\n`;
}

export function isSectorKey(v: unknown): v is SectorKey {
  return typeof v === 'string' && (SECTOR_KEYS as readonly string[]).includes(v);
}
