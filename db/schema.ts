import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  displayName: text('display_name').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const projects = sqliteTable(
  'projects',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    businessObjective: text('business_objective').notNull(),
    businessPurpose: text('business_purpose'),
    category: text('category').notNull(),
    stage: text('stage').notNull().default('IDEA'),
    health: text('health').notNull().default('HEALTHY'),
    priority: text('priority').notNull().default('MEDIUM'),
    nextAction: text('next_action'),
    developmentEnvironment: text('development_environment'),
    aiProvider: text('ai_provider'),
    databaseProvider: text('database_provider'),
    repositoryUrl: text('repository_url'),
    repositoryFullName: text('repository_full_name'),
    repositoryVisibility: text('repository_visibility'),
    defaultBranch: text('default_branch'),
    activeBranch: text('active_branch'),
    githubLastActivityAt: integer('github_last_activity_at', { mode: 'timestamp_ms' }),
    deploymentProvider: text('deployment_provider'),
    deploymentStatus: text('deployment_status').notNull().default('NOT_CONFIGURED'),
    productionUrl: text('production_url'),
    pausedReason: text('paused_reason'),
    stashedAt: integer('stashed_at', { mode: 'timestamp_ms' }),
    archivedAt: integer('archived_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    uniqueIndex('projects_owner_slug_unique').on(table.ownerId, table.slug),
    index('projects_owner_stage_idx').on(table.ownerId, table.stage),
    index('projects_owner_updated_idx').on(table.ownerId, table.updatedAt),
  ],
);

export const checklistItems = sqliteTable(
  'checklist_items',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    category: text('category').notNull(),
    label: text('label').notNull(),
    sortOrder: integer('sort_order').notNull(),
    completed: integer('completed', { mode: 'boolean' }).notNull().default(false),
    completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('checklist_project_category_idx').on(table.projectId, table.category)],
);

export const projectTechnologies = sqliteTable(
  'project_technologies',
  {
    projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    category: text('category').notNull(),
    name: text('name').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.projectId, table.category, table.name] })],
);

export const projectIntegrations = sqliteTable(
  'project_integrations',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    status: text('status').notNull().default('NOT_CONNECTED'),
    externalId: text('external_id'),
    lastSyncedAt: integer('last_synced_at', { mode: 'timestamp_ms' }),
    syncError: text('sync_error'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [uniqueIndex('integrations_project_provider_unique').on(table.projectId, table.provider)],
);

export const projectDeployments = sqliteTable(
  'project_deployments',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    environment: text('environment').notNull(),
    status: text('status').notNull().default('NOT_CONFIGURED'),
    url: text('url'),
    branch: text('branch'),
    lastCheckedAt: integer('last_checked_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('deployments_project_idx').on(table.projectId)],
);

export const projectApiRequirements = sqliteTable(
  'project_api_requirements',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    secretName: text('secret_name'),
    environment: text('environment').notNull().default('production'),
    required: integer('required', { mode: 'boolean' }).notNull().default(true),
    configured: integer('configured', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('api_requirements_project_idx').on(table.projectId)],
);

export const projectBranches = sqliteTable(
  'project_branches',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    purpose: text('purpose'),
    status: text('status').notNull().default('ACTIVE'),
    aheadBy: integer('ahead_by'),
    behindBy: integer('behind_by'),
    pullRequestUrl: text('pull_request_url'),
    deploymentUrl: text('deployment_url'),
    lastCommitAt: integer('last_commit_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [uniqueIndex('branches_project_name_unique').on(table.projectId, table.name)],
);

export const projectTasks = sqliteTable(
  'project_tasks',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    status: text('status').notNull().default('OPEN'),
    priority: text('priority').notNull().default('MEDIUM'),
    isBlocker: integer('is_blocker', { mode: 'boolean' }).notNull().default(false),
    dueAt: integer('due_at', { mode: 'timestamp_ms' }),
    completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('tasks_project_status_idx').on(table.projectId, table.status)],
);

export const projectNotes = sqliteTable(
  'project_notes',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    authorId: text('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('notes_project_created_idx').on(table.projectId, table.createdAt)],
);

export const projectActivity = sqliteTable(
  'project_activity',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    actorId: text('actor_id').references(() => users.id, { onDelete: 'set null' }),
    eventType: text('event_type').notNull(),
    summary: text('summary').notNull(),
    metadataJson: text('metadata_json'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('activity_project_created_idx').on(table.projectId, table.createdAt)],
);
