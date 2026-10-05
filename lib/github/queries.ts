import { and, asc, desc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { githubCommits, githubContributors, githubInstallations, githubIssues, githubPullRequests, githubRepositories, githubWorkflowRuns, projectBranches, projectIntegrations, projects } from '@/db/schema';
import type { ProjectRecord } from '@/lib/project-hub';
import { githubWarnings, suggestedHealth } from './health';

export async function getGitHubProjectData(project: ProjectRecord) {
  const db = getDb();
  const [integration, repository, pullRequests, issues, commits, runs, contributors, branches] = await Promise.all([
    db.select().from(projectIntegrations).where(and(eq(projectIntegrations.projectId, project.id), eq(projectIntegrations.provider, 'GITHUB'))).limit(1),
    db.select().from(githubRepositories).where(and(eq(githubRepositories.ownerId, project.ownerId), eq(githubRepositories.projectId, project.id))).limit(1),
    db.select().from(githubPullRequests).where(eq(githubPullRequests.projectId, project.id)).orderBy(desc(githubPullRequests.updatedAt)),
    db.select().from(githubIssues).where(eq(githubIssues.projectId, project.id)).orderBy(desc(githubIssues.updatedAt)),
    db.select().from(githubCommits).where(eq(githubCommits.projectId, project.id)).orderBy(desc(githubCommits.committedAt)),
    db.select().from(githubWorkflowRuns).where(eq(githubWorkflowRuns.projectId, project.id)).orderBy(desc(githubWorkflowRuns.startedAt)),
    db.select().from(githubContributors).where(eq(githubContributors.projectId, project.id)).orderBy(desc(githubContributors.contributions)),
    db.select().from(projectBranches).where(eq(projectBranches.projectId, project.id)),
  ]);

  const synced = integration[0]?.lastSyncedAt != null;
  const warnings = synced
    ? githubWarnings(
        {
          isArchived: repository[0]?.isArchived ?? false,
          pushedAt: project.githubLastActivityAt?.getTime() ?? null,
          defaultBranch: project.defaultBranch,
          workflowRuns: runs.map((run) => ({ runId: run.runId, name: run.name, branch: run.branch, event: run.event, status: run.status, conclusion: run.conclusion, url: run.url, startedAt: run.startedAt.getTime() })),
          branches: branches
            .filter((branch) => branch.status !== 'DELETED')
            .map((branch) => ({ name: branch.name, sha: null, committedAt: branch.lastCommitAt?.getTime() ?? null, isDefault: branch.name === project.defaultBranch, openPullRequestUrl: branch.pullRequestUrl, aheadBy: branch.aheadBy, behindBy: branch.behindBy })),
          pullRequests: pullRequests.map((pr) => ({ number: pr.number, title: pr.title, isDraft: pr.isDraft, url: pr.url, author: pr.author, headBranch: pr.headBranch ?? '', baseBranch: pr.baseBranch ?? '', reviewDecision: pr.reviewDecision, createdAt: pr.createdAt.getTime(), updatedAt: pr.updatedAt.getTime() })),
        },
        Date.now(),
      )
    : [];

  return { integration: integration[0] ?? null, repository: repository[0] ?? null, pullRequests, issues, commits, runs, contributors, warnings, suggestedHealth: suggestedHealth(warnings) };
}

export async function getGitHubOverview(ownerId: string) {
  const db = getDb();
  const [installations, repositories] = await Promise.all([
    db.select().from(githubInstallations).where(eq(githubInstallations.ownerId, ownerId)).orderBy(asc(githubInstallations.accountLogin)),
    db
      .select({ repository: githubRepositories, project: projects, integration: projectIntegrations })
      .from(githubRepositories)
      .leftJoin(projects, eq(projects.id, githubRepositories.projectId))
      .leftJoin(projectIntegrations, and(eq(projectIntegrations.projectId, projects.id), eq(projectIntegrations.provider, 'GITHUB')))
      .where(eq(githubRepositories.ownerId, ownerId))
      .orderBy(asc(githubRepositories.fullName)),
  ]);
  return { installations, repositories };
}
