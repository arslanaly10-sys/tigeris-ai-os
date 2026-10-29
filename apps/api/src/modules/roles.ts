import type { Role } from '@tigeris/shared';

/** Role names as they appear in drafted prose (mirrors the web client's labels). */
export const ROLE_LABEL_API: Record<Role, string> = {
  executive: 'Executive / Governor',
  analyst: 'Intelligence Analyst',
  domain_expert: 'Domain Expert',
  approver: 'Expert Approver',
  operations_owner: 'Operations Owner',
  administrator: 'Governance Administrator',
  auditor: 'Auditor',
};
