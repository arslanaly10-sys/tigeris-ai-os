import type { AuthContext, DemoPrincipal, Role } from '@tigeris/shared';
import { asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { appendAudit } from '../../audit/audit';
import { resolveInstitutionId, withInstitution } from '../../db/client';
import { institutions, principalRoles, principals } from '../../db/schema';
import { ctxOf, loadPrincipal, requireSession, type AppDeps } from '../context';

const ROLE_ORDER: Role[] = [
  'executive',
  'analyst',
  'domain_expert',
  'approver',
  'operations_owner',
  'administrator',
  'auditor',
];

export async function authRoutes(app: FastifyInstance, deps: AppDeps) {
  const { db, identity } = deps;

  /** Seeded demo principals for the labelled Demonstration Mode role picker (FR-04). */
  app.get('/api/auth/demo-principals', async (_request, reply) => {
    const institutionId = await resolveInstitutionId(db, deps.demoInstitutionKey);
    if (!institutionId) return reply.code(503).send({ error: 'demo_institution_missing' });
    return withInstitution(db, institutionId, async (tx) => {
      const [inst] = await tx.select().from(institutions);
      const rows = await tx
        .select({
          id: principals.id,
          displayName: principals.displayName,
          title: principals.title,
          role: principalRoles.role,
        })
        .from(principals)
        .innerJoin(principalRoles, eq(principalRoles.principalId, principals.id))
        .where(eq(principals.isDemo, true))
        .orderBy(asc(principals.displayName));
      const byId = new Map<string, DemoPrincipal>();
      for (const r of rows) {
        const p = byId.get(r.id) ?? { id: r.id, displayName: r.displayName, title: r.title, roles: [] };
        p.roles.push(r.role as Role);
        byId.set(r.id, p);
      }
      const list = [...byId.values()].sort(
        (a, b) => ROLE_ORDER.indexOf(a.roles[0]!) - ROLE_ORDER.indexOf(b.roles[0]!),
      );
      return { institution: { key: inst!.key, name: inst!.name }, principals: list };
    });
  });

  /**
   * Institution identification step of sign-in. Production resolves the code or email domain to the
   * institution's identity provider; the demonstration build only knows its one demo institution.
   */
  app.post('/api/auth/resolve-institution', async (request, reply) => {
    const body = z.object({ identifier: z.string().trim().min(2).max(200) }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_request' });
    const id = body.data.identifier.toLowerCase();
    const code = deps.demoInstitutionCode.toLowerCase();
    const matches = id === code || id.endsWith(`@${code}.example`);
    if (!matches) return reply.code(404).send({ error: 'institution_not_connected' });
    const institutionId = await resolveInstitutionId(db, deps.demoInstitutionKey);
    if (!institutionId) return reply.code(503).send({ error: 'demo_institution_missing' });
    const [inst] = await withInstitution(db, institutionId, (tx) => tx.select().from(institutions));
    return { institution: { key: inst!.key, name: inst!.name }, identityProvider: 'demo' as const };
  });

  app.post('/api/auth/demo-session', async (request, reply) => {
    const body = z.object({ principalId: z.string().uuid() }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_request' });
    const institutionId = await resolveInstitutionId(db, deps.demoInstitutionKey);
    if (!institutionId) return reply.code(503).send({ error: 'demo_institution_missing' });

    const ok = await withInstitution(db, institutionId, async (tx) => {
      const loaded = await loadPrincipal(tx, institutionId, body.data.principalId);
      if (!loaded || !loaded.principal.isDemo) return false;
      await appendAudit(tx, {
        institutionId,
        actorPrincipalId: loaded.principal.id,
        actorType: 'human',
        action: 'auth.demo_session_started',
        objectType: 'principal',
        objectId: loaded.principal.id,
        payload: { roles: loaded.roles, identityProvider: identity.kind },
      });
      return true;
    });
    if (!ok) return reply.code(403).send({ error: 'not_a_demo_principal' });
    identity.writeSession(reply, { institutionId, principalId: body.data.principalId });
    return { ok: true };
  });

  app.get(
    '/api/auth/context',
    { preHandler: requireSession(deps) },
    async (request): Promise<AuthContext> => {
      const ctx = ctxOf(request);
      const [inst] = await withInstitution(db, ctx.institutionId, (tx) => tx.select().from(institutions));
      return {
        institution: { id: inst!.id, key: inst!.key, name: inst!.name, isSynthetic: inst!.isSynthetic },
        principal: { id: ctx.principalId, displayName: ctx.displayName, title: ctx.title, roles: ctx.roles },
        environment: 'demonstration',
        dataModes: ['snapshot', 'synthetic_demo'],
      };
    },
  );

  app.post('/api/auth/logout', { preHandler: requireSession(deps) }, async (request, reply) => {
    const ctx = ctxOf(request);
    await withInstitution(db, ctx.institutionId, (tx) =>
      appendAudit(tx, {
        institutionId: ctx.institutionId,
        actorPrincipalId: ctx.principalId,
        actorType: 'human',
        action: 'auth.session_ended',
        objectType: 'principal',
        objectId: ctx.principalId,
      }),
    );
    identity.clearSession(reply);
    return { ok: true };
  });
}
