import { createPublicKey, generateKeyPairSync, type KeyObject } from 'node:crypto';
import { jwtVerify } from 'jose';

export type FakeRepo = {
  id: number;
  fullName: string;
  private?: boolean;
  archived?: boolean;
  defaultBranch?: string | null;
  pushedAt?: string;
  commits?: { oid: string; messageHeadline: string; committedDate: string; url?: string; author?: { name: string | null; user: { login: string } | null } | null }[];
  branches?: { name: string; oid: string; committedDate: string; pr?: { number: number; url: string } }[];
  pullRequests?: { number: number; title: string; isDraft?: boolean; updatedAt: string; createdAt?: string; headRefName?: string; baseRefName?: string; reviewDecision?: string | null; author?: string }[];
  issues?: { number: number; title: string; updatedAt: string; labels?: string[]; author?: string }[];
  runs?: { id: number; name: string; status: string; conclusion: string | null; head_branch?: string; created_at: string }[];
  contributors?: { login: string; contributions: number; type?: string }[];
  compare?: Record<string, { ahead: number; behind: number }>;
  actionsForbidden?: boolean;
  branchTotal?: number;
  description?: string | null;
  homepage?: string | null;
  createdAt?: string;
};

export type FakeInstallation = { id: number; login: string; repos: FakeRepo[]; suspended?: boolean; selection?: 'all' | 'selected' };

