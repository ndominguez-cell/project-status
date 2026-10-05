import assert from 'node:assert/strict';
import test from 'node:test';
import { clearInstallationTokenCache, getInstallationToken } from '../lib/github/app-auth';
import { GitHubApiError, GitHubClient } from '../lib/github/client';
import type { GitHubConfig } from '../lib/github/config';
import { branchStatus, githubWarnings, suggestedHealth } from '../lib/github/health';
import { fetchRepoSnapshot } from '../lib/github/snapshot';
import { createFakeGitHub, createTestKeys, type FakeRepo } from './helpers/fake-github';

const keys = createTestKeys();
const NOW = Date.parse('2026-10-05T12:00:00Z');
const DAY = 86_400_000;
const iso = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString();
const config: GitHubConfig = { appId: '12345', privateKey: keys.pkcs1Private, webhookSecret: 's', appSlug: null, apiBase: 'https://api.github.com', syncBatch: 4 };

async function clientFor(repos: FakeRepo[]) {
  clearInstallationTokenCache();
  const gh = createFakeGitHub({ appId: '12345', publicKey: keys.pkcs1Public, installations: [{ id: 1, login: 'nick', repos }], now: () => NOW });
  const token = await getInstallationToken(config, 1, gh.fetch, NOW);
  return { gh, client: new GitHubClient({ token, fetch: gh.fetch }) };
}

const repo = (overrides: Partial<FakeRepo> = {}): FakeRepo => ({
  id: 501,
  fullName: 'nick/demo',
  private: true,
  pushedAt: iso(1),
  commits: [{ oid: 'c1'.padEnd(40, '0'), messageHeadline: 'Ship it', committedDate: iso(1) }],
  branches: [
    { name: 'old-idea', oid: 'b1'.padEnd(40, '0'), committedDate: iso(60) },
    { name: 'main', oid: 'a1'.padEnd(40, '0'), committedDate: iso(1) },
    { name: 'feature/login', oid: 'b2'.padEnd(40, '0'), committedDate: iso(3), pr: { number: 7, url: 'https://github.com/nick/demo/pull/7' } },
  ],
  pullRequests: [{ number: 7, title: 'Add login', updatedAt: iso(2), reviewDecision: 'APPROVED' }],
  issues: [{ number: 3, title: 'Bug', updatedAt: iso(5), labels: ['bug'] }],
  runs: [{ id: 9001, name: 'CI', status: 'completed', conclusion: 'success', created_at: iso(1) }],
  contributors: [{ login: 'nick', contributions: 40 }, { login: 'dependabot[bot]', contributions: 3, type: 'Bot' }],
  compare: { 'feature/login': { ahead: 2, behind: 1 }, 'old-idea': { ahead: 1, behind: 30 } },
  ...overrides,
});

test('normalizes a repository into one snapshot', async () => {
  const { client, gh } = await clientFor([repo()]);
  const snapshot = await fetchRepoSnapshot(client, 'nick/demo');

  assert.equal(snapshot.repoId, 501);
  assert.equal(snapshot.defaultBranch, 'main');
  assert.equal(snapshot.isPrivate, true);
  assert.deepEqual(snapshot.branches.map((branch) => branch.name), ['main', 'feature/login', 'old-idea'], 'default first, then newest');
  assert.deepEqual(snapshot.branches.map((branch) => [branch.aheadBy, branch.behindBy]), [[0, 0], [2, 1], [1, 30]]);
  assert.equal(snapshot.branches[1].openPullRequestUrl, 'https://github.com/nick/demo/pull/7');
  assert.equal(snapshot.pullRequests[0].reviewDecision, 'APPROVED');
  assert.deepEqual(snapshot.issues[0].labels, ['bug']);
  assert.equal(snapshot.commits[0].message, 'Ship it');
  assert.equal(snapshot.workflowRuns[0].conclusion, 'success');
  assert.deepEqual(snapshot.contributors, [{ login: 'nick', contributions: 40, isBot: false }, { login: 'dependabot[bot]', contributions: 3, isBot: true }]);
  assert.equal(snapshot.actionsAvailable, true);
  assert.equal(gh.calls.filter((call) => call.includes('/graphql')).length, 1, 'one GraphQL call carries branches, PRs, issues, and commits');
});

test('limits branch comparisons so a batch stays under subrequest limits', async () => {
  const many = Array.from({ length: 9 }, (_, index) => ({ name: `topic-${index}`, oid: `d${index}`.padEnd(40, '0'), committedDate: iso(index + 1) }));
  const { client, gh } = await clientFor([repo({ branches: [{ name: 'main', oid: 'a'.repeat(40), committedDate: iso(0) }, ...many], compare: {} })]);
  await fetchRepoSnapshot(client, 'nick/demo');
  assert.equal(gh.calls.filter((call) => call.includes('/compare/')).length, 5);
});

