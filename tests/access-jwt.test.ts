import assert from 'node:assert/strict';
import test from 'node:test';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import { verifyAccessToken } from '../lib/access-jwt';

const TEAM = 'team.cloudflareaccess.com';
const AUD = 'app-aud-tag';
const ISSUER = `https://${TEAM}`;

const trusted = await generateKeyPair('RS256');
const attacker = await generateKeyPair('RS256');
const trustedJwk = { ...(await exportJWK(trusted.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };

globalThis.fetch = (async (input: RequestInfo | URL) => {
  assert.equal(String(input), `${ISSUER}/cdn-cgi/access/certs`);
  return Response.json({ keys: [trustedJwk] });
}) as typeof fetch;

function sign(claims: Record<string, unknown>, opts: { key?: CryptoKey; aud?: string; iss?: string; exp?: string } = {}) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuer(opts.iss ?? ISSUER)
    .setAudience(opts.aud ?? AUD)
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? '10m')
    .sign(opts.key ?? trusted.privateKey);
}

test('accepts a valid Access token and returns its identity', async () => {
  const token = await sign({ sub: 'user-123', email: 'me@example.com' });
  assert.deepEqual(await verifyAccessToken(token, TEAM, AUD), { userId: 'user-123', email: 'me@example.com' });
});

test('rejects a token for a different Access application audience', async () => {
  const token = await sign({ sub: 'user-123', email: 'me@example.com' }, { aud: 'other-app' });
  assert.equal(await verifyAccessToken(token, TEAM, AUD), null);
});

test('rejects a token from a different issuer', async () => {
  const token = await sign({ sub: 'user-123', email: 'me@example.com' }, { iss: 'https://evil.cloudflareaccess.com' });
  assert.equal(await verifyAccessToken(token, TEAM, AUD), null);
});

test('rejects an expired token', async () => {
  const token = await sign({ sub: 'user-123', email: 'me@example.com' }, { exp: '-1m' });
  assert.equal(await verifyAccessToken(token, TEAM, AUD), null);
});

test('rejects a token signed with a key Cloudflare does not publish', async () => {
  const token = await sign({ sub: 'user-123', email: 'me@example.com' }, { key: attacker.privateKey });
  assert.equal(await verifyAccessToken(token, TEAM, AUD), null);
});

test('rejects tokens missing the subject or email claim', async () => {
  assert.equal(await verifyAccessToken(await sign({ email: 'me@example.com' }), TEAM, AUD), null);
  assert.equal(await verifyAccessToken(await sign({ sub: 'user-123' }), TEAM, AUD), null);
});

test('rejects malformed tokens', async () => {
  assert.equal(await verifyAccessToken('not-a-jwt', TEAM, AUD), null);
});
