/** Seeds the owner-supplied EIA homepage snapshot (D-102) as unverified evidence and one new Energy signal. */
import { eq } from 'drizzle-orm';
import { EIA_SNAPSHOT as S } from '../fixtures/eia-snapshot';
import { withInstitution, type Db } from './client';
import { evidenceObjects, signalEvidence, signals, sources } from './schema';

export async function seedEiaSnapshot(db: Db, institutionId: string) {
  await withInstitution(db, institutionId, async (tx) => {
    const [source] = await tx.select().from(sources).where(eq(sources.key, 'con-eia-rss'));
    if (!source) throw new Error('seed: EIA source con-eia-rss missing');
    const [ev] = await tx
      .insert(evidenceObjects)
      .values({
        institutionId,
        sourceId: source.id,
        externalId: S.externalId,
        title: S.title,
        summary: S.summary,
        eventTime: new Date(S.postedOn),
        retrievedAt: new Date(S.suppliedAt),
        version: 'manual-snapshot.v1',
        validationStatus: 'unverified',
        validationNote: S.note,
      })
      .returning({ id: evidenceObjects.id });
    const [sig] = await tx
      .insert(signals)
      .values({
        institutionId,
        key: S.signalKey,
        title: S.title,
        summary: `${S.summary} (Manual snapshot of ${S.url}, supplied by the owner; unverified.)`,
        domain: 'Energy',
        urgency: 'routine',
        dataMode: 'snapshot',
        disposition: 'new',
        detectedAt: new Date(S.postedOn),
        signalType: 'energy',
        confidenceBand: 'insufficient',
        locationLabel: 'Colombia',
      })
      .returning({ id: signals.id });
    await tx.insert(signalEvidence).values({ institutionId, signalId: sig!.id, evidenceId: ev!.id });
  });
}
