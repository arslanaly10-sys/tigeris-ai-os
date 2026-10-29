import type { Role, SignalAction, SignalDisposition } from './vocabulary';

/** Disposition each triage action produces. `challenge` keeps the signal under monitoring with a recorded objection. */
export const ACTION_RESULT: Record<SignalAction, SignalDisposition> = {
  corroborate: 'corroborated',
  challenge: 'monitoring',
  monitor: 'monitoring',
  dismiss: 'dismissed',
  open_case: 'case_opened',
};

/** Which dispositions accept further triage. Dismissed and case-opened signals are settled. */
export const OPEN_DISPOSITIONS: readonly SignalDisposition[] = ['new', 'monitoring', 'corroborated'];

/** Roles allowed to take each triage action (App Flow §3: analysts triage; experts may challenge). */
export const ACTION_ROLES: Record<SignalAction, readonly Role[]> = {
  corroborate: ['analyst'],
  challenge: ['analyst', 'domain_expert'],
  monitor: ['analyst'],
  dismiss: ['analyst'],
  open_case: ['analyst'],
};

export function canTriage(roles: readonly Role[], action: SignalAction): boolean {
  return ACTION_ROLES[action].some((r) => roles.includes(r));
}
