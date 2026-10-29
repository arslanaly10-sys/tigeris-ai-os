import { describe, expect, it } from 'vitest';
import { ACTION_RESULT, canTriage, OPEN_DISPOSITIONS } from './signal-triage';
import { SIGNAL_ACTIONS } from './vocabulary';

describe('signal triage', () => {
  it('maps every action to a disposition', () => {
    expect(SIGNAL_ACTIONS.every((a) => ACTION_RESULT[a])).toBe(true);
  });

  it('lets only analysts dismiss or open cases, and experts challenge', () => {
    expect(canTriage(['analyst'], 'open_case')).toBe(true);
    expect(canTriage(['domain_expert'], 'open_case')).toBe(false);
    expect(canTriage(['domain_expert'], 'challenge')).toBe(true);
    expect(canTriage(['auditor'], 'monitor')).toBe(false);
    expect(canTriage(['executive'], 'dismiss')).toBe(false);
  });

  it('treats dismissed and case-opened signals as settled', () => {
    expect(OPEN_DISPOSITIONS).not.toContain('dismissed');
    expect(OPEN_DISPOSITIONS).not.toContain('case_opened');
  });
});
