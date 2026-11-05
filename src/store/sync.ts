/**
 * Two-phone sync over the optional companion service (worker/). Local-first: everything works without
 * it. When configured, one round (1) pushes queued shopping-check operations, (2) pushes the document
 * with compare-and-set if it changed, (3) pulls a newer document and any operations, folding checks
 * last-writer-wins. The capability token lives only in the household document on the phone and in the
 * Authorization header of requests; it is never exported, never in a URL path, never in the body.
 *
 * A round that finds nothing new changes nothing locally, so it never triggers another round.
 */
import type { Household, Purchase } from '@/core/model';
import { SCHEMA_VERSION } from '@/core/model';
import { migrateHousehold } from '@/core/household';
import { db, type OutboxOp } from './db';
import { store } from './store';

export interface SyncStatus {
  state: 'idle' | 'syncing' | 'error' | 'unconfigured' | 'conflict';
  lastSync?: string;
  message?: string;
  pending: number;
  /** Sticky notice about a change taken from the other phone; stays until dismissed. */
  notice?: string;
  /** The other phone runs a newer app: this one keeps ticks flowing but cannot take their plan. */
  updateRequired?: boolean;
}

export interface CheckOp {
  opId: string;
  weekId: string;
  key: string;
  checked: boolean;
  coveredG: number;
  by: string;
  at: string;
  rev: number;
}

type Listener = (s: SyncStatus) => void;
const listeners = new Set<Listener>();
let status: SyncStatus = { state: 'unconfigured', pending: 0 };
let inFlight: Promise<SyncStatus> | null = null;
/** True while a sync round replaces the document, so the store listener does not schedule another round. */
let applyingRemote = false;

const OPS_PER_REQUEST = 200;

function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  for (const l of listeners) l(status);
}

export function subscribeSync(fn: Listener): () => void {
  listeners.add(fn);
  fn(status);
  return () => listeners.delete(fn);
}

export function getSyncStatus(): SyncStatus {
  return status;
}

export function dismissNotice(): void {
  setStatus({ notice: undefined, state: status.state === 'conflict' ? 'idle' : status.state });
}

/** Resolves once no sync round is in flight (tests and the e2e harness). */
export async function awaitIdle(): Promise<void> {
  while (inFlight) await inFlight;
}

/** Only for tests: forget module state between cases. */
export function __resetSyncForTests(): void {
  status = { state: 'unconfigured', pending: 0 };
  inFlight = null;
  applyingRemote = false;
  if (timer) clearTimeout(timer);
  timer = null;
}

/** The document as sent to the service: purchases travel as operations, the token never travels in the body. */
export function docForSync(h: Household): Omit<Household, 'purchases' | 'sync'> {
  const copy = { ...h } as Partial<Household>;
  delete copy.purchases;
  delete copy.sync;
  return copy as Omit<Household, 'purchases' | 'sync'>;
}

/** A service URL the app accepts: https, or plain http only on this machine (development). */
export function serviceUrlProblem(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return 'Enter the full service address, starting with https://';
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local))
    return 'The service address must start with https:// (plain http only for localhost).';
  return null;
}

export async function queueCheck(op: CheckOp): Promise<void> {
  if (!store.get().sync) return;
  await db.outbox.put({ opId: op.opId, kind: 'check', payload: op, at: op.at, rev: op.rev });
  setStatus({ pending: await db.outbox.count() });
}

/** Ticks made before this phone was connected: send them as operations so the other phone sees them. */
async function queuePurchases(h: Household): Promise<void> {
  const ops: OutboxOp[] = [];
  for (const [weekId, items] of Object.entries(h.purchases))
    for (const [key, p] of Object.entries(items))
      ops.push({
        opId: p.opId,
        kind: 'check',
        payload: {
          opId: p.opId,
          weekId,
          key,
          checked: p.coveredG > 0,
          coveredG: p.coveredG,
          by: p.by,
          at: p.at,
          rev: p.rev,
        } satisfies CheckOp,
        at: p.at,
        rev: p.rev,
      });
  if (ops.length) await db.outbox.bulkPut(ops);
}

/**
 * Fold operations into the purchases map, newest `at` wins per (week, key). An uncheck leaves a
 * tombstone (coveredG 0) so that an older check arriving later cannot resurrect the item.
 */
