import Link from 'next/link';
import { Activity } from 'lucide-react';
import { requireChatGPTUser } from '@/app/chatgpt-auth';
import { AppShell } from '@/components/project-hub/app-shell';
import { getProjectsForOwner, getRecentActivity } from '@/lib/project-data';
import { prettyLabel } from '@/lib/project-hub';

export const dynamic = 'force-dynamic';

export default async function ActivityPage() {
  const user = await requireChatGPTUser('/activity');
  const [activity, projects] = await Promise.all([getRecentActivity(user.userId), getProjectsForOwner(user.userId)]);
  return <AppShell active="activity" user={user} projectCount={projects.length}><main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Timeline</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">Project activity</h1><div className="mt-7 rounded-2xl border border-border bg-card p-3">{activity.length ? activity.map(({ activity: item, project }) => <Link href={`/projects/${project.slug}?tab=activity`} key={item.id} className="flex gap-4 rounded-xl px-3 py-4 hover:bg-secondary"><div className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><Activity className="size-4" /></div><div><p className="text-sm font-medium">{item.summary}</p><p className="mt-1 text-xs text-muted-foreground">{project.name} · {prettyLabel(item.eventType)} · {item.createdAt.toLocaleString()}</p></div></Link>) : <p className="py-14 text-center text-sm text-muted-foreground">Project changes will appear here.</p>}</div></main></AppShell>;
}
