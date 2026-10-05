import Link from 'next/link';
import { Archive, ArrowRight, Boxes } from 'lucide-react';
import { changeProjectStage } from '@/app/actions';
import { requireUser } from '@/app/auth';
import { AppShell } from '@/components/project-hub/app-shell';
import { Button } from '@/components/ui/button';
import { getProjectsForOwner, getStashedProjects } from '@/lib/project-data';

export const dynamic = 'force-dynamic';

export default async function StashPage() {
  const user = await requireUser();
  const [stashed, allProjects] = await Promise.all([getStashedProjects(user.userId), getProjectsForOwner(user.userId)]);
  return (
    <AppShell active="stash" user={user} projectCount={allProjects.length}>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="mb-7"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Project stash</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">Paused, not forgotten.</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Every paused project keeps its context, progress, reason, and next action so you can resume without reconstructing the past.</p></div>
        {stashed.length ? <div className="space-y-3">{stashed.map((project) => <article key={project.id} className="grid gap-5 rounded-2xl border border-border bg-card p-5 md:grid-cols-[1.2fr_.65fr_.8fr_auto] md:items-center"><div><div className="flex items-center gap-2"><Boxes className="size-4 text-primary" /><Link href={`/projects/${project.slug}`} className="font-semibold hover:text-primary">{project.name}</Link></div><p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{project.pausedReason || 'No pause reason recorded.'}</p></div><div><p className="label-mini">Progress</p><p className="mt-1 font-mono text-lg font-semibold">{project.progress.Overall}%</p><p className="text-xs text-muted-foreground">{project.stage}</p></div><div><p className="label-mini">Next action</p><p className="mt-1 text-xs leading-5">{project.recommendedNextAction}</p></div><div className="flex gap-2 md:flex-col"><form action={changeProjectStage}><input type="hidden" name="projectId" value={project.id} /><input type="hidden" name="slug" value={project.slug} /><input type="hidden" name="stage" value="BUILDING" /><Button type="submit" className="w-full">Resume <ArrowRight /></Button></form><form action={changeProjectStage}><input type="hidden" name="projectId" value={project.id} /><input type="hidden" name="slug" value={project.slug} /><input type="hidden" name="stage" value="ARCHIVED" /><Button type="submit" variant="outline" className="w-full"><Archive /> Archive</Button></form></div></article>)}</div> : <div className="rounded-2xl border border-dashed border-border bg-card/40 px-6 py-16 text-center"><Boxes className="mx-auto size-8 text-primary" /><h2 className="mt-4 text-lg font-semibold">Your stash is empty</h2><p className="mt-1 text-sm text-muted-foreground">Pause any project from its detail page when you need to set it aside.</p></div>}
      </main>
    </AppShell>
  );
}
