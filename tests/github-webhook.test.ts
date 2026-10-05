import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { clearInstallationTokenCache } from '../lib/github/app-auth';
import type { GitHubConfig } from '../lib/github/config';
import { runScheduledSync } from '../lib/github/scheduled';
import { refreshInstallations, type SyncDeps } from '../lib/github/sync-store';
import { trackRepository } from '../lib/github/track';
import { handleWebhookEvent, signWebhookBody, verifyWebhookSignature, type WebhookPayload } from '../lib/github/webhook';
import { createTestDb, seedProject, seedUser } from './helpers/d1';
import { createFakeGitHub, createTestKeys, type FakeInstallation, type FakeRepo } from './helpers/fake-github';

const keys = createTestKeys();
const NOW = Date.parse('2026-10-05T12:00:00Z');
const DAY = 86_400_000;
const iso = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString();
const config: GitHubConfig = { appId: '12345', privateKey: keys.pkcs1Private, webhookSecret: 'hook-secret', appSlug: null, apiBase: 'https://api.github.com', syncBatch: 2 };
const encoder = new TextEncoder();

beforeEach(() => clearInstallationTokenCache());

const makeRepo = (id: number, fullName: string, overrides: Partial<FakeRepo> = {}): FakeRepo => ({
  id,
  fullName,
  pushedAt: iso(1),
  commits: [{ oid: `c${id}`.padEnd(40, '0'), messageHeadline: 'Commit', committedDate: iso(1) }],
  branches: [{ name: 'main', oid: 'a'.repeat(40), committedDate: iso(1) }],
  ...overrides,
});

async function setup(installations: FakeInstallation[] = [{ id: 99, login: 'nick', repos: [makeRepo(1, 'nick/alpha'), makeRepo(2, 'nick/untracked')] }]) {
  const { db, query, exec } = createTestDb();
  seedUser(exec, 'user-1');
  seedProject(exec, 'user-1', 'p-alpha', 'nick/alpha');
  const gh = createFakeGitHub({ appId: '12345', publicKey: keys.pkcs1Public, installations, now: () => NOW });
  const deps: SyncDeps = { db, config, fetch: gh.fetch, now: () => NOW };
  await refreshInstallations(deps, 'user-1');
  return { db, query, exec, gh, deps, installations };
}

const repository = (id: number, fullName: string) => ({ id, full_name: fullName });
const activity = (query: ReturnType<typeof createTestDb>['query']) => query('SELECT event_type, summary FROM project_activity ORDER BY created_at, rowid');

test('verifies webhook signatures against GitHub\'s published test vector', async () => {
  const secret = "It's a Secret to Everybody";
  const body = encoder.encode('Hello, World!');
  const expected = 'sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17';
  assert.equal(await signWebhookBody(secret, 'Hello, World!'), expected);
  assert.equal(await verifyWebhookSignature(secret, body, expected), true);
});

test('rejects bad, tampered, missing, and malformed signatures', async () => {
  const body = '{"zen":"Keep it logically awesome."}';
  const good = await signWebhookBody('s3cret', body);
  assert.equal(await verifyWebhookSignature('s3cret', encoder.encode(body), good), true);
  assert.equal(await verifyWebhookSignature('other', encoder.encode(body), good), false, 'wrong secret');
  assert.equal(await verifyWebhookSignature('s3cret', encoder.encode(`${body} `), good), false, 'tampered body');
  assert.equal(await verifyWebhookSignature('s3cret', encoder.encode(body), null), false, 'missing header');
  assert.equal(await verifyWebhookSignature('s3cret', encoder.encode(body), good.replace('sha256=', 'sha1=')), false, 'wrong algorithm');
  assert.equal(await verifyWebhookSignature('s3cret', encoder.encode(body), 'sha256=abc'), false, 'short signature');
  assert.equal(await verifyWebhookSignature('s3cret', encoder.encode(body), `sha256=${'z'.repeat(64)}`), false, 'non-hex signature');
});

