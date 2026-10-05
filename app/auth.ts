import { env } from 'cloudflare:workers';
import { headers } from 'next/headers';
import { verifyAccessToken } from '@/lib/access-jwt';

export type AppUser = {
  userId: string;
  displayName: string;
  email: string;
  signOutPath: string | null;
};

const ACCESS_JWT_HEADER = 'cf-access-jwt-assertion';
const ACCESS_SIGN_OUT_PATH = '/cdn-cgi/access/logout';
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export async function getUser(): Promise<AppUser | null> {
  const requestHeaders = await headers();
  const teamDomain = env.CF_ACCESS_TEAM_DOMAIN;
  const audience = env.CF_ACCESS_AUD;

  if (teamDomain && audience) {
    const token = requestHeaders.get(ACCESS_JWT_HEADER);
    const identity = token ? await verifyAccessToken(token, teamDomain, audience) : null;
    return identity && { ...identity, displayName: identity.email, signOutPath: ACCESS_SIGN_OUT_PATH };
  }

  const hostname = (requestHeaders.get('host') ?? '').replace(/:\d+$/, '').toLowerCase();
  if (LOOPBACK_HOSTS.has(hostname)) {
    const email = env.DEV_AUTH_EMAIL || 'dev@localhost';
    return { userId: `dev:${email}`, displayName: email, email, signOutPath: null };
  }

  return null;
}

export async function requireUser(): Promise<AppUser> {
  const user = await getUser();
  if (user) return user;
  throw new Error('Not authenticated. Open this site through Cloudflare Access.');
}
