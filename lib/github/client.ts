export const USER_AGENT = 'project-hub';

export class GitHubApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly rateLimited = false,
  ) {
    super(message);
    this.name = 'GitHubApiError';
  }
}

type Fetch = typeof fetch;

export type GitHubClientOptions = {
  token: string;
  apiBase?: string;
  fetch?: Fetch;
};

export class GitHubClient {
  private readonly token: string;
  private readonly apiBase: string;
  private readonly fetchImpl: Fetch;

  constructor(options: GitHubClientOptions) {
    this.token = options.token;
    this.apiBase = (options.apiBase ?? 'https://api.github.com').replace(/\/+$/, '');
    // Workers throws "Illegal invocation" when the global fetch runs with a `this` other than undefined,
    // which is what `this.fetchImpl(...)` would give it. Calling through a plain closure avoids that.
    const fetchFn = options.fetch ?? fetch;
    this.fetchImpl = (input, init) => fetchFn(input, init);
  }

  private async request(path: string, init: RequestInit = {}) {
    const response = await this.fetchImpl(`${this.apiBase}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': USER_AGENT,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
    const text = await response.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
    }
    if (!response.ok) {
      const message = (body as { message?: string } | null)?.message ?? response.statusText;
      const rateLimited = response.status === 429 || (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0');
      throw new GitHubApiError(response.status, message, rateLimited);
    }
    return body;
  }

  async rest<T>(path: string) {
    return (await this.request(path)) as T | null;
  }

  async graphql<T>(query: string, variables: Record<string, unknown>) {
    const body = (await this.request('/graphql', { method: 'POST', body: JSON.stringify({ query, variables }) })) as {
      data?: T;
      errors?: { type?: string; message: string }[];
    } | null;
    if (body?.errors?.length) {
      const notFound = body.errors.some((error) => error.type === 'NOT_FOUND');
      throw new GitHubApiError(notFound ? 404 : 502, body.errors.map((error) => error.message).join('; '));
    }
    if (!body?.data) throw new GitHubApiError(502, 'GitHub returned an empty GraphQL response.');
    return body.data;
  }
}
