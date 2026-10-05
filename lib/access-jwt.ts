import { createRemoteJWKSet, jwtVerify } from 'jose';

export type AccessIdentity = { userId: string; email: string };

const jwksByIssuer = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export async function verifyAccessToken(
  token: string,
  teamDomain: string,
  audience: string,
): Promise<AccessIdentity | null> {
  const issuer = `https://${teamDomain}`;
  let jwks = jwksByIssuer.get(issuer);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
    jwksByIssuer.set(issuer, jwks);
  }

  try {
    const { payload } = await jwtVerify(token, jwks, { issuer, audience, algorithms: ['RS256'] });
    const email = typeof payload.email === 'string' ? payload.email : null;
    if (!payload.sub || !email) return null;
    return { userId: payload.sub, email };
  } catch {
    return null;
  }
}
