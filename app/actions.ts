'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { getD1 } from '@/db';
import { DEFAULT_CHECKLIST, PROJECT_HEALTH, PROJECT_STAGES, slugify } from '@/lib/project-hub';

async function requireActionUser() {
  const user = await getChatGPTUser();
  if (!user) throw new Error('Authentication required.');
  return user;
}

function required(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? '').trim();
  if (!value) throw new Error(`${key} is required.`);
  return value;
}

function optional(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? '').trim();
  return value || null;
}

function safeUrl(formData: FormData, key: string) {
  const value = optional(formData, key);
  if (!value) return null;
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`${key} must be an HTTP or HTTPS URL.`);
  return url.toString();
}

function splitList(value: string | null) {
  return [...new Set((value ?? '').split(',').map((item) => item.trim()).filter(Boolean))];
}

export async function createProject(formData: FormData) {
  const user = await requireActionUser();
  const database = getD1();
  const now = Date.now();
  const id = crypto.randomUUID();
  const name = required(formData, 'name');
  const slug = `${slugify(name)}-${id.slice(0, 5)}`;
  const objective = required(formData, 'businessObjective');
  const repositoryUrl = safeUrl(formData, 'repositoryUrl');
  const productionUrl = safeUrl(formData, 'productionUrl');
  const repositoryFullName = optional(formData, 'repositoryFullName');
  const defaultBranch = optional(formData, 'defaultBranch') ?? 'main';
  const activeBranch = optional(formData, 'activeBranch') ?? defaultBranch;
  const nextAction = optional(formData, 'nextAction');
  const aiProvider = optional(formData, 'aiProvider');
  const databaseProvider = optional(formData, 'databaseProvider');
  const deploymentProvider = optional(formData, 'deploymentProvider');
  const developmentEnvironment = optional(formData, 'developmentEnvironment');

  const statements: D1PreparedStatement[] = [
    database.prepare(`INSERT INTO users (id, email, display_name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET email = excluded.email, display_name = excluded.display_name, updated_at = excluded.updated_at`)
      .bind(user.userId, user.email, user.displayName, now, now),
    database.prepare(`INSERT INTO projects (
      id, owner_id, slug, name, business_objective, business_purpose, category, stage, health, priority,
      next_action, development_environment, ai_provider, database_provider, repository_url, repository_full_name,
      repository_visibility, default_branch, active_branch, deployment_provider, deployment_status, production_url,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'HEALTHY', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        id,
        user.userId,
        slug,
        name,
        objective,
        optional(formData, 'businessPurpose'),
        required(formData, 'category'),
        required(formData, 'stage'),
        required(formData, 'priority'),
        nextAction,
        developmentEnvironment,
        aiProvider,
        databaseProvider,
        repositoryUrl,
        repositoryFullName,
        optional(formData, 'repositoryVisibility'),
        defaultBranch,
        activeBranch,
        deploymentProvider,
        productionUrl ? 'UNKNOWN' : 'NOT_CONFIGURED',
        productionUrl,
        now,
        now,
      ),
  ];

  DEFAULT_CHECKLIST.forEach((item, index) => {
    const autoComplete = item.label === 'Project name confirmed' || item.label === 'Business objective documented';
    statements.push(
      database.prepare(`INSERT INTO checklist_items
        (id, project_id, category, label, sort_order, completed, completed_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), id, item.category, item.label, index, autoComplete ? 1 : 0, autoComplete ? now : null, now, now),
    );
  });

  const technologies = [
    ['Frontend', optional(formData, 'frontend')],
    ['Backend', optional(formData, 'backend')],
    ['Database', databaseProvider],
    ['AI Provider', aiProvider],
    ['Hosting', deploymentProvider],
    ['Development', developmentEnvironment],
    ['Authentication', optional(formData, 'authentication')],
    ['Storage', optional(formData, 'storage')],
  ] as const;

  for (const [category, technology] of technologies) {
    if (!technology) continue;
    statements.push(database.prepare('INSERT INTO project_technologies (project_id, category, name, created_at) VALUES (?, ?, ?, ?)').bind(id, category, technology, now));
  }

  for (const apiName of splitList(optional(formData, 'requiredApis'))) {
    const secretName = apiName.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/_API$/, '') + '_API_KEY';
    statements.push(database.prepare(`INSERT INTO project_api_requirements
      (id, project_id, name, secret_name, environment, required, configured, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'production', 1, 0, ?, ?)`)
      .bind(crypto.randomUUID(), id, apiName, secretName, now, now));
  }

  if (deploymentProvider) {
    statements.push(database.prepare(`INSERT INTO project_deployments
      (id, project_id, provider, environment, status, url, branch, created_at, updated_at)
      VALUES (?, ?, ?, 'production', ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), id, deploymentProvider, productionUrl ? 'UNKNOWN' : 'NOT_CONFIGURED', productionUrl, defaultBranch, now, now));
  }

  statements.push(database.prepare(`INSERT INTO project_activity
    (id, project_id, actor_id, event_type, summary, metadata_json, created_at)
    VALUES (?, ?, ?, 'PROJECT_CREATED', ?, NULL, ?)`)
    .bind(crypto.randomUUID(), id, user.userId, `Created ${name}`, now));

  await database.batch(statements);
  redirect(`/projects/${slug}`);
}

export async function updateProject(formData: FormData) {
  const user = await requireActionUser();
  const database = getD1();
  const id = required(formData, 'projectId');
  const slug = required(formData, 'slug');
  const now = Date.now();
  const health = required(formData, 'health');
  if (!PROJECT_HEALTH.includes(health as (typeof PROJECT_HEALTH)[number])) throw new Error('Invalid project health.');

  await database.batch([
    database.prepare(`UPDATE projects SET business_objective = ?, business_purpose = ?, health = ?, priority = ?, next_action = ?,
      development_environment = ?, ai_provider = ?, database_provider = ?, repository_url = ?, repository_full_name = ?,
      default_branch = ?, active_branch = ?, deployment_provider = ?, deployment_status = ?, production_url = ?, updated_at = ?
      WHERE id = ? AND owner_id = ?`)
      .bind(
        required(formData, 'businessObjective'), optional(formData, 'businessPurpose'), health, required(formData, 'priority'), optional(formData, 'nextAction'),
        optional(formData, 'developmentEnvironment'), optional(formData, 'aiProvider'), optional(formData, 'databaseProvider'), safeUrl(formData, 'repositoryUrl'), optional(formData, 'repositoryFullName'),
        optional(formData, 'defaultBranch'), optional(formData, 'activeBranch'), optional(formData, 'deploymentProvider'), required(formData, 'deploymentStatus'), safeUrl(formData, 'productionUrl'), now, id, user.userId,
      ),
    database.prepare(`INSERT INTO project_activity (id, project_id, actor_id, event_type, summary, metadata_json, created_at)
      SELECT ?, id, ?, 'PROJECT_UPDATED', 'Updated project details', NULL, ? FROM projects WHERE id = ? AND owner_id = ?`)
      .bind(crypto.randomUUID(), user.userId, now, id, user.userId),
  ]);
  revalidatePath(`/projects/${slug}`);
  revalidatePath('/');
}

export async function changeProjectStage(formData: FormData) {
  const user = await requireActionUser();
  const database = getD1();
  const projectId = required(formData, 'projectId');
  const slug = required(formData, 'slug');
  const stage = required(formData, 'stage');
  if (!PROJECT_STAGES.includes(stage as (typeof PROJECT_STAGES)[number])) throw new Error('Invalid project stage.');
  const now = Date.now();
  const pausedReason = stage === 'PAUSED' ? optional(formData, 'pausedReason') : null;

  await database.batch([
    database.prepare(`UPDATE projects SET stage = ?, paused_reason = ?, stashed_at = ?, archived_at = ?, updated_at = ? WHERE id = ? AND owner_id = ?`)
      .bind(stage, pausedReason, stage === 'PAUSED' ? now : null, stage === 'ARCHIVED' ? now : null, now, projectId, user.userId),
    database.prepare(`INSERT INTO project_activity (id, project_id, actor_id, event_type, summary, metadata_json, created_at)
      SELECT ?, id, ?, 'STAGE_CHANGED', ?, NULL, ? FROM projects WHERE id = ? AND owner_id = ?`)
      .bind(crypto.randomUUID(), user.userId, `Moved project to ${stage}`, now, projectId, user.userId),
  ]);
  revalidatePath(`/projects/${slug}`);
  revalidatePath('/');
  revalidatePath('/projects');
  revalidatePath('/stash');
}

export async function toggleChecklistItem(formData: FormData) {
  const user = await requireActionUser();
  const database = getD1();
  const itemId = required(formData, 'itemId');
  const projectId = required(formData, 'projectId');
  const slug = required(formData, 'slug');
  const completed = required(formData, 'completed') === 'true';
  const now = Date.now();

  await database.batch([
    database.prepare(`UPDATE checklist_items SET completed = ?, completed_at = ?, updated_at = ?
      WHERE id = ? AND project_id IN (SELECT id FROM projects WHERE id = ? AND owner_id = ?)`)
      .bind(completed ? 1 : 0, completed ? now : null, now, itemId, projectId, user.userId),
    database.prepare('UPDATE projects SET updated_at = ? WHERE id = ? AND owner_id = ?').bind(now, projectId, user.userId),
  ]);
  revalidatePath(`/projects/${slug}`);
  revalidatePath('/');
}

export async function addProjectNote(formData: FormData) {
  const user = await requireActionUser();
  const database = getD1();
  const projectId = required(formData, 'projectId');
  const slug = required(formData, 'slug');
  const body = required(formData, 'body');
  const now = Date.now();

  await database.batch([
    database.prepare(`INSERT INTO project_notes (id, project_id, author_id, body, created_at, updated_at)
      SELECT ?, id, ?, ?, ?, ? FROM projects WHERE id = ? AND owner_id = ?`)
      .bind(crypto.randomUUID(), user.userId, body, now, now, projectId, user.userId),
    database.prepare(`INSERT INTO project_activity (id, project_id, actor_id, event_type, summary, metadata_json, created_at)
      SELECT ?, id, ?, 'NOTE_ADDED', 'Added a project note', NULL, ? FROM projects WHERE id = ? AND owner_id = ?`)
      .bind(crypto.randomUUID(), user.userId, now, projectId, user.userId),
  ]);
  revalidatePath(`/projects/${slug}`);
}

export async function addProjectTask(formData: FormData) {
  const user = await requireActionUser();
  const database = getD1();
  const projectId = required(formData, 'projectId');
  const slug = required(formData, 'slug');
  const title = required(formData, 'title');
  const now = Date.now();
  await database.prepare(`INSERT INTO project_tasks (id, project_id, title, status, priority, is_blocker, created_at, updated_at)
    SELECT ?, id, ?, 'OPEN', ?, ?, ?, ? FROM projects WHERE id = ? AND owner_id = ?`)
    .bind(crypto.randomUUID(), title, required(formData, 'priority'), formData.get('isBlocker') === 'on' ? 1 : 0, now, now, projectId, user.userId).run();
  revalidatePath(`/projects/${slug}`);
}

export async function toggleProjectTask(formData: FormData) {
  const user = await requireActionUser();
  const database = getD1();
  const projectId = required(formData, 'projectId');
  const slug = required(formData, 'slug');
  const taskId = required(formData, 'taskId');
  const complete = required(formData, 'complete') === 'true';
  const now = Date.now();
  await database.prepare(`UPDATE project_tasks SET status = ?, completed_at = ?, updated_at = ?
    WHERE id = ? AND project_id IN (SELECT id FROM projects WHERE id = ? AND owner_id = ?)`)
    .bind(complete ? 'DONE' : 'OPEN', complete ? now : null, now, taskId, projectId, user.userId).run();
  revalidatePath(`/projects/${slug}`);
}

export async function deleteProject(formData: FormData) {
  const user = await requireActionUser();
  const projectId = required(formData, 'projectId');
  await getD1().prepare('DELETE FROM projects WHERE id = ? AND owner_id = ?').bind(projectId, user.userId).run();
  revalidatePath('/');
  revalidatePath('/projects');
  redirect('/projects');
}