test('treats forbidden Actions as unavailable rather than failing the sync', async () => {
  const { client } = await clientFor([repo({ actionsForbidden: true })]);
  const snapshot = await fetchRepoSnapshot(client, 'nick/demo');
  assert.equal(snapshot.actionsAvailable, false);
  assert.deepEqual(snapshot.workflowRuns, []);
});

test('handles empty repositories that have no default branch', async () => {
  const { client, gh } = await clientFor([repo({ defaultBranch: null, branches: [], commits: [], pullRequests: [], issues: [], runs: [], contributors: [] })]);
  const snapshot = await fetchRepoSnapshot(client, 'nick/demo');
  assert.equal(snapshot.defaultBranch, null);
  assert.deepEqual(snapshot.commits, []);
  assert.equal(gh.calls.some((call) => call.includes('/actions/runs')), false);
});

test('reports inaccessible repositories as not found', async () => {
  const { client } = await clientFor([repo()]);
  await assert.rejects(fetchRepoSnapshot(client, 'nick/missing'), (error: unknown) => error instanceof GitHubApiError && error.status === 404);
  await assert.rejects(fetchRepoSnapshot(client, 'not-a-repo-name'), /Invalid repository name/);
});

test('propagates rate limits instead of hiding them as optional failures', async () => {
  const limited = new GitHubClient({
    token: 't',
    fetch: (async (input: RequestInfo | URL) => {
      if ((typeof input === 'string' ? input : input instanceof URL ? input.href : input.url).endsWith('/graphql')) return Response.json({ data: { repository: { databaseId: 1, nameWithOwner: 'a/b', url: 'u', isPrivate: false, isArchived: false, pushedAt: null, defaultBranchRef: { name: 'main', target: { oid: 'x', history: { nodes: [] } } }, refs: { totalCount: 0, nodes: [] }, pullRequests: { totalCount: 0, nodes: [] }, issues: { totalCount: 0, nodes: [] } } } });
      return new Response('{"message":"rate limited"}', { status: 403, headers: { 'x-ratelimit-remaining': '0' } });
    }) as typeof fetch,
  });
  await assert.rejects(fetchRepoSnapshot(limited, 'a/b'), (error: unknown) => error instanceof GitHubApiError && error.rateLimited);
});

test('branch status marks non-default branches stale after 30 days', () => {
  assert.equal(branchStatus({ committedAt: NOW - 31 * DAY, isDefault: false }, NOW), 'STALE');
  assert.equal(branchStatus({ committedAt: NOW - 29 * DAY, isDefault: false }, NOW), 'ACTIVE');
  assert.equal(branchStatus({ committedAt: NOW - 400 * DAY, isDefault: true }, NOW), 'ACTIVE');
  assert.equal(branchStatus({ committedAt: null, isDefault: false }, NOW), 'ACTIVE');
});

test('health warnings and suggestion follow the stale-branch, CI, and idle rules', async () => {
  const { client } = await clientFor([
    repo({
      runs: [{ id: 1, name: 'CI', status: 'completed', conclusion: 'failure', created_at: iso(1) }, { id: 2, name: 'CI', status: 'completed', conclusion: 'success', created_at: iso(9) }],
      pullRequests: [{ number: 7, title: 'Add login', updatedAt: iso(20) }, { number: 8, title: 'Draft', isDraft: true, updatedAt: iso(40) }],
    }),
  ]);
  const snapshot = await fetchRepoSnapshot(client, 'nick/demo');
  const warnings = githubWarnings(snapshot, NOW);
  assert.deepEqual(warnings.map((warning) => warning.code).sort(), ['CI_FAILING', 'IDLE_PULL_REQUESTS', 'STALE_BRANCHES']);
  assert.match(warnings.find((warning) => warning.code === 'IDLE_PULL_REQUESTS')!.message, /^1 open pull request idle/);
  assert.equal(warnings.find((warning) => warning.code === 'CI_FAILING')!.message, 'Latest CI run on main failed.');
  assert.equal(suggestedHealth(warnings), 'NEEDS_ATTENTION');

  const healthy = githubWarnings({ ...snapshot, workflowRuns: [], branches: snapshot.branches.slice(0, 1), pullRequests: [] }, NOW);
  assert.deepEqual(healthy, []);
  assert.equal(suggestedHealth(healthy), 'HEALTHY');

  const stale = githubWarnings({ ...snapshot, workflowRuns: [], branches: [], pullRequests: [], pushedAt: NOW - 120 * DAY }, NOW);
  assert.equal(suggestedHealth(stale), 'STALE');
  assert.deepEqual(githubWarnings({ ...snapshot, isArchived: true, workflowRuns: [], branches: [], pullRequests: [] }, NOW).map((warning) => warning.code), ['ARCHIVED_ON_GITHUB']);
});
