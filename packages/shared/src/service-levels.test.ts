import { describe, expect, it } from 'vitest';
import { dueState, SERVICE_LEVELS } from './service-levels';

describe('service levels', () => {
  const since = new Date('2026-10-01T00:00:00Z');
  it('is not overdue before the level and counts whole hours after it', () => {
    expect(dueState('review', since, new Date('2026-10-02T23:00:00Z'))).toMatchObject({
      overdue: false,
      overdueHours: 0,
    });
    const late = dueState('review', since, new Date('2026-10-03T05:30:00Z'));
    expect(late.overdue).toBe(true);
    expect(late.overdueHours).toBe(5);
    expect(late.dueAt.toISOString()).toBe('2026-10-03T00:00:00.000Z');
  });
  it('names the role that owns each step', () => {
    expect(SERVICE_LEVELS.decision.role).toBe('approver');
    expect(SERVICE_LEVELS.acknowledge.role).toBe('operations_owner');
  });
});
