import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { clearInstallationTokenCache } from '../lib/github/app-auth';
import type { GitHubConfig } from '../lib/github/config';
import { reconcileStale, refreshInstallations, setRepositoryDecision, syncProject, type SyncDeps } from '../lib/github/sync-store';
import { createTestDb, seedProject, seedUser } from './helpers/d1';
import { createFakeGitHub, createTestKeys, type FakeInstallation, type FakeRepo } from './helpers/fake-github';

const keys = createTestKeys();
const NOW = Date.parse('2026-10-05T12:00:00Z');
const DAY = 86_400_000;
const iso = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString();
const config: GitHubConfig = { appId: '12345', privateKey: keys.pkcs1Private, webhookSecret: 's', appSlug: null, apiBase: 'https://api.github.com', syncBatch: 2 };

beforeEach(() => clearInstallationTokenCache());

const makeRepo = (id: number, fullName: string, overrides: Partial<FakeRepo> = {}): FakeRepo => ({
  id,
  fullName,
  private: false,
  pushedAt: iso(1),
  commits: [{ oid: `c${id}`.padEnd(40, '0'), messageHeadline: 'Commit', committedDate: iso(1) }],
  branches: [
    { name: 'main', oid: 'a'.repeat(40), committedDate: iso(1) },
    { name: 'feature/x', oid: 'b'.repeat(40), committedDate: iso(2) },
    { name: 'stale-one', oid: 'c'.repeat(40), committedDate: iso(45) },
  ],
  pullRequests: [{ number: 1, title: 'PR one', updatedAt: iso(1) }],
  issues: [{ number: 2, title: 'Issue two', updatedAt: iso(3), labels: ['bug', 'p1'] }],
  runs: [{ id: id * 10, name: 'CI', status: 'completed', conclusion: 'success', created_at: iso(1) }],
  contributors: [{ login: 'nick', contributions: 5 }],
  compare: { 'feature/x': { ahead: 3, behind: 0 }, 'stale-one': { ahead: 1, behind: 20 } },
  ...overrides,
});

function setup(options: { installations?: FakeInstallation[]; projects?: { id: string; fullName: string | null }[] } = {}) {
  const { db, query, exec } = createTestDb();
  seedUser(exec, 'user-1');
  for (const project of options.projects ?? []) seedProject(exec, 'user-1', project.id, project.fullName);
  const installations = options.installations ?? [{ id: 99, login: 'nick', repos: [makeRepo(1, 'nick/alpha')] }];
  const gh = createFakeGitHub({ appId: '12345', publicKey: keys.pkcs1Public, installations, now: () => NOW });
  const deps: SyncDeps = { db, config, fetch: gh.fetch, now: () => NOW };
  return { db, query, exec, gh, deps, installations };
}

const project = (id: string, fullName: string) => ({ id, ownerId: 'user-1', repositoryFullName: fullName });

test('discovery stores installations and repositories and links existing projects by repo name', async () => {
  const { deps, query } = setup({
    installations: [{ id: 99, login: 'nick', repos: [makeRepo(1, 'Nick/Alpha'), makeRepo(2, 'nick/beta')] }],
    projects: [{ id: 'p-alpha', fullName: 'nick/alpha' }, { id: 'p-manual', fullName: null }],
  });
  const result = await refreshInstallations(deps, 'user-1');
  assert.deepEqual(result, { installations: 1, repositories: 2 });

  assert.deepEqual(query('SELECT id, account_login, owner_id FROM github_installations'), [{ id: 99, account_login: 'nick', owner_id: 'user-1' }]);
  assert.deepEqual(query('SELECT full_name, project_id, decision FROM github_repositories ORDER BY repo_id'), [
    { full_name: 'Nick/Alpha', project_id: 'p-alpha', decision: 'TRACKED' },
    { full_name: 'nick/beta', project_id: null, decision: 'PENDING' },
  ]);
});

test('discovery is idempotent, keeps decisions, and drops repos removed from the installation', async () => {
  const { deps, query, installations } = setup({ installations: [{ id: 99, login: 'nick', repos: [makeRepo(1, 'nick/alpha'), makeRepo(2, 'nick/beta'), makeRepo(3, 'nick/gamma')] }] });
  await refreshInstallations(deps, 'user-1');
  await setRepositoryDecision(deps.db, 'user-1', 2, 'IGNORED');

  installations[0].repos = installations[0].repos.filter((repo) => repo.id !== 3);
  installations[0].repos[0].archived = true;
  await refreshInstallations(deps, 'user-1');

  assert.deepEqual(query('SELECT repo_id, decision, is_archived FROM github_repositories ORDER BY repo_id'), [
    { repo_id: 1, decision: 'PENDING', is_archived: 1 },
    { repo_id: 2, decision: 'IGNORED', is_archived: 0 },
  ]);
  assert.equal(query('SELECT COUNT(*) AS n FROM github_installations')[0].n, 1);
});

