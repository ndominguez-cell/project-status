import type { checklistItems, projects } from '@/db/schema';

export const PROJECT_STAGES = [
  'IDEA',
  'PLANNING',
  'SETUP',
  'BUILDING',
  'TESTING',
  'DEPLOYED',
  'MAINTENANCE',
  'PAUSED',
  'ARCHIVED',
] as const;

export const PROJECT_HEALTH = [
  'HEALTHY',
  'NEEDS_ATTENTION',
  'BLOCKED',
  'STALE',
  'BROKEN',
  'DEPLOYMENT_ISSUE',
  'MISSING_CONFIGURATION',
] as const;

export const PROJECT_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export const PROGRESS_CATEGORIES = ['Planning', 'Development', 'Infrastructure', 'Deployment', 'Testing', 'Documentation'] as const;

export type ProjectStage = (typeof PROJECT_STAGES)[number];
export type ProjectHealth = (typeof PROJECT_HEALTH)[number];
export type ProjectPriority = (typeof PROJECT_PRIORITIES)[number];
export type ProjectRecord = typeof projects.$inferSelect;
export type ChecklistItemRecord = typeof checklistItems.$inferSelect;

export const DEFAULT_CHECKLIST: ReadonlyArray<{ category: (typeof PROGRESS_CATEGORIES)[number]; label: string }> = [
  { category: 'Planning', label: 'Project name confirmed' },
  { category: 'Planning', label: 'Business objective documented' },
  { category: 'Planning', label: 'Problem being solved documented' },
  { category: 'Planning', label: 'Target user identified' },
  { category: 'Planning', label: 'Core features defined' },
  { category: 'Planning', label: 'MVP scope defined' },
  { category: 'Development', label: 'Primary AI provider selected' },
  { category: 'Development', label: 'Development environment selected' },
  { category: 'Development', label: 'Coding assistant selected' },
  { category: 'Development', label: 'Local environment configured' },
  { category: 'Development', label: 'GitHub repository created' },
  { category: 'Development', label: 'Repository linked to Project Hub' },
  { category: 'Development', label: 'README created' },
  { category: 'Development', label: 'Main branch confirmed' },
  { category: 'Development', label: 'Development branch created if required' },
  { category: 'Development', label: 'Branch strategy documented' },
  { category: 'Development', label: '.gitignore configured' },
  { category: 'Development', label: 'Initial commit completed' },
  { category: 'Infrastructure', label: 'Required APIs identified' },
  { category: 'Infrastructure', label: 'API accounts created' },
  { category: 'Infrastructure', label: 'API keys generated' },
  { category: 'Infrastructure', label: '.env created' },
  { category: 'Infrastructure', label: '.env excluded from Git' },
  { category: 'Infrastructure', label: '.env.example created' },
  { category: 'Infrastructure', label: 'Production secrets configured' },
  { category: 'Infrastructure', label: 'Database requirement decided' },
  { category: 'Infrastructure', label: 'Database provider selected' },
  { category: 'Infrastructure', label: 'Database created' },
  { category: 'Infrastructure', label: 'Schema created' },
  { category: 'Infrastructure', label: 'Database credentials configured' },
  { category: 'Infrastructure', label: 'Migration strategy created' },
  { category: 'Deployment', label: 'Deployment provider selected' },
  { category: 'Deployment', label: 'Production project created' },
  { category: 'Deployment', label: 'Environment variables configured' },
  { category: 'Deployment', label: 'Build tested' },
  { category: 'Deployment', label: 'Deployment successful' },
  { category: 'Deployment', label: 'Production URL saved' },
  { category: 'Deployment', label: 'Domain configured if needed' },
  { category: 'Testing', label: 'Application starts correctly' },
  { category: 'Testing', label: 'Core workflow tested' },
  { category: 'Testing', label: 'API connections tested' },
  { category: 'Testing', label: 'Database connections tested' },
  { category: 'Testing', label: 'Error handling tested' },
  { category: 'Testing', label: 'Mobile interface tested' },
  { category: 'Testing', label: 'Production deployment tested' },
  { category: 'Documentation', label: 'README updated' },
  { category: 'Documentation', label: 'Setup instructions documented' },
  { category: 'Documentation', label: 'Deployment instructions documented' },
  { category: 'Documentation', label: 'Environment variables documented' },
  { category: 'Documentation', label: 'Architecture documented' },
  { category: 'Documentation', label: 'Known issues documented' },
  { category: 'Documentation', label: 'Next steps documented' },
];

export type ProgressBreakdown = Record<(typeof PROGRESS_CATEGORIES)[number], number> & { Overall: number };

export function calculateProgress(items: ChecklistItemRecord[]): ProgressBreakdown {
  const progress = Object.fromEntries(PROGRESS_CATEGORIES.map((category) => [category, 0])) as Omit<ProgressBreakdown, 'Overall'>;

  for (const category of PROGRESS_CATEGORIES) {
    const categoryItems = items.filter((item) => item.category === category);
    const completed = categoryItems.filter((item) => item.completed).length;
    progress[category] = categoryItems.length ? Math.round((completed / categoryItems.length) * 100) : 0;
  }

  const completed = items.filter((item) => item.completed).length;
  return { ...progress, Overall: items.length ? Math.round((completed / items.length) * 100) : 0 };
}

export function recommendedNextAction(project: ProjectRecord, items: ChecklistItemRecord[]) {
  if (project.nextAction?.trim()) return project.nextAction;
  const nextItem = [...items].sort((a, b) => a.sortOrder - b.sortOrder).find((item) => !item.completed);
  return nextItem ? nextItem.label : 'Review the project and define the next milestone';
}

export function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 72) || 'project';
}

export function prettyLabel(value: string) {
  return value.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
