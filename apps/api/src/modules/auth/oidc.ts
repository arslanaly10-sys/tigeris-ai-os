/**
 * OpenID Connect sign-in (Phase 5H, FR-02, D-100, D-122): authorization code with PKCE against the institution's
 * identity provider, Microsoft Entra ID by default. Off until OIDC_ISSUER and OIDC_CLIENT_ID are set; the demo sign-in
 * stays for the demonstration institution. The ID token is verified here (RS256 signature against the issuer's keys,
 * issuer, audience, expiry, nonce); the person must already be provisioned with that issuer and subject. TIGERIS
 * stores no passwords; MFA and conditional access are the identity provider's.
 */
import { createHash, createPublicKey, randomBytes, verify, type JsonWebKey } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { appendAudit } from '../../audit/audit';
import { config } from '../../config';
import { resolveInstitutionId, withInstitution } from '../../db/client';
import { principals } from '../../db/schema';
import type { AppDeps } from '../context';

const FLOW_COOKIE = 'tigeris_oidc';
const b64url = (b: Buffer) => b.toString('base64url');

export interface IdClaims {
  iss: string;
  sub: string;
  aud: string | string[];
  exp: number;
  nbf?: number;
  nonce?: string;
  name?: string;
}

/**
 * Verifies an ID token. Only RS256 is accepted (no "none", no HMAC with a public key); the key is chosen by kid.
 * Returns the claims, or throws with the reason.
 */
export function verifyIdToken(
  token: string,
  keys: (JsonWebKey & { kid?: string })[],
  expect: { issuer: string; audience: string; nonce: string },
  nowSeconds = Math.floor(Date.now() / 1000),
): IdClaims {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('malformed token');
  const header = JSON.parse(Buffer.from(parts[0]!, 'base64url').toString()) as { alg?: string; kid?: string };
  if (header.alg !== 'RS256') throw new Error(`algorithm ${header.alg} not accepted`);
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('signing key not found');
  const ok = verify(
    'RSA-SHA256',
    Buffer.from(`${parts[0]}.${parts[1]}`),
    createPublicKey({ key: jwk, format: 'jwk' }),
    Buffer.from(parts[2]!, 'base64url'),
  );
  if (!ok) throw new Error('bad signature');
  const c = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString()) as IdClaims;
  const skew = 60;
  if (c.iss !== expect.issuer) throw new Error('wrong issuer');
  if (!(Array.isArray(c.aud) ? c.aud.includes(expect.audience) : c.aud === expect.audience))
    throw new Error('wrong audience');
  if (typeof c.exp !== 'number' || c.exp + skew < nowSeconds) throw new Error('expired');
  if (typeof c.nbf === 'number' && c.nbf - skew > nowSeconds) throw new Error('not yet valid');
  if (c.nonce !== expect.nonce) throw new Error('nonce mismatch');
  if (typeof c.sub !== 'string' || !c.sub) throw new Error('no subject');
  return c;
}

interface Discovery {
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
}

let discovery: Discovery | null = null;
async function discover(): Promise<Discovery> {
  if (discovery) return discovery;
  const res = await fetch(`${config.OIDC_ISSUER!.replace(/\/$/, '')}/.well-known/openid-configuration`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`discovery failed: HTTP ${res.status}`);
  return (discovery = (await res.json()) as Discovery);
}

export const oidcEnabled = () => !!(config.OIDC_ISSUER && config.OIDC_CLIENT_ID && config.OIDC_REDIRECT_URI);

