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
cp .dev.vars.example .dev.vars   # optional: pick the email you are signed in as locally
npm run dev
```

`npm run dev` applies the checked-in migrations to a local D1 database (`.wrangler/state`) and starts the app. On `localhost` you are signed in as `DEV_AUTH_EMAIL` (default `dev@localhost`); `npm run dev` blanks the production Access vars from `wrangler.jsonc`, and the fallback only ever applies to loopback hosts, so a deployed Worker never uses it. Database schema changes belong in `db/schema.ts`; run `npm run db:generate` and inspect the new append-only migration before deployment.

## Validation

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

## Deployment (Cloudflare Workers)

The app runs on Cloudflare Workers with a D1 database, and Cloudflare Access handles sign-in.

1. `npx wrangler login`
2. `npx wrangler d1 create project-hub`, then add the printed `database_id` to the `d1_databases` entry in `wrangler.jsonc`.
3. `npm run db:migrate:remote` applies the checked-in Drizzle migrations to the remote D1 database.
4. `npm run deploy` builds and deploys the Worker.
5. In Cloudflare Zero Trust, add a self-hosted Access application for the Worker hostname (cover the `workers.dev` URL too, or disable it) with an allow policy for the people who may sign in. Copy its AUD tag and your team domain into `CF_ACCESS_AUD` and `CF_ACCESS_TEAM_DOMAIN` in `wrangler.jsonc`, set `PUBLIC_SITE_URL` to the canonical origin, and run `npm run deploy` again.

Until the Access variables are set, the deployed site rejects every request (it never falls back to the local sign-in). Secret values for the Phase 2 GitHub App go in with `npx wrangler secret put`, never in `wrangler.jsonc`.

## GitHub integration (Phase 2)

Create a GitHub App with the minimum permissions needed for repository metadata, contents, pull requests, issues, checks/actions summaries, and installation repository discovery. Configure these server-only values as Worker secrets (`npx wrangler secret put <NAME>`):

- `GITHUB_APP_ID`
- `GITHUB_APP_PRIVATE_KEY`
- `GITHUB_WEBHOOK_SECRET`

Never prefix secrets with `NEXT_PUBLIC_`. Verify every webhook signature, store only installation/repository identifiers in the database, and keep GitHub authoritative for commits, branches, pull requests, issues, and Actions state.

## Security model

- Every data read and mutation includes the authenticated owner ID.
- Authentication and authorization checks run on the server. The Cloudflare Access JWT is verified on every request (signature, issuer, audience, expiry); identity headers alone are never trusted.
- Secret values are never accepted or displayed.
- Destructive deletion requires explicit confirmation; archive is the normal retirement path.
- URLs accept HTTP or HTTPS only.
