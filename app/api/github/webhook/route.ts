import { env } from 'cloudflare:workers';
import { readGitHubConfig } from '@/lib/github/config';
import { handleWebhookEvent, verifyWebhookSignature, type WebhookPayload } from '@/lib/github/webhook';

export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 5 * 1024 * 1024;

export async function POST(request: Request) {
  const config = readGitHubConfig(env);
  if (!config) return Response.json({ error: 'GitHub integration is not configured.' }, { status: 503 });

  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) return Response.json({ error: 'Payload too large.' }, { status: 413 });
  const body = await request.arrayBuffer();
  if (body.byteLength > MAX_BODY_BYTES) return Response.json({ error: 'Payload too large.' }, { status: 413 });

  if (!(await verifyWebhookSignature(config.webhookSecret, body, request.headers.get('x-hub-signature-256')))) {
    return Response.json({ error: 'Invalid signature.' }, { status: 401 });
  }

  const event = request.headers.get('x-github-event');
  const delivery = request.headers.get('x-github-delivery');
  if (!event || !delivery) return Response.json({ error: 'Missing GitHub event headers.' }, { status: 400 });

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(body)) as WebhookPayload;
  } catch {
    return Response.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  try {
    return Response.json(await handleWebhookEvent({ db: env.DB, config }, event, payload, delivery));
  } catch (error) {
    console.error('GitHub webhook failed', event, error instanceof Error ? error.message : error);
    return Response.json({ error: 'Webhook processing failed.' }, { status: 500 });
  }
}

export function GET() {
  return Response.json({ error: 'Method not allowed.' }, { status: 405, headers: { Allow: 'POST' } });
}
