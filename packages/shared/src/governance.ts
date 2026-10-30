import type { MandateCheck } from './scenario-options';
import type { CaseState, PolicyResult, Role } from './vocabulary';

/**
 * Governance (Phase 4): the path from a draft option to institutional memory. Every step is a named human
 * action; this module holds the rules as pure code so the API enforces them and the UI can preview them.
 *
 *   recommend (analyst) → expert review (domain expert) → decision (named authority, policy-checked)
 *   → handoff (operations owner: acknowledge, progress, outcome) → memory (approved and outcome recorded)
 */

export const POLICY_VERSION = 'decision-policy 1.0.0';

export const REVIEW_VERDICTS = ['endorse', 'request_changes'] as const;
export type ReviewVerdict = (typeof REVIEW_VERDICTS)[number];

export const DECISION_OUTCOMES = ['approve', 'reject', 'defer', 'request_evidence'] as const;
export type DecisionOutcome = (typeof DECISION_OUTCOMES)[number];

export const RECOMMENDATION_STATUSES = [
  'in_review',
  'changes_requested',
  'endorsed',
  'awaiting_second_approval',
  'approved',
  'rejected',
  'deferred',
  'evidence_requested',
] as const;
export type RecommendationStatus = (typeof RECOMMENDATION_STATUSES)[number];

/** Statuses in which a recommendation is still open; at most one open recommendation per case. */
export const OPEN_RECOMMENDATION_STATUSES: readonly RecommendationStatus[] = [
  'in_review',
  'endorsed',
  'awaiting_second_approval',
];

export const HANDOFF_STATUSES = [
  'awaiting_acknowledgement',
  'acknowledged',
  'in_progress',
  'completed',
] as const;
export type HandoffStatus = (typeof HANDOFF_STATUSES)[number];

export const HANDOFF_ACTIONS = ['acknowledge', 'start', 'record_outcome'] as const;
export type HandoffAction = (typeof HANDOFF_ACTIONS)[number];

/** Each handoff action is allowed from exactly one status, and moves to exactly one status. */
export const HANDOFF_TRANSITIONS: Record<HandoffAction, { from: HandoffStatus; to: HandoffStatus }> = {
  acknowledge: { from: 'awaiting_acknowledgement', to: 'acknowledged' },
  start: { from: 'acknowledged', to: 'in_progress' },
  record_outcome: { from: 'in_progress', to: 'completed' },
};

/** Recording a recommendation is the analyst's; it can start from analysis, scenario or an empty review. */
export const RECOMMEND_ROLES: readonly Role[] = ['analyst'];
export const RECOMMEND_FROM_STATES: readonly CaseState[] = ['analysis', 'scenario', 'review'];
export const REVIEW_ROLES: readonly Role[] = ['domain_expert'];
export const HANDOFF_ROLES: readonly Role[] = ['operations_owner'];

/** Roles that can record a decision at all. An executive holds every approver power. */
export const DECIDING_ROLES: readonly Role[] = ['approver', 'executive'];

export function holdsAuthority(roles: readonly Role[], required: Role): boolean {
  if (roles.includes(required)) return true;
  return required === 'approver' && roles.includes('executive');
}

/** Case state each completed decision outcome leads to (case lifecycle: decision → handoff | analysis | closed). */
export const OUTCOME_CASE_STATE: Record<DecisionOutcome, CaseState> = {
  approve: 'handoff',
  reject: 'closed',
  defer: 'analysis',
  request_evidence: 'analysis',
};

/** Recommendation status each completed outcome leads to. */
export const OUTCOME_STATUS: Record<DecisionOutcome, RecommendationStatus> = {
  approve: 'approved',
  reject: 'rejected',
  defer: 'deferred',
  request_evidence: 'evidence_requested',
};

export interface PolicyReason {
  code:
    | 'review'
    | 'state'
    | 'self'
    | 'reviewer'
    | 'role'
    | 'mandate'
    | 'two_person'
    | 'two_person_same'
    | 'duplicate'
    | 'limit';
  result: PolicyResult;
  text: string;
}

export interface PolicyInput {
  outcome: DecisionOutcome;
  actor: { id: string; roles: readonly Role[] };
  recommendation: { createdBy: string; status: RecommendationStatus };
  reviews: readonly { reviewerId: string; verdict: ReviewVerdict }[];
  /** Approvals already recorded on this recommendation (the first half of a two-person decision). */
  priorApprovals: readonly { approverId: string }[];
  authority: { requiredRole: Role; twoPerson: boolean } | null;
  mandateChecks: readonly MandateCheck[];
  /** The option's size, when it has one (scenario-options `optionMagnitude`). */
  magnitude?: { value: number; unit: string; label: string } | null;
  /**
   * The actor's delegated numeric limit for this action class (D-52), null when none is configured for their
   * roles. Leave undefined to skip the limit rule (no limits register loaded).
   */
  limit?: { value: number; unit: string; basis: string } | null;
}

export interface PolicyEvaluation {
  version: string;
  result: PolicyResult;
  /** True when recording this outcome finishes the decision (moves the case on). */
  completes: boolean;
  reasons: PolicyReason[];
}

const ROLE_NAME: Record<Role, string> = {
  executive: 'Executive / Governor',
  analyst: 'Intelligence Analyst',
  domain_expert: 'Domain Expert',
  approver: 'Expert Approver',
  operations_owner: 'Operations Owner',
  administrator: 'Governance Administrator',
  auditor: 'Auditor',
};

/**
 * Evaluates one decision attempt. `block` refuses it; `hold` records an approval that still needs a second,
 * different approver; `pass` records it and, when `completes`, moves the case on. Every rule that applied
 * returns a reason, so the person deciding sees why, not just what.
 */
