declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    CF_ACCESS_TEAM_DOMAIN?: string;
    CF_ACCESS_AUD?: string;
    DEV_AUTH_EMAIL?: string;
    GITHUB_APP_ID?: string;
    GITHUB_APP_PRIVATE_KEY?: string;
    GITHUB_WEBHOOK_SECRET?: string;
    GITHUB_APP_SLUG?: string;
    GITHUB_API_URL?: string;
    GITHUB_SYNC_BATCH?: string;
  }
}
