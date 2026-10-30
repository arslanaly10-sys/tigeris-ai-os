import type { ReadScope } from '@tigeris/shared';
import { and, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { cases } from '../db/schema';

/**
 * Case read scope as SQL (TR-050): classification within the person's clearance and, when they have assigned
 * workspaces, the case's sector among them (cases without a sector stay visible). Every read of case data — and of
 * anything that belongs to a case — goes through this, so a hidden button is never the only control.
 */
export function caseReadable(scope: ReadScope): SQL {
  if (!scope.sensitivities.length) return sql`false`;
  const clearance = inArray(cases.sensitivity, scope.sensitivities);
  if (!scope.sectors) return clearance;
  return and(clearance, or(isNull(cases.sectorKey), inArray(cases.sectorKey, scope.sectors)))!;
}
