import { inArray } from 'drizzle-orm';
import { ASSUMPTIONS, AUTHORITY_RULES, MANDATES } from '../fixtures/mandates';
import { OIL_ASSUMPTIONS } from '../fixtures/oil-assumptions';
import { withInstitution, type Db } from './client';
import { assumptions, authorityRules, evidenceObjects, mandates } from './schema';

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
    const basisIds = ASSUMPTIONS.flatMap((a) => (a.basisExternalId ? [a.basisExternalId] : []));
    const basis = basisIds.length
      ? await tx
          .select({ id: evidenceObjects.id, externalId: evidenceObjects.externalId })
          .from(evidenceObjects)
          .where(inArray(evidenceObjects.externalId, basisIds))
      : [];
    await tx.insert(assumptions).values(
      ASSUMPTIONS.map(({ basisExternalId, ...a }) => ({
        ...a,
        institutionId,
        basisEvidenceId: basis.find((b) => b.externalId === basisExternalId)?.id ?? null,
      })),
    );
    await tx.insert(assumptions).values(OIL_ASSUMPTIONS.map((a) => ({ ...a, institutionId })));
  });
}
