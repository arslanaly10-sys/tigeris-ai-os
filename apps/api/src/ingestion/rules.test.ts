import { describe, expect, it } from 'vitest';
import { packageDecision, sha256Hex, validateRecord, type SourceContext } from './rules';

const now = new Date('2026-10-29T12:00:00Z');
const source: SourceContext = {
  sourceClass: 'synthetic',
  approvalStatus: 'approved',
  freshnessLimitHours: 48,
};

function record(overrides: Record<string, unknown> = {}) {
  const content = (overrides.content as string) ?? 'illustrative body';
  return {
    externalId: 'rec-1',
    title: 'Illustrative record',
    summary: 'A synthetic record for testing.',
    content,
    sha256: sha256Hex(content),
    dataClass: 'synthetic',
    eventTime: '2026-10-29T08:00:00Z',
    retrievedAt: '2026-10-29T09:00:00Z',
    ...overrides,
  };
}

describe('validation rules v1', () => {
  it('accepts a clean record', () => {
    expect(validateRecord(record(), source, [], now).outcome).toBe('accepted');
  });

  it('blocks unapproved or unknown sources at package level', () => {
    expect(packageDecision({ ...source, approvalStatus: 'pending' }).result).toBe('fail');
    expect(packageDecision(null).rule).toBe('source_registered');
    expect(packageDecision(source).result).toBe('pass');
  });

  it('rejects malformed records and data-class mismatches without storing them', () => {
    const malformed = validateRecord({ externalId: 'x' }, source, [], now);
    expect(malformed).toMatchObject({ outcome: 'rejected', record: null });
    const mismatch = validateRecord(record({ dataClass: 'public' }), source, [], now);
    expect(mismatch.outcome).toBe('rejected');
  });

  it('quarantines tampered content', () => {
    const d = validateRecord(record({ sha256: sha256Hex('something else') }), source, [], now);
    expect(d.outcome).toBe('quarantined');
    expect(d.checks.find((c) => c.rule === 'integrity')?.result).toBe('fail');
    expect(d.record).not.toBeNull();
  });

  it('quarantines impossible timestamps', () => {
    const future = validateRecord(record({ retrievedAt: '2026-11-30T00:00:00Z' }), source, [], now);
    expect(future.outcome).toBe('quarantined');
    const eventAfterRetrieval = validateRecord(
      record({ eventTime: '2026-10-29T11:00:00Z' }),
      source,
      [],
      now,
    );
    expect(eventAfterRetrieval.outcome).toBe('quarantined');
  });

  it('treats identical re-submissions as duplicates and changed content as a new version', () => {
    const r = record();
    expect(validateRecord(r, source, [{ externalId: 'rec-1', sha256: r.sha256 }], now).outcome).toBe(
      'duplicate',
    );
    expect(validateRecord(r, source, [{ externalId: 'rec-1', sha256: 'f'.repeat(64) }], now).outcome).toBe(
      'warned',
    );
  });

  it('warns on stale records', () => {
    const d = validateRecord(
      record({ eventTime: null, retrievedAt: '2026-10-20T00:00:00Z' }),
      source,
      [],
      now,
    );
    expect(d.outcome).toBe('warned');
    expect(d.checks.find((c) => c.rule === 'freshness')?.result).toBe('warn');
  });
});
