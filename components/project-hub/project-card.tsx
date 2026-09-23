import Link from 'next/link';
import { ArrowUpRight, ExternalLink, FolderGit2, GitBranch } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { ProjectSummary } from '@/lib/project-data';
import { prettyLabel } from '@/lib/project-hub';

const healthStyles: Record<string, string> = {
  HEALTHY: 'border-emerald-400/20 bg-emerald-400/5 text-emerald-300',
  NEEDS_ATTENTION: 'border-amber-400/20 bg-amber-400/5 text-amber-300',
  BLOCKED: 'border-rose-400/20 bg-rose-400/5 text-rose-300',
  STALE: 'border-stone-400/20 bg-stone-400/5 text-stone-300',
  BROKEN: 'border-rose-400/20 bg-rose-400/5 text-rose-300',
  DEPLOYMENT_ISSUE: 'border-orange-400/20 bg-orange-400/5 text-orange-300',
  MISSING_CONFIGURATION: 'border-amber-400/20 bg-amber-400/5 text-amber-300',
};

export function ProjectCard({ project }: { project: ProjectSummary }) {
  return (
    <Card className="relative h-full border-0 bg-card shadow-none ring-border transition duration-200 hover:-translate-y-0.5 hover:ring-primary/35">
      <CardHeader className="gap-3 border-b border-border pb-4">
        <div className="flex items-start justify-between gap-3"><div className="grid size-10 place-items-center rounded-xl border border-border bg-secondary font-mono text-sm font-semibold text-primary">{project.name.slice(0, 2).toUpperCase()}</div><ArrowUpRight className="size-4 text-muted-foreground" /></div>
        <div><CardTitle className="text-base font-semibold"><Link href={`/projects/${project.slug}`} className="after:absolute after:inset-0">{project.name}</Link></CardTitle><p className="mt-1 line-clamp-2 min-h-10 text-xs leading-5 text-muted-foreground">{project.businessObjective}</p></div>
        <div className="flex flex-wrap gap-1.5"><Badge className="bg-sky-400/10 text-sky-300">{project.stage}</Badge><Badge variant="outline" className={healthStyles[project.health] ?? healthStyles.HEALTHY}>{prettyLabel(project.health)}</Badge><Badge variant="outline" className="border-border text-muted-foreground">{project.priority}</Badge></div>
      </CardHeader>
      <CardContent className="relative space-y-4 pt-1">
        <div><div className="mb-2 flex items-center justify-between text-xs"><span className="text-muted-foreground">Overall progress</span><span className="font-mono font-semibold">{project.progress.Overall}%</span></div><Progress value={project.progress.Overall} className="[&_[data-slot=progress-indicator]]:bg-primary [&_[data-slot=progress-track]]:h-1.5" /></div>
        <div className="space-y-2 text-xs">
          <div className="flex items-center gap-2 text-muted-foreground"><FolderGit2 className="size-3.5" /><span className="truncate">{project.repositoryFullName || 'No repository linked'}</span></div>
          <div className="flex items-center gap-2 text-muted-foreground"><GitBranch className="size-3.5" /><span className="truncate">{project.activeBranch || 'No active branch'}</span></div>
        </div>
        <div className="rounded-xl border border-primary/15 bg-primary/[.06] p-3"><p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">Next action</p><p className="text-xs font-medium leading-5">{project.recommendedNextAction}</p></div>
        <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground"><span>{project.aiProvider || 'No AI provider'} · {project.databaseProvider || 'No database'}</span>{project.productionUrl ? <a href={project.productionUrl} target="_blank" rel="noreferrer" className="relative z-10 inline-flex items-center gap-1 hover:text-primary">Production <ExternalLink className="size-3" /></a> : null}</div>
      </CardContent>
    </Card>
  );
}
