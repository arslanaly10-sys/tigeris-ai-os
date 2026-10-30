import { WATCH_BASIS, WATCH_RULES } from '../fixtures/watch-rules';
import { sweep } from '../modules/interventions';
import { withInstitution, type Db } from './client';
import { watchRules } from './schema';

/** Seeds the approved watch rules (synthetic, owner-approved) and runs the first sweep as the service. */
export async function seedInterventions(db: Db, institutionId: string, now = new Date()) {
  await withInstitution(db, institutionId, async (tx) => {
    await tx.insert(watchRules).values(
      WATCH_RULES.map((r) => ({
        ...r,
        routeRoles: [...r.routeRoles],
        institutionId,
        version: 1,
        claimClass: 'synthetic',
        status: 'approved',
        approvedAt: now,
        basis: WATCH_BASIS,
      })),
    );
    await sweep(tx, institutionId, null, now);
  });
}