test('ping is acknowledged without touching the database', async () => {
  const { deps, query } = await setup();
  assert.deepEqual(await handleWebhookEvent(deps, 'ping', {}, 'd-ping'), { status: 'handled', detail: 'pong' });
  assert.equal(query('SELECT COUNT(*) AS n FROM github_webhook_deliveries')[0].n, 0);
});

test('a push to a tracked repo records activity and syncs the project', async () => {
  const { deps, query } = await setup();
  const result = await handleWebhookEvent(deps, 'push', { ref: 'refs/heads/main', commits: [{}, {}], repository: repository(1, 'nick/alpha') }, 'd-1');
  assert.equal(result.status, 'handled');
  assert.deepEqual(activity(query), [{ event_type: 'GITHUB_PUSH', summary: 'Pushed 2 commits to main' }]);
  assert.equal(query("SELECT status FROM project_integrations WHERE project_id = 'p-alpha'")[0].status, 'CONNECTED');
  assert.equal(query('SELECT COUNT(*) AS n FROM github_commits')[0].n, 1);
});

test('redelivered webhooks are processed once', async () => {
  const { deps, query } = await setup();
  const payload = { ref: 'refs/heads/main', commits: [{}], repository: repository(1, 'nick/alpha') };
  assert.equal((await handleWebhookEvent(deps, 'push', payload, 'same')).status, 'handled');
  assert.equal((await handleWebhookEvent(deps, 'push', payload, 'same')).status, 'duplicate');
  assert.equal(activity(query).length, 1);
});

test('a failed delivery can be redelivered', async () => {
  const { deps, db, query } = await setup();
  const flaky = { prepare: (sql: string) => (sql.includes('INTO project_activity') ? (() => { throw new Error('boom'); })() : db.prepare(sql)), batch: db.batch.bind(db) } as unknown as D1Database;
  const failing: SyncDeps = { ...deps, db: flaky };
  const payload = { ref: 'refs/heads/main', commits: [{}], repository: repository(1, 'nick/alpha') };
  await assert.rejects(handleWebhookEvent(failing, 'push', payload, 'retry-me'), /boom/);
  assert.equal(query('SELECT COUNT(*) AS n FROM github_webhook_deliveries')[0].n, 0);
  assert.equal((await handleWebhookEvent(deps, 'push', payload, 'retry-me')).status, 'handled');
});

test('events that should not change anything are ignored', async () => {
  const { deps, query } = await setup();
  const ignored: [string, WebhookPayload][] = [
    ['push', { ref: 'refs/tags/v1', commits: [], repository: repository(1, 'nick/alpha') }],
    ['push', { ref: 'refs/heads/gone', deleted: true, commits: [], repository: repository(1, 'nick/alpha') }],
    ['create', { ref: 'v2', ref_type: 'tag', repository: repository(1, 'nick/alpha') }],
    ['pull_request', { action: 'synchronize', number: 1, pull_request: { title: 'x' }, repository: repository(1, 'nick/alpha') }],
    ['issues', { action: 'labeled', issue: { number: 1, title: 'x' }, repository: repository(1, 'nick/alpha') }],
    ['workflow_run', { action: 'in_progress', workflow_run: { name: 'CI' }, repository: repository(1, 'nick/alpha') }],
    ['push', { ref: 'refs/heads/main', commits: [{}], repository: repository(2, 'nick/untracked') }],
    ['star', { action: 'created', repository: repository(1, 'nick/alpha') }],
  ];
  for (const [index, [event, payload]] of ignored.entries()) assert.equal((await handleWebhookEvent(deps, event, payload, `ignored-${index}`)).status, 'ignored', `${event} #${index}`);
  assert.deepEqual(activity(query), []);
});