export function createTestKeys() {
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs1', format: 'pem' } });
  const pkcs8 = generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
  return { pkcs1Private: pair.privateKey, pkcs1Public: createPublicKey(pair.publicKey), pkcs8Private: pkcs8.privateKey, pkcs8Public: createPublicKey(pkcs8.publicKey) };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export function createFakeGitHub(options: { appId: string; publicKey: KeyObject; installations: FakeInstallation[]; tokenTtlMs?: number; now?: () => number }) {
  const calls: string[] = [];
  const tokens = new Map<string, number>();
  let minted = 0;
  const now = options.now ?? (() => Date.now());

  const findRepo = (owner: string, name: string) => {
    const full = `${owner}/${name}`.toLowerCase();
    for (const installation of options.installations) {
      const repo = installation.repos.find((candidate) => candidate.fullName.toLowerCase() === full);
      if (repo) return { installation, repo };
    }
    return null;
  };

  const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const method = init?.method ?? 'GET';
    const path = url.pathname;
    calls.push(`${method} ${path}`);
    const auth = (init?.headers as Record<string, string> | undefined)?.Authorization ?? '';
    const bearer = auth.replace(/^Bearer /, '');

    if (path.startsWith('/app/')) {
      try {
        await jwtVerify(bearer, options.publicKey, { issuer: options.appId, currentDate: new Date(now()) });
      } catch {
        return json({ message: 'A JSON web token could not be decoded' }, 401);
      }
      if (path === '/app/installations') {
        return json(options.installations.map((installation) => ({ id: installation.id, account: { login: installation.login, type: 'User' }, repository_selection: installation.selection ?? 'selected', suspended_at: installation.suspended ? '2026-01-01T00:00:00Z' : null })));
      }
      const mint = path.match(/^\/app\/installations\/(\d+)\/access_tokens$/);
      if (mint && method === 'POST') {
        minted += 1;
        const token = `ghs_${mint[1]}_${minted}`;
        const expiresAt = now() + (options.tokenTtlMs ?? 3_600_000);
        tokens.set(token, expiresAt);
        return json({ token, expires_at: new Date(expiresAt).toISOString() }, 201);
      }
      return json({ message: 'Not Found' }, 404);
    }

    if (!tokens.has(bearer)) return json({ message: 'Bad credentials' }, 401);
    const installationId = Number(bearer.split('_')[1]);

    if (path === '/installation/repositories') {
      const installation = options.installations.find((candidate) => candidate.id === installationId);
      return json({ total_count: installation?.repos.length ?? 0, repositories: (installation?.repos ?? []).map((repo) => ({ id: repo.id, full_name: repo.fullName, private: repo.private ?? false, archived: repo.archived ?? false, default_branch: repo.defaultBranch === undefined ? 'main' : repo.defaultBranch })) });
    }

    if (path === '/graphql') {
      const { variables } = JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as { variables: { owner: string; name: string } };
      const found = findRepo(variables.owner, variables.name);
      if (!found || found.installation.id !== installationId) return json({ data: { repository: null }, errors: [{ type: 'NOT_FOUND', message: `Could not resolve to a Repository with the name '${variables.owner}/${variables.name}'.` }] });
      const repo = found.repo;
      const defaultBranch = repo.defaultBranch === undefined ? 'main' : repo.defaultBranch;
      const branches = repo.branches ?? (defaultBranch ? [{ name: defaultBranch, oid: 'a'.repeat(40), committedDate: repo.pushedAt ?? '2026-10-01T00:00:00Z' }] : []);
      return json({
        data: {
          repository: {
            databaseId: repo.id,
            nameWithOwner: repo.fullName,
            url: `https://github.com/${repo.fullName}`,
            isPrivate: repo.private ?? false,
            isArchived: repo.archived ?? false,
            pushedAt: repo.pushedAt ?? '2026-10-01T00:00:00Z',
            defaultBranchRef: defaultBranch ? { name: defaultBranch, target: { oid: 'a'.repeat(40), history: { nodes: (repo.commits ?? []).map((commit) => ({ url: `https://github.com/${repo.fullName}/commit/${commit.oid}`, author: { name: 'Nick', user: { login: 'nick' } }, ...commit })) } } } : null,
            refs: { totalCount: repo.branchTotal ?? branches.length, nodes: branches.map((branch) => ({ name: branch.name, target: { oid: branch.oid, committedDate: branch.committedDate }, associatedPullRequests: { nodes: branch.pr ? [branch.pr] : [] } })) },
            pullRequests: { totalCount: (repo.pullRequests ?? []).length, nodes: (repo.pullRequests ?? []).map((pr) => ({ number: pr.number, title: pr.title, isDraft: pr.isDraft ?? false, url: `https://github.com/${repo.fullName}/pull/${pr.number}`, createdAt: pr.createdAt ?? pr.updatedAt, updatedAt: pr.updatedAt, headRefName: pr.headRefName ?? 'feature', baseRefName: pr.baseRefName ?? 'main', reviewDecision: pr.reviewDecision ?? null, author: { login: pr.author ?? 'nick' } })) },
            issues: { totalCount: (repo.issues ?? []).length, nodes: (repo.issues ?? []).map((issue) => ({ number: issue.number, title: issue.title, url: `https://github.com/${repo.fullName}/issues/${issue.number}`, createdAt: issue.updatedAt, updatedAt: issue.updatedAt, author: { login: issue.author ?? 'nick' }, labels: { nodes: (issue.labels ?? []).map((name) => ({ name })) } })) },
          },
        },
      });
    }

    const repoRoot = path.match(/^\/repos\/([^/]+)\/([^/]+)$/);
    if (repoRoot) {
      const found = findRepo(repoRoot[1], repoRoot[2]);
      if (!found) return json({ message: 'Not Found' }, 404);
      const repo = found.repo;
      return json({ name: repo.fullName.split('/')[1], description: repo.description ?? null, homepage: repo.homepage ?? null, created_at: repo.createdAt ?? '2026-01-01T00:00:00Z', pushed_at: repo.pushedAt ?? '2026-10-01T00:00:00Z', html_url: `https://github.com/${repo.fullName}`, private: repo.private ?? false, default_branch: repo.defaultBranch === undefined ? 'main' : repo.defaultBranch });
    }

    const repoPath = path.match(/^\/repos\/([^/]+)\/([^/]+)\/(.+)$/);
    if (repoPath) {
      const found = findRepo(repoPath[1], repoPath[2]);
      if (!found) return json({ message: 'Not Found' }, 404);
      const repo = found.repo;
      const rest = repoPath[3];
      if (rest.startsWith('compare/')) {
        const [, head] = decodeURIComponent(rest.slice('compare/'.length)).split('...');
        const result = repo.compare?.[head];
        return result ? json({ status: 'diverged', ahead_by: result.ahead, behind_by: result.behind, total_commits: result.ahead }) : json({ message: 'Not Found' }, 404);
      }
      if (rest === 'actions/runs') {
        if (repo.actionsForbidden) return json({ message: 'Resource not accessible by integration' }, 403);
        return json({ total_count: (repo.runs ?? []).length, workflow_runs: (repo.runs ?? []).map((run) => ({ event: 'push', html_url: `https://github.com/${repo.fullName}/actions/runs/${run.id}`, run_started_at: run.created_at, head_branch: 'main', ...run })) });
      }
      if (rest === 'contributors') return json(repo.contributors ?? []);
    }

    return json({ message: 'Not Found' }, 404);
  }) as typeof fetch;

  return { fetch: fakeFetch, calls, mintedTokens: () => minted };
}
