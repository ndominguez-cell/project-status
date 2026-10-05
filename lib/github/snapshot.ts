import { GitHubApiError, type GitHubClient } from './client';

export const REPO_SNAPSHOT_QUERY = `query RepoSnapshot($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    databaseId
    nameWithOwner
    url
    isPrivate
    isArchived
    pushedAt
    defaultBranchRef {
      name
      target {
        ... on Commit {
          oid
          history(first: 15) {
            nodes {
              oid
              messageHeadline
              committedDate
              url
              author { name user { login } }
            }
          }
        }
      }
    }
    refs(refPrefix: "refs/heads/", first: 50, orderBy: {field: TAG_COMMIT_DATE, direction: DESC}) {
      totalCount
      nodes {
        name
        target { ... on Commit { oid committedDate } }
        associatedPullRequests(first: 1, states: OPEN) { nodes { number url } }
      }
    }
    pullRequests(states: OPEN, first: 30, orderBy: {field: UPDATED_AT, direction: DESC}) {
      totalCount
      nodes {
        number title isDraft url createdAt updatedAt headRefName baseRefName reviewDecision
        author { login }
      }
    }
    issues(states: OPEN, first: 30, orderBy: {field: UPDATED_AT, direction: DESC}) {
      totalCount
      nodes {
        number title url createdAt updatedAt
        author { login }
        labels(first: 5) { nodes { name } }
      }
    }
  }
}`;

type GqlCommit = { oid: string; messageHeadline: string; committedDate: string; url: string; author: { name: string | null; user: { login: string } | null } | null };
type GqlRepository = {
  databaseId: number;
  nameWithOwner: string;
  url: string;
  isPrivate: boolean;
  isArchived: boolean;
  pushedAt: string | null;
  defaultBranchRef: { name: string; target: { oid: string; history: { nodes: GqlCommit[] } } | null } | null;
  refs: {
    totalCount: number;
    nodes: { name: string; target: { oid: string; committedDate: string } | null; associatedPullRequests: { nodes: { number: number; url: string }[] } }[];
  };
  pullRequests: {
    totalCount: number;
    nodes: { number: number; title: string; isDraft: boolean; url: string; createdAt: string; updatedAt: string; headRefName: string; baseRefName: string; reviewDecision: string | null; author: { login: string } | null }[];
  };
  issues: {
    totalCount: number;
    nodes: { number: number; title: string; url: string; createdAt: string; updatedAt: string; author: { login: string } | null; labels: { nodes: { name: string }[] } }[];
  };
};

export type SnapshotBranch = {
  name: string;
  sha: string | null;
  committedAt: number | null;
  isDefault: boolean;
  openPullRequestUrl: string | null;
  aheadBy: number | null;
  behindBy: number | null;
};

export type RepoSnapshot = {
  repoId: number;
  fullName: string;
  url: string;
  isPrivate: boolean;
  isArchived: boolean;
  pushedAt: number | null;
  defaultBranch: string | null;
  commits: { sha: string; message: string; authorName: string | null; authorLogin: string | null; committedAt: number; url: string }[];
  branches: SnapshotBranch[];
  branchTotal: number;
  pullRequests: { number: number; title: string; isDraft: boolean; url: string; author: string | null; headBranch: string; baseBranch: string; reviewDecision: string | null; createdAt: number; updatedAt: number }[];
  pullRequestTotal: number;
  issues: { number: number; title: string; url: string; author: string | null; labels: string[]; createdAt: number; updatedAt: number }[];
  issueTotal: number;
  workflowRuns: { runId: number; name: string | null; branch: string | null; event: string | null; status: string; conclusion: string | null; url: string; startedAt: number }[];
  actionsAvailable: boolean;
  contributors: { login: string; contributions: number; isBot: boolean }[];
};

const ms = (value: string | null | undefined) => (value ? Date.parse(value) : null);

async function optional<T>(request: () => Promise<T | null>) {
  try {
    return await request();
  } catch (error) {
    if (error instanceof GitHubApiError && !error.rateLimited && [403, 404, 409, 451].includes(error.status)) return null;
    throw error;
  }
}

export function splitFullName(fullName: string) {
  const [owner, name, ...rest] = fullName.split('/');
  if (!owner || !name || rest.length) throw new Error(`Invalid repository name: ${fullName}`);
  return { owner, name };
}

