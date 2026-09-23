import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { getDb } from '@/db';
import {
  checklistItems,
  projectActivity,
  projectApiRequirements,
  projectBranches,
  projectDeployments,
  projectNotes,
  projectTasks,
  projectTechnologies,
  projects,
} from '@/db/schema';
import { calculateProgress, recommendedNextAction, type ProjectRecord } from '@/lib/project-hub';

export type ProjectSummary = ProjectRecord & {
  progress: ReturnType<typeof calculateProgress>;
  recommendedNextAction: string;
};

async function withProgress(rows: ProjectRecord[]) {
  if (!rows.length) return [];
  const ids = rows.map((project) => project.id);
  const items = await getDb().select().from(checklistItems).where(inArray(checklistItems.projectId, ids));
  return rows.map((project) => {
    const projectItems = items.filter((item) => item.projectId === project.id);
    return {
      ...project,
      progress: calculateProgress(projectItems),
      recommendedNextAction: recommendedNextAction(project, projectItems),
    };
  });
}

export async function getProjectsForOwner(ownerId: string, includeArchived = false) {
  const filters = includeArchived
    ? eq(projects.ownerId, ownerId)
    : and(eq(projects.ownerId, ownerId), isNull(projects.archivedAt));
  const rows = await getDb().select().from(projects).where(filters).orderBy(desc(projects.updatedAt));
  return withProgress(rows);
}

export async function getStashedProjects(ownerId: string) {
  const rows = await getDb().select().from(projects).where(and(eq(projects.ownerId, ownerId), eq(projects.stage, 'PAUSED'), isNull(projects.archivedAt))).orderBy(desc(projects.stashedAt));
  return withProgress(rows);
}

export async function getProjectForOwner(ownerId: string, slug: string) {
  const [project] = await getDb().select().from(projects).where(and(eq(projects.ownerId, ownerId), eq(projects.slug, slug))).limit(1);
  if (!project) return null;

  const [items, technologies, deployments, requirements, branches, tasks, notes, activity] = await Promise.all([
    getDb().select().from(checklistItems).where(eq(checklistItems.projectId, project.id)).orderBy(checklistItems.sortOrder),
    getDb().select().from(projectTechnologies).where(eq(projectTechnologies.projectId, project.id)),
    getDb().select().from(projectDeployments).where(eq(projectDeployments.projectId, project.id)),
    getDb().select().from(projectApiRequirements).where(eq(projectApiRequirements.projectId, project.id)),
    getDb().select().from(projectBranches).where(eq(projectBranches.projectId, project.id)),
    getDb().select().from(projectTasks).where(eq(projectTasks.projectId, project.id)).orderBy(desc(projectTasks.createdAt)),
    getDb().select().from(projectNotes).where(eq(projectNotes.projectId, project.id)).orderBy(desc(projectNotes.createdAt)),
    getDb().select().from(projectActivity).where(eq(projectActivity.projectId, project.id)).orderBy(desc(projectActivity.createdAt)).limit(30),
  ]);

  return {
    project,
    checklist: items,
    technologies,
    deployments,
    apiRequirements: requirements,
    branches,
    tasks,
    notes,
    activity,
    progress: calculateProgress(items),
    recommendedNextAction: recommendedNextAction(project, items),
  };
}

export async function getRecentActivity(ownerId: string) {
  return getDb()
    .select({ activity: projectActivity, project: projects })
    .from(projectActivity)
    .innerJoin(projects, eq(projectActivity.projectId, projects.id))
    .where(eq(projects.ownerId, ownerId))
    .orderBy(desc(projectActivity.createdAt))
    .limit(40);
}
