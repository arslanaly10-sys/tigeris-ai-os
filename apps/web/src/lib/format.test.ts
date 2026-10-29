import { describe, expect, it } from 'vitest';
import { formatDateTime, formatFactValue, formatRelative } from './format';

describe('format', () => {
  it('shows times in UTC with an explicit label', () => {
    expect(formatDateTime('2024-04-13T02:43:00Z')).toBe('13 Apr 2024, 02:43 UTC');
    expect(formatDateTime(null)).toBe('Not recorded');
  });

  it('renders fact values exactly with their unit', () => {
    expect(formatFactValue({ valueNum: 20.9, valueText: null, unit: 'million b/d' })).toBe(
      '20.9 million b/d',
    );
    expect(formatFactValue({ valueNum: null, valueText: 'Portugal', unit: null })).toBe('Portugal');
  });

  it('formats relative times', () => {
    const now = Date.parse('2026-10-29T12:00:00Z');
    expect(formatRelative('2026-10-26T12:00:00Z', now)).toBe('3 days ago');
    expect(formatRelative('2026-10-29T11:59:30Z', now)).toBe('just now');
  });
});
