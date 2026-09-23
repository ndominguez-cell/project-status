import Link from 'next/link';
import { AlertTriangle, ArrowRight, Boxes, CircleCheck, Clock3, FolderKanban, GitPullRequest, Plus, Rocket, Settings2 } from 'lucide-react';
import { requireChatGPTUser } from '@/app/chatgpt-auth';
import { AppShell } from '@/components/project-hub/app-shell';
import { ProjectCard } from '@/components/project-hub/project-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getProjectsForOwner, getRecentActivity } from '@/lib/project-data';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = await requireChatGPTUser('/');
  const [projects, activity] = await Promise.all([getProjectsForOwner(user.userId), getRecentActivity(user.userId)]);
  const active = projects.filter((project) => ['PLANNING', 'SETUP', 'BUILDING', 'TESTING', 'MAINTENANCE'].includes(project.stage));
  const needsAttention = projects.filter((project) => project.health !== 'HEALTHY');
  const summary = [
    { label: 'Total projects', value: projects.length, icon: FolderKanban },
    { label: 'Active projects', value: active.length, icon: CircleCheck },
    { label: 'Deployed', value: projects.filter((project) => project.stage === 'DEPLOYED').length, icon: Rocket },
    { label: 'Need attention', value: needsAttention.length, icon: AlertTriangle, alert: needsAttention.length > 0 },
    { label: 'Stashed', value: projects.filter((project) => project.stage === 'PAUSED').length, icon: Boxes },
    { label: 'Stale', value: projects.filter((project) => project.health === 'STALE').length, icon: Clock3 },
    { label: 'Open pull requests', value: 0, icon: GitPullRequest, note: 'Phase 2 sync' },
    { label: 'Missing config', value: projects.filter((project) => project.health === 'MISSING_CONFIGURATION').length, icon: Settings2 },
  ];
  const priorityProjects = [...projects].sort((a, b) => {
    const weights: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
    return (weights[b.priority] ?? 0) - (weights[a.priority] ?? 0);
  }).slice(0, 6);

  return (
    <AppShell active="dashboard" user={user} projectCount={projects.length}>
      <main className="mx-auto max-w-[1500px] space-y-7 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div><div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground"><span className="size-2 rounded-full bg-emerald-400" /> Private workspace</div><h1 className="text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Your projects, in focus.</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">See what is moving, what needs attention, and the exact next step for every build.</p></div>
          <Link href="/projects/new" className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-medium hover:border-primary/40"><Plus className="size-4" /> Add a project</Link>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Project summary">
          {summary.map(({ label, value, icon: Icon, alert, note }) => (
            <Card key={label} className="border-0 bg-card shadow-none ring-border">
              <CardHeader className="flex-row items-center justify-between pb-1"><CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle><Icon className={alert ? 'size-4 text-amber-300' : 'size-4 text-muted-foreground'} /></CardHeader>
              <CardContent><div className="flex items-end justify-between gap-3"><p className="text-3xl font-semibold tracking-tight">{value}</p>{note ? <p className="text-[10px] text-muted-foreground">{note}</p> : null}</div></CardContent>
            </Card>
          ))}
        </section>

        {!projects.length ? (
          <section className="rounded-2xl border border-dashed border-border bg-card/40 px-6 py-16 text-center"><div className="mx-auto grid size-12 place-items-center rounded-xl bg-primary/10 text-primary"><FolderKanban /></div><h2 className="mt-4 text-xl font-semibold">Create your first project workspace</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">The wizard captures the project’s purpose, stack, repository, deployment, APIs, and generates its standard checklist.</p><Link href="/projects/new" className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">Start a project <ArrowRight className="size-4" /></Link></section>
        ) : (
          <section><div className="mb-4 flex items-end justify-between gap-3"><div><h2 className="text-lg font-semibold tracking-tight">Priority projects</h2><p className="text-xs text-muted-foreground">Ordered by priority and ready for action.</p></div><Link href="/projects" className="text-xs font-medium text-primary hover:underline">View all</Link></div><div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{priorityProjects.map((project) => <ProjectCard key={project.id} project={project} />)}</div></section>
        )}

        <section className="grid gap-4 xl:grid-cols-[1.3fr_.7fr]">
          <Card className="border-0 bg-card shadow-none ring-border"><CardHeader><CardTitle>Recent activity</CardTitle></CardHeader><CardContent className="space-y-1">{activity.length ? activity.slice(0, 6).map(({ activity: item, project }) => <Link href={`/projects/${project.slug}?tab=activity`} key={item.id} className="flex items-start gap-3 rounded-lg px-2 py-3 hover:bg-secondary"><span className="mt-1.5 size-2 rounded-full bg-primary" /><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{item.summary}</span><span className="block truncate text-xs text-muted-foreground">{project.name} · {item.createdAt.toLocaleDateString()}</span></span></Link>) : <p className="py-8 text-center text-sm text-muted-foreground">Activity appears as projects change.</p>}</CardContent></Card>
          <Card className="border-0 bg-card shadow-none ring-border"><CardHeader><CardTitle>Projects to resume</CardTitle></CardHeader><CardContent className="space-y-2">{projects.filter((project) => project.stage === 'PAUSED').slice(0, 4).map((project) => <Link href={`/projects/${project.slug}`} key={project.id} className="block rounded-xl border border-border p-3 hover:border-primary/30"><p className="text-sm font-medium">{project.name}</p><p className="mt-1 truncate text-xs text-muted-foreground">{project.recommendedNextAction}</p></Link>)}{!projects.some((project) => project.stage === 'PAUSED') ? <p className="py-8 text-center text-sm text-muted-foreground">No projects are currently stashed.</p> : null}</CardContent></Card>
        </section>
      </main>
    </AppShell>
  );
}
