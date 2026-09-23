# Project Hub architecture

## 1. Architecture overview

Project Hub is a private, server-rendered command center built with TypeScript, React 19, the Next.js App Router programming model through Vinext, Tailwind CSS, and reusable shadcn primitives. The deployed application uses platform-managed ChatGPT sign-in and Cloudflare D1. Every database read and mutation is scoped by the authenticated user ID on the server.

The architecture separates four concerns:

1. `app/` owns routes, protected server-rendered pages, metadata, and server actions.
2. `components/project-hub/` owns reusable product UI: shell, project cards, filters, wizard, and guarded destructive controls.
3. `lib/` owns lifecycle constants, checklist templates, progress calculation, next-action recommendation, and read models.
4. `db/` owns the relational schema and the single D1 access boundary.

GitHub is intentionally the source of truth for repository-native facts. Project Hub stores only links and user-owned metadata in Phase 1. Phase 2 adds a GitHub App adapter and synchronized cache for branch, pull-request, issue, commit, and Actions summaries.

### Why D1 and platform sign-in for the first deployment

The requested stack suggested Supabase and Vercel unless another choice was compelling. This hosted private site already supplies authenticated identity, relational persistence, migrations, and private access without introducing a second login system or requiring user credentials. The application keeps database access behind `db/index.ts` and identity behind `app/chatgpt-auth.ts`, so a later move to Supabase PostgreSQL and Supabase Auth is isolated. A Supabase migration must enable RLS on every exposed table and pair every policy with an `owner_id = auth.uid()` predicate; client roles should receive only the operations they need.

## 2. Database schema

The schema is normalized around `users` and `projects`:

- `users`: stable authenticated identity and display metadata.
- `projects`: Project Hub-owned metadata including lifecycle, health, priority, purpose, repository links, deployment summary, stash state, and next action.
- `checklist_items`: the configurable per-project checklist. Progress is calculated from these rows and is not stored as a mutable percentage.
- `project_technologies`: normalized category/name inventory.
- `project_integrations`: connection status, external identifier, sync state, and errors; no credentials.
- `project_deployments`: one row per provider/environment/branch deployment.
- `project_api_requirements`: API name, secret name, environment, and configured/missing status; never secret values.
- `project_branches`: branch purpose, category/status, ahead/behind, PR, and deployment association.
- `project_tasks`: lightweight work and blockers that do not replace GitHub Issues.
- `project_notes`: durable project context and handoff notes.
- `project_activity`: append-only user and integration event summaries.

`project_health` is not a separate table in the MVP. The current derived/overridden state lives on `projects`, while changes belong in `project_activity`. GitHub repository details are not duplicated into a dedicated cache until synchronization exists.

The generated migration is under `drizzle/`. Foreign keys cascade project-owned records, common owner/stage and project/status reads are indexed, and owner/slug plus integration/branch identities are unique.

## 3. Application routes

| Route | Purpose |
| --- | --- |
| `/` | Command center: portfolio metrics, priority projects, recent activity, and resume queue |
| `/projects` | Searchable and filterable portfolio |
| `/projects/new` | Three-part creation wizard covering the requested ten inputs |
| `/projects/[slug]` | Protected project workspace with 12 requested tabs |
| `/stash` | Pause context, completion, next action, resume, and archive controls |
| `/activity` | Cross-project activity timeline |
| `/integrations` | Integration boundary and GitHub Phase 2 contract |
| `/settings` | Security and secret-handling model |

Project detail tabs: Overview, GitHub, Branches, Checklist, Deployment, Environment, APIs, Database, Documentation, Tasks, Activity, and Notes.

## 4. Component structure

- `AppShell`: desktop sidebar, mobile navigation, global search, user identity, sign-out, and add-project action.
- `ProjectCard`: lifecycle, health, progress, repo/branch context, production link, and next action.
- `ProjectExplorer`: client-side search plus stage, priority, AI-provider, and category filters.
- `ProjectWizard`: progressive creation flow with custom provider fields and secret-safe API inventory.
- `DeleteProjectButton`: explicit browser confirmation before permanent deletion.
- Route-local panels on the detail page keep server reads close to each workspace while sharing data and action helpers.

## 5. Integration architecture

Each integration is an adapter with four responsibilities: authorization, synchronization, normalization, and health reporting. Credentials remain server-side. The GitHub adapter should use a GitHub App rather than a broad personal access token:

```text
GitHub App installation
        |
        v
Server-only sync route/job ----> GitHub API
        |
        v
Normalized integration, branch, deployment, and activity rows
        |
        v
Project read models and health rules
```

Webhook signatures must be verified before writes. Repository discovery compares installation repositories with tracked repository external IDs. Manual project metadata is never silently overwritten: repository-native fields refresh from GitHub, while Project Hub-owned fields remain user-controlled.

Future deployment adapters (Vercel, Netlify, Railway, Cloud Run, Supabase) implement the same boundary. Health rules consume normalized signals rather than provider-specific response shapes.

## 6. MVP implementation plan

### Phase 1 — implemented

- Private authentication and owner-scoped records
- Relational schema and migration
- Responsive shell, command center, portfolio, detail workspace, and mobile navigation
- Project create/read/update/delete and archive lifecycle
- Generated 52-item checklist and category/overall progress engine
- Manual next action with checklist-derived recommendation
- Stash, resume, archive, tasks, blockers, notes, and activity
- Manual repository, technology, API/secret-name, database, and deployment inventory
- Loading, empty, not-found, and error states

### Phase 2

- GitHub App installation and least-privilege repository access
- Repository discovery, ignore/archive decisions, synchronization, branches, commits, PRs, issues, contributors, and Actions health
- Webhook ingestion plus scheduled reconciliation and stale-branch rules

### Phase 3

- Deployment provider adapters and production health checks
- Provider-specific build/deployment events normalized into Project Hub health signals

### Phase 4

- Repository activity summaries, blocker detection, documentation gaps, configuration warnings, and AI-recommended next actions with user-visible evidence
