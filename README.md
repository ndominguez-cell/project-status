# Project Hub

Project Hub is a private, responsive command center for software, AI, automation, and experimental projects. It keeps GitHub as the source of truth for repository-native data while storing the project context GitHub does not naturally own.

## Phase 1 features

- Authenticated, per-user project portfolio
- Project creation wizard and full edit workflow
- Standard lifecycle from Idea through Archived
- Configurable 52-item checklist
- Planning, development, infrastructure, deployment, testing, documentation, and overall progress
- Next-action recommendation based on the first incomplete checklist item
- Project health, priorities, stash/resume, archive, delete, tasks, blockers, notes, and activity
- Secret-safe API inventory: names and status only
- Responsive desktop, tablet, and mobile layouts

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the schema, routes, component map, integration design, and phased plan.

## Local setup

Requirements: Node.js 22.13 or later.

```bash
npm install
cp .env.example .env.local
npm run db:generate
npm run dev
```

The local Sites runtime supplies a test signed-in user and a local D1 binding. Database schema changes belong in `db/schema.ts`; generate and inspect a new append-only migration before deployment.

## Validation

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

## Deployment

The application is configured for private OpenAI Sites hosting. The hosting control plane provisions D1, applies the checked-in Drizzle migrations, supplies authenticated user headers, and keeps the deployed site sign-in gated. Set `PUBLIC_SITE_URL` to the canonical private origin so Open Graph and X preview image URLs are absolute.

## GitHub integration (Phase 2)

Create a GitHub App with the minimum permissions needed for repository metadata, contents, pull requests, issues, checks/actions summaries, and installation repository discovery. Configure these server-only values with the deployment platform:

- `GITHUB_APP_ID`
- `GITHUB_APP_PRIVATE_KEY`
- `GITHUB_WEBHOOK_SECRET`

Never prefix secrets with `NEXT_PUBLIC_`. Verify every webhook signature, store only installation/repository identifiers in the database, and keep GitHub authoritative for commits, branches, pull requests, issues, and Actions state.

## Security model

- Every data read and mutation includes the authenticated owner ID.
- Authentication and authorization checks run on the server.
- Secret values are never accepted or displayed.
- Destructive deletion requires explicit confirmation; archive is the normal retirement path.
- URLs accept HTTP or HTTPS only.
