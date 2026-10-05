import { KeyRound, ShieldCheck } from 'lucide-react';
import { requireUser } from '@/app/auth';
import { AppShell } from '@/components/project-hub/app-shell';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const user = await requireUser();
  return <AppShell active="settings" user={user}><main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Workspace</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">Security & preferences</h1><section className="mt-7 space-y-3"><div className="rounded-2xl border border-border bg-card p-5"><div className="flex gap-3"><ShieldCheck className="size-5 text-primary" /><div><h2 className="font-medium">Private authenticated workspace</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">Every server read and write is scoped to your authenticated user ID. The deployed site is private.</p></div></div></div><div className="rounded-2xl border border-border bg-card p-5"><div className="flex gap-3"><KeyRound className="size-5 text-primary" /><div><h2 className="font-medium">Secret-safe inventory</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">Project Hub stores only required secret names and configured/missing status. Secret values stay with the deployment provider or secret manager.</p></div></div></div></section></main></AppShell>;
}
