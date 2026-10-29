// Phase 2 seed pass for the demonstration institution: graph, signal links, illustrative signals,
// movement tracks, and two ingestion runs through the real validation pipeline.
import { eq } from 'drizzle-orm';
import {
  CASE_ENTITIES,
  ENTITIES,
  REAL_SIGNAL_LINKS,
  RELATIONSHIPS,
  SYNTHETIC_SIGNALS,
  TRACKS,
  timeTrack,
} from '../fixtures/graph';
import { ingestPackage, sampleSyntheticPackage } from '../ingestion/service';
import { sha256Hex } from '../ingestion/rules';
import { withInstitution, type Db } from './client';
import {
  caseEntities,
  entities,
  entityRelationships,
  evidenceObjects,
  movementTracks,
  relationshipEvidence,
  signalEvidence,
  signals,
} from './schema';
import type { SeededIds } from './seed';

const HOUR = 3_600_000;

export async function seedPhase2(db: Db, ids: SeededIds, now = Date.now()) {
  const { institutionId } = ids;
  await withInstitution(db, institutionId, async (tx) => {
    const entityIds = new Map<string, string>();
    for (const e of ENTITIES) {
      const [row] = await tx
        .insert(entities)
        .values({
          institutionId,
          key: e.key,
          entityType: e.type,
          name: e.name,
          description: e.description,
          lon: e.lonLat?.[0] ?? null,
          lat: e.lonLat?.[1] ?? null,
          geoPrecision: e.lonLat ? (e.geoPrecision ?? 'approximate') : null,
          claimClass: e.claimClass,
        })
        .returning({ id: entities.id });
      entityIds.set(e.key, row!.id);
    }

    for (const r of RELATIONSHIPS) {
      const [row] = await tx
        .insert(entityRelationships)
        .values({
          institutionId,
          subjectId: entityIds.get(r.subject)!,
          predicate: r.predicate,
          objectId: entityIds.get(r.object)!,
          relationshipClass: r.relClass,
          confidenceBand: r.band,
          rationale: r.rationale,
          status: 'active',
          graphVersion: 1,
        })
        .returning({ id: entityRelationships.id });
      for (const ev of r.evidence ?? []) {
        await tx.insert(relationshipEvidence).values({
          institutionId,
          relationshipId: row!.id,
          evidenceId: ids.evidenceIds.get(ev.ref)!,
          stance: ev.stance,
        });
      }
    }

    for (const ce of CASE_ENTITIES) {
      await tx.insert(caseEntities).values({
        institutionId,
        caseId: ids.caseIds.get(ce.caseKey)!,
        entityId: entityIds.get(ce.entityKey)!,
        role: ce.role,
      });
    }

    // Real signal: type, location, entity and evidence links.
    const [real] = await tx
      .update(signals)
      .set({
        signalType: REAL_SIGNAL_LINKS.signalType,
        confidenceBand: REAL_SIGNAL_LINKS.confidenceBand,
        locationLabel: REAL_SIGNAL_LINKS.locationLabel,
        entityId: entityIds.get(REAL_SIGNAL_LINKS.entityKey)!,
      })
      .where(eq(signals.key, REAL_SIGNAL_LINKS.key))
      .returning({ id: signals.id });
    for (const ref of REAL_SIGNAL_LINKS.evidenceRefs) {
      await tx
        .insert(signalEvidence)
        .values({ institutionId, signalId: real!.id, evidenceId: ids.evidenceIds.get(ref)! });
    }
    // The earlier synthetic LNG signal (Phase 1 fixture) becomes an energy signal with its own evidence.
    const [lng] = await tx
      .update(signals)
      .set({
        signalType: 'energy',
        confidenceBand: 'low',
        locationLabel: 'Gulf LNG terminal (illustrative)',
        entityId: entityIds.get('term-ras-laffan')!,
      })
      .where(eq(signals.key, 'SIG-SYN-0002'))
      .returning({ id: signals.id, detectedAt: signals.detectedAt });
    const [lngEvidence] = await tx
      .insert(evidenceObjects)
      .values({
        institutionId,
        sourceId: ids.sourceIds.get('synthetic-signals')!,
        externalId: 'synthetic:SIG-SYN-0002',
        title: 'Illustrative departure schedule extract',
        summary: 'Generated schedule comparison for demonstration. Not real terminal data.',
        eventTime: new Date(lng!.detectedAt.getTime() - HOUR),
        retrievedAt: lng!.detectedAt,
        version: '1',
        sha256: sha256Hex('SIG-SYN-0002|schedule'),
        validationStatus: 'unverified',
        validationNote: 'Synthetic record; single uncorroborated generator output.',
      })
      .returning({ id: evidenceObjects.id });
    await tx.insert(signalEvidence).values({ institutionId, signalId: lng!.id, evidenceId: lngEvidence!.id });

    const syntheticSource = ids.sourceIds.get('synthetic-signals')!;
    for (const s of SYNTHETIC_SIGNALS) {
      const detected = new Date(now - s.hoursAgo * HOUR);
      const [ev] = await tx
        .insert(evidenceObjects)
        .values({
          institutionId,
          sourceId: syntheticSource,
          externalId: `synthetic:${s.key}`,
          title: s.evidence.title,
          summary: s.evidence.summary,
          eventTime: new Date(detected.getTime() - HOUR),
          retrievedAt: detected,
          version: '1',
          sha256: sha256Hex(`${s.key}|${s.evidence.summary}`),
          validationStatus: s.evidence.validationStatus,
          validationNote: s.evidence.note,
        })
        .returning({ id: evidenceObjects.id });
      const [sig] = await tx
        .insert(signals)
        .values({
          institutionId,
          key: s.key,
          title: s.title,
          summary: s.summary,
          domain: s.domain,
          urgency: s.urgency,
          dataMode: 'synthetic_demo',
          disposition: s.disposition,
          detectedAt: detected,
          signalType: s.signalType,
          confidenceBand: s.confidenceBand,
          locationLabel: s.locationLabel,
          entityId: s.entityKey ? entityIds.get(s.entityKey)! : null,
        })
        .returning({ id: signals.id });
      await tx.insert(signalEvidence).values({ institutionId, signalId: sig!.id, evidenceId: ev!.id });
    }

    const movementSource = ids.sourceIds.get('synthetic-movement')!;
    for (const t of TRACKS) {
      await tx.insert(movementTracks).values({
        institutionId,
        sourceId: movementSource,
        key: t.key,
        kind: t.kind,
        label: t.label,
        dataMode: 'synthetic_demo',
        claimClass: 'illustrative',
        points: timeTrack(t),
      });
    }

    // Two packages through the real pipeline: one mixed synthetic sample, one from an unapproved source.
    const seedTime = new Date(now - 2 * HOUR);
    await ingestPackage(
      tx,
      institutionId,
      ids.principalIds.get('admin')!,
      sampleSyntheticPackage(seedTime),
      seedTime,
    );
    const body = 'GCC-Stat indicator extract (placeholder body for the rejected-package demonstration).';
    await ingestPackage(
      tx,
      institutionId,
      ids.principalIds.get('admin')!,
      {
        packageId: 'gcc-stat-trial-extract',
        sourceKey: 'gcc-stat',
        createdAt: seedTime.toISOString(),
        records: [
          {
            externalId: 'gccstat:trial:1',
            title: 'Trial indicator extract',
            summary: 'Submitted before the source terms were approved.',
            content: body,
            sha256: sha256Hex(body),
            dataClass: 'public',
            eventTime: null,
            retrievedAt: seedTime.toISOString(),
          },
        ],
      },
      seedTime,
    );
  });
}
