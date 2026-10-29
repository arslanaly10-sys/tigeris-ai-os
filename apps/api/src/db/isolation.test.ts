// Tenant isolation tests (TR-044, FR-42, schema design §3). They run as tigeris_app, the role the API uses.
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { appendAudit, verifyAuditChain } from '../audit/audit';
import { config } from '../config';
import { createDb, resolveInstitutionId, withInstitution } from './client';
import { auditEvents, caseEvidence, cases, evidenceObjects, institutions, sources } from './schema';

const { db, close } = createDb(config.DATABASE_APP_URL, 2);
let gsia: string;
let nri: string;

beforeAll(async () => {
  gsia = (await resolveInstitutionId(db, 'gsia-demo'))!;
  nri = (await resolveInstitutionId(db, 'nri-test'))!;
  expect(gsia).toBeTruthy();
  expect(nri).toBeTruthy();
});

afterAll(async () => {
  await close();
});

describe('application role', () => {
  it('is not a superuser, owner or RLS-bypassing role', async () => {
    const [row] = await db.execute<{ rolsuper: boolean; rolbypassrls: boolean }>(
      sql`select rolsuper, rolbypassrls from pg_roles where rolname = current_user`,
    );
    expect(row).toEqual({ rolsuper: false, rolbypassrls: false });
    const owned = await db.execute(
      sql`select 1 from pg_tables where schemaname = 'public' and tableowner = current_user`,
    );
    expect(owned).toHaveLength(0);
  });
});

describe('row-level security', () => {
  it('returns no institutional rows without a scope', async () => {
    expect(await db.select().from(cases)).toHaveLength(0);
    expect(await db.select().from(institutions)).toHaveLength(0);
  });

  it("never returns another institution's rows", async () => {
    const rows = await withInstitution(db, gsia, (tx) =>
      tx.select({ key: cases.key, inst: cases.institutionId }).from(cases),
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.inst === gsia)).toBe(true);
    expect(rows.map((r) => r.key)).not.toContain('NRI-TEST-01');

    const byKey = await withInstitution(db, gsia, (tx) =>
      tx.select().from(cases).where(eq(cases.key, 'NRI-TEST-01')),
    );
    expect(byKey).toHaveLength(0);
  });

  it('sees only its own institution record', async () => {
    const rows = await withInstitution(db, gsia, (tx) =>
      tx.select({ key: institutions.key }).from(institutions),
    );
    expect(rows).toEqual([{ key: 'gsia-demo' }]);
  });

  it("rejects writes tagged with another institution's id", async () => {
    await expect(
      withInstitution(db, gsia, (tx) =>
        tx.insert(sources).values({
          institutionId: nri,
          key: 'smuggled',
          publisher: 'x',
          title: 'x',
          sourceClass: 'synthetic',
          allowedPurpose: 'x',
          approvalStatus: 'approved',
        }),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('cannot link a case to evidence from another institution (composite foreign key)', async () => {
    const [nriEvidence] = await withInstitution(db, nri, (tx) =>
      tx.select({ id: evidenceObjects.id }).from(evidenceObjects),
    );
    const [gsiaCase] = await withInstitution(db, gsia, (tx) =>
      tx.select({ id: cases.id }).from(cases).limit(1),
    );
    await expect(
      withInstitution(db, gsia, (tx) =>
        tx
          .insert(caseEvidence)
          .values({ institutionId: gsia, caseId: gsiaCase!.id, evidenceId: nriEvidence!.id, sortOrder: 99 }),
      ),
    ).rejects.toThrow(/foreign key/);
  });

  it('does not leak scope to the next transaction on a pooled connection', async () => {
    const { db: single, close: closeSingle } = createDb(config.DATABASE_APP_URL, 1);
    try {
      await withInstitution(single, gsia, (tx) => tx.select().from(cases));
      const after = await single.execute<{ scope: string | null }>(sql`select app_institution_id() as scope`);
      expect(after[0]?.scope).toBeNull();
      expect(await single.select().from(cases)).toHaveLength(0);
    } finally {
      await closeSingle();
    }
  });
});

describe('audit trail', () => {
  it('appends hash-chained events that verify', async () => {
    await withInstitution(db, gsia, (tx) =>
      appendAudit(tx, {
        institutionId: gsia,
        actorPrincipalId: null,
        actorType: 'service',
        action: 'test.isolation',
        objectType: 'test',
        payload: { zeta: 1, alpha: { b: 2, a: 1 } },
      }),
    );
    const broken = await withInstitution(db, gsia, (tx) => verifyAuditChain(tx, gsia));
    expect(broken).toBeNull();
  });

  it('cannot be updated or deleted', async () => {
    await expect(
      withInstitution(db, gsia, (tx) =>
        tx.update(auditEvents).set({ action: 'tampered' }).where(eq(auditEvents.institutionId, gsia)),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      withInstitution(db, gsia, (tx) => tx.delete(auditEvents).where(eq(auditEvents.institutionId, gsia))),
    ).rejects.toThrow(/permission denied/);
  });
});
