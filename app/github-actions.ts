'use server';

import { env } from 'cloudflare:workers';
import { redirect } from 'next/navigation';
import { getUser } from '@/app/auth';
import { readGitHubConfig } from '@/lib/github/config';
import { reconcileStale, refreshInstallations, setRepositoryDecision, syncProject, type SyncDeps } from '@/lib/github/sync-store';
import { trackRepository } from '@/lib/github/track';

function field(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

async function context() {
  const user = await getUser();
  if (!user) throw new Error('Authentication required.');
  const config = readGitHubConfig(env);
  if (!config) throw new Error('GitHub integration is not configured. Set the GitHub App secrets first.');
  const now = Date.now();
  await env.DB
    .prepare(
      `INSERT INTO users (id, email, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET email = excluded.email, display_name = excluded.display_name, updated_at = excluded.updated_at`,
    )
    .bind(user.userId, user.email, user.displayName, now, now)
    .run();
  const deps: SyncDeps = { db: env.DB, config };
  return { user, deps };
}

function back(path: string, kind: 'ok' | 'error', message: string): never {
  const separator = path.includes('?') ? '&' : '?';
  redirect(`${path}${separator}notice=${encodeURIComponent(message.slice(0, 280))}&kind=${kind}`);
}

async function attempt(path: string, action: () => Promise<string>): Promise<never> {
  let message: string;
  try {
    message = await action();
  } catch (error) {
    return back(path, 'error', error instanceof Error ? error.message : 'Something went wrong.');
  }
  return back(path, 'ok', message);
}

export async function connectGitHub() {
  await attempt('/integrations', async () => {
    const { user, deps } = await context();
    const result = await refreshInstallations(deps, user.userId);
    if (!result.installations) return 'No installations found. Install the GitHub App on your account, then refresh.';
    return `Found ${result.installations} installation${result.installations === 1 ? '' : 's'} and ${result.repositories} repositor${result.repositories === 1 ? 'y' : 'ies'}.`;
  });
}

export async function syncGitHubNow() {
  await attempt('/integrations', async () => {
    const { deps } = await context();
    const results = await reconcileStale(deps);
    const failed = results.filter((result) => !result.ok);
    if (!results.length) return 'Nothing to sync yet. Track a repository first.';
    return `Synced ${results.length - failed.length} of ${results.length} project${results.length === 1 ? '' : 's'}${failed.length ? `; ${failed.length} failed (see the repository list)` : ''}.`;
  });
}

export async function syncGitHubProject(formData: FormData) {
  const projectId = field(formData, 'projectId');
  const { user, deps } = await context().catch((error: unknown) => back('/integrations', 'error', error instanceof Error ? error.message : 'Something went wrong.'));
  const project = await env.DB.prepare('SELECT id, slug, repository_full_name AS full_name FROM projects WHERE id = ? AND owner_id = ?').bind(projectId, user.userId).first<{ id: string; slug: string; full_name: string | null }>();
  if (!project) return back('/projects', 'error', 'Project not found.');
  const path = `/projects/${project.slug}?tab=github`;
  if (!project.full_name) return back(path, 'error', 'This project has no linked GitHub repository.');
  const result = await syncProject(deps, { id: project.id, ownerId: user.userId, repositoryFullName: project.full_name });
  return back(path, result.ok ? 'ok' : 'error', result.ok ? 'Synced from GitHub.' : result.error);
}

export async function trackGitHubRepository(formData: FormData) {
  let slug: string;
  try {
    const { user, deps } = await context();
    const tracked = await trackRepository(deps, user.userId, Number(field(formData, 'repoId')), { category: field(formData, 'category'), priority: field(formData, 'priority') });
    slug = tracked.slug;
  } catch (error) {
    return back('/integrations', 'error', error instanceof Error ? error.message : 'Something went wrong.');
  }
  return redirect(`/projects/${slug}?tab=github`);
}

export async function setGitHubRepositoryDecision(formData: FormData) {
  await attempt('/integrations', async () => {
    const { user, deps } = await context();
    const decision = field(formData, 'decision');
    if (decision !== 'IGNORED' && decision !== 'PENDING') throw new Error('Invalid decision.');
    await setRepositoryDecision(deps.db, user.userId, Number(field(formData, 'repoId')), decision);
    return decision === 'IGNORED' ? 'Repository ignored.' : 'Repository restored to the review list.';
  });
}

export async function updateBranchPurpose(formData: FormData) {
  const user = await getUser();
  if (!user) throw new Error('Authentication required.');
  const row = await env.DB
    .prepare('SELECT b.id AS id, p.slug AS slug FROM project_branches b JOIN projects p ON p.id = b.project_id WHERE b.id = ? AND p.owner_id = ?')
    .bind(field(formData, 'branchId'), user.userId)
    .first<{ id: string; slug: string }>();
  if (!row) return back('/projects', 'error', 'Branch not found.');
  const purpose = field(formData, 'purpose').trim().slice(0, 200) || null;
  await env.DB.prepare('UPDATE project_branches SET purpose = ?, updated_at = ? WHERE id = ?').bind(purpose, Date.now(), row.id).run();
  return back(`/projects/${row.slug}?tab=branches`, 'ok', 'Branch purpose saved.');
}
