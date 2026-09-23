'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import type { ProjectSummary } from '@/lib/project-data';
import { PROJECT_PRIORITIES, PROJECT_STAGES, prettyLabel } from '@/lib/project-hub';
import { ProjectCard } from '@/components/project-hub/project-card';

export function ProjectExplorer({ projects, initialQuery = '' }: { projects: ProjectSummary[]; initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [stage, setStage] = useState('ALL');
  const [priority, setPriority] = useState('ALL');
  const [provider, setProvider] = useState('ALL');
  const [category, setCategory] = useState('ALL');

  const aiProviders = [...new Set(projects.map((project) => project.aiProvider).filter(Boolean))] as string[];
  const categories = [...new Set(projects.map((project) => project.category).filter(Boolean))];
  useEffect(() => {
    type FilterInput = { query?: string; stage?: string; priority?: string };
    type ModelContext = { registerTool: (tool: { name: string; title: string; description: string; inputSchema: object; annotations: { readOnlyHint: boolean; untrustedContentHint: boolean }; execute: (input: unknown) => unknown }, options?: { signal?: AbortSignal }) => void | Promise<void> };
    const context = (document as Document & { modelContext?: ModelContext }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const allowedStages = new Set(['ALL', ...PROJECT_STAGES]);
    const allowedPriorities = new Set(['ALL', ...PROJECT_PRIORITIES]);

    void Promise.resolve(context.registerTool({
      name: 'filter_projects',
      title: 'Filter projects',
      description: 'Filter the visible Project Hub portfolio by search text, lifecycle stage, or priority and return the matching project names.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Text to find in project names, objectives, repositories, providers, or next actions.' },
          stage: { type: 'string', enum: ['ALL', ...PROJECT_STAGES] },
          priority: { type: 'string', enum: ['ALL', ...PROJECT_PRIORITIES] },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute(input) {
        if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Input must be an object.');
        const value = input as FilterInput;
        if (value.query !== undefined && typeof value.query !== 'string') throw new Error('query must be a string.');
        if (value.stage !== undefined && !allowedStages.has(value.stage)) throw new Error('stage is not valid.');
        if (value.priority !== undefined && !allowedPriorities.has(value.priority)) throw new Error('priority is not valid.');
        const nextQuery = value.query ?? '';
        const nextStage = value.stage ?? 'ALL';
        const nextPriority = value.priority ?? 'ALL';
        setQuery(nextQuery);
        setStage(nextStage);
        setPriority(nextPriority);
        setProvider('ALL');
        setCategory('ALL');
        const needle = nextQuery.trim().toLowerCase();
        const matches = projects.filter((project) => {
          const haystack = [project.name, project.businessObjective, project.repositoryFullName, project.nextAction, project.aiProvider, project.databaseProvider, project.deploymentProvider].filter(Boolean).join(' ').toLowerCase();
          return (!needle || haystack.includes(needle)) && (nextStage === 'ALL' || project.stage === nextStage) && (nextPriority === 'ALL' || project.priority === nextPriority);
        });
        return { matched: matches.length, projects: matches.map((project) => project.name) };
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);

    return () => lifecycle.abort();
  }, [projects]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return projects.filter((project) => {
      const haystack = [project.name, project.businessObjective, project.repositoryFullName, project.nextAction, project.aiProvider, project.databaseProvider, project.deploymentProvider].filter(Boolean).join(' ').toLowerCase();
      return (!needle || haystack.includes(needle)) && (stage === 'ALL' || project.stage === stage) && (priority === 'ALL' || project.priority === priority) && (provider === 'ALL' || project.aiProvider === provider) && (category === 'ALL' || project.category === category);
    });
  }, [projects, query, stage, priority, provider, category]);

  return (
    <>
      <div className="mb-5 grid gap-2 rounded-xl border border-border bg-card p-3 md:grid-cols-[minmax(220px,1fr)_repeat(4,auto)]">
        <div className="relative"><Search className="absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} className="h-9 pl-9" placeholder="Search every project field…" /></div>
        <NativeSelect className="w-full md:w-40" value={stage} onChange={(event) => setStage(event.target.value)} aria-label="Filter by stage"><NativeSelectOption value="ALL">All stages</NativeSelectOption>{PROJECT_STAGES.map((value) => <NativeSelectOption key={value} value={value}>{prettyLabel(value)}</NativeSelectOption>)}</NativeSelect>
        <NativeSelect className="w-full md:w-36" value={priority} onChange={(event) => setPriority(event.target.value)} aria-label="Filter by priority"><NativeSelectOption value="ALL">All priorities</NativeSelectOption>{PROJECT_PRIORITIES.map((value) => <NativeSelectOption key={value} value={value}>{prettyLabel(value)}</NativeSelectOption>)}</NativeSelect>
        <NativeSelect className="w-full md:w-42" value={provider} onChange={(event) => setProvider(event.target.value)} aria-label="Filter by AI provider"><NativeSelectOption value="ALL">All AI providers</NativeSelectOption>{aiProviders.map((value) => <NativeSelectOption key={value} value={value}>{value}</NativeSelectOption>)}</NativeSelect>
        <NativeSelect className="w-full md:w-40" value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filter by category"><NativeSelectOption value="ALL">All categories</NativeSelectOption>{categories.map((value) => <NativeSelectOption key={value} value={value}>{value}</NativeSelectOption>)}</NativeSelect>
      </div>
      {filtered.length ? <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{filtered.map((project) => <ProjectCard key={project.id} project={project} />)}</div> : <div className="rounded-2xl border border-dashed border-border px-6 py-16 text-center"><p className="font-medium">No projects match these filters.</p><p className="mt-1 text-sm text-muted-foreground">Try clearing a filter or search term.</p></div>}
    </>
  );
}
