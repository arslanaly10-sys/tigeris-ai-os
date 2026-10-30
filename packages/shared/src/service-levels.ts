/**
 * Service levels for governed work (slice I). They are synthetic demonstration values, labelled as such, and only
 * decide what the command centre lists as overdue; nothing is escalated or acted on automatically.
 */
import type { Role } from './vocabulary';

export const SERVICE_LEVELS = {
  review: { hours: 48, role: 'domain_expert', label: 'Expert review' },
  decision: { hours: 72, role: 'approver', label: 'Decision by the named authority' },
  acknowledge: { hours: 24, role: 'operations_owner', label: 'Handoff acknowledgement' },
  complete: { hours: 14 * 24, role: 'operations_owner', label: 'Handoff outcome recorded' },
} as const satisfies Record<string, { hours: number; role: Role; label: string }>;

export type ServiceLevelKey = keyof typeof SERVICE_LEVELS;
export const SERVICE_LEVELS_BASIS = 'Synthetic demonstration service levels (D-89)';

/** When the step is due and how many whole hours it is past due (0 when not yet due). */
export function dueState(kind: ServiceLevelKey, since: Date, now: Date = new Date()) {
  const dueAt = new Date(since.getTime() + SERVICE_LEVELS[kind].hours * 3_600_000);
  const overdueHours = Math.max(0, Math.floor((now.getTime() - dueAt.getTime()) / 3_600_000));
  return { dueAt, overdueHours, overdue: now.getTime() > dueAt.getTime() };
}
