import type { Role, Sensitivity } from './vocabulary';
import type { SectorKey } from './sectors';

/**
 * Read scope (TR-050): what a person may read is decided on the server from their roles (clearance by
 * classification) and, when assigned, their sector workspaces. Assigned work (a handoff to an operations owner)
 * is readable by its assignee regardless; that rule lives with the handoff, not here.
 */
export const SENSITIVITY_ORDER: readonly Sensitivity[] = ['internal', 'restricted', 'confidential'];

/** Highest classification each role may read. Administrators run configuration, not cases. */
export const CLEARANCE: Record<Role, Sensitivity> = {
  executive: 'confidential',
  analyst: 'confidential',
  domain_expert: 'confidential',
  approver: 'confidential',
  auditor: 'confidential',
  operations_owner: 'restricted',
  administrator: 'restricted',
};

export interface ReadScope {
  /** Classifications this person may read. */
  sensitivities: Sensitivity[];
  /** Sector workspaces they are limited to, or null for every workspace. */
  sectors: SectorKey[] | null;
}

export function readScope(roles: readonly Role[], workspaces: readonly SectorKey[]): ReadScope {
  const top = Math.max(-1, ...roles.map((r) => SENSITIVITY_ORDER.indexOf(CLEARANCE[r])));
  return {
    sensitivities: SENSITIVITY_ORDER.slice(0, top + 1) as Sensitivity[],
    sectors: workspaces.length ? [...workspaces] : null,
  };
}

/** Records without a sector belong to the institution as a whole and stay visible within clearance. */
export function canRead(
  scope: ReadScope,
  record: { sensitivity: Sensitivity; sectorKey: SectorKey | null },
): boolean {
  if (!scope.sensitivities.includes(record.sensitivity)) return false;
  return scope.sectors === null || record.sectorKey === null || scope.sectors.includes(record.sectorKey);
}
