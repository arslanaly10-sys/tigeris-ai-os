import { describe, expect, it } from 'vitest';
import { cronIntervalMs, freshness } from './observations';

const now = new Date('2026-11-02T12:00:00Z');
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

describe('freshness (D-127)', () => {
  it('is Live only for a connected connector within twice its schedule', () => {
    const day = 86_400_000;
    expect(
      freshness({ connectorStatus: 'connected', fetchedAt: hoursAgo(30), scheduleIntervalMs: day, now }),
    ).toBe('live');
    expect(
      freshness({ connectorStatus: 'connected', fetchedAt: hoursAgo(49), scheduleIntervalMs: day, now }),
    ).toBe('stale');
  });

  it('caps the window at 48 hours even for a weekly schedule', () => {
    const week = 7 * 86_400_000;
    expect(
      freshness({ connectorStatus: 'connected', fetchedAt: hoursAgo(47), scheduleIntervalMs: week, now }),
    ).toBe('live');
    expect(
      freshness({ connectorStatus: 'connected', fetchedAt: hoursAgo(72), scheduleIntervalMs: week, now }),
    ).toBe('stale');
  });

  it('is a Snapshot when the connector is not connected or has no schedule', () => {
    for (const s of ['configured', 'failed', 'paused', 'sample'] as const)
      expect(
        freshness({ connectorStatus: s, fetchedAt: hoursAgo(1), scheduleIntervalMs: 3_600_000, now }),
      ).toBe('snapshot');
    expect(
      freshness({ connectorStatus: 'connected', fetchedAt: hoursAgo(1), scheduleIntervalMs: null, now }),
    ).toBe('snapshot');
  });

  it('never treats a fetch time in the future as Live', () => {
    expect(
      freshness({
        connectorStatus: 'connected',
        fetchedAt: hoursAgo(-1),
        scheduleIntervalMs: 3_600_000,
        now,
      }),
    ).toBe('stale');
  });
});

describe('cronIntervalMs', () => {
  it('reads the schedules the product offers', () => {
    expect(cronIntervalMs('*/15 * * * *')).toBe(15 * 60_000);
    expect(cronIntervalMs('5 * * * *')).toBe(3_600_000);
    expect(cronIntervalMs('0 */6 * * *')).toBe(6 * 3_600_000);
    expect(cronIntervalMs('30 6 * * *')).toBe(86_400_000);
    expect(cronIntervalMs('0 6 * * 1')).toBe(7 * 86_400_000);
  });
  it('returns null for anything it cannot read with confidence', () => {
    for (const c of [null, '', '0 6 1 * *', '0 6 * 1 *', 'not a cron', '0 6,18 * * *'])
      expect(cronIntervalMs(c)).toBeNull();
  });
});
