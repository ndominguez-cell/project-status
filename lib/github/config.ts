export type GitHubEnv = {
  GITHUB_APP_ID?: string;
  GITHUB_APP_PRIVATE_KEY?: string;
  GITHUB_WEBHOOK_SECRET?: string;
  GITHUB_APP_SLUG?: string;
  GITHUB_API_URL?: string;
  GITHUB_SYNC_BATCH?: string;
};

export type GitHubConfig = {
  appId: string;
  privateKey: string;
  webhookSecret: string;
  appSlug: string | null;
  apiBase: string;
  syncBatch: number;
};

export function readGitHubConfig(env: GitHubEnv): GitHubConfig | null {
  const appId = env.GITHUB_APP_ID?.trim();
  const privateKey = env.GITHUB_APP_PRIVATE_KEY?.trim();
  const webhookSecret = env.GITHUB_WEBHOOK_SECRET?.trim();
  if (!appId || !privateKey || !webhookSecret) return null;
  const batch = Number.parseInt(env.GITHUB_SYNC_BATCH ?? '', 10);
  return {
    appId,
    privateKey: privateKey.replaceAll('\\n', '\n'),
    webhookSecret,
    appSlug: env.GITHUB_APP_SLUG?.trim() || null,
    apiBase: (env.GITHUB_API_URL?.trim() || 'https://api.github.com').replace(/\/+$/, ''),
    syncBatch: Number.isFinite(batch) && batch > 0 ? Math.min(batch, 10) : 4,
  };
}
