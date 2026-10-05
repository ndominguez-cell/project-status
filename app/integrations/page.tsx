import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { ExternalLink, FolderGit2, RefreshCw, ShieldCheck, Webhook } from 'lucide-react';
import { requireUser } from '@/app/auth';
import { connectGitHub, setGitHubRepositoryDecision, syncGitHubNow, trackGitHubRepository } from '@/app/github-actions';
import { AppShell } from '@/components/project-hub/app-shell';
import { Data, Empty, Notice, Panel } from '@/components/project-hub/panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { readGitHubConfig } from '@/lib/github/config';
import { getGitHubOverview } from '@/lib/github/queries';
import { TRACK_CATEGORIES, TRACK_PRIORITIES } from '@/lib/github/track';
import { prettyLabel } from '@/lib/project-hub';

export const dynamic = 'force-dynamic';

type PageProps = { searchParams: Promise<{ notice?: string; kind?: string }> };

const WEBHOOK_EVENTS = ['push', 'create', 'delete', 'pull_request', 'issues', 'workflow_run', 'repository', 'installation', 'installation_repositories'];
const GOOD = 'bg-emerald-400/10 text-emerald-300';
const BAD = 'bg-red-400/10 text-red-300';

function ago(value: Date | null | undefined) {
  if (!value) return 'never';
  const minutes = Math.floor((Date.now() - value.getTime()) / 60_000);
  if (minutes < 2) return 'just now';
  if (minutes < 120) return `${minutes}m ago`;
  if (minutes < 2880) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}