test('pull request, issue, branch, and workflow events are summarized', async () => {
  const { deps, query } = await setup();
  const repo = repository(1, 'nick/alpha');
  await handleWebhookEvent(deps, 'pull_request', { action: 'closed', number: 7, pull_request: { title: 'Add login', merged: true }, repository: repo }, 'd-pr');
  await handleWebhookEvent(deps, 'issues', { action: 'opened', issue: { number: 3, title: 'Bug' }, repository: repo }, 'd-issue');
  await handleWebhookEvent(deps, 'create', { ref: 'feature/new', ref_type: 'branch', repository: repo }, 'd-branch');
  await handleWebhookEvent(deps, 'workflow_run', { action: 'completed', workflow_run: { name: 'CI', conclusion: 'failure', head_branch: 'main' }, repository: repo }, 'd-ci');
  assert.deepEqual(activity(query).map((row) => row.summary), ['Pull request #7 merged: Add login', 'Issue #3 opened: Bug', 'Branch feature/new created', 'Workflow CI failure on main']);
});

test('repository renames, archives, and deletions are reflected', async () => {
  const { deps, query, installations } = await setup();
  installations[0].repos[0].fullName = 'nick/alpha-renamed';
  await handleWebhookEvent(deps, 'repository', { action: 'renamed', repository: { ...repository(1, 'nick/alpha-renamed'), html_url: 'https://github.com/nick/alpha-renamed' } }, 'd-rename');
  assert.equal(query("SELECT repository_full_name FROM projects WHERE id = 'p-alpha'")[0].repository_full_name, 'nick/alpha-renamed');
  assert.equal(query('SELECT full_name FROM github_repositories WHERE repo_id = 1')[0].full_name, 'nick/alpha-renamed');
  assert.equal(query("SELECT status FROM project_integrations WHERE project_id = 'p-alpha'")[0].status, 'CONNECTED');

  await handleWebhookEvent(deps, 'repository', { action: 'deleted', repository: repository(1, 'nick/alpha-renamed') }, 'd-delete');
  assert.deepEqual(query('SELECT repo_id FROM github_repositories WHERE repo_id = 1'), []);
  assert.deepEqual(query("SELECT status, sync_error FROM project_integrations WHERE project_id = 'p-alpha'"), [{ status: 'ERROR', sync_error: 'Repository was deleted on GitHub.' }]);
  assert.equal(query("SELECT COUNT(*) AS n FROM projects WHERE id = 'p-alpha'")[0].n, 1, 'the project itself is never deleted');
});

test('installation lifecycle events update or remove the installation but keep projects', async () => {
  const { deps, query } = await setup();
  await handleWebhookEvent(deps, 'installation', { action: 'suspend', installation: { id: 99 } }, 'd-suspend');
  assert.equal(query('SELECT suspended_at FROM github_installations WHERE id = 99')[0].suspended_at, NOW);
  await handleWebhookEvent(deps, 'installation', { action: 'unsuspend', installation: { id: 99 } }, 'd-unsuspend');
  assert.equal(query('SELECT suspended_at FROM github_installations WHERE id = 99')[0].suspended_at, null);
  assert.equal((await handleWebhookEvent(deps, 'installation', { action: 'created', installation: { id: 555 } }, 'd-created')).status, 'ignored');

  await handleWebhookEvent(deps, 'installation', { action: 'deleted', installation: { id: 99 } }, 'd-deleted');
  assert.equal(query('SELECT COUNT(*) AS n FROM github_installations')[0].n, 0);
  assert.equal(query('SELECT COUNT(*) AS n FROM github_repositories')[0].n, 0);
  assert.equal(query('SELECT COUNT(*) AS n FROM projects')[0].n, 1);
});

test('installation_repositories refreshes discovery for known installations only', async () => {
  const { deps, query, installations } = await setup();
  installations[0].repos.push(makeRepo(3, 'nick/new-repo'));
  const known = await handleWebhookEvent(deps, 'installation_repositories', { action: 'added', installation: { id: 99 } }, 'd-added');
  assert.equal(known.status, 'handled');
  assert.equal(query("SELECT decision FROM github_repositories WHERE repo_id = 3")[0].decision, 'PENDING');
  assert.equal((await handleWebhookEvent(deps, 'installation_repositories', { action: 'added', installation: { id: 12345 } }, 'd-unknown')).status, 'ignored');
});

