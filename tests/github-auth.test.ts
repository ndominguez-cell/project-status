import assert from 'node:assert/strict';
import test from 'node:test';
import { jwtVerify } from 'jose';
import { clearInstallationTokenCache, createAppJwt, getInstallationToken } from '../lib/github/app-auth';
import { GitHubApiError, GitHubClient } from '../lib/github/client';
import { readGitHubConfig, type GitHubConfig } from '../lib/github/config';
import { createFakeGitHub, createTestKeys } from './helpers/fake-github';

const keys = createTestKeys();
const NOW = Date.parse('2026-10-05T12:00:00Z');
const config = (privateKey: string): GitHubConfig => ({ appId: '12345', privateKey, webhookSecret: 'secret', appSlug: null, apiBase: 'https://api.github.com', syncBatch: 4 });

test('signs a valid GitHub App JWT from a PKCS#1 key (GitHub default format)', async () => {
  const jwt = await createAppJwt(config(keys.pkcs1Private), NOW);
  const { payload, protectedHeader } = await jwtVerify(jwt, keys.pkcs1Public, { issuer: '12345', currentDate: new Date(NOW) });
  assert.equal(protectedHeader.alg, 'RS256');
  assert.ok(payload.exp! - payload.iat! <= 600, 'GitHub rejects JWTs valid for more than 10 minutes');
  assert.ok(payload.iat! < NOW / 1000, 'iat is backdated to tolerate clock drift');
});

test('signs a valid GitHub App JWT from a PKCS#8 key', async () => {
  const jwt = await createAppJwt(config(keys.pkcs8Private), NOW);
  await jwtVerify(jwt, keys.pkcs8Public, { issuer: '12345', currentDate: new Date(NOW) });
});

test('rejects unsupported key formats', async () => {
  await assert.rejects(createAppJwt(config('-----BEGIN EC PRIVATE KEY-----\nabc\n-----END EC PRIVATE KEY-----')), /Unsupported/);
});

test('config reads single-line secrets with escaped newlines and requires all three secrets', async () => {
  const escaped = keys.pkcs1Private.replaceAll('\n', '\\n');
  const parsed = readGitHubConfig({ GITHUB_APP_ID: ' 12345 ', GITHUB_APP_PRIVATE_KEY: escaped, GITHUB_WEBHOOK_SECRET: 'x' });
  assert.ok(parsed);
  assert.equal(parsed.appId, '12345');
  assert.equal(parsed.apiBase, 'https://api.github.com');
  await jwtVerify(await createAppJwt(parsed, NOW), keys.pkcs1Public, { issuer: '12345', currentDate: new Date(NOW) });
  assert.equal(readGitHubConfig({ GITHUB_APP_ID: '1', GITHUB_APP_PRIVATE_KEY: 'k' }), null);
  assert.equal(readGitHubConfig({}), null);
  assert.equal(readGitHubConfig({ GITHUB_APP_ID: '1', GITHUB_APP_PRIVATE_KEY: 'k', GITHUB_WEBHOOK_SECRET: 's', GITHUB_SYNC_BATCH: '99' })?.syncBatch, 10);
});

test('installation tokens are cached until one minute before they expire', async () => {
  clearInstallationTokenCache();
  const gh = createFakeGitHub({ appId: '12345', publicKey: keys.pkcs1Public, installations: [{ id: 7, login: 'nick', repos: [] }], now: () => NOW });
  const cfg = config(keys.pkcs1Private);
  const first = await getInstallationToken(cfg, 7, gh.fetch, NOW);
  assert.equal(await getInstallationToken(cfg, 7, gh.fetch, NOW + 60_000), first);
  assert.equal(gh.mintedTokens(), 1);
  const refreshed = await getInstallationToken(cfg, 7, gh.fetch, NOW + 3_600_000 - 30_000);
  assert.notEqual(refreshed, first);
  assert.equal(gh.mintedTokens(), 2);
});

test('app requests surface GitHub errors with status and message', async () => {
  clearInstallationTokenCache();
  const gh = createFakeGitHub({ appId: '99999', publicKey: keys.pkcs1Public, installations: [], now: () => NOW });
  await assert.rejects(getInstallationToken(config(keys.pkcs1Private), 7, gh.fetch, NOW), (error: unknown) => error instanceof GitHubApiError && error.status === 401);
});

test('client flags rate limiting and maps GraphQL NOT_FOUND to 404', async () => {
  const limited = new GitHubClient({ token: 't', fetch: (async () => new Response('{"message":"API rate limit exceeded"}', { status: 403, headers: { 'x-ratelimit-remaining': '0' } })) as typeof fetch });
  await assert.rejects(limited.rest('/x'), (error: unknown) => error instanceof GitHubApiError && error.rateLimited && error.status === 403);

  const forbidden = new GitHubClient({ token: 't', fetch: (async () => new Response('{"message":"Resource not accessible"}', { status: 403 })) as typeof fetch });
  await assert.rejects(forbidden.rest('/x'), (error: unknown) => error instanceof GitHubApiError && !error.rateLimited);

  const notFound = new GitHubClient({ token: 't', fetch: (async () => Response.json({ data: null, errors: [{ type: 'NOT_FOUND', message: 'nope' }] })) as typeof fetch });
  await assert.rejects(notFound.graphql('query {}', {}), (error: unknown) => error instanceof GitHubApiError && error.status === 404);

  const empty = new GitHubClient({ token: 't', fetch: (async () => new Response(null, { status: 204 })) as typeof fetch });
  assert.equal(await empty.rest('/x'), null);
});

test('the client never calls fetch as a method (Workers throws Illegal invocation)', async () => {
  const strictFetch = function (this: unknown) {
    if (this !== undefined) throw new TypeError('Illegal invocation: function called with incorrect `this` reference.');
    return Promise.resolve(Response.json({ ok: true }));
  } as unknown as typeof fetch;
  const client = new GitHubClient({ token: 't', fetch: strictFetch });
  assert.deepEqual(await client.rest('/anything'), { ok: true });
  assert.deepEqual(await client.graphql('query {}', {}).catch((error: unknown) => (error as Error).message), 'GitHub returned an empty GraphQL response.');
});
