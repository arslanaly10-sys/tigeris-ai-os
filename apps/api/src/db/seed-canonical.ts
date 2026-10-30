import { eq, inArray } from 'drizzle-orm';
import {
  AS_OF,
  AUTHORITY_LIMITS,
  CANONICAL_SOURCE_REF,
  CASE_SECTORS,
  MANAGERS,
  MAPPING_VERSION,
  POSITIONS,
  SYNTHETIC_NAV_USD_M,
} from '../fixtures/canonical';
import { withInstitution, type Db } from './client';
import {
  authorityLimits,
  cases,
  connectors,
  ddRecords,
  entities,
  managers,
  positions,
  principalRoles,
  sources,
} from './schema';

/** Synthetic canonical records (slice B): positions, managers, due diligence, delegated limits, case workspaces. */
export async function seedCanonical(db: Db, institutionId: string) {
  await withInstitution(db, institutionId, async (tx) => {
    const [source] = await tx.select().from(sources).where(eq(sources.key, CANONICAL_SOURCE_REF));
    if (!source) throw new Error(`seed: source ${CANONICAL_SOURCE_REF} missing`);
    const ents = await tx
      .select({ id: entities.id, key: entities.key })
      .from(entities)
      .where(
        inArray(entities.key, [
          'pf-gsia',
          ...POSITIONS.flatMap((p) => (p.holdingEntityKey ? [p.holdingEntityKey] : [])),
        ]),
      );
    const entityId = (k: string | undefined) => (k ? (ents.find((e) => e.key === k)?.id ?? null) : null);
    const provenance = {
      institutionId,
      sourceId: source.id,
      recordMode: 'synthetic' as const,
      classification: 'confidential' as const,
      mappingVersion: MAPPING_VERSION,
    };

    await tx.insert(positions).values(
      POSITIONS.map((p) => ({
        ...provenance,
        key: p.key,
        portfolioEntityId: entityId('pf-gsia'),
        holdingEntityId: entityId(p.holdingEntityKey),
        name: p.name,
        assetClass: p.assetClass,
        sectorKey: p.sectorKey,
        country: p.country,
        currency: 'USD',
        marketValue: String((p.navSharePct / 100) * SYNTHETIC_NAV_USD_M),
        navSharePct: String(p.navSharePct),
        routeDependent: p.routeDependent,
        asOf: AS_OF,
        sourceRecordId: `gsia-demo:positions:${p.key}`,
      })),
    );

    for (const m of MANAGERS) {
      const [row] = await tx
        .insert(managers)
        .values({
          ...provenance,
          classification: 'restricted',
          key: m.key,
          name: m.name,
          strategy: m.strategy,
          domicile: m.domicile,
          sectorKey: m.sectorKey,
          sourceRecordId: `gsia-demo:managers:${m.key}`,
        })
        .returning({ id: managers.id });
      await tx.insert(ddRecords).values({
        ...provenance,
        classification: 'restricted',
        key: m.dd.key,
        managerId: row!.id,
        reviewType: m.dd.reviewType,
        status: m.dd.status,
        openIssues: m.dd.openIssues,
        summary: m.dd.summary,
        reviewedOn: m.dd.reviewedOn,
        sourceRecordId: `gsia-demo:dd:${m.dd.key}`,
      });
    }

    await tx.insert(authorityLimits).values(
      AUTHORITY_LIMITS.map((l) => ({
        institutionId,
        actionClass: l.actionClass,
        role: l.role,
        limitValue: String(l.limitValue),
        limitUnit: l.limitUnit,
        basis: l.basis,
        claimClass: 'synthetic',
      })),
    );

    // Connectors: the synthetic register as a sample connector, and a public feed whose source the owner approved
    // (D-98) and which stays `configured` until a fetch actually succeeds.
    const [admin] = await tx
      .select({ id: principalRoles.principalId })
      .from(principalRoles)
      .where(eq(principalRoles.role, 'administrator'));
    const [sample] = await tx
      .insert(connectors)
      .values({
        institutionId,
        key: 'CON-SAMPLE-01',
        provider: 'GSIA (Demo) — synthetic fixture',
        name: 'Synthetic exposure register',
        connectionType: 'file',
        authType: 'none',
        datasets: ['positions', 'managers', 'due_diligence'],
        sectorKey: 'capital',
        classification: 'confidential',
        status: 'sample',
        mappingVersion: MAPPING_VERSION,
        sourceId: source.id,
        createdBy: admin!.id,
      })
      .returning({ id: connectors.id });
    await tx.update(positions).set({ connectorId: sample!.id });
    await tx.update(managers).set({ connectorId: sample!.id });
    await tx.update(ddRecords).set({ connectorId: sample!.id });
    const [feedSource] = await tx
      .insert(sources)
      .values({
        institutionId,
        key: 'con-eia-rss',
        publisher: 'U.S. Energy Information Administration',
        title: 'Today in Energy (RSS)',
        sourceClass: 'public',
        url: 'https://www.eia.gov/rss/todayinenergy.xml',
        termsRef: 'EIA public information (citation required)',
        allowedPurpose: 'Institutional analysis (registered connector)',
        cadence: 'On sync',
        freshnessLimitHours: null,
        // Approved by the owner (D-98). The connector stays "configured" until a fetch actually succeeds.
        approvalStatus: 'approved',
      })
      .returning({ id: sources.id });
    await tx.insert(connectors).values({
      institutionId,
      key: 'CON-EIA-RSS',
      provider: 'U.S. Energy Information Administration',
      name: 'Today in Energy (RSS)',
      connectionType: 'rss',
      authType: 'none',
      endpoint: 'https://www.eia.gov/rss/todayinenergy.xml',
      datasets: ['signals'],
      sectorKey: 'energy',
      classification: 'internal',
      status: 'configured',
      mappingVersion: 'feed.items.v1',
      sourceId: feedSource!.id,
      createdBy: admin!.id,
    });

    for (const [key, sectorKey] of Object.entries(CASE_SECTORS)) {
      await tx.update(cases).set({ sectorKey }).where(eq(cases.key, key));
    }
  });
}
