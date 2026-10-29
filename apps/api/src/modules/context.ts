import type { Role } from '@tigeris/shared';
import { and, eq } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { withInstitution, type Db, type Tx } from '../db/client';
import { principalRoles, principals } from '../db/schema';
import type { IdentityProvider } from './auth/identity';

export interface RequestContext {
  institutionId: string;
  principalId: string;
  displayName: string;
  title: string;
  roles: Role[];
}

export interface AppDeps {
  db: Db;
  identity: IdentityProvider;
  demoInstitutionKey: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    ctx: RequestContext | null;
  }
}

export async function loadPrincipal(tx: Tx, institutionId: string, principalId: string) {
  const [p] = await tx
    .select()
    .from(principals)
    .where(and(eq(principals.id, principalId), eq(principals.institutionId, institutionId)));
  if (!p) return null;
  const roles = await tx
    .select({ role: principalRoles.role })
    .from(principalRoles)
    .where(eq(principalRoles.principalId, principalId));
  return { principal: p, roles: roles.map((r) => r.role as Role) };
}

/**
 * Pre-handler for protected routes: resolves the session, re-reads the principal inside the
 * institution scope on every request (never trusting client-supplied ids or roles), or replies 401.
 */
export function requireSession(deps: AppDeps) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const identity = deps.identity.readSession(request);
    if (!identity) return reply.code(401).send({ error: 'unauthenticated' });
    const loaded = await withInstitution(deps.db, identity.institutionId, (tx) =>
      loadPrincipal(tx, identity.institutionId, identity.principalId),
    );
    if (!loaded) {
      deps.identity.clearSession(reply);
      return reply.code(401).send({ error: 'unauthenticated' });
    }
    request.ctx = {
      institutionId: identity.institutionId,
      principalId: identity.principalId,
      displayName: loaded.principal.displayName,
      title: loaded.principal.title,
      roles: loaded.roles,
    };
  };
}

export function ctxOf(request: FastifyRequest): RequestContext {
  if (!request.ctx) throw new Error('requireSession pre-handler missing on protected route');
  return request.ctx;
}
