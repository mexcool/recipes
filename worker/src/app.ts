/**
 * Sync service: one household document plus fine-grained shopping-check operations.
 *
 * Identity is a capability token in the Authorization header; the server stores only its SHA-256. The
 * document is updated with compare-and-set on a version counter (409 on conflict → the client reloads).
 * Shopping checks are idempotent operations keyed by (household, op id), merged last-writer-wins by
 * their timestamp; a check that lost to a newer opposite op is reported back as a conflict instead of
 * being silently overwritten. A document from an older app schema never overwrites a newer one (426).
 */
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import type { ListOp, SyncStore } from './store';

/** Byte-measured, well under D1's per-value limit; a household with a year of weeks is ~0.4 MB. */
export const MAX_DOC_BYTES = 1.5 * 1024 * 1024;
export const MAX_OPS_PER_REQUEST = 500;
/** Ticks older than this are forgotten; a phone away for longer re-joins from the document anyway. */
const OPS_RETENTION_DAYS = 120;
const MAX_OPS_BODY_BYTES = 256 * 1024;
const MAX_DOC_BODY_BYTES = MAX_DOC_BYTES + 64 * 1024;

export interface AppOptions {
  /** When set, creating a household requires `Authorization: Bearer <createKey>`. */
  createKey?: string;
}

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function newToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const isText = (x: unknown, max: number): x is string =>
  typeof x === 'string' && x.length > 0 && x.length <= max;
const isFiniteNonNeg = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0;
const isTimestamp = (x: unknown): x is string => isText(x, 40) && !Number.isNaN(Date.parse(x));

/** Why an operation is unacceptable, or null when it is well-formed. */
export function opProblem(x: unknown): string | null {
  if (!x || typeof x !== 'object') return 'not an object';
  const o = x as Record<string, unknown>;
  if (!isText(o.opId, 64)) return 'opId';
  if (!isText(o.weekId, 64)) return 'weekId';
  if (!isText(o.key, 200)) return 'key';
  if (typeof o.checked !== 'boolean') return 'checked';
  if (!isFiniteNonNeg(o.coveredG)) return 'coveredG';
  if (!isText(o.by, 64)) return 'by';
  if (!isTimestamp(o.at)) return 'at';
  if (!isFiniteNonNeg(o.rev) || !Number.isInteger(o.rev)) return 'rev';
  return null;
}

function cleanOp(o: ListOp): ListOp {
  return {
    opId: o.opId,
    weekId: o.weekId,
    key: o.key,
    checked: o.checked,
    coveredG: o.coveredG,
    by: o.by,
    at: o.at,
    rev: o.rev,
  };
}

/** A document body: a plain object with an integer schemaVersion; returns its JSON and version or a problem. */
function docOf(x: unknown): { json: string; schemaVersion: number; bytes: number } | { problem: string } {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return { problem: 'doc must be an object' };
  const sv = (x as { schemaVersion?: unknown }).schemaVersion ?? 0;
  if (typeof sv !== 'number' || !Number.isInteger(sv) || sv < 0 || sv > 1_000_000)
    return { problem: 'doc.schemaVersion must be a non-negative integer' };
  const json = JSON.stringify(x);
  return { json, schemaVersion: sv, bytes: new TextEncoder().encode(json).length };
}