export default async function IntegrationsPage({ searchParams }: PageProps) {
  const user = await requireUser();
  const query = await searchParams;
  const config = readGitHubConfig(env);
  const { installations, repositories } = config ? await getGitHubOverview(user.userId) : { installations: [], repositories: [] };

  const tracked = repositories.filter((row) => row.project);
  const pending = repositories.filter((row) => !row.project && row.repository.decision === 'PENDING');
  const ignored = repositories.filter((row) => !row.project && row.repository.decision === 'IGNORED');
  const siteUrl = (process.env.PUBLIC_SITE_URL || '').replace(/\/$/, '');
  const notice = query.notice ? { message: query.notice.slice(0, 280), tone: query.kind === 'error' ? ('error' as const) : ('ok' as const) } : null;

  return (
    <AppShell active="integrations" user={user}>
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Connections</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">Integrations</h1>
        <p className="mt-2 text-sm text-muted-foreground">GitHub stays the source of truth for repository facts. Project Hub syncs a read-only cache and never overwrites the fields you own.</p>
        {notice ? <Notice tone={notice.tone}>{notice.message}</Notice> : null}

        <div className="mt-7 space-y-4">
          <Panel title="GitHub App" description="Least-privilege, read-only access: repository metadata, contents, pull requests, issues, and Actions.">
            <dl className="data-grid">
              <Data label="Status" value={config ? (installations.length ? 'Connected' : 'Configured, not installed') : 'Not configured'} />
              <Data label="Installations" value={installations.length ? installations.map((installation) => `${installation.accountLogin}${installation.suspendedAt ? ' (suspended)' : ''}`).join(', ') : 'None'} />
              <Data label="Repositories visible" value={String(repositories.length)} />
            </dl>

            {config ? (
              <>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <form action={connectGitHub}>
                    <Button type="submit" size="sm">
                      <RefreshCw /> Refresh connection
                    </Button>
                  </form>
                  <form action={syncGitHubNow}>
                    <Button type="submit" variant="outline" size="sm">
                      Sync stalest projects
                    </Button>
                  </form>
                  {config.appSlug ? (
                    <a href={`https://github.com/apps/${encodeURIComponent(config.appSlug)}/installations/new`} target="_blank" rel="noreferrer" className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[0.8rem] font-medium hover:border-primary/40">
                      Install or configure on GitHub <ExternalLink className="size-3" />
                    </a>
                  ) : null}
                </div>
                <div className="mt-5 rounded-xl border border-border p-4 text-sm">
                  <p className="flex items-center gap-2 font-medium">
                    <Webhook className="size-4 text-primary" /> Webhook
                  </p>
                  <p className="mt-2 break-all font-mono text-xs text-muted-foreground">{siteUrl || '<your site>'}/api/github/webhook</p>
                  <p className="mt-2 text-xs leading-6 text-muted-foreground">
                    Subscribe the app to: {WEBHOOK_EVENTS.join(', ')}. Every delivery is verified with the webhook secret before anything is written. A scheduled job also reconciles the stalest projects every 15 minutes.
                  </p>
                </div>
              </>
            ) : (
              <Notice>
                <p className="flex items-center gap-2 font-medium text-foreground">
                  <ShieldCheck className="size-4 text-primary" /> Setup required
                </p>
                <ol className="mt-2 list-decimal space-y-1 pl-5">
                  <li>Create a private GitHub App with read-only permissions (see <code>docs/GITHUB_APP_SETUP.md</code> in the repository).</li>
                  <li>
                    Store its secrets on the Worker: <code>GITHUB_APP_ID</code>, <code>GITHUB_APP_PRIVATE_KEY</code>, and <code>GITHUB_WEBHOOK_SECRET</code> (<code>wrangler secret put</code>).
                  </li>
                  <li>
                    Set <code>GITHUB_APP_SLUG</code> in <code>wrangler.jsonc</code>, deploy, install the app on your repositories, then come back and press Refresh connection.
                  </li>
                </ol>
              </Notice>
            )}
          </Panel>

          {config ? (
            <>
              <Panel title="Tracked repositories" description="Linked to a Project Hub project and kept in sync by webhooks and the 15-minute reconciliation.">
                {tracked.length ? (
                  <div className="space-y-2">
                    {tracked.map(({ repository, project, integration }) => (
                      <div key={repository.repoId} className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-4 text-sm">
                        <FolderGit2 className="size-4 text-primary" />
                        <Link href={`/projects/${project!.slug}?tab=github`} className="font-medium hover:underline">
                          {project!.name}
                        </Link>
                        <span className="font-mono text-xs text-muted-foreground">{repository.fullName}</span>
                        <Badge className={integration?.status === 'CONNECTED' ? GOOD : integration?.status === 'ERROR' ? BAD : undefined} variant={integration ? 'default' : 'outline'}>
                          {integration ? prettyLabel(integration.status) : 'Not synced'}
                        </Badge>
                        <span className="text-xs text-muted-foreground sm:ml-auto">synced {ago(integration?.lastSyncedAt)}</span>
                        {integration?.syncError ? <p className="w-full text-xs text-red-300">{integration.syncError}</p> : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty text="No tracked repositories yet. Existing projects link automatically by repository name after you refresh the connection." />
                )}
              </Panel>

              <Panel title="Needs a decision" description="Repositories the app can see that are not projects yet. Track one to create a project, or ignore it.">
                {pending.length ? (
                  <div className="space-y-2">
                    {pending.map(({ repository }) => (
                      <div key={repository.repoId} className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-4 text-sm">
                        <span className="font-mono text-xs">{repository.fullName}</span>
                        <Badge variant="outline">{repository.isPrivate ? 'Private' : 'Public'}</Badge>
                        {repository.isArchived ? <Badge variant="outline">Archived</Badge> : null}
                        <form action={trackGitHubRepository} className="flex flex-wrap items-center gap-2 sm:ml-auto">
                          <input type="hidden" name="repoId" value={repository.repoId} />
                          <NativeSelect name="category" defaultValue="Experiment" aria-label={`Category for ${repository.fullName}`}>
                            {TRACK_CATEGORIES.map((category) => (
                              <NativeSelectOption key={category}>{category}</NativeSelectOption>
                            ))}
                          </NativeSelect>
                          <NativeSelect name="priority" defaultValue="MEDIUM" aria-label={`Priority for ${repository.fullName}`}>
                            {TRACK_PRIORITIES.map((priority) => (
                              <NativeSelectOption key={priority} value={priority}>
                                {prettyLabel(priority)}
                              </NativeSelectOption>
                            ))}
                          </NativeSelect>
                          <Button type="submit" size="sm">
                            Track
                          </Button>
                        </form>
                        <form action={setGitHubRepositoryDecision}>
                          <input type="hidden" name="repoId" value={repository.repoId} />
                          <input type="hidden" name="decision" value="IGNORED" />
                          <Button type="submit" variant="outline" size="sm">
                            Ignore
                          </Button>
                        </form>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty text="Nothing waiting. Every repository the app can see is tracked or ignored." />
                )}
              </Panel>

              {ignored.length ? (
                <Panel title="Ignored" description="Hidden from the review list. Restore any of them at any time.">
                  <div className="space-y-2">
                    {ignored.map(({ repository }) => (
                      <div key={repository.repoId} className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-4 text-sm">
                        <span className="font-mono text-xs text-muted-foreground">{repository.fullName}</span>
                        <form action={setGitHubRepositoryDecision} className="sm:ml-auto">
                          <input type="hidden" name="repoId" value={repository.repoId} />
                          <input type="hidden" name="decision" value="PENDING" />
                          <Button type="submit" variant="outline" size="sm">
                            Restore
                          </Button>
                        </form>
                      </div>
                    ))}
                  </div>
                </Panel>
              ) : null}
            </>
          ) : null}

          <Panel title="Deployment providers" description="Vercel, Cloudflare, Render, and other providers arrive in Phase 3 with production health checks.">
            <Empty text="Deployment status is entered manually for now." />
          </Panel>
        </div>
      </main>
    </AppShell>
  );
}
