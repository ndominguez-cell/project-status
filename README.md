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

A private, read-only GitHub App syncs commits, branches, pull requests, issues, Actions runs, and contributors into a cache that the project **GitHub** and **Branches** tabs display. Signed webhooks keep it fresh, and a cron job (every 15 minutes) reconciles the stalest projects. The **Integrations** page discovers repositories, auto-links ones that match existing projects, and lets you track or ignore the rest.

Setup (GitHub App, Worker secrets, and the Access bypass for the webhook path) is in [docs/GITHUB_APP_SETUP.md](docs/GITHUB_APP_SETUP.md). The secrets are `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, and `GITHUB_WEBHOOK_SECRET` (`npx wrangler secret put <NAME>`); never commit them or prefix them with `NEXT_PUBLIC_`. GitHub stays authoritative for repository facts, and Project Hub-owned fields are never overwritten.

## Security model

- Every data read and mutation includes the authenticated owner ID.
- GitHub webhooks are verified with an HMAC signature before any write, deduplicated by delivery ID, and size-limited. The GitHub App is read-only, and its private key lives only in a Worker secret.
- Authentication and authorization checks run on the server. The Cloudflare Access JWT is verified on every request (signature, issuer, audience, expiry); identity headers alone are never trusted.
- Secret values are never accepted or displayed.
- Destructive deletion requires explicit confirmation; archive is the normal retirement path.
- URLs accept HTTP or HTTPS only.
