/**
 * Seeds the labelled sector samples (D-98) as a "sample" connector with its own synthetic, approved source. The rows
 * go through the same validation as an import, so a sample can never hold a value an import would refuse.
 */
import { SECTOR_DATASET_DEFS, SECTOR_DATASETS, validateRows } from '@tigeris/shared';
import { eq } from 'drizzle-orm';
import { SECTOR_SAMPLE_AS_OF, SECTOR_SAMPLES } from '../fixtures/sector-samples';
import { withInstitution, type Db } from './client';
import { connectors, principalRoles, sectorRecords, sources } from './schema';

export async function seedSectorSamples(db: Db, institutionId: string) {
  await withInstitution(db, institutionId, async (tx) => {
    const [admin] = await tx
      .select({ id: principalRoles.principalId })
      .from(principalRoles)
      .where(eq(principalRoles.role, 'administrator'));
    const [source] = await tx
      .insert(sources)
      .values({
        institutionId,
        key: 'sector-samples',
        publisher: 'TIGERIS sector samples (synthetic)',
        title: 'Labelled sample records for the six sector datasets',
        sourceClass: 'synthetic',
        allowedPurpose: 'Demonstration only; approved by the owner (D-98)',
        approvalStatus: 'approved',
      })
      .returning({ id: sources.id });
    const [conn] = await tx
      .insert(connectors)
      .values({
        institutionId,
        key: 'CON-SECTOR-SAMPLES',
        provider: 'TIGERIS — synthetic sample register',
        name: 'Sector samples (labelled)',
        connectionType: 'file',
        authType: 'none',
        datasets: [...SECTOR_DATASETS],
        classification: 'internal',
        status: 'sample',
        mappingVersion: 'sector-samples.v1',
        sourceId: source!.id,
        createdBy: admin!.id,
      })
      .returning({ id: connectors.id });
    for (const dataset of SECTOR_DATASETS) {
      const def = SECTOR_DATASET_DEFS[dataset];
      const raw = SECTOR_SAMPLES[dataset].map((r) =>
        Object.fromEntries(
          Object.entries({ ...r, as_of: SECTOR_SAMPLE_AS_OF }).map(([k, v]) => [k, String(v)]),
        ),
      );
      const { rows, missingColumns } = validateRows(dataset, Object.keys(raw[0]!), raw);
      if (missingColumns.length)
        throw new Error(`sector sample ${dataset} lacks ${missingColumns.join(', ')}`);
      for (const r of rows) {
        if (r.issues.some((i) => i.severity === 'error'))
          throw new Error(
            `sector sample ${dataset} row ${r.row} is invalid: ${r.issues.map((i) => i.message).join('; ')}`,
          );
        const v = r.values;
        await tx.insert(sectorRecords).values({
          institutionId,
          dataset,
          key: String(v.key),
          sectorKey: def.sector,
          attributes: Object.fromEntries(
            def.fields
              .filter((f) => f.name !== 'key' && f.name !== 'as_of')
              .map((f) => [f.name, v[f.name] ?? null]),
          ),
          asOf: String(v.as_of),
          sourceId: source!.id,
          sourceRecordId: `sample:${dataset}:${String(v.key)}`,
          recordMode: 'sample',
          classification: 'internal',
          mappingVersion: def.mappingVersion,
          qualityStatus: r.issues.length ? 'warning' : 'valid',
          connectorId: conn!.id,
        });
      }
    }
  });
}
