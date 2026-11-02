/**
 * Validation tasking and roll-up (Phase 5E, FR-56, D-107, D-119). A finding is put to named people or asset-class
 * desks with a due date; each answers confirmed, disputed or insufficient evidence, with their reasoning and the
 * assumptions they relied on. The roll-up shows every answer side by side with counts; it never averages or votes.
 */
import type { Role } from './vocabulary';

export const VALIDATION_VERSION = 'validation 1.0.0';
export const VALIDATION_VERDICTS = ['confirmed', 'disputed', 'insufficient_evidence'] as const;
export type ValidationVerdict = (typeof VALIDATION_VERDICTS)[number];
export const VALIDATION_SUBJECTS = ['case', 'scenario_run', 'recommendation', 'intervention'] as const;
export type ValidationSubject = (typeof VALIDATION_SUBJECTS)[number];
export const DIVISION_KINDS = ['executive', 'committee', 'desk'] as const;
export type DivisionKind = (typeof DIVISION_KINDS)[number];

/** Who may ask for validation. Anyone named, or on a named desk, may answer, except the person who asked. */
export const VALIDATION_REQUEST_ROLES: readonly Role[] = [
  'analyst',
  'domain_expert',
  'approver',
  'executive',
];

export const VERDICT_LABEL: Record<ValidationVerdict, string> = {
  confirmed: 'Confirmed',
  disputed: 'Disputed',
  insufficient_evidence: 'Insufficient evidence',
};

export interface ValidationAssumption {
  label: string;
  value: string;
  basis: string;
}

export type ValidationState = 'open' | 'overdue' | 'answered' | 'withdrawn';

/** An open request past its due date is overdue (the due date itself is still on time). */
export function validationState(
  status: 'open' | 'answered' | 'withdrawn',
  dueOn: string,
  today: string,
): ValidationState {
  return status === 'open' && dueOn < today ? 'overdue' : status;
}

export interface RollupCounts {
  confirmed: number;
  disputed: number;
  insufficient_evidence: number;
  pending: number;
  withdrawn: number;
}

/**
 * Counts for one batch. The summary says where answers agree or differ; it states no majority and no average,
 * because desks answer from different books and assumptions.
 */
export function rollupCounts(
  answers: readonly { status: 'open' | 'answered' | 'withdrawn'; verdict: ValidationVerdict | null }[],
): RollupCounts & { summary: string } {
  const c: RollupCounts = { confirmed: 0, disputed: 0, insufficient_evidence: 0, pending: 0, withdrawn: 0 };
  for (const a of answers) {
    if (a.status === 'withdrawn') c.withdrawn++;
    else if (a.status === 'open' || !a.verdict) c.pending++;
    else c[a.verdict]++;
  }
  const answered = c.confirmed + c.disputed + c.insufficient_evidence;
  const parts = [
    c.confirmed ? `${c.confirmed} confirmed` : null,
    c.disputed ? `${c.disputed} disputed` : null,
    c.insufficient_evidence ? `${c.insufficient_evidence} insufficient evidence` : null,
    c.pending ? `${c.pending} awaiting an answer` : null,
  ].filter(Boolean);
  const summary =
    answered === 0
      ? c.pending
        ? `No answers yet; ${c.pending} awaiting.`
        : 'No live requests.'
      : c.disputed && c.confirmed
        ? `Answers differ: ${parts.join(', ')}. Read each desk's reasoning and assumptions.`
        : `${parts.join(', ')}.`;
  return { ...c, summary };
}
