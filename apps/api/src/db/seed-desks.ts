import { DESK_MEMBERS, DIVISIONS } from '../fixtures/desks';
import { withInstitution, type Db } from './client';
import { deskMembers, divisions, principalRoles } from './schema';

/** Seeds the Executive Office, the Investment Committee and five asset-class desks, with synthetic membership. */
export async function seedDesks(db: Db, institutionId: string) {
  await withInstitution(db, institutionId, async (tx) => {
    const ids = new Map<string, string>();
    for (const d of DIVISIONS) {
      const [row] = await tx
        .insert(divisions)
        .values({
          institutionId,
          key: d.key,
          name: d.name,
          kind: d.kind,
          parentId: d.parent ? ids.get(d.parent)! : null,
          description: d.description,
        })
        .returning({ id: divisions.id });
      ids.set(d.key, row!.id);
    }
    const roles = await tx.select().from(principalRoles);
    const rows = DESK_MEMBERS.flatMap((m) => {
      const p = roles.find((r) => r.role === m.role);
      return p ? [{ institutionId, divisionId: ids.get(m.division)!, principalId: p.principalId }] : [];
    });
    if (rows.length) await tx.insert(deskMembers).values(rows);
  });
}
