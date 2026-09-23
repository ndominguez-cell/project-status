CREATE TABLE `checklist_items` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`category` text NOT NULL,
	`label` text NOT NULL,
	`sort_order` integer NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `checklist_project_category_idx` ON `checklist_items` (`project_id`,`category`);--> statement-breakpoint
CREATE TABLE `project_activity` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`actor_id` text,
	`event_type` text NOT NULL,
	`summary` text NOT NULL,
	`metadata_json` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `activity_project_created_idx` ON `project_activity` (`project_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `project_api_requirements` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`secret_name` text,
	`environment` text DEFAULT 'production' NOT NULL,
	`required` integer DEFAULT true NOT NULL,
	`configured` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `api_requirements_project_idx` ON `project_api_requirements` (`project_id`);--> statement-breakpoint
CREATE TABLE `project_branches` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`purpose` text,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`ahead_by` integer,
	`behind_by` integer,
	`pull_request_url` text,
	`deployment_url` text,
	`last_commit_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `branches_project_name_unique` ON `project_branches` (`project_id`,`name`);--> statement-breakpoint
CREATE TABLE `project_deployments` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`provider` text NOT NULL,
	`environment` text NOT NULL,
	`status` text DEFAULT 'NOT_CONFIGURED' NOT NULL,
	`url` text,
	`branch` text,
	`last_checked_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `deployments_project_idx` ON `project_deployments` (`project_id`);--> statement-breakpoint
CREATE TABLE `project_integrations` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`provider` text NOT NULL,
	`status` text DEFAULT 'NOT_CONNECTED' NOT NULL,
	`external_id` text,
	`last_synced_at` integer,
	`sync_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `integrations_project_provider_unique` ON `project_integrations` (`project_id`,`provider`);--> statement-breakpoint
CREATE TABLE `project_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`author_id` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notes_project_created_idx` ON `project_notes` (`project_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `project_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`priority` text DEFAULT 'MEDIUM' NOT NULL,
	`is_blocker` integer DEFAULT false NOT NULL,
	`due_at` integer,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tasks_project_status_idx` ON `project_tasks` (`project_id`,`status`);--> statement-breakpoint
CREATE TABLE `project_technologies` (
	`project_id` text NOT NULL,
	`category` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`project_id`, `category`, `name`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`business_objective` text NOT NULL,
	`business_purpose` text,
	`category` text NOT NULL,
	`stage` text DEFAULT 'IDEA' NOT NULL,
	`health` text DEFAULT 'HEALTHY' NOT NULL,
	`priority` text DEFAULT 'MEDIUM' NOT NULL,
	`next_action` text,
	`development_environment` text,
	`ai_provider` text,
	`database_provider` text,
	`repository_url` text,
	`repository_full_name` text,
	`repository_visibility` text,
	`default_branch` text,
	`active_branch` text,
	`github_last_activity_at` integer,
	`deployment_provider` text,
	`deployment_status` text DEFAULT 'NOT_CONFIGURED' NOT NULL,
	`production_url` text,
	`paused_reason` text,
	`stashed_at` integer,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_owner_slug_unique` ON `projects` (`owner_id`,`slug`);--> statement-breakpoint
CREATE INDEX `projects_owner_stage_idx` ON `projects` (`owner_id`,`stage`);--> statement-breakpoint
CREATE INDEX `projects_owner_updated_idx` ON `projects` (`owner_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
