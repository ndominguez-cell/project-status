# GitHub App setup (Phase 2)

Project Hub reads GitHub through a **private, read-only GitHub App**. It never uses a personal access token, and it never writes to your repositories.

What it syncs per tracked repository: default-branch commits, branches (with ahead/behind and staleness), open pull requests, open issues, GitHub Actions runs on the default branch, and top contributors. Webhooks keep that fresh; a cron job reconciles the stalest projects every 15 minutes as a safety net.

## 1. Create the app

GitHub, Settings, Developer settings, GitHub Apps, **New GitHub App**.

| Field | Value |
| --- | --- |
| GitHub App name | anything unique, for example `Project Hub (yourname)` |
| Homepage URL | your site, for example `https://project-hub.ndominguez.workers.dev` |
| Callback URL / Setup URL | leave blank (no user sign-in goes through GitHub) |
| Webhook, Active | checked |
| Webhook URL | `https://<your-site>/api/github/webhook` |
| Webhook secret | generate one: `openssl rand -hex 32` (keep it, you need it in step 2) |
| Where can this app be installed? | **Only on this account** |

**Repository permissions** (all read-only): Actions, Contents, Issues, Pull requests, and Metadata (mandatory). Leave everything else, and all account permissions, at "No access".

**Subscribe to events:** Create, Delete, Issues, Pull request, Push, Repository, Workflow run. Installation events are delivered automatically.

After creating the app: note the **App ID** (top of the app page), and the **slug** (the last part of `github.com/apps/<slug>`). Then **Generate a private key**; GitHub downloads a `.pem` file.

## 2. Store the secrets on the Worker

The private key and webhook secret never go in the repository or `wrangler.jsonc`.

```bash
npx wrangler secret put GITHUB_APP_ID
npx wrangler secret put GITHUB_WEBHOOK_SECRET
npx wrangler secret put GITHUB_APP_PRIVATE_KEY < ~/Downloads/your-app.private-key.pem
```

Both GitHub's default PKCS#1 key (`BEGIN RSA PRIVATE KEY`) and PKCS#8 keys work. Delete the downloaded `.pem` afterwards or keep it in a password manager.

Put the slug in `wrangler.jsonc` under `vars`:

```jsonc
"GITHUB_APP_SLUG": "your-app-slug"
```

## 3. Migrate and deploy

```bash
npm run db:migrate:remote   # adds the Phase 2 tables (additive; existing data is untouched)
npm run deploy
```

## 4. Let GitHub's webhook through Cloudflare Access

Cloudflare Access protects the whole site, so GitHub's webhook calls get a login redirect instead of reaching the Worker. Add one narrow exception:

1. Zero Trust, Access controls, Applications, **Add an application**, Self-hosted.
2. Application destination: `<your-site>` with path `api/github/webhook`.
3. Policy: action **Bypass**, include **Everyone**.

This is safe because the endpoint verifies GitHub's HMAC signature (`X-Hub-Signature-256`) before it reads or writes anything, rejects oversized bodies, and ignores redelivered events. Optionally restrict the bypass to GitHub's webhook IP ranges (the `hooks` list at `https://api.github.com/meta`).

If you also have a Worker-level Access app for this Worker (`... - Cloudflare Workers`), add the same bypass there or delete that app; overlapping apps can intercept the webhook path.

## 5. Install the app and connect

1. On the app's page, **Install App** on your account and choose the repositories (or all).
2. In Project Hub, open **Integrations** and press **Refresh connection**. Repositories whose name matches an existing project link automatically; others appear under **Needs a decision** where you can **Track** (creates a project) or **Ignore** them.
3. Press **Sync stalest projects**, or open a project's **GitHub** tab and press **Sync now**.

## 6. Verify

- GitHub app settings, Advanced, **Recent Deliveries**: the `ping` delivery should show `200`. A `302` or `403` means Access is still intercepting (step 4).
- Watch the cron and webhook logs: `npx wrangler tail`. A scheduled run logs `GitHub sync {"synced":N,"failed":0,...}`.

## Operational notes

- **Subrequest limits.** Each cron run syncs at most `GITHUB_SYNC_BATCH` projects (default 4, max 10), about eight GitHub calls each. On the Workers Free plan (50 subrequests per invocation) set `GITHUB_SYNC_BATCH` to `2` in `wrangler.jsonc`.
- **Rate limits.** Installation tokens get 5,000 requests per hour. A rate-limited sync is recorded as an error on the project and retried by the next run.
- **What is never overwritten.** Project name, objective, stage, health, priority, next action, tasks, notes, and branch purpose notes belong to you. GitHub refreshes only repository-native fields: URL, full name, visibility, default branch, and last push time.
- **Suggested health** is shown on the GitHub tab (failing CI, stale branches, idle pull requests, no recent pushes) but is never applied to the project automatically.
- **Removing a repository** from the installation removes it from discovery; the Project Hub project and its history are kept.

## Local development

Local dev needs no GitHub App. To exercise the integration locally, point `GITHUB_API_URL` at a fake server and set the three secrets in `.dev.vars` (see `.dev.vars.example`). The automated tests use an in-memory SQLite database and a fake GitHub that verifies real RSA-signed app tokens.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Integrations says "Not configured" | One of the three secrets is missing on the deployed Worker |
| "Configured, not installed" | The app is not installed yet, or press Refresh connection |
| Project shows "not accessible to the GitHub App" | The repository is not selected in the installation, or the app lacks a permission |
| Webhook deliveries show 302/403 | Access is blocking the webhook path (step 4) |
| Webhook deliveries show 401 | The webhook secret in GitHub differs from `GITHUB_WEBHOOK_SECRET` |
| Actions section empty | The app has no Actions permission, or the repository has no workflow runs |
