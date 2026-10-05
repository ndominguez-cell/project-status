import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { AlertTriangle, CircleDot, ExternalLink, GitBranch, GitCommitHorizontal, GitPullRequest, RefreshCw, Users } from 'lucide-react';
import { syncGitHubProject, updateBranchPurpose } from '@/app/github-actions';
import { Data, Empty, Notice, Panel } from '@/components/project-hub/panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { projectBranches } from '@/db/schema';
import { readGitHubConfig } from '@/lib/github/config';
import { getGitHubProjectData } from '@/lib/github/queries';
import { prettyLabel, type ProjectRecord } from '@/lib/project-hub';

const GOOD = 'bg-emerald-400/10 text-emerald-300';
const BAD = 'bg-red-400/10 text-red-300';
const WARN = 'bg-amber-400/10 text-amber-300';

function timeAgo(value: Date | number | null | undefined, now = Date.now()) {
  if (value === null || value === undefined) return 'never';
  const seconds = Math.max(0, Math.floor((now - (value instanceof Date ? value.getTime() : value)) / 1000));
  if (seconds < 90) return 'just now';
  const units: [number, string][] = [[86_400 * 30, 'mo'], [86_400, 'd'], [3_600, 'h'], [60, 'm']];
  for (const [size, label] of units) if (seconds >= size) return `${Math.floor(seconds / size)}${label} ago`;
  return 'just now';
}

const safeHref = (url: string | null | undefined) => (url?.startsWith('https://') ? url : undefined);

function ExternalText({ href, children, className }: { href: string | null | undefined; children: React.ReactNode; className?: string }) {
  const safe = safeHref(href);
  return safe ? (
    <a href={safe} target="_blank" rel="noreferrer" className={className ?? 'hover:underline'}>
      {children}
    </a>
  ) : (
    <span className={className}>{children}</span>
  );
}

function Section({ icon: Icon, title, count, empty, children }: { icon: React.ComponentType<{ className?: string }>; title: string; count: number; empty: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border p-4">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        <Icon className="size-4 text-primary" /> {title} <span className="text-xs font-normal text-muted-foreground">{count}</span>
      </h3>
      <div className="mt-3 space-y-3">{count ? children : <p className="text-xs text-muted-foreground">{empty}</p>}</div>
    </section>
  );
}

function runBadge(status: string, conclusion: string | null) {
  if (status !== 'completed') return <Badge variant="outline">{prettyLabel(status)}</Badge>;
  if (conclusion === 'success') return <Badge className={GOOD}>Passed</Badge>;
  if (['failure', 'timed_out', 'startup_failure'].includes(conclusion ?? '')) return <Badge className={BAD}>{prettyLabel(conclusion ?? 'failed')}</Badge>;
  return <Badge variant="outline">{prettyLabel(conclusion ?? 'unknown')}</Badge>;
}

