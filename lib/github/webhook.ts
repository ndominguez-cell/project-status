import { refreshInstallations, syncProject, type SyncDeps } from './sync-store';

const encoder = new TextEncoder();
const DELIVERY_RETENTION_MS = 7 * 86_400_000;

function hexToBytes(hex: string) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  return bytes;
}

export async function verifyWebhookSignature(secret: string, body: BufferSource, header: string | null) {
  if (!header?.startsWith('sha256=')) return false;
  const hex = header.slice('sha256='.length);
  if (!/^[0-9a-f]{64}$/i.test(hex)) return false;
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  return crypto.subtle.verify('HMAC', key, hexToBytes(hex), body);
}

export async function signWebhookBody(secret: string, body: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(body)));
  return `sha256=${Array.from(signature, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

export type WebhookResult = { status: 'handled' | 'ignored' | 'duplicate'; detail?: string };

export type WebhookPayload = {
  action?: string;
  ref?: string;
  ref_type?: string;
  deleted?: boolean;
  number?: number;
  commits?: unknown[];
  sender?: { login?: string };
  repository?: { id: number; full_name: string; html_url?: string; private?: boolean; archived?: boolean; default_branch?: string };
  installation?: { id: number; suspended_at?: string | null };
  pull_request?: { title?: string; merged?: boolean; html_url?: string };
  issue?: { number: number; title?: string; html_url?: string };
  workflow_run?: { name?: string; conclusion?: string | null; head_branch?: string | null; html_url?: string };
  changes?: { repository?: { name?: { from?: string } } };
};

const clip = (value: string | undefined, length = 120) => (value ?? '').replace(/\s+/g, ' ').trim().slice(0, length);
const branchOf = (ref: string | undefined) => ref?.replace(/^refs\/heads\//, '') ?? '';

async function trackedProject(deps: SyncDeps, repoId: number) {
  return deps.db
    .prepare(
      `SELECT p.id AS id, p.owner_id AS owner_id, p.repository_full_name AS full_name
       FROM github_repositories r JOIN projects p ON p.id = r.project_id
       WHERE r.repo_id = ? AND r.decision = 'TRACKED'`,
    )
    .bind(repoId)
    .first<{ id: string; owner_id: string; full_name: string }>();
}

async function recordActivity(deps: SyncDeps, projectId: string, eventType: string, summary: string, payload: WebhookPayload, deliveryId: string, now: number) {
  await deps.db
    .prepare('INSERT INTO project_activity (id, project_id, actor_id, event_type, summary, metadata_json, created_at) VALUES (?, ?, NULL, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), projectId, eventType, summary.slice(0, 240), JSON.stringify({ delivery: deliveryId, sender: payload.sender?.login ?? null }), now)
    .run();
}

function describe(event: string, payload: WebhookPayload): { summary: string; sync: boolean } | null {
  const action = payload.action ?? '';
  switch (event) {
    case 'push': {
      if (payload.deleted || payload.ref?.startsWith('refs/tags/')) return null;
      const count = payload.commits?.length ?? 0;
      return { summary: `Pushed ${count} commit${count === 1 ? '' : 's'} to ${branchOf(payload.ref)}`, sync: true };
    }
    case 'create':
    case 'delete':
      return payload.ref_type === 'branch' ? { summary: `Branch ${payload.ref} ${event === 'create' ? 'created' : 'deleted'}`, sync: true } : null;
    case 'pull_request': {
      if (!['opened', 'closed', 'reopened', 'ready_for_review', 'converted_to_draft'].includes(action)) return null;
      const verb = action === 'closed' && payload.pull_request?.merged ? 'merged' : action.replaceAll('_', ' ');
      return { summary: `Pull request #${payload.number} ${verb}: ${clip(payload.pull_request?.title)}`, sync: true };
    }
    case 'issues':
      return ['opened', 'closed', 'reopened', 'deleted'].includes(action) ? { summary: `Issue #${payload.issue?.number} ${action}: ${clip(payload.issue?.title)}`, sync: true } : null;
    case 'workflow_run':
      return action === 'completed' ? { summary: `Workflow ${clip(payload.workflow_run?.name, 60)} ${payload.workflow_run?.conclusion ?? 'finished'} on ${payload.workflow_run?.head_branch ?? 'unknown branch'}`, sync: true } : null;
    default:
      return null;
  }
}

