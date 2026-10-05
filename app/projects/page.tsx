import Link from 'next/link';
import { Plus } from 'lucide-react';
import { requireUser } from '@/app/auth';
import { AppShell } from '@/components/project-hub/app-shell';
import { ProjectExplorer } from '@/components/project-hub/project-explorer';
import { getProjectsForOwner } from '@/lib/project-data';

export const dynamic = 'force-dynamic';

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser();
  const [projects, query] = await Promise.all([getProjectsForOwner(user.userId), searchParams.then((params) => params.q ?? '')]);
  return (
    <AppShell active="projects" user={user} projectCount={projects.length}>
      <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="mb-6 flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Portfolio</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">All projects</h1><p className="mt-2 text-sm text-muted-foreground">Search and filter every project field without duplicating source data.</p></div><Link href="/projects/new" className="hidden h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground sm:inline-flex"><Plus className="size-4" /> Add project</Link></div>
        <ProjectExplorer projects={projects} initialQuery={query} />
      </main>
    </AppShell>
  );
}