export async function GitHubPanel({ project }: { project: ProjectRecord }) {
  const configured = readGitHubConfig(env) !== null;
  const github = await getGitHubProjectData(project);
  const { integration } = github;
  const status = integration?.status ?? 'NOT_CONNECTED';
  const synced = integration?.lastSyncedAt != null;

  return (
    <Panel title="GitHub repository" description="GitHub stays the source of truth. This view is a synced cache; Project Hub-owned fields are never overwritten.">
      <dl className="data-grid">
        <Data label="Repository" value={project.repositoryFullName || 'Not linked'} />
        <Data label="Visibility" value={project.repositoryVisibility ? prettyLabel(project.repositoryVisibility) : 'Unknown'} />
        <Data label="Default branch" value={project.defaultBranch || 'Not set'} />
        <Data label="Last push" value={project.githubLastActivityAt ? `${timeAgo(project.githubLastActivityAt)} · ${project.githubLastActivityAt.toISOString().slice(0, 10)}` : 'Unknown'} />
        <Data label="Sync status" value={status === 'CONNECTED' ? `Connected · synced ${timeAgo(integration?.lastSyncedAt)}` : prettyLabel(status)} />
        <Data label="Suggested health" value={synced ? prettyLabel(github.suggestedHealth) : 'Awaiting first sync'} />
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {configured && project.repositoryFullName ? (
          <form action={syncGitHubProject}>
            <input type="hidden" name="projectId" value={project.id} />
            <Button type="submit" variant="outline" size="sm">
              <RefreshCw /> Sync now
            </Button>
          </form>
        ) : null}
        {safeHref(project.repositoryUrl) ? (
          <a href={safeHref(project.repositoryUrl)} target="_blank" rel="noreferrer" className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[0.8rem] font-medium hover:border-primary/40">
            Open on GitHub <ExternalLink className="size-3" />
          </a>
        ) : null}
      </div>

      {integration?.syncError ? <Notice tone="error">Last sync failed: {integration.syncError}</Notice> : null}
      {!configured ? (
        <Notice>
          The GitHub App is not configured yet, so this project is showing manually entered metadata. Set it up on the <Link href="/integrations" className="underline">Integrations page</Link>.
        </Notice>
      ) : !synced && !integration?.syncError ? (
        <Notice>
          This repository has not been synced yet. Install the GitHub App on it, then use <strong>Refresh connection</strong> on the <Link href="/integrations" className="underline">Integrations page</Link> and press Sync now.
        </Notice>
      ) : null}

      {github.warnings.length ? (
        <ul className="mt-5 space-y-2" aria-label="GitHub signals">
          {github.warnings.map((warning) => (
            <li key={warning.code} className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${warning.level === 'error' ? 'border-red-400/25 bg-red-400/[.06]' : warning.level === 'warn' ? 'border-amber-400/25 bg-amber-400/[.06]' : 'border-border'}`}>
              <AlertTriangle className={`mt-0.5 size-4 shrink-0 ${warning.level === 'error' ? 'text-red-300' : warning.level === 'warn' ? 'text-amber-300' : 'text-muted-foreground'}`} />
              {warning.message}
            </li>
          ))}
        </ul>
      ) : null}

      {synced ? (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Section icon={GitPullRequest} title="Open pull requests" count={github.pullRequests.length} empty="No open pull requests.">
            {github.pullRequests.map((pr) => (
              <div key={pr.number} className="text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <ExternalText href={pr.url} className="font-medium hover:underline">
                    #{pr.number} {pr.title}
                  </ExternalText>
                  {pr.isDraft ? <Badge variant="outline">Draft</Badge> : null}
                  {pr.reviewDecision === 'APPROVED' ? <Badge className={GOOD}>Approved</Badge> : null}
                  {pr.reviewDecision === 'CHANGES_REQUESTED' ? <Badge className={WARN}>Changes requested</Badge> : null}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {pr.author ?? 'unknown'} · {pr.headBranch} → {pr.baseBranch} · updated {timeAgo(pr.updatedAt)}
                </p>
              </div>
            ))}
          </Section>

          <Section icon={CircleDot} title="Open issues" count={github.issues.length} empty="No open issues.">
            {github.issues.map((issue) => {
              const labels = JSON.parse(issue.labelsJson) as string[];
              return (
                <div key={issue.number} className="text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <ExternalText href={issue.url} className="font-medium hover:underline">
                      #{issue.number} {issue.title}
                    </ExternalText>
                    {labels.map((label) => (
                      <Badge key={label} variant="outline">
                        {label}
                      </Badge>
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {issue.author ?? 'unknown'} · updated {timeAgo(issue.updatedAt)}
                  </p>
                </div>
              );
            })}
          </Section>

          <Section icon={GitCommitHorizontal} title={`Recent commits on ${project.defaultBranch ?? 'default branch'}`} count={github.commits.length} empty="No commits found.">
            {github.commits.map((commit) => (
              <div key={commit.sha} className="text-sm">
                <p className="truncate">
                  <ExternalText href={commit.url} className="font-mono text-xs text-primary hover:underline">
                    {commit.sha.slice(0, 7)}
                  </ExternalText>{' '}
                  {commit.message}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {commit.authorLogin ?? commit.authorName ?? 'unknown'} · {timeAgo(commit.committedAt)}
                </p>
              </div>
            ))}
          </Section>

          <Section icon={RefreshCw} title="GitHub Actions" count={github.runs.length} empty="No workflow runs on the default branch (or Actions access was not granted).">
            {github.runs.map((run) => (
              <div key={run.runId} className="flex flex-wrap items-center gap-2 text-sm">
                {runBadge(run.status, run.conclusion)}
                <ExternalText href={run.url} className="font-medium hover:underline">
                  {run.name ?? 'Workflow'}
                </ExternalText>
                <span className="text-xs text-muted-foreground">
                  {run.branch ?? ''} · {timeAgo(run.startedAt)}
                </span>
              </div>
            ))}
          </Section>

          <Section icon={Users} title="Top contributors" count={github.contributors.length} empty="No contributor data.">
            {github.contributors.map((person) => (
              <div key={person.login} className="flex items-center justify-between text-sm">
                <span>
                  {person.login} {person.isBot ? <Badge variant="outline">Bot</Badge> : null}
                </span>
                <span className="text-xs text-muted-foreground">{person.contributions} commit{person.contributions === 1 ? '' : 's'}</span>
              </div>
            ))}
          </Section>
        </div>
      ) : null}
    </Panel>
  );
}

type Branch = typeof projectBranches.$inferSelect;

export function BranchesPanel({ project, branches }: { project: ProjectRecord; branches: Branch[] }) {
  const sorted = [...branches].sort((a, b) => Number(b.name === project.defaultBranch) - Number(a.name === project.defaultBranch) || (b.lastCommitAt?.getTime() ?? 0) - (a.lastCommitAt?.getTime() ?? 0));
  return (
    <Panel title="Branches" description="Branch freshness and delivery state come from GitHub; the purpose note is yours.">
      {sorted.length ? (
        <div className="space-y-2">
          {sorted.map((branch) => (
            <div key={branch.id} className="rounded-xl border border-border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <GitBranch className="size-4 text-primary" />
                <span className="font-mono text-sm">{branch.name}</span>
                {branch.name === project.defaultBranch ? <Badge variant="outline">Default</Badge> : null}
                <Badge className={branch.status === 'STALE' ? WARN : branch.status === 'DELETED' ? BAD : undefined} variant={branch.status === 'ACTIVE' ? 'outline' : 'default'}>
                  {prettyLabel(branch.status)}
                </Badge>
                {safeHref(branch.pullRequestUrl) ? (
                  <a href={safeHref(branch.pullRequestUrl)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                    <GitPullRequest className="size-3" /> Open PR
                  </a>
                ) : null}
                <span className="text-xs text-muted-foreground sm:ml-auto">
                  {branch.aheadBy ?? '—'} ahead · {branch.behindBy ?? '—'} behind · {branch.lastCommitAt ? `last commit ${timeAgo(branch.lastCommitAt)}` : 'no commit date'}
                </span>
              </div>
              <form action={updateBranchPurpose} className="mt-3 flex gap-2">
                <input type="hidden" name="branchId" value={branch.id} />
                <Input name="purpose" defaultValue={branch.purpose ?? ''} maxLength={200} placeholder="What is this branch for?" aria-label={`Purpose of ${branch.name}`} />
                <Button type="submit" variant="outline" size="sm">
                  Save
                </Button>
              </form>
            </div>
          ))}
        </div>
      ) : (
        <Empty text={`Active branch: ${project.activeBranch || 'none recorded'}. Branches appear here after the first GitHub sync.`} />
      )}
    </Panel>
  );
}
