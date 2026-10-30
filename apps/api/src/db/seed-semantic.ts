import { SEMANTIC_BASIS, SEMANTIC_DEFINITIONS, SEMANTIC_RULES } from '../fixtures/semantic';
import { withInstitution, type Db } from './client';
import { semanticDefinitions, semanticRules } from './schema';

/** Seeds the codified mandate rules as approved version 1 (synthetic, owner-approved, no named approver). */
export async function seedSemantic(db: Db, institutionId: string, now = new Date()) {
  await withInstitution(db, institutionId, async (tx) => {
    const common = {
      institutionId,
      version: 1,
      claimClass: 'synthetic',
      status: 'approved',
      approvedAt: now,
      basis: SEMANTIC_BASIS,
    };
    await tx.insert(semanticRules).values(SEMANTIC_RULES.map((r) => ({ ...r, ...common })));
    await tx.insert(semanticDefinitions).values(SEMANTIC_DEFINITIONS.map((d) => ({ ...d, ...common })));
  });
}
