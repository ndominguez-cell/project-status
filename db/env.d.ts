declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    CF_ACCESS_TEAM_DOMAIN?: string;
    CF_ACCESS_AUD?: string;
    DEV_AUTH_EMAIL?: string;
  }
}