export async function oidcRoutes(app: FastifyInstance, deps: AppDeps) {
  app.get('/api/auth/oidc/status', async () => ({
    enabled: oidcEnabled(),
    issuer: oidcEnabled() ? config.OIDC_ISSUER : null,
  }));

  app.get('/api/auth/oidc/start', async (_request, reply) => {
    if (!oidcEnabled()) return reply.code(404).send({ error: 'oidc_not_configured' });
    const d = await discover();
    const flow = {
      state: b64url(randomBytes(24)),
      nonce: b64url(randomBytes(24)),
      verifier: b64url(randomBytes(48)),
    };
    reply.setCookie(FLOW_COOKIE, JSON.stringify(flow), {
      signed: true,
      httpOnly: true,
      sameSite: 'lax',
      secure: config.NODE_ENV === 'production',
      path: '/api/auth/oidc',
      maxAge: 600,
    });
    const url = new URL(d.authorization_endpoint);
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: config.OIDC_CLIENT_ID!,
      redirect_uri: config.OIDC_REDIRECT_URI!,
      scope: 'openid profile',
      state: flow.state,
      nonce: flow.nonce,
      code_challenge: b64url(createHash('sha256').update(flow.verifier).digest()),
      code_challenge_method: 'S256',
    }).toString();
    return reply.redirect(url.toString());
  });

  app.get('/api/auth/oidc/callback', async (request, reply) => {
    const fail = (why: string) => reply.redirect(`/sign-in?error=${encodeURIComponent(why)}`);
    if (!oidcEnabled()) return reply.code(404).send({ error: 'oidc_not_configured' });
    const q = z
      .object({ code: z.string().min(1).max(4096), state: z.string().min(1).max(200) })
      .safeParse(request.query);
    const raw = request.cookies[FLOW_COOKIE];
    const unsigned = raw ? request.unsignCookie(raw) : null;
    reply.clearCookie(FLOW_COOKIE, { path: '/api/auth/oidc' });
    if (!q.success || !unsigned?.valid || !unsigned.value) return fail('sign_in_expired');
    const flow = JSON.parse(unsigned.value) as { state: string; nonce: string; verifier: string };
    if (flow.state !== q.data.state) return fail('sign_in_expired');
    let claims: IdClaims;
    try {
      const d = await discover();
      const tokenRes = await fetch(d.token_endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: q.data.code,
          redirect_uri: config.OIDC_REDIRECT_URI!,
          client_id: config.OIDC_CLIENT_ID!,
          code_verifier: flow.verifier,
          ...(config.OIDC_CLIENT_SECRET ? { client_secret: config.OIDC_CLIENT_SECRET } : {}),
        }),
        signal: AbortSignal.timeout(10_000),
      });
      const tokens = (await tokenRes.json()) as { id_token?: string };
      if (!tokenRes.ok || !tokens.id_token) return fail('identity_provider_refused');
      const jwks = (await (await fetch(d.jwks_uri, { signal: AbortSignal.timeout(10_000) })).json()) as {
        keys: JsonWebKey[];
      };
      claims = verifyIdToken(tokens.id_token, jwks.keys, {
        issuer: config.OIDC_ISSUER!,
        audience: config.OIDC_CLIENT_ID!,
        nonce: flow.nonce,
      });
    } catch (err) {
      request.log.warn({ err: (err as Error).message }, 'oidc sign-in refused');
      return fail('identity_not_verified');
    }
    const institutionId = await resolveInstitutionId(deps.db, config.OIDC_INSTITUTION_KEY);
    if (!institutionId) return fail('institution_missing');
    const principalId = await withInstitution(deps.db, institutionId, async (tx) => {
      const [p] = await tx
        .select({ id: principals.id })
        .from(principals)
        .where(and(eq(principals.idpIssuer, claims.iss), eq(principals.idpSubject, claims.sub)));
      if (p)
        await appendAudit(tx, {
          institutionId,
          actorPrincipalId: p.id,
          actorType: 'human',
          action: 'auth.oidc_session_started',
          objectType: 'principal',
          objectId: p.id,
          payload: { issuer: claims.iss },
        });
      return p?.id ?? null;
    });
    // Only people an administrator provisioned with this issuer and subject may enter.
    if (!principalId) return fail('not_provisioned');
    deps.identity.writeSession(reply, { institutionId, principalId });
    return reply.redirect('/');
  });
}