export function foldOps(purchases: Household['purchases'], ops: CheckOp[]): Household['purchases'] {
  const out: Household['purchases'] = Object.fromEntries(
    Object.entries(purchases).map(([k, v]) => [k, { ...v }]),
  );
  const latestAt = new Map<string, string>();
  for (const [w, items] of Object.entries(out))
    for (const [k, v] of Object.entries(items)) latestAt.set(`${w}|${k}`, v.at);
  for (const op of [...ops].sort((a, b) => a.at.localeCompare(b.at))) {
    const id = `${op.weekId}|${op.key}`;
    const seen = latestAt.get(id);
    if (seen && seen > op.at) continue;
    latestAt.set(id, op.at);
    const week = { ...(out[op.weekId] ?? {}) };
    week[op.key] = {
      coveredG: op.checked ? op.coveredG : 0,
      at: op.at,
      by: op.by,
      opId: op.opId,
      rev: op.rev,
    } satisfies Purchase;
    out[op.weekId] = week;
  }
  return out;
}

async function api(url: string, init?: RequestInit, token?: string): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
}

export function serviceBase(serviceUrl: string): string {
  return serviceUrl.replace(/\/+$/, '');
}

async function setCursor(lastSeq: number): Promise<void> {
  await db.kv.put({ key: 'sync.lastSeq', value: lastSeq, updatedAt: new Date().toISOString() });
}

async function setDirty(dirty: boolean): Promise<void> {
  await db.kv.put({ key: 'sync.dirty', value: dirty, updatedAt: new Date().toISOString() });
}

/** Adopt a document without waking the sync trigger. */
function replaceQuietly(h: Household): void {
  applyingRemote = true;
  try {
    store.replace(h);
  } finally {
    applyingRemote = false;
  }
}

/** Create a household on the service and store the returned token locally. */
export async function connectNew(serviceUrl: string, createKey?: string): Promise<SyncStatus> {
  const problem = serviceUrlProblem(serviceUrl);
  if (problem) throw new Error(problem);
  const h = store.get();
  const res = await api(
    `${serviceBase(serviceUrl)}/h`,
    { method: 'POST', body: JSON.stringify({ doc: docForSync(h) }) },
    createKey?.trim() || undefined,
  );
  if (res.status === 401) throw new Error('This service needs its setup key to create a household.');
  if (!res.ok) throw new Error(`Service refused (${res.status})`);
  const { token, version } = (await res.json()) as { token: string; version: number };
  await db.outbox.clear();
  await setCursor(0);
  await setDirty(false);
  replaceQuietly({
    ...store.get(),
    sync: { serviceUrl: serviceBase(serviceUrl), token, lastVersion: version },
  });
  await queuePurchases(store.get());
  setStatus({ state: 'idle', lastSync: new Date().toISOString(), message: 'Connected', notice: undefined });
  return syncNow();
}

/**
 * Join a household from a link. A phone that already belongs to that household (a rotated link) only
 * takes the new token and keeps its unsent work; any other phone replaces its data with the service's.
 */
export async function joinExisting(serviceUrl: string, token: string): Promise<SyncStatus> {
  const problem = serviceUrlProblem(serviceUrl);
  if (problem) throw new Error(problem);
  const base = serviceBase(serviceUrl);
  const res = await api(`${base}/h/state?since=0&sinceSeq=0`, undefined, token);
  if (!res.ok)
    throw new Error(res.status === 404 ? 'That link is not valid any more' : `Service error (${res.status})`);
  const data = (await res.json()) as {
    version: number;
    schemaVersion: number;
    doc: { id?: unknown };
    ops: CheckOp[];
    lastSeq: number;
  };
  const local = store.get();
  if (typeof data.doc?.id === 'string' && data.doc.id === local.id) {
    replaceQuietly({
      ...local,
      sync: { serviceUrl: base, token, lastVersion: local.sync?.lastVersion ?? 0 },
    });
    setStatus({ state: 'idle', message: 'Reconnected', notice: undefined, updateRequired: false });
    return syncNow();
  }
  if (data.schemaVersion > SCHEMA_VERSION)
    throw new Error('The other phone runs a newer version of the app. Update this app, then join again.');
  const remote = migrateHousehold({
    ...(data.doc as object),
    purchases: {},
    sync: { serviceUrl: base, token, lastVersion: data.version },
  });
  const merged: Household = {
    ...remote,
    purchases: foldOps({}, data.ops),
    sync: { serviceUrl: base, token, lastVersion: data.version },
  };
  await db.outbox.clear();
  await setDirty(false);
  await setCursor(data.lastSeq);
  replaceQuietly(merged);
  setStatus({
    state: 'idle',
    lastSync: new Date().toISOString(),
    message: 'Joined',
    pending: 0,
    notice: undefined,
    updateRequired: false,
  });
  return status;
}

export async function disconnect(): Promise<void> {
  const copy = { ...store.get() };
  delete copy.sync;
  replaceQuietly(copy);
  await db.outbox.clear();
  await db.kv.delete('sync.lastSeq');
  await db.kv.delete('sync.dirty');
  setStatus({
    state: 'unconfigured',
    pending: 0,
    message: undefined,
    notice: undefined,
    updateRequired: false,
  });
}

