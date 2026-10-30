import { describe, expect, it } from 'vitest';
import {
  checkReview,
  evaluatePolicy,
  HANDOFF_TRANSITIONS,
  holdsAuthority,
  OUTCOME_CASE_STATE,
  type PolicyInput,
} from './governance';
import { canTransition } from './case-lifecycle';
import { DECISION_OUTCOMES } from './governance';

const base: PolicyInput = {
  outcome: 'approve',
  actor: { id: 'approver-1', roles: ['approver'] },
  recommendation: { createdBy: 'analyst-1', status: 'endorsed' },
  reviews: [{ reviewerId: 'expert-1', verdict: 'endorse' }],
  priorApprovals: [],
  authority: { requiredRole: 'approver', twoPerson: false },
  mandateChecks: [{ mandateKey: 'M-RISK-02', title: 'Route concentration', status: 'within', detail: '' }],
};

const codes = (e: ReturnType<typeof evaluatePolicy>, result: string) =>
  e.reasons.filter((r) => r.result === result).map((r) => r.code);

describe('decision policy', () => {
  it('passes and completes a single-approver approval after endorsement', () => {
    const e = evaluatePolicy(base);
    expect(e.result).toBe('pass');
    expect(e.completes).toBe(true);
    expect(e.version).toBe('decision-policy 1.1.0');
  });

  it('blocks any decision without an endorsing expert review', () => {
    const e = evaluatePolicy({ ...base, reviews: [{ reviewerId: 'expert-1', verdict: 'request_changes' }] });
    expect(e.result).toBe('block');
    expect(codes(e, 'block')).toContain('review');
  });

  it('never lets the author decide on their own recommendation, whatever their role', () => {
    for (const outcome of DECISION_OUTCOMES) {
      const e = evaluatePolicy({
        ...base,
        outcome,
        actor: { id: 'analyst-1', roles: ['approver', 'executive'] },
      });
      expect(e.result).toBe('block');
      expect(codes(e, 'block')).toContain('self');
    }
  });

  it('stops the reviewer from also approving', () => {
    const e = evaluatePolicy({ ...base, actor: { id: 'expert-1', roles: ['domain_expert', 'approver'] } });
    expect(codes(e, 'block')).toContain('reviewer');
  });

  it('requires the role the authority matrix names; an executive holds approver powers', () => {
    expect(evaluatePolicy({ ...base, actor: { id: 'x', roles: ['analyst'] } }).result).toBe('block');
    expect(evaluatePolicy({ ...base, actor: { id: 'x', roles: ['executive'] } }).result).toBe('pass');
    const reallocate = { ...base, authority: { requiredRole: 'executive' as const, twoPerson: false } };
    expect(evaluatePolicy(reallocate).result).toBe('block');
    expect(holdsAuthority(['approver'], 'executive')).toBe(false);
    expect(holdsAuthority(['executive'], 'approver')).toBe(true);
  });

  it('blocks approval on a mandate breach but still allows rejecting it', () => {
    const breach = [{ mandateKey: 'M-RISK-03', title: 'NAV at risk', status: 'breach' as const, detail: '' }];
    const approve = evaluatePolicy({ ...base, mandateChecks: breach });
    expect(approve.result).toBe('block');
    expect(approve.reasons.find((r) => r.code === 'mandate')?.text).toContain('M-RISK-03');
    expect(evaluatePolicy({ ...base, outcome: 'reject', mandateChecks: breach }).result).toBe('pass');
  });

  it('holds the first of a two-person approval and completes on a different second approver', () => {
    const two = { ...base, authority: { requiredRole: 'approver' as const, twoPerson: true } };
    const first = evaluatePolicy(two);
    expect(first.result).toBe('hold');
    expect(first.completes).toBe(false);

    const secondSame = evaluatePolicy({
      ...two,
      recommendation: { ...two.recommendation, status: 'awaiting_second_approval' },
      priorApprovals: [{ approverId: 'approver-1' }],
    });
    expect(codes(secondSame, 'block')).toContain('two_person_same');

    const secondOther = evaluatePolicy({
      ...two,
      actor: { id: 'exec-1', roles: ['executive'] },
      recommendation: { ...two.recommendation, status: 'awaiting_second_approval' },
      priorApprovals: [{ approverId: 'approver-1' }],
    });
    expect(secondOther.result).toBe('pass');
    expect(secondOther.completes).toBe(true);
  });

  it('only decides endorsed recommendations', () => {
    expect(
      evaluatePolicy({ ...base, recommendation: { createdBy: 'analyst-1', status: 'in_review' } }).result,
    ).toBe('block');
    expect(
      evaluatePolicy({ ...base, recommendation: { createdBy: 'analyst-1', status: 'approved' } }).result,
    ).toBe('block');
  });

  it('maps every outcome onto an allowed case transition from decision', () => {
    for (const o of DECISION_OUTCOMES) expect(canTransition('decision', OUTCOME_CASE_STATE[o])).toBe(true);
  });
});

