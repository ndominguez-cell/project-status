CREATE TABLE `github_commits` (
	`project_id` text NOT NULL,
	`sha` text NOT NULL,
	`message` text NOT NULL,
	`author_name` text,
	`author_login` text,
	`committed_at` integer NOT NULL,
	`url` text NOT NULL,
	PRIMARY KEY(`project_id`, `sha`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `github_commits_project_time_idx` ON `github_commits` (`project_id`,`committed_at`);--> statement-breakpoint
CREATE TABLE `github_contributors` (
	`project_id` text NOT NULL,
	`login` text NOT NULL,
	`contributions` integer NOT NULL,
	`is_bot` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`project_id`, `login`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `github_installations` (
	`id` integer PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`account_login` text NOT NULL,
	`account_type` text DEFAULT 'User' NOT NULL,
	`repository_selection` text DEFAULT 'selected' NOT NULL,
	`suspended_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `github_issues` (
	`project_id` text NOT NULL,
	`number` integer NOT NULL,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`author` text,
	`labels_json` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`project_id`, `number`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `github_pull_requests` (
	`project_id` text NOT NULL,
	`number` integer NOT NULL,
	`title` text NOT NULL,
	`is_draft` integer DEFAULT false NOT NULL,
	`url` text NOT NULL,
	`author` text,
	`head_branch` text,
	`base_branch` text,
	`review_decision` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`project_id`, `number`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `github_repositories` (
	`repo_id` integer PRIMARY KEY NOT NULL,
	`installation_id` integer NOT NULL,
	`owner_id` text NOT NULL,
	`full_name` text NOT NULL,
	`default_branch` text,
	`is_private` integer DEFAULT false NOT NULL,
	`is_archived` integer DEFAULT false NOT NULL,
	`project_id` text,
	`decision` text DEFAULT 'PENDING' NOT NULL,
	`discovered_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`installation_id`) REFERENCES `github_installations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `github_repos_owner_name_unique` ON `github_repositories` (`owner_id`,`full_name`);--> statement-breakpoint
CREATE INDEX `github_repos_installation_idx` ON `github_repositories` (`installation_id`);--> statement-breakpoint
CREATE TABLE `github_webhook_deliveries` (
	`delivery_id` text PRIMARY KEY NOT NULL,
	`event` text NOT NULL,
	`received_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `github_workflow_runs` (
	`project_id` text NOT NULL,
	`run_id` integer NOT NULL,
	`name` text,
	`branch` text,
	`event` text,
	`status` text NOT NULL,
	`conclusion` text,
	`url` text NOT NULL,
	`started_at` integer NOT NULL,
	PRIMARY KEY(`project_id`, `run_id`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `github_runs_project_time_idx` ON `github_workflow_runs` (`project_id`,`started_at`);