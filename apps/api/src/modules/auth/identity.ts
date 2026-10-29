import type { FastifyReply, FastifyRequest } from 'fastify';

/** The verified identity attached to a request after authentication. */
export interface SessionIdentity {
  institutionId: string;
  principalId: string;
}

/**
 * Identity provider seam (FR-01, D-18). The MVP ships the labelled demo provider only.
 * A production deployment supplies an OIDC/SAML provider that maps issuer + subject to a principal;
 * TIGERIS never becomes the institution's identity directory and never stores passwords.
 */
export interface IdentityProvider {
  readonly kind: 'demo' | 'oidc';
  readSession(request: FastifyRequest): SessionIdentity | null;
  writeSession(reply: FastifyReply, identity: SessionIdentity): void;
  clearSession(reply: FastifyReply): void;
}

const COOKIE = 'tigeris_session';

export class DemoIdentityProvider implements IdentityProvider {
  readonly kind = 'demo' as const;

  constructor(private readonly secure: boolean) {}

  readSession(request: FastifyRequest): SessionIdentity | null {
    const raw = request.cookies[COOKIE];
    if (!raw) return null;
    const unsigned = request.unsignCookie(raw);
    if (!unsigned.valid || !unsigned.value) return null;
    try {
      const parsed = JSON.parse(unsigned.value) as Partial<SessionIdentity>;
      if (typeof parsed.institutionId !== 'string' || typeof parsed.principalId !== 'string') return null;
      return { institutionId: parsed.institutionId, principalId: parsed.principalId };
    } catch {
      return null;
    }
  }

  writeSession(reply: FastifyReply, identity: SessionIdentity): void {
    reply.setCookie(COOKIE, JSON.stringify(identity), {
      signed: true,
      httpOnly: true,
      sameSite: 'lax',
      secure: this.secure,
      path: '/',
      maxAge: 8 * 60 * 60,
    });
  }

  clearSession(reply: FastifyReply): void {
    reply.clearCookie(COOKIE, { path: '/' });
  }
}

/** Placeholder for the pilot phase: wired once the client names its IdP and claim mapping. */
export class OidcIdentityProvider implements IdentityProvider {
  readonly kind = 'oidc' as const;
  readSession(): SessionIdentity | null {
    throw new Error('OIDC identity provider is not configured in this build (pilot scope).');
  }
  writeSession(): void {
    throw new Error('OIDC identity provider is not configured in this build (pilot scope).');
  }
  clearSession(): void {}
}