describe('expert review and handoff rules', () => {
  const rec = { createdBy: 'analyst-1', status: 'in_review' as const };
  it('lets only a domain expert who is not the author review an open recommendation', () => {
    expect(checkReview({ id: 'expert-1', roles: ['domain_expert'] }, rec).allowed).toBe(true);
    expect(checkReview({ id: 'approver-1', roles: ['approver'] }, rec).allowed).toBe(false);
    expect(checkReview({ id: 'analyst-1', roles: ['domain_expert'] }, rec).allowed).toBe(false);
    expect(
      checkReview({ id: 'expert-1', roles: ['domain_expert'] }, { ...rec, status: 'endorsed' }).allowed,
    ).toBe(false);
  });

  it('walks a handoff forward one step at a time to completion', () => {
    expect(HANDOFF_TRANSITIONS.acknowledge.from).toBe('awaiting_acknowledgement');
    expect(HANDOFF_TRANSITIONS.start.from).toBe(HANDOFF_TRANSITIONS.acknowledge.to);
    expect(HANDOFF_TRANSITIONS.record_outcome.from).toBe(HANDOFF_TRANSITIONS.start.to);
    expect(HANDOFF_TRANSITIONS.record_outcome.to).toBe('completed');
  });
});

describe('delegated limits (D-52)', () => {
  const hedge = {
    ...base,
    magnitude: { value: 18, unit: '% of NAV', label: 'Notional to hedge' },
    limit: { value: 20, unit: '% of NAV', basis: 'synthetic delegation' },
  };
  it('passes within the limit and names both figures', () => {
    const e = evaluatePolicy(hedge);
    expect(e.result).toBe('pass');
    expect(e.reasons.find((r) => r.code === 'limit')?.text).toContain(
      'within your delegated limit of 20 % of NAV',
    );
  });

  it('blocks above the limit and asks to escalate', () => {
    const e = evaluatePolicy({
      ...hedge,
      limit: { value: 10, unit: '% of NAV', basis: 'synthetic delegation' },
    });
    expect(e.result).toBe('block');
    expect(e.reasons.find((r) => r.code === 'limit')?.text).toContain('Escalate');
  });

  it('blocks when a limit exists but the option has no size, and never checks other outcomes', () => {
    expect(evaluatePolicy({ ...hedge, magnitude: null }).result).toBe('block');
    expect(
      evaluatePolicy({ ...hedge, outcome: 'reject', limit: { value: 1, unit: '% of NAV', basis: 'x' } })
        .result,
    ).toBe('pass');
  });

  it('passes with a note when the role has no numeric limit for the action', () => {
    const e = evaluatePolicy({ ...hedge, limit: null });
    expect(e.reasons.find((r) => r.code === 'limit')?.text).toContain('No numeric limit');
  });
});

describe('recorded disagreement (FR-24)', () => {
  it('blocks approval over an unacknowledged disagreement and passes once acknowledged', () => {
    const open = evaluatePolicy({ ...base, dissent: { count: 2, acknowledged: false } });
    expect(open.result).toBe('block');
    expect(open.reasons.find((r) => r.code === 'dissent')?.text).toContain('2 recorded disagreements');
    const known = evaluatePolicy({ ...base, dissent: { count: 2, acknowledged: true } });
    expect(known.result).toBe('pass');
    expect(codes(known, 'pass')).toContain('dissent');
  });

  it('does not stand in the way of rejecting, deferring or asking for evidence', () => {
    for (const outcome of ['reject', 'defer', 'request_evidence'] as const)
      expect(evaluatePolicy({ ...base, outcome, dissent: { count: 1, acknowledged: false } }).result).toBe(
        'pass',
      );
    expect(
      evaluatePolicy({ ...base, dissent: { count: 0, acknowledged: false } }).reasons.map((r) => r.code),
    ).not.toContain('dissent');
  });
});