export async function rotateToken(): Promise<string> {
  const h = store.get();
  if (!h.sync) throw new Error('Not connected');
  const res = await api(`${h.sync.serviceUrl}/h/rotate`, { method: 'POST' }, h.sync.token);
  if (!res.ok) throw new Error(`Service error (${res.status})`);
  const { token } = (await res.json()) as { token: string };
  replaceQuietly({ ...store.get(), sync: { ...h.sync, token } });
  return token;
}

export function joinLink(h: Household, appUrl: string): string | null {
  if (!h.sync) return null;
  const u = new URL(appUrl);
  u.hash = `#/join?s=${encodeURIComponent(h.sync.serviceUrl)}&t=${encodeURIComponent(h.sync.token)}`;
  return u.toString();
}

/** One sync round. Safe to call often; concurrent calls share one in-flight round. */
export function syncNow(): Promise<SyncStatus> {
  if (inFlight) return inFlight;
  inFlight = run().finally(() => (inFlight = null));
  return inFlight;
}

class SyncError extends Error {}
const gone = () => new SyncError('The household is no longer on the service (link rotated?)');

async function pushOps(serviceUrl: string, token: string): Promise<{ opId: string; winner: CheckOp }[]> {
  const queued = (await db.outbox.orderBy('at').toArray()).filter(
    (o): o is OutboxOp & { payload: CheckOp } => o.kind === 'check',
  );
  const conflicts: { opId: string; winner: CheckOp }[] = [];
  for (let i = 0; i < queued.length; i += OPS_PER_REQUEST) {
    const chunk = queued.slice(i, i + OPS_PER_REQUEST);
    const res = await api(
      `${serviceUrl}/h/ops`,
      { method: 'POST', body: JSON.stringify({ ops: chunk.map((o) => o.payload) }) },
      token,
    );
    if (res.status === 404) throw gone();
    if (!res.ok) throw new SyncError(`Could not send ticks (${res.status})`);
    const body = (await res.json()) as {
      applied: string[];
      duplicates?: string[];
      rejected?: { opId?: string }[];
      conflicts: { opId: string; winner: CheckOp }[];
    };
    conflicts.push(...body.conflicts);
    // Forget what the service has (new or already known) and what it will never take.
    const done = new Set([
      ...body.applied,
      ...(body.duplicates ?? []),
      ...(body.rejected ?? []).flatMap((r) => (r.opId ? [r.opId] : [])),
    ]);
    const stuck = chunk.filter((o) => !done.has(o.opId));
    await db.outbox.bulkDelete(chunk.filter((o) => done.has(o.opId)).map((o) => o.opId));
    if (stuck.length) {
      // Unnamed rejections (not even an id): drop them too, or the queue would never drain.
      await db.outbox.bulkDelete(stuck.map((o) => o.opId));
    }
  }
  return conflicts;
}

/** Returns the version to pull against and whether the other phone runs a newer schema. */
async function pushDoc(
  serviceUrl: string,
  token: string,
  lastVersion: number,
): Promise<{ version: number; behind: boolean }> {
  if ((await db.kv.get('sync.dirty'))?.value !== true) return { version: lastVersion, behind: false };
  const snapshot = store.get();
  const res = await api(
    `${serviceUrl}/h/doc`,
    { method: 'PUT', body: JSON.stringify({ baseVersion: lastVersion, doc: docForSync(snapshot) }) },
    token,
  );
  if (res.status === 404) throw gone();
  if (res.status === 426) {
    setStatus({
      updateRequired: true,
      notice:
        'The other phone runs a newer version of the app. Update this app to share the plan again; ticks still sync.',
    });
    return { version: lastVersion, behind: true };
  }
  if (res.status === 409) {
    const body = (await res.json()) as { version: number; schemaVersion?: number; doc: unknown };
    if ((body.schemaVersion ?? 0) > SCHEMA_VERSION) {
      setStatus({
        updateRequired: true,
        notice:
          'The other phone runs a newer version of the app. Update this app to share the plan again; ticks still sync.',
      });
      return { version: lastVersion, behind: true };
    }
    // Someone else planned in the meantime: take theirs, keep our purchases (they are ops), say so.
    const remote = migrateHousehold({
      ...(body.doc as object),
      purchases: store.get().purchases,
      sync: { serviceUrl, token, lastVersion: body.version },
    });
    replaceQuietly(remote);
    await setDirty(false);
    setStatus({
      state: 'conflict',
      notice:
        'The plan was changed on the other phone; showing their version. Your last edit here was not kept.',
    });
    return { version: body.version, behind: false };
  }
  if (!res.ok) throw new SyncError(`Could not send the plan (${res.status})`);
  const version = ((await res.json()) as { version: number }).version;
  // An edit made while the push was in flight stays dirty for the next round.
  if (store.get().updatedAt === snapshot.updatedAt) await setDirty(false);
  replaceQuietly({ ...store.get(), sync: { serviceUrl, token, lastVersion: version } });
  return { version, behind: false };
}

