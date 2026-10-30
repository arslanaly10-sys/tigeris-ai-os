import { readScope, type ReadScope, type Role, type SectorKey } from '@tigeris/shared';
import { and, eq } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { withInstitution, type Db, type Tx } from '../db/client';
import { principalRoles, principals, principalWorkspaces } from '../db/schema';
import type { JobScheduler } from '../jobs';
import type { IdentityProvider } from './auth/identity';

export interface RequestContext {
  institutionId: string;
  principalId: string;
  displayName: string;
  title: string;
  roles: Role[];
  /** Assigned sector workspaces; empty means every workspace. */
  workspaces: SectorKey[];
  /** What this person may read (clearance by classification, workspaces). Enforced in every read query. */
  scope: ReadScope;
}

export interface AppDeps {
  db: Db;
  identity: IdentityProvider;
  demoInstitutionKey: string;
  /** Code a user types at sign-in to reach the demonstration institution. */
  demoInstitutionCode: string;
  jobs: JobScheduler;
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
  const workspaces = await tx
    .select({ sectorKey: principalWorkspaces.sectorKey })
    .from(principalWorkspaces)
    .where(eq(principalWorkspaces.principalId, principalId));
  return {
    principal: p,
    roles: roles.map((r) => r.role as Role),
    workspaces: workspaces.map((w) => w.sectorKey as SectorKey),
  };
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
      workspaces: loaded.workspaces,
      scope: readScope(loaded.roles, loaded.workspaces),
    };
  };
}

export function ctxOf(request: FastifyRequest): RequestContext {
  if (!request.ctx) throw new Error('requireSession pre-handler missing on protected route');
  return request.ctx;
}