test('old webhook delivery ids are pruned', async () => {
  const { deps, query, exec } = await setup();
  exec("INSERT INTO github_webhook_deliveries (delivery_id, event, received_at) VALUES ('ancient', 'push', ?)", NOW - 8 * DAY);
  exec("INSERT INTO github_webhook_deliveries (delivery_id, event, received_at) VALUES ('recent', 'push', ?)", NOW - 6 * DAY);
  await handleWebhookEvent(deps, 'star', { repository: repository(1, 'nick/alpha') }, 'fresh');
  assert.deepEqual(query('SELECT delivery_id FROM github_webhook_deliveries ORDER BY delivery_id').map((row) => row.delivery_id), ['fresh', 'recent']);
});

test('tracking a discovered repository creates a fully seeded project and syncs it', async () => {
  const { deps, query, exec } = await setup([{ id: 99, login: 'nick', repos: [makeRepo(1, 'nick/alpha'), makeRepo(2, 'nick/Beta', { pushedAt: iso(200) })] }]);
  seedProject(exec, 'user-1', 'p-existing', null, 'beta');
  const { slug, sync } = await trackRepository(deps, 'user-1', 2, { category: 'Website', priority: 'HIGH' });

  assert.equal(slug, 'beta-2', 'a clashing slug gets a suffix');
  assert.equal(sync.ok, true);
  const created = query<Record<string, unknown>>('SELECT * FROM projects WHERE slug = ?', 'beta-2')[0];
  assert.equal(created.category, 'Website');
  assert.equal(created.priority, 'HIGH');
  assert.equal(created.stage, 'PAUSED', 'no recent activity');
  assert.equal(created.repository_full_name, 'nick/Beta');
  assert.equal(query('SELECT COUNT(*) AS n FROM checklist_items WHERE project_id = ?', created.id)[0].n, 52);
  assert.equal(query('SELECT COUNT(*) AS n FROM checklist_items WHERE project_id = ? AND completed = 1', created.id)[0].n, 6);
  assert.deepEqual(query('SELECT decision, project_id FROM github_repositories WHERE repo_id = 2'), [{ decision: 'TRACKED', project_id: created.id }]);
  assert.equal(query("SELECT status FROM project_integrations WHERE project_id = ?", created.id)[0].status, 'CONNECTED');
  assert.ok(query('SELECT summary FROM project_activity WHERE project_id = ?', created.id).some((row) => row.summary === 'Tracked Beta from GitHub'));
});

test('tracking rejects invalid input, already-tracked repos, and repos owned by someone else', async () => {
  const { deps, exec } = await setup();
  await assert.rejects(trackRepository(deps, 'user-1', 2, { category: 'Nope', priority: 'HIGH' }), /Invalid category/);
  await assert.rejects(trackRepository(deps, 'user-1', 1, { category: 'Website', priority: 'HIGH' }), /already tracked/);
  seedUser(exec, 'user-2');
  await assert.rejects(trackRepository(deps, 'user-2', 2, { category: 'Website', priority: 'HIGH' }), /Repository not found/);
});

test('the scheduled run is a no-op without GitHub credentials and otherwise reconciles', async () => {
  const { db, query, gh } = await setup();
  assert.deepEqual(await runScheduledSync({ DB: db }, gh.fetch), { skipped: 'GitHub integration is not configured.' });

  const env = { DB: db, GITHUB_APP_ID: '12345', GITHUB_APP_PRIVATE_KEY: keys.pkcs1Private, GITHUB_WEBHOOK_SECRET: 'hook-secret', GITHUB_SYNC_BATCH: '2' };
  const result = await runScheduledSync(env, gh.fetch);
  assert.deepEqual(result, { synced: 1, failed: 0, refreshErrors: [] });
  assert.equal(query("SELECT status FROM project_integrations WHERE project_id = 'p-alpha'")[0].status, 'CONNECTED');

  const broken = createFakeGitHub({ appId: 'other', publicKey: keys.pkcs1Public, installations: [], now: () => NOW });
  const failed = await runScheduledSync(env, broken.fetch);
  assert.equal(failed.skipped, undefined);
  assert.equal((failed.refreshErrors ?? []).length, 1, 'a failed installation refresh is reported but does not stop reconciliation');
});
