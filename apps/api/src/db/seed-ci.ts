/**
 * Competitive-intelligence seed (slice J): the five vendor domains the owner approved in D-54. Only BlackRock's
 * Aladdin section is in scope. Nothing is collected here: pages and claims exist only after a real crawl succeeds.
 */
import { withInstitution, type Db } from './client';
import { ciDomains } from './schema';

export const CI_SEED = [
  {
    key: 'palantir',
    vendor: 'Palantir',
    host: 'www.palantir.com',
    pathPrefix: '/',
    category: 'Data and decision platform',
  },
  {
    key: 'blackrock-aladdin',
    vendor: 'BlackRock Aladdin',
    host: 'www.blackrock.com',
    pathPrefix: '/aladdin',
    category: 'Investment management platform',
  },
  {
    key: 'alternativesoft',
    vendor: 'AlternativeSoft',
    host: 'www.alternativesoft.com',
    pathPrefix: '/',
    category: 'Fund analytics and due diligence',
  },
  {
    key: 'dasseti',
    vendor: 'Dasseti',
    host: 'www.dasseti.com',
    pathPrefix: '/',
    category: 'Due diligence and data collection',
  },
  {
    key: 'v7',
    vendor: 'V7',
    host: 'www.v7labs.com',
    pathPrefix: '/',
    category: 'AI document and data extraction',
  },
] as const;

export async function seedCi(db: Db, institutionId: string) {
  await withInstitution(db, institutionId, async (tx) => {
    await tx.insert(ciDomains).values(
      CI_SEED.map((d) => ({
        institutionId,
        ...d,
        status: 'approved',
        approvalBasis: 'Owner decision D-54 (29 Oct 2026): the five seed vendor domains',
        // Approved by the owner's decision, not by a person in the institution's directory.
        approvedBy: null,
        approvedAt: new Date('2026-10-29T00:00:00Z'),
      })),
    );
  });
}
