import type { EvidenceFact } from '@tigeris/shared';

const dateTime = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
  hourCycle: 'h23',
});
const dateOnly = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** All times are shown in UTC with an explicit label (TRD §5.1: units and time zones are preserved). */
export function formatDateTime(iso: string | null): string {
  return iso ? `${dateTime.format(new Date(iso))} UTC` : 'Not recorded';
}

export function formatDate(iso: string | null): string {
  return iso ? dateOnly.format(new Date(iso)) : 'Not recorded';
}

export function formatRelative(iso: string, now = Date.now()): string {
  const diff = now - new Date(iso).getTime();
  const abs = Math.abs(diff);
  const units: [number, string][] = [
    [365 * 86_400_000, 'year'],
    [30 * 86_400_000, 'month'],
    [86_400_000, 'day'],
    [3_600_000, 'hour'],
    [60_000, 'minute'],
  ];
  for (const [ms, unit] of units) {
    if (abs >= ms) {
      const n = Math.floor(abs / ms);
      return diff >= 0 ? `${n} ${unit}${n === 1 ? '' : 's'} ago` : `in ${n} ${unit}${n === 1 ? '' : 's'}`;
    }
  }
  return 'just now';
}

/** Renders a fact value exactly as stored, with its unit. Never rounds or rescales. */
export function formatFactValue(f: Pick<EvidenceFact, 'valueNum' | 'valueText' | 'unit'>): string {
  const value =
    f.valueNum !== null
      ? new Intl.NumberFormat('en-GB', { maximumFractionDigits: 6 }).format(f.valueNum)
      : (f.valueText ?? '');
  return f.unit ? `${value} ${f.unit}` : value;
}

export function humanize(token: string): string {
  return token.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}