export function createApp(store: SyncStore, options: AppOptions = {}) {
  const app = new Hono();
  app.use(
    '*',
    cors({
      origin: '*',
      allowMethods: ['GET', 'POST', 'PUT', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
      maxAge: 86400,
    }),
  );
  app.use('*', async (c, next) => {
    await next();
    c.header('Referrer-Policy', 'no-referrer');
    c.header('Cache-Control', 'no-store');
    c.header('X-Content-Type-Options', 'nosniff');
  });
  const tooLarge = (c: { json: (b: unknown, s: 413) => Response }) =>
    c.json({ error: 'body too large' }, 413);
  app.use('/h', bodyLimit({ maxSize: MAX_DOC_BODY_BYTES, onError: tooLarge }));
  app.use('/h/doc', bodyLimit({ maxSize: MAX_DOC_BODY_BYTES, onError: tooLarge }));
  app.use('/h/ops', bodyLimit({ maxSize: MAX_OPS_BODY_BYTES, onError: tooLarge }));

  app.get('/', (c) => c.json({ service: 'stasera-sync', ok: true }));

  /** The capability token travels in the Authorization header, never in the path, so request logs never see it. */
  const tokenOf = (c: { req: { header: (n: string) => string | undefined } }): string =>
    (c.req.header('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  const withHousehold = async (token: string) =>
    token ? store.getByTokenHash(await sha256Hex(token)) : null;

  /** Create a household from a document; returns the capability token (shown once). */
  app.post('/h', async (c) => {
    if (options.createKey && tokenOf(c) !== options.createKey)
      return c.json({ error: 'this service needs its setup key to create a household' }, 401);
    const body = await readJson(c.req.raw);
    if (!body || typeof body !== 'object' || !('doc' in body)) return c.json({ error: 'doc required' }, 400);
    const d = docOf((body as { doc: unknown }).doc);
    if ('problem' in d) return c.json({ error: d.problem }, 400);
    if (d.bytes > MAX_DOC_BYTES) return c.json({ error: 'document too large' }, 413);
    const token = newToken();
    const id = `hh-${newToken().slice(0, 12)}`;
    const now = new Date().toISOString();
    await store.create({
      id,
      tokenHash: await sha256Hex(token),
      doc: d.json,
      schemaVersion: d.schemaVersion,
      version: 1,
      updatedAt: now,
    });
    return c.json({ token, id, version: 1 }, 201);
  });

  app.get('/h/state', async (c) => {
    const row = await withHousehold(tokenOf(c));
    if (!row) return c.json({ error: 'not found' }, 404);
    const since = nonNegInt(c.req.query('since'));
    const sinceSeq = nonNegInt(c.req.query('sinceSeq'));
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

  app.put('/h/doc', async (c) => {
    const row = await withHousehold(tokenOf(c));
    if (!row) return c.json({ error: 'not found' }, 404);
    const body = await readJson(c.req.raw);
    if (!body || typeof body !== 'object' || !('doc' in body))
      return c.json({ error: 'baseVersion and doc required' }, 400);
    const { baseVersion, doc } = body as { baseVersion?: unknown; doc: unknown };
    if (typeof baseVersion !== 'number' || !Number.isInteger(baseVersion) || baseVersion < 0)
      return c.json({ error: 'baseVersion must be a non-negative integer' }, 400);
    const d = docOf(doc);
    if ('problem' in d) return c.json({ error: d.problem }, 400);
    if (d.bytes > MAX_DOC_BYTES) return c.json({ error: 'document too large' }, 413);
    if (d.schemaVersion < row.schemaVersion)
      return c.json({ error: 'schema_behind', schemaVersion: row.schemaVersion, version: row.version }, 426);
    const ok = await store.updateDoc(row.id, baseVersion, d.json, d.schemaVersion, new Date().toISOString());
    if (!ok) {
      const fresh = await withHousehold(tokenOf(c));
      return c.json(
        {
          error: 'conflict',
          version: fresh?.version ?? row.version,
          schemaVersion: fresh?.schemaVersion ?? row.schemaVersion,
          doc: fresh ? JSON.parse(fresh.doc) : undefined,
        },
        409,
      );
    }
    return c.json({ version: baseVersion + 1 });
  });

  app.post('/h/ops', async (c) => {
    const row = await withHousehold(tokenOf(c));
    if (!row) return c.json({ error: 'not found' }, 404);
    const body = await readJson(c.req.raw);
    const raw =
      body && typeof body === 'object' && Array.isArray((body as { ops?: unknown }).ops)
        ? (body as { ops: unknown[] }).ops
        : null;
    if (!raw) return c.json({ error: 'ops must be an array' }, 400);
    if (raw.length > MAX_OPS_PER_REQUEST)
      return c.json({ error: `at most ${MAX_OPS_PER_REQUEST} operations per request` }, 400);
    // Malformed operations are named and skipped, never a reason to refuse the well-formed ones:
    // one bad op must not block a phone's whole queue.
    const rejected: { opId?: string; reason: string }[] = [];
    const ops: ListOp[] = [];
    for (const x of raw) {
      const problem = opProblem(x);
      if (problem) {
        const id = x && typeof x === 'object' ? (x as { opId?: unknown }).opId : undefined;
        rejected.push({ ...(typeof id === 'string' ? { opId: id.slice(0, 64) } : {}), reason: problem });
      } else ops.push(cleanOp(x as ListOp));
    }
    const latest = await store.latestOpsFor(
      row.id,
      ops.map((o) => ({ weekId: o.weekId, key: o.key })),
    );
    const conflicts: { opId: string; winner: ListOp }[] = [];
    for (const op of ops) {
      const l = latest.get(`${op.weekId}\u0000${op.key}`);
      if (l && l.opId !== op.opId && l.at > op.at && l.checked !== op.checked)
        conflicts.push({ opId: op.opId, winner: l });
    }
    const applied = await store.insertOps(row.id, ops);
    if (applied.length)
      await store.pruneOps(row.id, new Date(Date.now() - OPS_RETENTION_DAYS * 86_400_000).toISOString());
    return c.json({
      applied: applied.map((o) => o.opId),
      // Already stored earlier (a retry): nothing to do, but the client may forget them too.
      duplicates: ops.filter((o) => !applied.some((a) => a.opId === o.opId)).map((o) => o.opId),
      rejected,
      conflicts,
      lastSeq: applied.length ? applied[applied.length - 1]!.seq : undefined,
    });
  });

  app.post('/h/rotate', async (c) => {
    const row = await withHousehold(tokenOf(c));
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

function nonNegInt(s: string | undefined): number {
  const n = Number(s ?? 0);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
