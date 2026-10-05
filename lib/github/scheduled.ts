import type { GitHubEnv } from './config';
import { readGitHubConfig } from './config';
import { listInstallationOwners, reconcileStale, refreshInstallations } from './sync-store';

export type ScheduledEnv = GitHubEnv & { DB: D1Database };

export async function runScheduledSync(env: ScheduledEnv, fetchImpl?: typeof fetch) {
  const config = readGitHubConfig(env);
  if (!config) return { skipped: 'GitHub integration is not configured.' };
  const deps = { db: env.DB, config, fetch: fetchImpl };

  const refreshErrors: string[] = [];
  for (const ownerId of await listInstallationOwners(env.DB)) {
    try {
      await refreshInstallations(deps, ownerId);
    } catch (error) {
      refreshErrors.push(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  const results = await reconcileStale(deps);
  return { synced: results.filter((result) => result.ok).length, failed: results.filter((result) => !result.ok).length, refreshErrors };
}