async function pull(serviceUrl: string, token: string, version: number, behind: boolean): Promise<void> {
  const lastSeq = Number((await db.kv.get('sync.lastSeq'))?.value ?? 0);
  const before = store.get();
  const res = await api(`${serviceUrl}/h/state?since=${version}&sinceSeq=${lastSeq}`, undefined, token);
  if (res.status === 404) throw gone();
  if (!res.ok) throw new SyncError(`Could not fetch (${res.status})`);
  const data = (await res.json()) as {
    version: number;
    schemaVersion: number;
    doc?: unknown;
    ops: CheckOp[];
    lastSeq: number;
  };
  const current = store.get();
  const editedMeanwhile = current.updatedAt !== before.updatedAt;
  let next: Household = current;
  let adoptedDoc = false;
  if (data.doc && data.schemaVersion > SCHEMA_VERSION) {
    setStatus({
      updateRequired: true,
      notice:
        'The other phone runs a newer version of the app. Update this app to see their plan; ticks still sync.',
    });
  } else if (data.doc && !editedMeanwhile && !behind) {
    next = migrateHousehold({
      ...(data.doc as object),
      purchases: current.purchases,
      sync: { serviceUrl, token, lastVersion: data.version },
    });
    adoptedDoc = true;
  }
  // A local edit made during the fetch is pushed next round; its compare-and-set then decides.
  if (data.ops.length) next = { ...next, purchases: foldOps(next.purchases, data.ops) };
  if (next !== current) replaceQuietly(next);
  if (data.lastSeq !== lastSeq) await setCursor(data.lastSeq);
  if (adoptedDoc && status.updateRequired) setStatus({ updateRequired: false, notice: undefined });
}

async function run(): Promise<SyncStatus> {
  const h = store.get();
  if (!h.sync) {
    setStatus({ state: 'unconfigured', pending: 0 });
    return status;
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    setStatus({ state: 'idle', message: 'Offline', pending: await db.outbox.count() });
    return status;
  }
  const { serviceUrl, token } = h.sync;
  setStatus({ state: 'syncing', message: undefined });
  let pushError: Error | null = null;
  let conflicts: { opId: string; winner: CheckOp }[] = [];
  try {
    try {
      conflicts = await pushOps(serviceUrl, token);
    } catch (e) {
      // Ticks that could not be sent stay queued; the plan still travels in both directions.
      if (e instanceof SyncError && e.message.startsWith('The household is no longer')) throw e;
      pushError = e instanceof Error ? e : new Error(String(e));
    }
    const { version, behind } = await pushDoc(serviceUrl, token, store.get().sync?.lastVersion ?? 0);
    await pull(serviceUrl, token, version, behind);
    const pending = await db.outbox.count();
    const notice =
      conflicts.length > 0
        ? `${conflicts.length} tick${conflicts.length > 1 ? 's' : ''} changed on the other phone`
        : status.notice;
    setStatus({
      state: pushError ? 'error' : notice ? 'conflict' : 'idle',
      lastSync: new Date().toISOString(),
      pending,
      message: pushError ? pushError.message : undefined,
      notice,
    });
  } catch (e) {
    setStatus({
      state: 'error',
      message: e instanceof Error ? e.message : String(e),
      pending: await db.outbox.count(),
    });
  }
  return status;
}

export async function markDocDirty(): Promise<void> {
  if (!store.get().sync) return;
  await setDirty(true);
}

let timer: ReturnType<typeof setTimeout> | null = null;
/** Debounced sync after local changes; also wired to online/focus events by installSyncTriggers(). */
export function scheduleSync(delayMs = 1500): void {
  if (!store.get().sync) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), delayMs);
}

export function installSyncTriggers(): () => void {
  const kick = () => scheduleSync(300);
  const onVisible = () => document.visibilityState === 'visible' && kick();
  window.addEventListener('online', kick);
  window.addEventListener('focus', kick);
  document.addEventListener('visibilitychange', onVisible);
  const unsub = store.subscribe(() => {
    if (!applyingRemote && store.get().sync) scheduleSync();
  });
  kick();
  return () => {
    window.removeEventListener('online', kick);
    window.removeEventListener('focus', kick);
    document.removeEventListener('visibilitychange', onVisible);
    unsub();
  };
}
