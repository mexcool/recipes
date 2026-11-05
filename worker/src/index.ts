import { createApp } from './app';
import { D1Store } from './store';

export interface Env {
  DB: D1Database;
  /** Optional: when set (wrangler secret put CREATE_KEY), creating a household needs this key. */
  CREATE_KEY?: string;
}

let cached: { db: D1Database; app: ReturnType<typeof createApp> } | null = null;

export default {
  fetch(request: Request, env: Env): Promise<Response> | Response {
    if (!cached || cached.db !== env.DB)
      cached = {
        db: env.DB,
        app: createApp(new D1Store(env.DB), env.CREATE_KEY ? { createKey: env.CREATE_KEY } : {}),
      };
    return cached.app.fetch(request);
  },
};
