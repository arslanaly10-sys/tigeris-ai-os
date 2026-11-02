import { describe, expect, it } from 'vitest';
import { rollupCounts, validationState } from './validation';

describe('validation', () => {
  it('is overdue only after the due date, and only while open', () => {
    expect(validationState('open', '2026-11-01', '2026-11-02')).toBe('overdue');
    expect(validationState('open', '2026-11-02', '2026-11-02')).toBe('open');
    expect(validationState('answered', '2026-10-01', '2026-11-02')).toBe('answered');
  });

  it('counts answers without averaging and says when desks differ', () => {
    const r = rollupCounts([
      { status: 'answered', verdict: 'confirmed' },
      { status: 'answered', verdict: 'disputed' },
      { status: 'open', verdict: null },
      { status: 'withdrawn', verdict: null },
    ]);
    expect(r).toMatchObject({ confirmed: 1, disputed: 1, pending: 1, withdrawn: 1 });
    expect(r.summary).toContain('Answers differ');
    expect(r.summary).not.toMatch(/majority|average|%/);
    expect(rollupCounts([{ status: 'open', verdict: null }]).summary).toBe('No answers yet; 1 awaiting.');
  });
});
