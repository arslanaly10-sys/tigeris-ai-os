// Seeds demonstration fixtures. Runs as the owner, but every institutional table is FORCE RLS,
// so each institution is written inside its own scoped transaction — the same boundary the app uses.
import { appendAudit } from '../audit/audit';
import { config } from '../config';
import { ALL_INSTITUTIONS, type InstitutionFixture } from '../fixtures/demo';
import { createDb, withInstitution, type Db } from './client';
import {
  caseEvents,
  caseEvidence,
  cases,
  evidenceFacts,
  evidenceObjects,
  institutions,
  principalRoles,
  principals,
  signals,
  sources,
} from './schema';

const DAY = 86_400_000;
const at = (v: string | ((now: number) => string) | null, now: number) =>
  v === null ? null : new Date(typeof v === 'function' ? v(now) : v);

export async function seedInstitution(db: Db, f: InstitutionFixture, now = Date.now()): Promise<string> {
  const [inst] = await db
    .insert(institutions)
    .values({ key: f.key, name: f.name, isSynthetic: f.isSynthetic })
    .returning({ id: institutions.id });
  const institutionId = inst!.id;

  await withInstitution(db, institutionId, async (tx) => {
    const principalIds = new Map<string, string>();
    for (const p of f.principals) {
      const [row] = await tx
        .insert(principals)
        .values({
          institutionId,
          displayName: p.displayName,
          title: p.title,
          idpIssuer: 'urn:tigeris:demo',
          idpSubject: `${f.key}:${p.ref}`,
          isDemo: true,
        })
        .returning({ id: principals.id });
      principalIds.set(p.ref, row!.id);
      for (const role of p.roles) {
        await tx.insert(principalRoles).values({ institutionId, principalId: row!.id, role });
      }
    }

    const sourceIds = new Map<string, string>();
    for (const s of f.sources) {
      const { ref, ...rest } = s;
      const [row] = await tx
        .insert(sources)
        .values({ institutionId, key: ref, ...rest })
        .returning({ id: sources.id });
      sourceIds.set(ref, row!.id);
    }

    const evidenceIds = new Map<string, string>();
    for (const e of f.evidence) {
      const [row] = await tx
        .insert(evidenceObjects)
        .values({
          institutionId,
          sourceId: sourceIds.get(e.sourceRef)!,
          externalId: e.externalId,
          title: e.title,
          summary: e.summary,
          eventTime: at(e.eventTime, now),
          retrievedAt: at(e.retrievedAt, now),
          version: '1',
          validationStatus: e.validationStatus,
          validationNote: e.validationNote,
        })
        .returning({ id: evidenceObjects.id });
      evidenceIds.set(e.ref, row!.id);
      for (const [i, fact] of e.facts.entries()) {
        await tx.insert(evidenceFacts).values({
          institutionId,
          evidenceId: row!.id,
          subject: fact.subject,
          predicate: fact.predicate,
          valueNum: fact.valueNum === undefined ? null : String(fact.valueNum),
          valueText: fact.valueText ?? null,
          unit: fact.unit ?? null,
          claimClass: fact.claimClass,
          validFrom: fact.validFrom ? new Date(fact.validFrom) : null,
          transformation: fact.transformation ?? null,
          extractionVersion: 'manual-v1',
          sortOrder: i,
        });
      }
    }

    const caseIds = new Map<string, string>();
    for (const c of f.cases) {
      const createdAt = new Date(now - Math.max(...c.events.map((e) => e.daysAgo), c.updatedDaysAgo) * DAY);
      const [row] = await tx
        .insert(cases)
        .values({
          institutionId,
          key: c.key,
          title: c.title,
          state: c.state,
          domain: c.domain,
          sensitivity: c.sensitivity,
          urgency: c.urgency,
          dataMode: c.dataMode,
          ownerPrincipalId: principalIds.get(c.ownerRef)!,
          objective: c.objective,
          summary: c.summary,
          whyItMatters: c.whyItMatters,
          unresolvedQuestions: c.unresolvedQuestions,
          confidence: c.confidence,
          version: c.events.length + 1,
          createdAt,
          updatedAt: new Date(now - c.updatedDaysAgo * DAY),
        })
        .returning({ id: cases.id });
      caseIds.set(c.key, row!.id);
      for (const [i, ref] of c.evidenceRefs.entries()) {
        await tx
          .insert(caseEvidence)
          .values({ institutionId, caseId: row!.id, evidenceId: evidenceIds.get(ref)!, sortOrder: i });
      }
      for (const ev of c.events) {
        await tx.insert(caseEvents).values({
          institutionId,
          caseId: row!.id,
          actorPrincipalId: ev.actorRef ? principalIds.get(ev.actorRef)! : null,
          eventType: ev.eventType,
          fromState: ev.fromState,
          toState: ev.toState,
          rationale: ev.rationale,
          occurredAt: new Date(now - ev.daysAgo * DAY),
        });
      }
    }

    for (const s of f.signals) {
      await tx.insert(signals).values({
        institutionId,
        key: s.key,
        title: s.title,
        summary: s.summary,
        domain: s.domain,
        urgency: s.urgency,
        dataMode: s.dataMode,
        disposition: s.disposition,
        detectedAt: at(s.detectedAt, now)!,
        caseId: s.caseKey ? caseIds.get(s.caseKey)! : null,
      });
    }

    await appendAudit(tx, {
      institutionId,
      actorPrincipalId: null,
      actorType: 'service',
      action: 'fixtures.seeded',
      objectType: 'institution',
      objectId: institutionId,
      payload: {
        fixture: f.key,
        sources: f.sources.length,
        evidence: f.evidence.length,
        cases: f.cases.length,
      },
    });
  });

  return institutionId;
}

export async function seedAll(url = config.DATABASE_OWNER_URL) {
  const { db, close } = createDb(url, 1);
  try {
    for (const f of ALL_INSTITUTIONS) await seedInstitution(db, f);
  } finally {
    await close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedAll()
    .then(() => console.log(`Seeded: ${ALL_INSTITUTIONS.map((f) => f.key).join(', ')}`))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
