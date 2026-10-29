import type { CaseState, Role } from './vocabulary';

/**
 * Allowed case transitions. Forward path is fixed; exception paths return work to analysis
 * (request evidence / defer) or close the case (reject / dismiss). REVIEW is mandatory before DECISION.
 */
export const CASE_TRANSITIONS: Record<CaseState, readonly CaseState[]> = {
  detected: ['triaged', 'closed'],
  triaged: ['analysis', 'closed'],
  analysis: ['scenario', 'closed'],
  scenario: ['review', 'analysis'],
  review: ['decision', 'analysis'],
  decision: ['handoff', 'analysis', 'closed'],
  handoff: ['closed'],
  closed: [],
};

export function canTransition(from: CaseState, to: CaseState): boolean {
  return CASE_TRANSITIONS[from].includes(to);
}

/** Which role normally owns the next step of a case in each state. */
export const NEXT_STEP_OWNER: Record<CaseState, Role | null> = {
  detected: 'analyst',
  triaged: 'analyst',
  analysis: 'analyst',
  scenario: 'analyst',
  review: 'domain_expert',
  decision: 'approver',
  handoff: 'operations_owner',
  closed: null,
};

export const NEXT_STEP_LABEL: Record<CaseState, string> = {
  detected: 'Triage new signal',
  triaged: 'Begin analysis',
  analysis: 'Curate evidence and graph',
  scenario: 'Compare horizons and route for review',
  review: 'Expert review required',
  decision: 'Decision by named authority',
  handoff: 'Record follow-through',
  closed: 'No action',
};
