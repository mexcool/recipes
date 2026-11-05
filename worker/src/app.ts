/**
 * Sync service: one household document plus fine-grained shopping-check operations.
 *
 * Identity is a capability token in the URL; the server stores only its SHA-256. The document is
 * updated with compare-and-set on a version counter (409 on conflict → the client reloads). Shopping
 * checks are idempotent operations keyed by op id, merged last-writer-wins by their timestamp; a check
 * that lost to a newer opposite op is reported back as a conflict instead of being silently overwritten.
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { ListOp, SyncStore } from './store';

const MAX_DOC_BYTES = 4 * 1024 * 1024;

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function newToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function isOp(x: unknown): x is ListOp {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return typeof o.opId === 'string' && typeof o.weekId === 'string' && typeof o.key === 'string' && typeof o.checked === 'boolean' && typeof o.coveredG === 'number' && typeof o.by === 'string' && typeof o.at === 'string' && typeof o.rev === 'number';
}

export function createApp(store: SyncStore) {
  const app = new Hono();
  app.use('*', cors({ origin: '*', allowMethods: ['GET', 'POST', 'PUT', 'OPTIONS'], allowHeaders: ['Content-Type'], maxAge: 86400 }));
  app.use('*', async (c, next) => {
    await next();
    c.header('Referrer-Policy', 'no-referrer');
    c.header('Cache-Control', 'no-store');
    c.header('X-Content-Type-Options', 'nosniff');
  });

  app.get('/', (c) => c.json({ service: 'stasera-sync', ok: true }));

  /** Create a household from a document; returns the capability token (shown once). */
  app.post('/h', async (c) => {
    const body = await readJson(c.req.raw);
    if (!body || typeof body !== 'object' || !('doc' in body)) return c.json({ error: 'doc required' }, 400);
    const doc = JSON.stringify((body as { doc: unknown }).doc);
    if (doc.length > MAX_DOC_BYTES) return c.json({ error: 'document too large' }, 413);
    const schemaVersion = Number(((body as { doc: { schemaVersion?: number } }).doc).schemaVersion ?? 0);
    const token = newToken();
    const id = `hh-${newToken().slice(0, 12)}`;
    const now = new Date().toISOString();
    await store.create({ id, tokenHash: await sha256Hex(token), doc, schemaVersion, version: 1, updatedAt: now });
    return c.json({ token, id, version: 1 }, 201);
  });

  const withHousehold = async (token: string) => store.getByTokenHash(await sha256Hex(token));

  app.get('/h/:t/state', async (c) => {
    const row = await withHousehold(c.req.param('t'));
    if (!row) return c.json({ error: 'not found' }, 404);
    const since = Number(c.req.query('since') ?? 0);
    const sinceSeq = Number(c.req.query('sinceSeq') ?? 0);
    const ops = await store.opsSince(row.id, sinceSeq);
    return c.json({
      id: row.id,
      version: row.version,
      schemaVersion: row.schemaVersion,
      updatedAt: row.updatedAt,
      ...(row.version > since ? { doc: JSON.parse(row.doc) } : {}),
      ops,
      lastSeq: ops.length ? ops[ops.length - 1]!.seq : sinceSeq,
      serverTime: new Date().toISOString(),
    });
  });

  app.put('/h/:t/doc', async (c) => {
    const row = await withHousehold(c.req.param('t'));
    if (!row) return c.json({ error: 'not found' }, 404);
    const body = await readJson(c.req.raw);
    if (!body || typeof body !== 'object' || !('doc' in body) || typeof (body as { baseVersion?: unknown }).baseVersion !== 'number') return c.json({ error: 'baseVersion and doc required' }, 400);
    const { baseVersion, doc } = body as { baseVersion: number; doc: { schemaVersion?: number } };
    const json = JSON.stringify(doc);
    if (json.length > MAX_DOC_BYTES) return c.json({ error: 'document too large' }, 413);
    const ok = await store.updateDoc(row.id, baseVersion, json, Number(doc.schemaVersion ?? row.schemaVersion), new Date().toISOString());
    if (!ok) {
      const fresh = await withHousehold(c.req.param('t'));
      return c.json({ error: 'conflict', version: fresh?.version ?? row.version, doc: fresh ? JSON.parse(fresh.doc) : undefined }, 409);
    }
    return c.json({ version: baseVersion + 1 });
  });

  app.post('/h/:t/ops', async (c) => {
    const row = await withHousehold(c.req.param('t'));
    if (!row) return c.json({ error: 'not found' }, 404);
    const body = await readJson(c.req.raw);
    const ops = body && typeof body === 'object' && Array.isArray((body as { ops?: unknown }).ops) ? (body as { ops: unknown[] }).ops : null;
    if (!ops || ops.length > 500 || !ops.every(isOp)) return c.json({ error: 'ops must be an array of at most 500 valid operations' }, 400);
    const conflicts: { opId: string; winner: ListOp }[] = [];
    for (const op of ops) {
      const latest = await store.latestOpFor(row.id, op.weekId, op.key);
      if (latest && latest.opId !== op.opId && latest.at > op.at && latest.checked !== op.checked) conflicts.push({ opId: op.opId, winner: latest });
    }
    const applied = await store.insertOps(row.id, ops);
    return c.json({ applied: applied.map((o) => o.opId), conflicts, lastSeq: applied.length ? applied[applied.length - 1]!.seq : undefined });
  });

  app.post('/h/:t/rotate', async (c) => {
    const row = await withHousehold(c.req.param('t'));
    if (!row) return c.json({ error: 'not found' }, 404);
    const token = newToken();
    await store.rotateToken(row.id, await sha256Hex(token));
    return c.json({ token });
  });

  app.notFound((c) => c.json({ error: 'not found' }, 404));
  app.onError((err, c) => {
    console.error(err.message);
    return c.json({ error: 'server error' }, 500);
  });
  return app;
}

async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
