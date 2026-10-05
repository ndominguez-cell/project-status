import type { RepoSnapshot } from './snapshot';

export const STALE_BRANCH_DAYS = 30;
export const IDLE_PULL_REQUEST_DAYS = 14;
export const NO_PUSH_DAYS = 90;

const DAY = 86_400_000;
const CONCLUSION_TEXT: Record<string, string> = { failure: 'failed', timed_out: 'timed out', startup_failure: 'failed to start' };

export type GitHubWarning = { code: 'CI_FAILING' | 'STALE_BRANCHES' | 'IDLE_PULL_REQUESTS' | 'NO_RECENT_PUSH' | 'ARCHIVED_ON_GITHUB'; level: 'info' | 'warn' | 'error'; message: string };

export function branchStatus(branch: { committedAt: number | null; isDefault: boolean }, now: number) {
  if (branch.isDefault || branch.committedAt === null) return 'ACTIVE';
  return now - branch.committedAt > STALE_BRANCH_DAYS * DAY ? 'STALE' : 'ACTIVE';
}

export function githubWarnings(snapshot: Pick<RepoSnapshot, 'isArchived' | 'pushedAt' | 'workflowRuns' | 'branches' | 'pullRequests' | 'defaultBranch'>, now: number): GitHubWarning[] {
  const warnings: GitHubWarning[] = [];

  const latestCompleted = snapshot.workflowRuns.filter((run) => run.status === 'completed').sort((a, b) => b.startedAt - a.startedAt)[0];
  if (latestCompleted && ['failure', 'timed_out', 'startup_failure'].includes(latestCompleted.conclusion ?? '')) {
    warnings.push({ code: 'CI_FAILING', level: 'error', message: `Latest ${latestCompleted.name ?? 'workflow'} run on ${snapshot.defaultBranch ?? 'the default branch'} ${CONCLUSION_TEXT[latestCompleted.conclusion ?? ''] ?? 'failed'}.` });
  }

  const stale = snapshot.branches.filter((branch) => branchStatus(branch, now) === 'STALE');
  if (stale.length) warnings.push({ code: 'STALE_BRANCHES', level: 'warn', message: `${stale.length} branch${stale.length === 1 ? '' : 'es'} with no commits in ${STALE_BRANCH_DAYS}+ days.` });

  const idle = snapshot.pullRequests.filter((pr) => !pr.isDraft && now - pr.updatedAt > IDLE_PULL_REQUEST_DAYS * DAY);
  if (idle.length) warnings.push({ code: 'IDLE_PULL_REQUESTS', level: 'warn', message: `${idle.length} open pull request${idle.length === 1 ? '' : 's'} idle for ${IDLE_PULL_REQUEST_DAYS}+ days.` });

  if (snapshot.pushedAt !== null && now - snapshot.pushedAt > NO_PUSH_DAYS * DAY) {
    warnings.push({ code: 'NO_RECENT_PUSH', level: 'warn', message: `No pushes in ${Math.floor((now - snapshot.pushedAt) / DAY)} days.` });
  }

  if (snapshot.isArchived) warnings.push({ code: 'ARCHIVED_ON_GITHUB', level: 'info', message: 'This repository is archived on GitHub. Consider archiving the project here too.' });

  return warnings;
}

export function suggestedHealth(warnings: GitHubWarning[]) {
  if (warnings.some((warning) => warning.code === 'CI_FAILING')) return 'NEEDS_ATTENTION' as const;
  if (warnings.some((warning) => warning.code === 'NO_RECENT_PUSH')) return 'STALE' as const;
  if (warnings.some((warning) => warning.level === 'warn')) return 'NEEDS_ATTENTION' as const;
  return 'HEALTHY' as const;
}
