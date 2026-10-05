import { SignJWT, importPKCS8 } from 'jose';
import type { GitHubConfig } from './config';
import { GitHubApiError, USER_AGENT } from './client';

const RSA_ALGORITHM_IDENTIFIER = [0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00];

function derLength(length: number) {
  if (length < 0x80) return [length];
  const bytes: number[] = [];
  for (let n = length; n > 0; n >>= 8) bytes.unshift(n & 0xff);
  return [0x80 | bytes.length, ...bytes];
}

function derElement(tag: number, content: number[]) {
  return [tag, ...derLength(content.length), ...content];
}

function pemBody(pem: string) {
  return pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
}

function base64ToBytes(base64: string) {
  return Array.from(atob(base64), (char) => char.charCodeAt(0));
}

function bytesToPem(bytes: number[], label: string) {
  const base64 = btoa(String.fromCharCode(...bytes)).replace(/(.{64})/g, '$1\n');
  return `-----BEGIN ${label}-----\n${base64}\n-----END ${label}-----`;
}

export function toPkcs8Pem(pem: string) {
  if (pem.includes('BEGIN PRIVATE KEY')) return pem;
  if (!pem.includes('BEGIN RSA PRIVATE KEY')) throw new Error('Unsupported GitHub App private key format.');
  const pkcs1 = base64ToBytes(pemBody(pem));
  const pkcs8 = derElement(0x30, [0x02, 0x01, 0x00, ...RSA_ALGORITHM_IDENTIFIER, ...derElement(0x04, pkcs1)]);
  return bytesToPem(pkcs8, 'PRIVATE KEY');
}

export async function createAppJwt(config: Pick<GitHubConfig, 'appId' | 'privateKey'>, nowMs = Date.now()) {
  const key = await importPKCS8(toPkcs8Pem(config.privateKey), 'RS256');
  const issuedAt = Math.floor(nowMs / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(config.appId)
    .setIssuedAt(issuedAt - 60)
    .setExpirationTime(issuedAt + 9 * 60)
    .sign(key);
}

type Fetch = typeof fetch;
type TokenEntry = { token: string; expiresAt: number };
const tokenCache = new Map<number, TokenEntry>();

export function clearInstallationTokenCache() {
  tokenCache.clear();
}

async function appRequest<T>(config: GitHubConfig, path: string, init: RequestInit, fetchImpl: Fetch, nowMs: number): Promise<T> {
  const jwt = await createAppJwt(config, nowMs);
  const response = await fetchImpl(`${config.apiBase}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': USER_AGENT,
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) throw new GitHubApiError(response.status, (body as { message?: string } | null)?.message ?? response.statusText);
  return body as T;
}

export async function getInstallationToken(config: GitHubConfig, installationId: number, fetchImpl: Fetch = fetch, nowMs = Date.now()) {
  const cached = tokenCache.get(installationId);
  if (cached && cached.expiresAt - 60_000 > nowMs) return cached.token;
  const result = await appRequest<{ token: string; expires_at: string }>(config, `/app/installations/${installationId}/access_tokens`, { method: 'POST' }, fetchImpl, nowMs);
  tokenCache.set(installationId, { token: result.token, expiresAt: Date.parse(result.expires_at) });
  return result.token;
}

export type AppInstallation = {
  id: number;
  account: { login: string; type: string } | null;
  repository_selection: 'all' | 'selected';
  suspended_at: string | null;
};

export async function listAppInstallations(config: GitHubConfig, fetchImpl: Fetch = fetch, nowMs = Date.now()) {
  return appRequest<AppInstallation[]>(config, '/app/installations?per_page=100', { method: 'GET' }, fetchImpl, nowMs);
}
