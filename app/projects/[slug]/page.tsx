import type { Metadata } from 'next';
import Link from 'next/link';
import { Archive, ArrowLeft, Check, Circle, ExternalLink, FolderGit2, GitBranch, Pause, Play, Plus } from 'lucide-react';
import { addProjectNote, addProjectTask, changeProjectStage, toggleChecklistItem, toggleProjectTask, updateProject } from '@/app/actions';
import { getUser, requireUser } from '@/app/auth';
import { AppShell } from '@/components/project-hub/app-shell';
import { DeleteProjectButton } from '@/components/project-hub/delete-project-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BranchesPanel, GitHubPanel } from '@/components/project-hub/github-panels';
import { Data, Empty, Notice, Panel } from '@/components/project-hub/panel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { getProjectForOwner } from '@/lib/project-data';
import { PROGRESS_CATEGORIES, PROJECT_HEALTH, PROJECT_PRIORITIES, PROJECT_STAGES, prettyLabel } from '@/lib/project-hub';
import { cn } from '@/lib/utils';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

const tabs = ['overview', 'github', 'branches', 'checklist', 'deployment', 'environment', 'apis', 'database', 'documentation', 'tasks', 'activity', 'notes'] as const;

type PageProps = { params: Promise<{ slug: string }>; searchParams: Promise<{ tab?: string; notice?: string; kind?: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const user = await getUser();
  if (!user) return { title: 'Project', openGraph: { images: [] }, twitter: { images: [] } };
  const data = await getProjectForOwner(user.userId, slug);
  return {
    title: data?.project.name ?? 'Project',
    description: data?.project.businessObjective ?? 'Project workspace',
    openGraph: { title: data?.project.name ?? 'Project', description: data?.project.businessObjective ?? 'Project workspace', images: [] },
    twitter: { title: data?.project.name ?? 'Project', description: data?.project.businessObjective ?? 'Project workspace', images: [] },
  };
}

export default async function ProjectPage({ params, searchParams }: PageProps) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const tab = tabs.includes(query.tab as (typeof tabs)[number]) ? (query.tab as (typeof tabs)[number]) : 'overview';
  const notice = query.notice ? { message: query.notice.slice(0, 280), kind: query.kind === 'error' ? ('error' as const) : ('ok' as const) } : null;
  return <ProjectWorkspace slug={slug} tab={tab} notice={notice} />;
}

