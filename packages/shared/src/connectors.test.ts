import { describe, expect, it } from 'vitest';
import { normalizeHeader, templateCsv, validateRows } from './connectors';

const TODAY = '2026-10-30';
const headers = [
  'Key',
  'Name',
  'Asset Class',
  'Sector',
  'Country',
  'Currency',
  'Market Value',
  'NAV Share Pct',
  'Route Dependent',
  'As Of',
];
const row = (o: Partial<Record<string, string>>) => ({
  Key: 'POS-101',
  Name: 'Sample holding',
  'Asset Class': 'Listed equity',
  Sector: 'energy',
  Country: 'AE',
  Currency: 'usd',
  'Market Value': '1,250.5',
  'NAV Share Pct': '1.25',
  'Route Dependent': 'yes',
  'As Of': '2026-09-30',
  ...o,
});

describe('file validation (positions.csv.v1)', () => {
  it('normalizes headers and values and accepts a clean row', () => {
    expect(normalizeHeader(' As Of ')).toBe('as_of');
    const v = validateRows('positions', headers, [row({})], TODAY);
    expect(v.missingColumns).toEqual([]);
    expect(v.rows[0]!.issues).toEqual([]);
    expect(v.rows[0]!.values).toMatchObject({ currency: 'USD', market_value: 1250.5, route_dependent: true });
  });

  it('reports row-level errors with spreadsheet row numbers and the field', () => {
    const v = validateRows(
      'positions',
      headers,
      [row({}), row({ Key: 'POS-102', 'NAV Share Pct': '140', Currency: 'dollars', 'As Of': '2027-01-01' })],
      TODAY,
    );
    const codes = v.rows[1]!.issues.map((i) => [i.row, i.field, i.code]);
    expect(codes).toEqual(
      expect.arrayContaining([
        [3, 'nav_share_pct', 'above_maximum'],
        [3, 'currency', 'invalid_currency'],
        [3, 'as_of', 'future_date'],
      ]),
    );
  });

  it('rejects duplicates within the file and warns on stale or unscoped rows', () => {
    const v = validateRows(
      'positions',
      headers,
      [row({}), row({}), row({ Key: 'POS-103', Sector: '', 'As Of': '2024-01-31' })],
      TODAY,
    );
    expect(v.rows[1]!.issues.map((i) => i.code)).toContain('duplicate_in_file');
    expect(v.rows[2]!.issues.map((i) => [i.code, i.severity])).toEqual(
      expect.arrayContaining([
        ['stale_valuation', 'warning'],
        ['no_workspace', 'warning'],
      ]),
    );
  });

  it('refuses a file missing required columns and flags unknown ones', () => {
    const v = validateRows(
      'positions',
      ['key', 'name', 'colour'],
      [{ key: 'X1', name: 'n', colour: 'red' }],
      TODAY,
    );
    expect(v.missingColumns).toContain('currency');
    expect(v.rows).toHaveLength(0);
    expect(v.issues.map((i) => i.code)).toEqual(['unknown_column', 'missing_columns']);
  });

  it('publishes a template whose sample rows validate cleanly', () => {
    for (const d of ['positions', 'managers', 'due_diligence'] as const) {
      const [head, ...lines] = templateCsv(d).trim().split('\n');
      const cols = head!.split(',');
      const rows = lines.map((l) => Object.fromEntries(l.split(',').map((c, i) => [cols[i]!, c])));
      const v = validateRows(d, cols, rows, TODAY);
      expect(v.rows.flatMap((r) => r.issues.filter((i) => i.severity === 'error'))).toEqual([]);
    }
  });
});
