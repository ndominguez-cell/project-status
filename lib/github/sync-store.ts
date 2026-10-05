import { getInstallationToken, listAppInstallations } from './app-auth';
import { GitHubApiError, GitHubClient } from './client';
import type { GitHubConfig } from './config';
import { branchStatus } from './health';
import { fetchRepoSnapshot, type RepoSnapshot } from './snapshot';

export type SyncDeps = {
  db: D1Database;
  config: GitHubConfig;
  fetch?: typeof fetch;
  now?: () => number;
};

export type TrackedProject = { id: string; ownerId: string; repositoryFullName: string };
export type SyncResult = { projectId: string; fullName: string; ok: true } | { projectId: string; fullName: string; ok: false; error: string };

const MAX_PARAMS = 90;

export function insertStatements(db: D1Database, table: string, columns: string[], rows: unknown[][], suffix = '') {
  const perStatement = Math.max(1, Math.floor(MAX_PARAMS / columns.length));
  const statements: D1PreparedStatement[] = [];
  for (let index = 0; index < rows.length; index += perStatement) {
    const chunk = rows.slice(index, index + perStatement);
    const placeholders = chunk.map(() => `(${columns.map(() => '?').join(', ')})`).join(', ');
    statements.push(db.prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES ${placeholders}${suffix}`).bind(...chunk.flat()));
  }
  return statements;
}

export function buildSnapshotStatements(db: D1Database, project: TrackedProject, snapshot: RepoSnapshot, now: number) {
  const projectId = project.id;
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `UPDATE projects SET repository_url = ?, repository_full_name = ?, repository_visibility = ?,
         default_branch = COALESCE(?, default_branch), github_last_activity_at = ? WHERE id = ? AND owner_id = ?`,
      )
      .bind(snapshot.url, snapshot.fullName, snapshot.isPrivate ? 'PRIVATE' : 'PUBLIC', snapshot.defaultBranch, snapshot.pushedAt, projectId, project.ownerId),
    db
      .prepare('UPDATE github_repositories SET full_name = ?, default_branch = ?, is_private = ?, is_archived = ?, updated_at = ? WHERE repo_id = ? AND owner_id = ?')
      .bind(snapshot.fullName, snapshot.defaultBranch, snapshot.isPrivate ? 1 : 0, snapshot.isArchived ? 1 : 0, now, snapshot.repoId, project.ownerId),
    db
      .prepare(
        `INSERT INTO project_integrations (id, project_id, provider, status, external_id, last_synced_at, sync_error, created_at, updated_at)
         VALUES (?, ?, 'GITHUB', 'CONNECTED', ?, ?, NULL, ?, ?)
         ON CONFLICT(project_id, provider) DO UPDATE SET status = 'CONNECTED', external_id = excluded.external_id,
           last_synced_at = excluded.last_synced_at, sync_error = NULL, updated_at = excluded.updated_at`,
      )
      .bind(crypto.randomUUID(), projectId, String(snapshot.repoId), now, now, now),
  ];

  for (const table of ['github_pull_requests', 'github_issues', 'github_commits', 'github_workflow_runs', 'github_contributors']) {
    statements.push(db.prepare(`DELETE FROM ${table} WHERE project_id = ?`).bind(projectId));
  }

  statements.push(
    ...insertStatements(
      db,
      'github_pull_requests',
      ['project_id', 'number', 'title', 'is_draft', 'url', 'author', 'head_branch', 'base_branch', 'review_decision', 'created_at', 'updated_at'],
      snapshot.pullRequests.map((pr) => [projectId, pr.number, pr.title, pr.isDraft ? 1 : 0, pr.url, pr.author, pr.headBranch, pr.baseBranch, pr.reviewDecision, pr.createdAt, pr.updatedAt]),
    ),
    ...insertStatements(
      db,
      'github_issues',
      ['project_id', 'number', 'title', 'url', 'author', 'labels_json', 'created_at', 'updated_at'],
      snapshot.issues.map((issue) => [projectId, issue.number, issue.title, issue.url, issue.author, JSON.stringify(issue.labels), issue.createdAt, issue.updatedAt]),
    ),
    ...insertStatements(
      db,
      'github_commits',
      ['project_id', 'sha', 'message', 'author_name', 'author_login', 'committed_at', 'url'],
      snapshot.commits.map((commit) => [projectId, commit.sha, commit.message, commit.authorName, commit.authorLogin, commit.committedAt, commit.url]),
    ),
    ...insertStatements(
      db,
      'github_workflow_runs',
      ['project_id', 'run_id', 'name', 'branch', 'event', 'status', 'conclusion', 'url', 'started_at'],
      snapshot.workflowRuns.map((run) => [projectId, run.runId, run.name, run.branch, run.event, run.status, run.conclusion, run.url, run.startedAt]),
    ),
    ...insertStatements(
      db,
      'github_contributors',
      ['project_id', 'login', 'contributions', 'is_bot'],
      snapshot.contributors.map((person) => [projectId, person.login, person.contributions, person.isBot ? 1 : 0]),
    ),
  );

  statements.push(
    ...insertStatements(
      db,
      'project_branches',
      ['id', 'project_id', 'name', 'purpose', 'status', 'ahead_by', 'behind_by', 'pull_request_url', 'deployment_url', 'last_commit_at', 'created_at', 'updated_at'],
      snapshot.branches.map((branch) => [crypto.randomUUID(), projectId, branch.name, null, branchStatus(branch, now), branch.aheadBy, branch.behindBy, branch.openPullRequestUrl, null, branch.committedAt, now, now]),
      ` ON CONFLICT(project_id, name) DO UPDATE SET
          status = CASE WHEN project_branches.status IN ('ACTIVE', 'STALE', 'DELETED') THEN excluded.status ELSE project_branches.status END,
          ahead_by = excluded.ahead_by, behind_by = excluded.behind_by, pull_request_url = excluded.pull_request_url,
          last_commit_at = excluded.last_commit_at, updated_at = excluded.updated_at`,
    ),
  );

  if (snapshot.branchTotal <= snapshot.branches.length && snapshot.branches.length > 0) {
    const names = snapshot.branches.map((branch) => branch.name);
    const placeholders = names.map(() => '?').join(', ');
    statements.push(
      db.prepare(`DELETE FROM project_branches WHERE project_id = ? AND purpose IS NULL AND name NOT IN (${placeholders})`).bind(projectId, ...names),
      db.prepare(`UPDATE project_branches SET status = 'DELETED', updated_at = ? WHERE project_id = ? AND purpose IS NOT NULL AND status != 'DELETED' AND name NOT IN (${placeholders})`).bind(now, projectId, ...names),
    );
  }

  return statements;
}

export async function clientFor(deps: SyncDeps, installationId: number) {
  const fetchImpl = deps.fetch ?? fetch;
  const token = await getInstallationToken(deps.config, installationId, fetchImpl, deps.now?.() ?? Date.now());
  return new GitHubClient({ token, apiBase: deps.config.apiBase, fetch: fetchImpl });
}

async function recordSyncError(deps: SyncDeps, project: TrackedProject, message: string, now: number) {
  await deps.db
    .prepare(
      `INSERT INTO project_integrations (id, project_id, provider, status, external_id, last_synced_at, sync_error, created_at, updated_at)
       VALUES (?, ?, 'GITHUB', 'ERROR', NULL, NULL, ?, ?, ?)
       ON CONFLICT(project_id, provider) DO UPDATE SET status = 'ERROR', sync_error = excluded.sync_error, updated_at = excluded.updated_at`,
    )
    .bind(crypto.randomUUID(), project.id, message.slice(0, 300), now, now)
    .run();
}

export async function findInstallationId(db: D1Database, project: TrackedProject) {
  const row = await db
    .prepare(
      `SELECT r.installation_id AS installation_id FROM github_repositories r
       JOIN github_installations i ON i.id = r.installation_id
       WHERE r.owner_id = ? AND i.suspended_at IS NULL AND (r.project_id = ? OR lower(r.full_name) = lower(?))
       ORDER BY (r.project_id = ?) DESC LIMIT 1`,
    )
    .bind(project.ownerId, project.id, project.repositoryFullName, project.id)
    .first<{ installation_id: number }>();
  return row?.installation_id ?? null;
}

export async function syncProject(deps: SyncDeps, project: TrackedProject): Promise<SyncResult> {
  const now = deps.now?.() ?? Date.now();
  const base = { projectId: project.id, fullName: project.repositoryFullName };
  try {
    const installationId = await findInstallationId(deps.db, project);
    if (installationId === null) throw new GitHubApiError(404, 'This repository is not accessible to the GitHub App. Install the app on it, then refresh the connection.');
    const client = await clientFor(deps, installationId);
    const snapshot = await fetchRepoSnapshot(client, project.repositoryFullName);
    await deps.db.batch(buildSnapshotStatements(deps.db, project, snapshot, now));
    return { ...base, ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown sync error.';
    await recordSyncError(deps, project, message, now).catch(() => undefined);
    return { ...base, ok: false, error: message };
  }
}

type InstallationRepository = { id: number; full_name: string; private: boolean; archived: boolean; default_branch: string | null };

export async function refreshInstallations(deps: SyncDeps, ownerId: string) {
  const now = deps.now?.() ?? Date.now();
  const fetchImpl = deps.fetch ?? fetch;
  const installations = await listAppInstallations(deps.config, fetchImpl, now);
  let repositoryCount = 0;

  for (const installation of installations) {
    await deps.db
      .prepare(
        `INSERT INTO github_installations (id, owner_id, account_login, account_type, repository_selection, suspended_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET account_login = excluded.account_login, account_type = excluded.account_type,
           repository_selection = excluded.repository_selection, suspended_at = excluded.suspended_at, updated_at = excluded.updated_at
         WHERE github_installations.owner_id = excluded.owner_id`,
      )
      .bind(installation.id, ownerId, installation.account?.login ?? 'unknown', installation.account?.type ?? 'User', installation.repository_selection, installation.suspended_at ? Date.parse(installation.suspended_at) : null, now, now)
      .run();

    const owned = await deps.db.prepare('SELECT 1 AS ok FROM github_installations WHERE id = ? AND owner_id = ?').bind(installation.id, ownerId).first();
    if (!owned || installation.suspended_at) continue;

    const client = await clientFor(deps, installation.id);
    const repositories: InstallationRepository[] = [];
    for (let page = 1; page <= 10; page += 1) {
      const result = await client.rest<{ repositories: InstallationRepository[] }>(`/installation/repositories?per_page=100&page=${page}`);
      const batch = result?.repositories ?? [];
      repositories.push(...batch);
      if (batch.length < 100) break;
    }
    repositoryCount += repositories.length;

    const statements: D1PreparedStatement[] = [];
    for (const repo of repositories) {
      statements.push(
        deps.db.prepare('DELETE FROM github_repositories WHERE owner_id = ? AND full_name = ? AND repo_id != ?').bind(ownerId, repo.full_name, repo.id),
        deps.db
          .prepare(
            `INSERT INTO github_repositories (repo_id, installation_id, owner_id, full_name, default_branch, is_private, is_archived, project_id, decision, discovered_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'PENDING', ?, ?)
             ON CONFLICT(repo_id) DO UPDATE SET installation_id = excluded.installation_id, full_name = excluded.full_name,
               default_branch = excluded.default_branch, is_private = excluded.is_private, is_archived = excluded.is_archived, updated_at = excluded.updated_at
             WHERE github_repositories.owner_id = excluded.owner_id`,
          )
          .bind(repo.id, installation.id, ownerId, repo.full_name, repo.default_branch, repo.private ? 1 : 0, repo.archived ? 1 : 0, now, now),
      );
    }

    const existing = await deps.db.prepare('SELECT repo_id FROM github_repositories WHERE installation_id = ? AND owner_id = ?').bind(installation.id, ownerId).all<{ repo_id: number }>();
    const present = new Set(repositories.map((repo) => repo.id));
    const removed = (existing.results ?? []).map((row) => row.repo_id).filter((id) => !present.has(id));
    for (let index = 0; index < removed.length; index += MAX_PARAMS) {
      const chunk = removed.slice(index, index + MAX_PARAMS);
      statements.push(deps.db.prepare(`DELETE FROM github_repositories WHERE owner_id = ? AND repo_id IN (${chunk.map(() => '?').join(', ')})`).bind(ownerId, ...chunk));
    }
    if (statements.length) await deps.db.batch(statements);
  }

  await deps.db
    .prepare(
      `UPDATE github_repositories SET
         project_id = (SELECT p.id FROM projects p WHERE p.owner_id = github_repositories.owner_id AND lower(p.repository_full_name) = lower(github_repositories.full_name) LIMIT 1),
         decision = 'TRACKED'
       WHERE owner_id = ? AND project_id IS NULL AND decision = 'PENDING'
         AND EXISTS (SELECT 1 FROM projects p WHERE p.owner_id = github_repositories.owner_id AND lower(p.repository_full_name) = lower(github_repositories.full_name))`,
    )
    .bind(ownerId)
    .run();

  return { installations: installations.length, repositories: repositoryCount };
}

export async function setRepositoryDecision(db: D1Database, ownerId: string, repoId: number, decision: 'PENDING' | 'IGNORED') {
  await db.prepare('UPDATE github_repositories SET decision = ?, updated_at = ? WHERE repo_id = ? AND owner_id = ? AND project_id IS NULL').bind(decision, Date.now(), repoId, ownerId).run();
}

export async function reconcileStale(deps: SyncDeps, limit = deps.config.syncBatch) {
  const rows = await deps.db
    .prepare(
      `SELECT p.id AS id, p.owner_id AS owner_id, p.repository_full_name AS full_name
       FROM github_repositories r
       JOIN projects p ON p.id = r.project_id
       LEFT JOIN project_integrations i ON i.project_id = p.id AND i.provider = 'GITHUB'
       WHERE r.decision = 'TRACKED' AND p.archived_at IS NULL AND p.repository_full_name IS NOT NULL
       ORDER BY COALESCE(i.last_synced_at, 0) ASC, p.id ASC LIMIT ?`,
    )
    .bind(limit)
    .all<{ id: string; owner_id: string; full_name: string }>();

  const results: SyncResult[] = [];
  for (const row of rows.results ?? []) {
    results.push(await syncProject(deps, { id: row.id, ownerId: row.owner_id, repositoryFullName: row.full_name }));
  }
  return results;
}

export async function listInstallationOwners(db: D1Database) {
  const rows = await db.prepare('SELECT DISTINCT owner_id FROM github_installations WHERE suspended_at IS NULL').all<{ owner_id: string }>();
  return (rows.results ?? []).map((row) => row.owner_id);
}
