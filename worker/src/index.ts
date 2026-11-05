import { createApp } from './app';
import { D1Store } from './store';

export interface Env {
  DB: D1Database;
}

let cached: { db: D1Database; app: ReturnType<typeof createApp> } | null = null;

export default {
  fetch(request: Request, env: Env): Promise<Response> | Response {
    if (!cached || cached.db !== env.DB) cached = { db: env.DB, app: createApp(new D1Store(env.DB)) };
    return cached.app.fetch(request);
  },
};
