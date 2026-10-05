import { requireUser } from '@/app/auth';
import { AppShell } from '@/components/project-hub/app-shell';
import { ProjectWizard } from '@/components/project-hub/project-wizard';

export const dynamic = 'force-dynamic';

export default async function NewProjectPage() {
  const user = await requireUser();
  return (
    <AppShell active="projects" user={user}>
      <main className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto mb-6 max-w-4xl"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">New workspace</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">Add a project</h1><p className="mt-2 text-sm text-muted-foreground">Capture what matters now. GitHub synchronization can enrich it later.</p></div>
        <ProjectWizard />
      </main>
    </AppShell>
  );
}
