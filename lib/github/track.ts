import { DEFAULT_CHECKLIST, slugify } from '../project-hub';
import { GitHubApiError } from './client';
import { clientFor, insertStatements, syncProject, type SyncDeps, type SyncResult } from './sync-store';

const AUTO_COMPLETE = new Set(['Project name confirmed', 'Business objective documented', 'GitHub repository created', 'Repository linked to Project Hub', 'Main branch confirmed', 'Initial commit completed']);

export const TRACK_CATEGORIES = ['AI application', 'Automation', 'Internal tool', 'Lead generation', 'Data scraper', 'Estimator', 'Website', 'SaaS', 'Experiment'] as const;
export const TRACK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

type RepoDetails = { name: string; description: string | null; homepage: string | null; created_at: string; pushed_at: string | null; html_url: string; private: boolean; default_branch: string | null };

export async function trackRepository(deps: SyncDeps, ownerId: string, repoId: number, options: { category: string; priority: string }): Promise<{ slug: string; sync: SyncResult }> {
  if (!(TRACK_CATEGORIES as readonly string[]).includes(options.category) || !(TRACK_PRIORITIES as readonly string[]).includes(options.priority)) throw new Error('Invalid category or priority.');
  const now = deps.now?.() ?? Date.now();

  const repo = await deps.db
    .prepare('SELECT repo_id, installation_id, full_name, project_id FROM github_repositories WHERE repo_id = ? AND owner_id = ?')
    .bind(repoId, ownerId)
    .first<{ repo_id: number; installation_id: number; full_name: string; project_id: string | null }>();
  if (!repo) throw new Error('Repository not found.');
  if (repo.project_id) throw new Error('This repository is already tracked.');

  const client = await clientFor(deps, repo.installation_id);
  const details = await client.rest<RepoDetails>(`/repos/${repo.full_name}`);
  if (!details) throw new GitHubApiError(404, `Repository ${repo.full_name} was not found.`);

  const base = slugify(details.name);
  const taken = await deps.db.prepare('SELECT slug FROM projects WHERE owner_id = ? AND (slug = ? OR slug LIKE ?)').bind(ownerId, base, `${base}-%`).all<{ slug: string }>();
  const used = new Set((taken.results ?? []).map((row) => row.slug));
  let slug = base;
  for (let suffix = 2; used.has(slug); suffix += 1) slug = `${base}-${suffix}`;

  const id = crypto.randomUUID();
  const pushed = details.pushed_at ? Date.parse(details.pushed_at) : now;
  const stage = now - pushed <= 45 * 86_400_000 ? 'BUILDING' : 'PAUSED';
  const homepage = /^https?:\/\//.test(details.homepage ?? '') ? details.homepage!.replace(/\/$/, '') : null;
  const objective = details.description?.trim() || 'Tracked from GitHub; add a business objective.';

  await deps.db.batch([
    deps.db
      .prepare(
        `INSERT INTO projects (id, owner_id, slug, name, business_objective, category, stage, health, priority, repository_url, repository_full_name, repository_visibility,
           default_branch, active_branch, github_last_activity_at, deployment_status, production_url, paused_reason, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'HEALTHY', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, ownerId, slug, details.name, objective, options.category, stage, options.priority, details.html_url, repo.full_name, details.private ? 'PRIVATE' : 'PUBLIC', details.default_branch ?? 'main', details.default_branch ?? 'main', pushed, homepage ? 'UNKNOWN' : 'NOT_CONFIGURED', homepage, stage === 'PAUSED' ? `No activity since ${new Date(pushed).toISOString().slice(0, 10)}` : null, Date.parse(details.created_at), pushed),
    ...insertStatements(
      deps.db,
      'checklist_items',
      ['id', 'project_id', 'category', 'label', 'sort_order', 'completed', 'completed_at', 'created_at', 'updated_at'],
      DEFAULT_CHECKLIST.map((item, index) => {
        const done = AUTO_COMPLETE.has(item.label);
        return [crypto.randomUUID(), id, item.category, item.label, index, done ? 1 : 0, done ? now : null, now, now];
      }),
    ),
    deps.db.prepare("INSERT INTO project_activity (id, project_id, actor_id, event_type, summary, metadata_json, created_at) VALUES (?, ?, ?, 'PROJECT_CREATED', ?, NULL, ?)").bind(crypto.randomUUID(), id, ownerId, `Tracked ${details.name} from GitHub`, now),
    deps.db.prepare("UPDATE github_repositories SET project_id = ?, decision = 'TRACKED', updated_at = ? WHERE repo_id = ? AND owner_id = ?").bind(id, now, repoId, ownerId),
  ]);

  const sync = await syncProject(deps, { id, ownerId, repositoryFullName: repo.full_name });
  return { slug, sync };
}