async function ProjectWorkspace({ slug, tab, notice }: { slug: string; tab: (typeof tabs)[number]; notice: { message: string; kind: 'ok' | 'error' } | null }) {
  const user = await requireUser();
  const data = await getProjectForOwner(user.userId, slug);
  if (!data) notFound();
  const { project } = data;

  return (
    <AppShell active="projects" user={user}>
      <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <Link href="/projects" className="mb-5 inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" /> All projects</Link>
        <header className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div><div className="flex flex-wrap items-center gap-2"><Badge className="bg-sky-400/10 text-sky-300">{project.stage}</Badge><Badge variant="outline">{prettyLabel(project.health)}</Badge><Badge variant="outline">{project.priority}</Badge></div><h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">{project.name}</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{project.businessObjective}</p></div>
          <div className="flex flex-wrap gap-2">
            {project.repositoryUrl ? <a href={project.repositoryUrl} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-medium hover:border-primary/40"><FolderGit2 className="size-4" /> GitHub <ExternalLink className="size-3" /></a> : null}
            {project.productionUrl ? <a href={project.productionUrl} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-medium hover:border-primary/40">Production <ExternalLink className="size-3" /></a> : null}
          </div>
        </header>

        <section className="mt-7 overflow-x-auto border-b border-border" aria-label="Project sections"><nav className="flex min-w-max gap-1">{tabs.map((value) => <Link key={value} href={`/projects/${slug}?tab=${value}`} className={cn('border-b-2 px-3 py-3 text-xs font-medium transition', tab === value ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>{prettyLabel(value)}</Link>)}</nav></section>

        <div className="mt-6">
          {tab === 'overview' ? <Overview data={data} /> : null}
          {notice ? <Notice tone={notice.kind}>{notice.message}</Notice> : null}
          {tab === 'github' ? <GitHubPanel project={data.project} /> : null}
          {tab === 'branches' ? <BranchesPanel project={data.project} branches={data.branches} /> : null}
          {tab === 'checklist' ? <ChecklistPanel data={data} /> : null}
          {tab === 'deployment' ? <DeploymentPanel data={data} /> : null}
          {tab === 'environment' ? <EnvironmentPanel data={data} /> : null}
          {tab === 'apis' ? <ApisPanel data={data} /> : null}
          {tab === 'database' ? <DatabasePanel data={data} /> : null}
          {tab === 'documentation' ? <DocumentationPanel data={data} /> : null}
          {tab === 'tasks' ? <TasksPanel data={data} /> : null}
          {tab === 'activity' ? <ActivityPanel data={data} /> : null}
          {tab === 'notes' ? <NotesPanel data={data} /> : null}
        </div>
      </main>
    </AppShell>
  );
}

function Overview({ data }: { data: NonNullable<Awaited<ReturnType<typeof getProjectForOwner>>> }) {
  const { project, progress } = data;
  return <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
    <div className="space-y-5">
      <Card className="border-0 bg-card shadow-none ring-border"><CardHeader><CardTitle>Progress engine</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{PROGRESS_CATEGORIES.map((category) => <div key={category} className="rounded-xl border border-border p-3"><div className="mb-2 flex items-center justify-between text-xs"><span className="text-muted-foreground">{category}</span><span className="font-mono font-semibold">{progress[category]}%</span></div><Progress value={progress[category]} className="[&_[data-slot=progress-indicator]]:bg-primary" /></div>)}</CardContent></Card>
      <Card className="border-0 bg-card shadow-none ring-border"><CardHeader><CardTitle>Edit project details</CardTitle></CardHeader><CardContent><form action={updateProject} className="grid gap-4 sm:grid-cols-2"><input type="hidden" name="projectId" value={project.id} /><input type="hidden" name="slug" value={project.slug} />
        <Field label="Business objective" name="businessObjective" defaultValue={project.businessObjective} textarea wide />
        <Field label="Business purpose" name="businessPurpose" defaultValue={project.businessPurpose} textarea wide />
        <SelectField label="Health" name="health" defaultValue={project.health} options={PROJECT_HEALTH} />
        <SelectField label="Priority" name="priority" defaultValue={project.priority} options={PROJECT_PRIORITIES} />
        <Field label="Next action" name="nextAction" defaultValue={project.nextAction} wide />
        <Field label="Development environment" name="developmentEnvironment" defaultValue={project.developmentEnvironment} />
        <Field label="AI provider" name="aiProvider" defaultValue={project.aiProvider} />
        <Field label="Database provider" name="databaseProvider" defaultValue={project.databaseProvider} />
        <Field label="Repository name" name="repositoryFullName" defaultValue={project.repositoryFullName} />
        <Field label="Repository URL" name="repositoryUrl" defaultValue={project.repositoryUrl} type="url" />
        <Field label="Default branch" name="defaultBranch" defaultValue={project.defaultBranch} />
        <Field label="Active branch" name="activeBranch" defaultValue={project.activeBranch} />
        <Field label="Deployment provider" name="deploymentProvider" defaultValue={project.deploymentProvider} />
        <SelectField label="Deployment status" name="deploymentStatus" defaultValue={project.deploymentStatus} options={['NOT_CONFIGURED', 'UNKNOWN', 'READY', 'BUILDING', 'FAILED']} />
        <Field label="Production URL" name="productionUrl" defaultValue={project.productionUrl} type="url" wide />
        <div className="sm:col-span-2"><Button type="submit">Save changes <Check /></Button></div>
      </form></CardContent></Card>
    </div>
    <aside className="space-y-5">
      <Card className="border-0 bg-primary/[.06] shadow-none ring-primary/20"><CardHeader><CardTitle className="text-primary">Next action</CardTitle></CardHeader><CardContent><p className="text-base font-medium leading-7">{data.recommendedNextAction}</p><p className="mt-3 text-xs leading-5 text-muted-foreground">Manual guidance takes precedence; otherwise the first incomplete checklist item is recommended.</p></CardContent></Card>
      <Card className="border-0 bg-card shadow-none ring-border"><CardHeader><CardTitle>Lifecycle</CardTitle></CardHeader><CardContent><div className="space-y-2">{PROJECT_STAGES.map((stage) => <div key={stage} className={cn('flex items-center gap-3 rounded-lg px-3 py-2 text-xs', stage === project.stage ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground')}><span className={cn('size-2 rounded-full', stage === project.stage ? 'bg-primary' : 'bg-border')} />{prettyLabel(stage)}</div>)}</div><form action={changeProjectStage} className="mt-4 space-y-3 border-t border-border pt-4"><input type="hidden" name="projectId" value={project.id} /><input type="hidden" name="slug" value={project.slug} /><Label htmlFor="stage-change">Move to stage</Label><NativeSelect id="stage-change" name="stage" defaultValue={project.stage} className="w-full">{PROJECT_STAGES.map((stage) => <NativeSelectOption key={stage} value={stage}>{prettyLabel(stage)}</NativeSelectOption>)}</NativeSelect><Input name="pausedReason" placeholder="Reason if pausing" /><Button type="submit" variant="outline" className="w-full">Update stage</Button></form></CardContent></Card>
      <Card className="border-0 bg-card shadow-none ring-border"><CardHeader><CardTitle>Quick actions</CardTitle></CardHeader><CardContent className="space-y-2"><form action={changeProjectStage}><input type="hidden" name="projectId" value={project.id} /><input type="hidden" name="slug" value={project.slug} /><input type="hidden" name="stage" value={project.stage === 'PAUSED' ? 'BUILDING' : 'PAUSED'} /><input type="hidden" name="pausedReason" value="Stashed from project workspace" /><Button type="submit" variant="outline" className="w-full">{project.stage === 'PAUSED' ? <><Play /> Resume project</> : <><Pause /> Stash project</>}</Button></form><form action={changeProjectStage}><input type="hidden" name="projectId" value={project.id} /><input type="hidden" name="slug" value={project.slug} /><input type="hidden" name="stage" value="ARCHIVED" /><Button type="submit" variant="outline" className="w-full"><Archive /> Archive project</Button></form><DeleteProjectButton projectId={project.id} projectName={project.name} /></CardContent></Card>
    </aside>
  </div>;
}

function ChecklistPanel({ data }: { data: NonNullable<Awaited<ReturnType<typeof getProjectForOwner>>> }) {
  return <div className="grid gap-4 lg:grid-cols-2">{PROGRESS_CATEGORIES.map((category) => { const items = data.checklist.filter((item) => item.category === category); return <Card key={category} className="border-0 bg-card shadow-none ring-border"><CardHeader className="flex-row items-center justify-between"><div><CardTitle>{category}</CardTitle><p className="mt-1 text-xs text-muted-foreground">{items.filter((item) => item.completed).length} of {items.length} complete</p></div><span className="font-mono text-sm font-semibold">{data.progress[category]}%</span></CardHeader><CardContent className="space-y-1">{items.map((item) => <form action={toggleChecklistItem} key={item.id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-secondary"><input type="hidden" name="itemId" value={item.id} /><input type="hidden" name="projectId" value={data.project.id} /><input type="hidden" name="slug" value={data.project.slug} /><input type="hidden" name="completed" value={String(!item.completed)} /><button type="submit" className={cn('grid size-5 shrink-0 place-items-center rounded-md border', item.completed ? 'border-primary bg-primary text-primary-foreground' : 'border-border')} aria-label={`${item.completed ? 'Mark incomplete' : 'Mark complete'}: ${item.label}`}>{item.completed ? <Check className="size-3.5" /> : null}</button><span className={cn('text-sm', item.completed && 'text-muted-foreground line-through')}>{item.label}</span></form>)}</CardContent></Card>; })}</div>;
}

function DeploymentPanel({ data }: PanelProps) { return <Panel title="Deployment" description="Manual deployment metadata now; monitoring integrations later."><dl className="data-grid"><Data label="Provider" value={data.project.deploymentProvider || 'Not selected'} /><Data label="Status" value={prettyLabel(data.project.deploymentStatus)} /><Data label="Production URL" value={data.project.productionUrl || 'Not configured'} /><Data label="Branch" value={data.project.defaultBranch || 'Not set'} /></dl>{data.deployments.map((deployment) => <div key={deployment.id} className="mt-4 rounded-xl border border-border p-4 text-sm">{deployment.provider} · {deployment.environment} · {prettyLabel(deployment.status)}</div>)}</Panel>; }
function EnvironmentPanel({ data }: PanelProps) { return <Panel title="Technology inventory" description="A concise map of the stack used to build and operate this project."><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{data.technologies.length ? data.technologies.map((technology) => <div key={`${technology.category}-${technology.name}`} className="rounded-xl border border-border p-4"><p className="label-mini">{technology.category}</p><p className="mt-2 text-sm font-medium">{technology.name}</p></div>) : <Empty text="No technology inventory has been recorded yet." />}</div></Panel>; }
function ApisPanel({ data }: PanelProps) { return <Panel title="APIs & secret requirements" description="Only secret names and configuration status are stored. Values never enter Project Hub.">{data.apiRequirements.length ? <div className="space-y-2">{data.apiRequirements.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4"><div><p className="text-sm font-medium">{item.name}</p><p className="mt-1 font-mono text-xs text-muted-foreground">{item.secretName || 'No secret required'} · {item.environment}</p></div><Badge className={item.configured ? 'bg-emerald-400/10 text-emerald-300' : 'bg-amber-400/10 text-amber-300'}>{item.configured ? 'CONFIGURED' : 'MISSING'}</Badge></div>)}</div> : <Empty text="No API requirements have been recorded." />}</Panel>; }
function DatabasePanel({ data }: PanelProps) { return <Panel title="Database" description="Database provider and readiness are tracked; credentials remain in a secret manager."><dl className="data-grid"><Data label="Provider" value={data.project.databaseProvider || 'No database selected'} /><Data label="Credentials" value="Never stored in Project Hub" /><Data label="Schema" value={`${data.checklist.find((item) => item.label === 'Schema created')?.completed ? 'Complete' : 'Not confirmed'}`} /><Data label="Migration strategy" value={`${data.checklist.find((item) => item.label === 'Migration strategy created')?.completed ? 'Complete' : 'Not confirmed'}`} /></dl></Panel>; }
function DocumentationPanel({ data }: PanelProps) { const docs = data.checklist.filter((item) => item.category === 'Documentation'); return <Panel title="Documentation readiness" description="Documentation progress comes directly from the checklist."><div className="space-y-2">{docs.map((item) => <div key={item.id} className="flex items-center gap-3 rounded-xl border border-border p-3">{item.completed ? <Check className="size-4 text-emerald-300" /> : <Circle className="size-4 text-muted-foreground" />}<span className="text-sm">{item.label}</span></div>)}</div></Panel>; }
function TasksPanel({ data }: PanelProps) { return <Panel title="Tasks & blockers" description="Track immediate work without replacing GitHub Issues."><form action={addProjectTask} className="mb-5 grid gap-2 sm:grid-cols-[1fr_140px_auto]"><input type="hidden" name="projectId" value={data.project.id} /><input type="hidden" name="slug" value={data.project.slug} /><Input name="title" required placeholder="Add a concrete task…" /><NativeSelect name="priority" defaultValue="MEDIUM" className="w-full"><NativeSelectOption>LOW</NativeSelectOption><NativeSelectOption>MEDIUM</NativeSelectOption><NativeSelectOption>HIGH</NativeSelectOption><NativeSelectOption>CRITICAL</NativeSelectOption></NativeSelect><Button type="submit"><Plus /> Add task</Button><label className="flex items-center gap-2 text-xs text-muted-foreground sm:col-span-3"><input type="checkbox" name="isBlocker" /> This task blocks the project</label></form><div className="space-y-2">{data.tasks.map((task) => <form action={toggleProjectTask} key={task.id} className="flex items-center gap-3 rounded-xl border border-border p-3"><input type="hidden" name="projectId" value={data.project.id} /><input type="hidden" name="slug" value={data.project.slug} /><input type="hidden" name="taskId" value={task.id} /><input type="hidden" name="complete" value={String(task.status !== 'DONE')} /><button type="submit" className={cn('grid size-5 place-items-center rounded-md border', task.status === 'DONE' ? 'border-primary bg-primary text-primary-foreground' : 'border-border')}>{task.status === 'DONE' ? <Check className="size-3.5" /> : null}</button><span className={cn('flex-1 text-sm', task.status === 'DONE' && 'text-muted-foreground line-through')}>{task.title}</span>{task.isBlocker ? <Badge variant="destructive">BLOCKER</Badge> : <Badge variant="outline">{task.priority}</Badge>}</form>)}{!data.tasks.length ? <Empty text="No tasks recorded yet." /> : null}</div></Panel>; }
function ActivityPanel({ data }: PanelProps) { return <Panel title="Activity" description="Project Hub changes and GitHub events (pushes, pull requests, issues, and CI results) appear here."><div className="space-y-1">{data.activity.map((item) => <div key={item.id} className="flex gap-3 rounded-xl px-3 py-3 hover:bg-secondary"><span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" /><div><p className="text-sm font-medium">{item.summary}</p><p className="mt-1 text-xs text-muted-foreground">{prettyLabel(item.eventType)} · {item.createdAt.toLocaleString()}</p></div></div>)}{!data.activity.length ? <Empty text="No activity recorded yet." /> : null}</div></Panel>; }
function NotesPanel({ data }: PanelProps) { return <Panel title="Notes" description="Capture context you will need when returning later."><form action={addProjectNote} className="mb-5 space-y-3"><input type="hidden" name="projectId" value={data.project.id} /><input type="hidden" name="slug" value={data.project.slug} /><Textarea name="body" required rows={4} placeholder="Decision, context, known issue, or handoff note…" /><Button type="submit"><Plus /> Add note</Button></form><div className="space-y-3">{data.notes.map((note) => <article key={note.id} className="rounded-xl border border-border p-4"><p className="whitespace-pre-wrap text-sm leading-6">{note.body}</p><p className="mt-3 text-xs text-muted-foreground">{note.createdAt.toLocaleString()}</p></article>)}{!data.notes.length ? <Empty text="No notes yet." /> : null}</div></Panel>; }

type PanelProps = { data: NonNullable<Awaited<ReturnType<typeof getProjectForOwner>>> };
function Field({ label, name, defaultValue, textarea, wide, type = 'text' }: { label: string; name: string; defaultValue?: string | null; textarea?: boolean; wide?: boolean; type?: string }) { return <div className={cn('space-y-2', wide && 'sm:col-span-2')}><Label htmlFor={`field-${name}`}>{label}</Label>{textarea ? <Textarea id={`field-${name}`} name={name} defaultValue={defaultValue ?? ''} rows={3} /> : <Input id={`field-${name}`} name={name} type={type} defaultValue={defaultValue ?? ''} />}</div>; }
function SelectField({ label, name, defaultValue, options }: { label: string; name: string; defaultValue: string; options: readonly string[] }) { return <div className="space-y-2"><Label htmlFor={`field-${name}`}>{label}</Label><NativeSelect id={`field-${name}`} name={name} defaultValue={defaultValue} className="w-full">{options.map((option) => <NativeSelectOption key={option} value={option}>{prettyLabel(option)}</NativeSelectOption>)}</NativeSelect></div>; }
