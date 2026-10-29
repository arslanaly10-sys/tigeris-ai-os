import { AUTHORITY_RULES, MANDATES } from '../fixtures/mandates';
import { withInstitution, type Db } from './client';
import { authorityRules, mandates } from './schema';

export async function seedMandates(db: Db, institutionId: string) {
  await withInstitution(db, institutionId, async (tx) => {
    await tx.insert(mandates).values(MANDATES.map((m) => ({ ...m, institutionId, claimClass: 'synthetic' })));
    await tx.insert(authorityRules).values(
      AUTHORITY_RULES.map((r, i) => ({
        ...r,
        institutionId,
        requiresExpertReview: true,
        selfApprovalBlocked: true,
        claimClass: 'synthetic',
        sortOrder: i,
      })),
    );
  });
}