async function handleRepositoryEvent(deps: SyncDeps, payload: WebhookPayload, deliveryId: string, now: number): Promise<WebhookResult> {
  const repo = payload.repository;
  if (!repo) return { status: 'ignored', detail: 'no repository' };
  const tracked = await trackedProject(deps, repo.id);
  const action = payload.action ?? '';

  if (action === 'deleted') {
    await deps.db.prepare('DELETE FROM github_repositories WHERE repo_id = ?').bind(repo.id).run();
    if (tracked) {
      await deps.db
        .prepare("UPDATE project_integrations SET status = 'ERROR', sync_error = 'Repository was deleted on GitHub.', updated_at = ? WHERE project_id = ? AND provider = 'GITHUB'")
        .bind(now, tracked.id)
        .run();
      await recordActivity(deps, tracked.id, 'GITHUB_REPOSITORY', 'Repository deleted on GitHub', payload, deliveryId, now);
    }
    return { status: 'handled', detail: 'repository deleted' };
  }

  if (!tracked) return { status: 'ignored', detail: 'untracked repository' };

  if (action === 'renamed') {
    await deps.db.batch([
      deps.db.prepare('UPDATE github_repositories SET full_name = ?, updated_at = ? WHERE repo_id = ?').bind(repo.full_name, now, repo.id),
      deps.db.prepare('UPDATE projects SET repository_full_name = ?, repository_url = COALESCE(?, repository_url) WHERE id = ?').bind(repo.full_name, repo.html_url ?? null, tracked.id),
    ]);
    await recordActivity(deps, tracked.id, 'GITHUB_REPOSITORY', `Repository renamed to ${repo.full_name}`, payload, deliveryId, now);
    await syncProject(deps, { id: tracked.id, ownerId: tracked.owner_id, repositoryFullName: repo.full_name });
    return { status: 'handled', detail: 'repository renamed' };
  }

  if (['archived', 'unarchived', 'privatized', 'publicized', 'edited', 'transferred'].includes(action)) {
    await recordActivity(deps, tracked.id, 'GITHUB_REPOSITORY', `Repository ${action}`, payload, deliveryId, now);
    await syncProject(deps, { id: tracked.id, ownerId: tracked.owner_id, repositoryFullName: repo.full_name });
    return { status: 'handled', detail: `repository ${action}` };
  }

  return { status: 'ignored', detail: `repository ${action}` };
}

async function handleInstallationEvent(deps: SyncDeps, payload: WebhookPayload, now: number): Promise<WebhookResult> {
  const id = payload.installation?.id;
  if (!id) return { status: 'ignored', detail: 'no installation' };
  const action = payload.action ?? '';
  if (action === 'deleted') {
    await deps.db.prepare('DELETE FROM github_installations WHERE id = ?').bind(id).run();
    return { status: 'handled', detail: 'installation removed' };
  }
  if (action === 'suspend' || action === 'unsuspend') {
    await deps.db.prepare('UPDATE github_installations SET suspended_at = ?, updated_at = ? WHERE id = ?').bind(action === 'suspend' ? now : null, now, id).run();
    return { status: 'handled', detail: `installation ${action}` };
  }
  return { status: 'ignored', detail: `installation ${action}` };
}

export async function handleWebhookEvent(deps: SyncDeps, event: string, payload: WebhookPayload, deliveryId: string): Promise<WebhookResult> {
  const now = deps.now?.() ?? Date.now();
  if (event === 'ping') return { status: 'handled', detail: 'pong' };

  const inserted = await deps.db.prepare('INSERT OR IGNORE INTO github_webhook_deliveries (delivery_id, event, received_at) VALUES (?, ?, ?)').bind(deliveryId, event, now).run();
  if (inserted.meta.changes === 0) return { status: 'duplicate' };
  await deps.db.prepare('DELETE FROM github_webhook_deliveries WHERE received_at < ?').bind(now - DELIVERY_RETENTION_MS).run();

  try {
    if (event === 'installation') return await handleInstallationEvent(deps, payload, now);

    if (event === 'installation_repositories') {
      const id = payload.installation?.id;
      const owner = id ? await deps.db.prepare('SELECT owner_id FROM github_installations WHERE id = ?').bind(id).first<{ owner_id: string }>() : null;
      if (!owner) return { status: 'ignored', detail: 'installation not linked to a user' };
      await refreshInstallations(deps, owner.owner_id);
      return { status: 'handled', detail: 'repositories refreshed' };
    }

    if (event === 'repository') return await handleRepositoryEvent(deps, payload, deliveryId, now);

    const repoId = payload.repository?.id;
    const description = describe(event, payload);
    if (!repoId || !description) return { status: 'ignored', detail: event };
    const project = await trackedProject(deps, repoId);
    if (!project) return { status: 'ignored', detail: 'untracked repository' };

    await recordActivity(deps, project.id, `GITHUB_${event.toUpperCase()}`, description.summary, payload, deliveryId, now);
    if (description.sync) await syncProject(deps, { id: project.id, ownerId: project.owner_id, repositoryFullName: payload.repository?.full_name ?? project.full_name });
    return { status: 'handled', detail: description.summary };
  } catch (error) {
    await deps.db.prepare('DELETE FROM github_webhook_deliveries WHERE delivery_id = ?').bind(deliveryId).run();
    throw error;
  }
}