export async function fetchRepoSnapshot(client: GitHubClient, fullName: string, options: { compareLimit?: number } = {}): Promise<RepoSnapshot> {
  const { owner, name } = splitFullName(fullName);
  const notFound = () => new GitHubApiError(404, `Repository ${fullName} was not found or is not accessible to the GitHub App.`);
  const data = await client.graphql<{ repository: GqlRepository | null }>(REPO_SNAPSHOT_QUERY, { owner, name }).catch((error: unknown) => {
    throw error instanceof GitHubApiError && error.status === 404 ? notFound() : error;
  });
  const repo = data.repository;
  if (!repo) throw notFound();

  const defaultBranch = repo.defaultBranchRef?.name ?? null;
  const base = `/repos/${owner}/${name}`;

  const branches: SnapshotBranch[] = repo.refs.nodes
    .map((ref) => ({
      name: ref.name,
      sha: ref.target?.oid ?? null,
      committedAt: ms(ref.target?.committedDate),
      isDefault: ref.name === defaultBranch,
      openPullRequestUrl: ref.associatedPullRequests.nodes[0]?.url ?? null,
      aheadBy: ref.name === defaultBranch ? 0 : null,
      behindBy: ref.name === defaultBranch ? 0 : null,
    }))
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || (b.committedAt ?? 0) - (a.committedAt ?? 0));

  if (defaultBranch) {
    for (const branch of branches.filter((candidate) => !candidate.isDefault).slice(0, options.compareLimit ?? 5)) {
      const comparison = await optional(() => client.rest<{ ahead_by: number; behind_by: number }>(`${base}/compare/${encodeURIComponent(defaultBranch)}...${encodeURIComponent(branch.name)}`));
      if (comparison) {
        branch.aheadBy = comparison.ahead_by;
        branch.behindBy = comparison.behind_by;
      }
    }
  }

  const runs = defaultBranch
    ? await optional(() => client.rest<{ workflow_runs: { id: number; name: string | null; head_branch: string | null; event: string | null; status: string | null; conclusion: string | null; html_url: string; run_started_at: string | null; created_at: string }[] }>(`${base}/actions/runs?per_page=10&branch=${encodeURIComponent(defaultBranch)}`))
    : null;
  const contributors = await optional(() => client.rest<{ login: string; contributions: number; type: string }[]>(`${base}/contributors?per_page=10`));

  return {
    repoId: repo.databaseId,
    fullName: repo.nameWithOwner,
    url: repo.url,
    isPrivate: repo.isPrivate,
    isArchived: repo.isArchived,
    pushedAt: ms(repo.pushedAt),
    defaultBranch,
    commits: (repo.defaultBranchRef?.target?.history.nodes ?? []).map((commit) => ({
      sha: commit.oid,
      message: commit.messageHeadline,
      authorName: commit.author?.name ?? null,
      authorLogin: commit.author?.user?.login ?? null,
      committedAt: Date.parse(commit.committedDate),
      url: commit.url,
    })),
    branches,
    branchTotal: repo.refs.totalCount,
    pullRequests: repo.pullRequests.nodes.map((pr) => ({
      number: pr.number,
      title: pr.title,
      isDraft: pr.isDraft,
      url: pr.url,
      author: pr.author?.login ?? null,
      headBranch: pr.headRefName,
      baseBranch: pr.baseRefName,
      reviewDecision: pr.reviewDecision,
      createdAt: Date.parse(pr.createdAt),
      updatedAt: Date.parse(pr.updatedAt),
    })),
    pullRequestTotal: repo.pullRequests.totalCount,
    issues: repo.issues.nodes.map((issue) => ({
      number: issue.number,
      title: issue.title,
      url: issue.url,
      author: issue.author?.login ?? null,
      labels: issue.labels.nodes.map((label) => label.name),
      createdAt: Date.parse(issue.createdAt),
      updatedAt: Date.parse(issue.updatedAt),
    })),
    issueTotal: repo.issues.totalCount,
    workflowRuns: (runs?.workflow_runs ?? []).map((run) => ({
      runId: run.id,
      name: run.name,
      branch: run.head_branch,
      event: run.event,
      status: run.status ?? 'unknown',
      conclusion: run.conclusion,
      url: run.html_url,
      startedAt: Date.parse(run.run_started_at ?? run.created_at),
    })),
    actionsAvailable: runs !== null,
    contributors: (contributors ?? []).map((person) => ({ login: person.login, contributions: person.contributions, isBot: person.type === 'Bot' })),
  };
}