test('discovery never takes over an installation owned by another user and skips suspended ones', async () => {
  const { deps, query, exec } = setup({
    installations: [
      { id: 99, login: 'nick', repos: [makeRepo(1, 'nick/alpha')] },
      { id: 100, login: 'old', repos: [makeRepo(2, 'old/repo')], suspended: true },
    ],
  });
  seedUser(exec, 'user-2');
  exec("INSERT INTO github_installations (id, owner_id, account_login, created_at, updated_at) VALUES (99, 'user-2', 'someone', 1, 1)");

  await refreshInstallations(deps, 'user-1');
  assert.equal(query('SELECT owner_id FROM github_installations WHERE id = 99')[0].owner_id, 'user-2');
  assert.equal(query('SELECT account_login FROM github_installations WHERE id = 99')[0].account_login, 'someone');
  assert.deepEqual(query("SELECT repo_id FROM github_repositories WHERE owner_id = 'user-1'"), [], 'no repos from the foreign or suspended installations');
});

test('sync writes the full snapshot and refreshes repository-native project fields only', async () => {
  const { deps, query, exec } = setup({ projects: [{ id: 'p-alpha', fullName: 'nick/alpha' }] });
  exec("UPDATE projects SET business_objective = 'My objective', priority = 'HIGH', health = 'BLOCKED', active_branch = 'my-branch' WHERE id = 'p-alpha'");
  await refreshInstallations(deps, 'user-1');
  const result = await syncProject(deps, project('p-alpha', 'nick/alpha'));
  assert.deepEqual(result, { projectId: 'p-alpha', fullName: 'nick/alpha', ok: true });

  const row = query<Record<string, unknown>>('SELECT * FROM projects WHERE id = ?', 'p-alpha')[0];
  assert.equal(row.repository_url, 'https://github.com/nick/alpha');
  assert.equal(row.repository_visibility, 'PUBLIC');
  assert.equal(row.default_branch, 'main');
  assert.equal(row.github_last_activity_at, NOW - DAY);
  assert.equal(row.business_objective, 'My objective', 'Project Hub-owned fields are never overwritten');
  assert.equal(row.priority, 'HIGH');
  assert.equal(row.health, 'BLOCKED');
  assert.equal(row.active_branch, 'my-branch');

  assert.deepEqual(query("SELECT status, sync_error, last_synced_at, external_id FROM project_integrations WHERE provider = 'GITHUB'"), [{ status: 'CONNECTED', sync_error: null, last_synced_at: NOW, external_id: '1' }]);
  assert.deepEqual(query('SELECT name, status, ahead_by, behind_by FROM project_branches ORDER BY name'), [
    { name: 'feature/x', status: 'ACTIVE', ahead_by: 3, behind_by: 0 },
    { name: 'main', status: 'ACTIVE', ahead_by: 0, behind_by: 0 },
    { name: 'stale-one', status: 'STALE', ahead_by: 1, behind_by: 20 },
  ]);
  assert.deepEqual(query('SELECT number, title FROM github_pull_requests'), [{ number: 1, title: 'PR one' }]);
  assert.deepEqual(query('SELECT labels_json FROM github_issues'), [{ labels_json: '["bug","p1"]' }]);
  assert.equal(query('SELECT COUNT(*) AS n FROM github_commits')[0].n, 1);
  assert.deepEqual(query('SELECT conclusion FROM github_workflow_runs'), [{ conclusion: 'success' }]);
  assert.deepEqual(query('SELECT login, is_bot FROM github_contributors'), [{ login: 'nick', is_bot: 0 }]);
});

test('re-syncing replaces synced sets, keeps branch purposes, and tidies deleted branches', async () => {
  const { deps, query, exec, installations } = setup({ projects: [{ id: 'p-alpha', fullName: 'nick/alpha' }] });
  await refreshInstallations(deps, 'user-1');
  await syncProject(deps, project('p-alpha', 'nick/alpha'));
  exec("UPDATE project_branches SET purpose = 'Release prep' WHERE name = 'feature/x'");

  const repo = installations[0].repos[0];
  repo.pullRequests = [{ number: 5, title: 'Replaced', updatedAt: iso(0) }, { number: 6, title: 'Another', updatedAt: iso(0) }];
  repo.issues = [];
  repo.branches = [{ name: 'main', oid: 'a'.repeat(40), committedDate: iso(0) }];
  await syncProject(deps, project('p-alpha', 'nick/alpha'));

  assert.deepEqual(query('SELECT number FROM github_pull_requests ORDER BY number'), [{ number: 5 }, { number: 6 }]);
  assert.equal(query('SELECT COUNT(*) AS n FROM github_issues')[0].n, 0);
  assert.deepEqual(query('SELECT name, status, purpose FROM project_branches ORDER BY name'), [
    { name: 'feature/x', status: 'DELETED', purpose: 'Release prep' },
    { name: 'main', status: 'ACTIVE', purpose: null },
  ]);

  repo.branches = [{ name: 'main', oid: 'a'.repeat(40), committedDate: iso(0) }, { name: 'feature/x', oid: 'b'.repeat(40), committedDate: iso(0) }];
  await syncProject(deps, project('p-alpha', 'nick/alpha'));
  assert.equal(query("SELECT status FROM project_branches WHERE name = 'feature/x'")[0].status, 'ACTIVE', 'a recreated branch comes back to life');
});