export function evaluatePolicy(input: PolicyInput): PolicyEvaluation {
  const reasons: PolicyReason[] = [];
  const { outcome, actor, recommendation, authority } = input;
  const approving = outcome === 'approve';

  const decidable =
    recommendation.status === 'endorsed' || recommendation.status === 'awaiting_second_approval';
  reasons.push(
    decidable
      ? { code: 'state', result: 'pass', text: 'The recommendation is open for decision.' }
      : { code: 'state', result: 'block', text: 'Only an endorsed recommendation can be decided.' },
  );

  const endorsed = input.reviews.some((r) => r.verdict === 'endorse');
  reasons.push(
    endorsed
      ? { code: 'review', result: 'pass', text: 'An expert review has endorsed it.' }
      : { code: 'review', result: 'block', text: 'Expert review is mandatory before any decision.' },
  );

  if (actor.id === recommendation.createdBy)
    reasons.push({
      code: 'self',
      result: 'block',
      text: 'The author of a recommendation can never decide on it.',
    });

  if (approving && input.reviews.some((r) => r.reviewerId === actor.id))
    reasons.push({
      code: 'reviewer',
      result: 'block',
      text: 'The expert who reviewed it cannot also approve it.',
    });

  const second = approving && authority?.twoPerson === true && input.priorApprovals.length > 0;
  if (input.priorApprovals.some((a) => a.approverId === actor.id))
    reasons.push({
      code: 'two_person_same',
      result: 'block',
      text: 'The second approval must come from a different person.',
    });

  // Role: the first approval needs the matrix's required role; a second approval, or any other outcome,
  // needs an approving role.
  const needed: Role = approving && !second ? (authority?.requiredRole ?? 'approver') : 'approver';
  reasons.push(
    holdsAuthority(actor.roles, needed)
      ? {
          code: 'role',
          result: 'pass',
          text: `Your role meets the authority matrix: ${ROLE_NAME[needed]}.`,
        }
      : {
          code: 'role',
          result: 'block',
          text: `The authority matrix requires ${ROLE_NAME[needed]} for this ${approving ? 'approval' : 'decision'}.`,
        },
  );

  if (approving) {
    const breaches = input.mandateChecks.filter((m) => m.status === 'breach');
    const attention = input.mandateChecks.filter((m) => m.status === 'attention');
    if (breaches.length)
      reasons.push({
        code: 'mandate',
        result: 'block',
        text: `Approval would breach ${breaches.map((m) => m.mandateKey).join(', ')}.`,
      });
    else
      reasons.push({
        code: 'mandate',
        result: 'pass',
        text: attention.length
          ? `Within mandate; ${attention.map((m) => m.mandateKey).join(', ')} need attention.`
          : 'Within every checked mandate.',
      });
  }

  if (approving && input.limit !== undefined) reasons.push(limitReason(input.magnitude ?? null, input.limit));

  if (approving && authority?.twoPerson) {
    reasons.push(
      second
        ? { code: 'two_person', result: 'pass', text: 'Second approval: completes the two-person rule.' }
        : {
            code: 'two_person',
            result: 'hold',
            text: 'Two-person rule: this approval is recorded and waits for a second, different approver.',
          },
    );
  }

  const result: PolicyResult = reasons.some((r) => r.result === 'block')
    ? 'block'
    : reasons.some((r) => r.result === 'hold')
      ? 'hold'
      : 'pass';
  return { version: POLICY_VERSION, result, completes: result === 'pass', reasons };
}

const num = (v: number) => Number(v.toFixed(2)).toString();

function limitReason(
  magnitude: { value: number; unit: string; label: string } | null,
  limit: { value: number; unit: string; basis: string } | null,
): PolicyReason {
  if (!limit)
    return { code: 'limit', result: 'pass', text: 'No numeric limit applies to your role for this action.' };
  if (!magnitude)
    return {
      code: 'limit',
      result: 'block',
      text: 'This option has no recorded size, so it cannot be checked against your delegated limit. Re-run the scenario.',
    };
  if (magnitude.unit !== limit.unit)
    return {
      code: 'limit',
      result: 'block',
      text: `The option is sized in ${magnitude.unit} but your limit is in ${limit.unit}; it cannot be checked.`,
    };
  const what = `${magnitude.label}: ${num(magnitude.value)} ${magnitude.unit}`;
  return magnitude.value > limit.value
    ? {
        code: 'limit',
        result: 'block',
        text: `${what} exceeds your delegated limit of ${num(limit.value)} ${limit.unit} (${limit.basis}). Escalate to a higher authority.`,
      }
    : {
        code: 'limit',
        result: 'pass',
        text: `${what} is within your delegated limit of ${num(limit.value)} ${limit.unit} (${limit.basis}).`,
      };
}

export interface ReviewCheck {
  allowed: boolean;
  reason: string;
}

/** Expert review: a domain expert, never the recommendation's author, on a recommendation that is in review. */
export function checkReview(
  actor: { id: string; roles: readonly Role[] },
  recommendation: { createdBy: string; status: RecommendationStatus },
): ReviewCheck {
  if (!REVIEW_ROLES.some((r) => actor.roles.includes(r)))
    return { allowed: false, reason: 'Only a Domain Expert can review a recommendation.' };
  if (actor.id === recommendation.createdBy)
    return { allowed: false, reason: 'The author of a recommendation cannot review it.' };
  if (recommendation.status !== 'in_review')
    return { allowed: false, reason: 'This recommendation is not awaiting review.' };
  return { allowed: true, reason: 'Open for your review.' };
}
