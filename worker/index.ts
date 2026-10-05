import handler from 'vinext/server/fetch-handler';
import { runScheduledSync, type ScheduledEnv } from '../lib/github/scheduled';

const worker = {
  fetch(request: Request, env: unknown, ctx: ExecutionContext) {
    return handler.fetch(request, env, ctx);
  },
  scheduled(_controller: ScheduledController, env: ScheduledEnv, ctx: ExecutionContext) {
    ctx.waitUntil(
      runScheduledSync(env).then(
        (result) => console.log('GitHub sync', JSON.stringify(result)),
        (error: unknown) => console.error('GitHub sync failed', error instanceof Error ? error.message : error),
      ),
    );
  },
};

export default worker;