test('a truncated branch list never deletes branches it could not see', async () => {
  const { deps, query, installations } = setup({ projects: [{ id: 'p-alpha', fullName: 'nick/alpha' }] });
  await refreshInstallations(deps, 'user-1');
  await syncProject(deps, project('p-alpha', 'nick/alpha'));
  installations[0].repos[0].branches = [{ name: 'main', oid: 'a'.repeat(40), committedDate: iso(0) }];
  installations[0].repos[0].branchTotal = 80;
  await syncProject(deps, project('p-alpha', 'nick/alpha'));
  assert.equal(query('SELECT COUNT(*) AS n FROM project_branches')[0].n, 3);
});

test('large repositories stay within the D1 bound-parameter limit', async () => {
  const many = Array.from({ length: 30 }, (_, index) => ({ number: index + 1, title: `PR ${index}`, updatedAt: iso(1) }));
  const { deps, query } = setup({
    installations: [{ id: 99, login: 'nick', repos: [makeRepo(1, 'nick/alpha', { pullRequests: many, issues: many.map((pr) => ({ ...pr, labels: ['a'] })) })] }],
    projects: [{ id: 'p-alpha', fullName: 'nick/alpha' }],
  });
  await refreshInstallations(deps, 'user-1');
  assert.equal((await syncProject(deps, project('p-alpha', 'nick/alpha'))).ok, true);
  assert.equal(query('SELECT COUNT(*) AS n FROM github_pull_requests')[0].n, 30);
  assert.equal(query('SELECT COUNT(*) AS n FROM github_issues')[0].n, 30);
});

test('sync failures are recorded on the integration without losing the last good sync time', async () => {
  const { deps, query, installations } = setup({ projects: [{ id: 'p-alpha', fullName: 'nick/alpha' }, { id: 'p-nowhere', fullName: 'nick/not-installed' }] });
  await refreshInstallations(deps, 'user-1');
  await syncProject(deps, project('p-alpha', 'nick/alpha'));

  const orphan = await syncProject(deps, project('p-nowhere', 'nick/not-installed'));
  assert.equal(orphan.ok, false);
  assert.match(orphan.ok ? '' : orphan.error, /not accessible to the GitHub App/);

  installations[0].repos = [];
  const gone = await syncProject(deps, project('p-alpha', 'nick/alpha'));
  assert.equal(gone.ok, false);
  assert.match(gone.ok ? '' : gone.error, /not found/i);

  const rows = query('SELECT project_id, status, sync_error, last_synced_at FROM project_integrations ORDER BY project_id');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].status, 'ERROR');
  assert.equal(rows[0].last_synced_at, NOW, 'last good sync time is kept');
  assert.equal(rows[1].status, 'ERROR');
  assert.equal(rows[1].last_synced_at, null);
});

test('reconcile syncs the stalest tracked projects first and respects the batch limit', async () => {
  const repos = [makeRepo(1, 'nick/a'), makeRepo(2, 'nick/b'), makeRepo(3, 'nick/c'), makeRepo(4, 'nick/d')];
  const { deps, query, exec } = setup({
    installations: [{ id: 99, login: 'nick', repos }],
    projects: repos.map((repo) => ({ id: `p-${repo.fullName.slice(5)}`, fullName: repo.fullName })),
  });
  await refreshInstallations(deps, 'user-1');
  exec("INSERT INTO project_integrations (id, project_id, provider, status, last_synced_at, created_at, updated_at) VALUES ('i1', 'p-a', 'GITHUB', 'CONNECTED', 500, 1, 1), ('i2', 'p-b', 'GITHUB', 'CONNECTED', 100, 1, 1), ('i3', 'p-c', 'GITHUB', 'CONNECTED', 900, 1, 1)");

  const results = await reconcileStale(deps, 2);
  assert.deepEqual(results.map((result) => result.projectId), ['p-d', 'p-b'], 'never-synced first, then oldest');
  assert.ok(results.every((result) => result.ok));

  exec("UPDATE github_repositories SET decision = 'IGNORED' WHERE repo_id = 1");
  exec("UPDATE projects SET archived_at = 1 WHERE id = 'p-c'");
  const next = await reconcileStale(deps, 10);
  assert.deepEqual(next.map((result) => result.projectId).sort(), ['p-b', 'p-d'], 'ignored repositories and archived projects are skipped');
  assert.deepEqual(query("SELECT project_id FROM project_integrations WHERE status = 'CONNECTED' AND last_synced_at = ? ORDER BY project_id", NOW), [{ project_id: 'p-b' }, { project_id: 'p-d' }]);
});
