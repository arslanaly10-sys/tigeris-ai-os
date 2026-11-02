// The ID-token verifier accepts only a correctly signed RS256 token for this issuer, audience and nonce.
import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyIdToken } from './modules/auth/oidc';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1' };
const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = 1_800_000_000;
const expect_ = { issuer: 'https://login.microsoftonline.com/t/v2.0', audience: 'client-1', nonce: 'n1' };
const token = (claims: object, header: object = { alg: 'RS256', kid: 'k1' }) => {
  const body = `${enc(header)}.${enc(claims)}`;
  return `${body}.${sign('RSA-SHA256', Buffer.from(body), privateKey).toString('base64url')}`;
};
const good = { iss: expect_.issuer, aud: 'client-1', sub: 'user-1', exp: now + 300, nonce: 'n1' };

describe('OIDC ID-token verification', () => {
  it('accepts a valid token', () => {
    expect(verifyIdToken(token(good), [jwk], expect_, now).sub).toBe('user-1');
  });

  it.each([
    ['wrong issuer', { ...good, iss: 'https://evil.example' }],
    ['wrong audience', { ...good, aud: 'other' }],
    ['expired', { ...good, exp: now - 600 }],
    ['nonce mismatch', { ...good, nonce: 'replayed' }],
  ])('refuses: %s', (reason, claims) => {
    expect(() => verifyIdToken(token(claims), [jwk], expect_, now)).toThrow(reason);
  });

  it('refuses other algorithms, unknown keys and tampered payloads', () => {
    expect(() => verifyIdToken(token(good, { alg: 'none', kid: 'k1' }), [jwk], expect_, now)).toThrow(
      'not accepted',
    );
    expect(() => verifyIdToken(token(good, { alg: 'RS256', kid: 'k2' }), [jwk], expect_, now)).toThrow(
      'key not found',
    );
    const [h, , s] = token(good).split('.');
    expect(() => verifyIdToken(`${h}.${enc({ ...good, sub: 'admin' })}.${s}`, [jwk], expect_, now)).toThrow(
      'bad signature',
    );
  });
});
