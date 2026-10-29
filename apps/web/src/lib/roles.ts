import type { Role } from '@tigeris/shared';

export const ROLE_LABEL: Record<Role, string> = {
  executive: 'Executive / Governor',
  analyst: 'Intelligence Analyst',
  domain_expert: 'Domain Expert',
  approver: 'Expert Approver',
  operations_owner: 'Operations Owner',
  administrator: 'Governance Administrator',
  auditor: 'Auditor (read-only)',
};

/** What each role does in TIGERIS (App Flow §3). Shown on sign-in and in the Command Centre. */
export const ROLE_PURPOSE: Record<Role, string> = {
  executive: 'See what needs a decision, why now, plausible consequences and who must authorise.',
  analyst: 'Validate signals, curate evidence, trace impact paths, run scenarios and route options.',
  domain_expert: 'Challenge sources and causal links, add sector context, endorse or return analysis.',
  approver: 'Inspect evidence and policy results; approve, reject, defer or request evidence.',
  operations_owner: 'Acknowledge approved handoffs, update task status and record outcomes.',
  administrator: 'Register sources and models, set terms and rules, and activate reviewed policy.',
  auditor: 'Inspect source lineage, model and policy versions and the decision trail. Read-only.',
};
