import { FolderGit2, RefreshCw, ShieldCheck } from 'lucide-react';
import { requireChatGPTUser } from '@/app/chatgpt-auth';
import { AppShell } from '@/components/project-hub/app-shell';
import { Badge } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';

export default async function IntegrationsPage() {
  const user = await requireChatGPTUser('/integrations');
  return <AppShell active="integrations" user={user}><main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Connections</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">Integrations</h1><p className="mt-2 text-sm text-muted-foreground">Phase 1 stores links and configuration metadata. Live synchronization is deliberately isolated for Phase 2.</p><section className="mt-7 rounded-2xl border border-border bg-card p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div className="flex gap-4"><div className="grid size-11 place-items-center rounded-xl bg-secondary"><FolderGit2 /></div><div><div className="flex items-center gap-2"><h2 className="font-semibold">GitHub</h2><Badge variant="outline">Ready for Phase 2</Badge></div><p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">A GitHub App will provide repository discovery, branch status, commits, pull requests, issues, Actions health, and installation-scoped permissions.</p></div></div></div><div className="mt-6 grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-border p-4"><ShieldCheck className="size-5 text-primary" /><p className="mt-3 text-sm font-medium">Least privilege</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Tokens stay server-side and repository access is installation-scoped.</p></div><div className="rounded-xl border border-border p-4"><RefreshCw className="size-5 text-primary" /><p className="mt-3 text-sm font-medium">Sync, don’t duplicate</p><p className="mt-1 text-xs leading-5 text-muted-foreground">GitHub remains authoritative for repository-native facts.</p></div></div></section></main></AppShell>;
}
