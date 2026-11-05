/**
 * Two-phone sync over the optional companion service (worker/). Local-first: everything works without
 * it. When configured, the client (1) pushes queued shopping-check operations, (2) pushes the document
 * with compare-and-set, (3) pulls the newer document and any operations, folding checks last-writer-wins.
 * The capability token lives only in the household document on the phone and in the URL of requests.
 */
import type { Household, Purchase } from '@/core/model';
import { migrateHousehold } from '@/core/household';
import { db, type OutboxOp } from './db';
import { store } from './store';

export interface SyncStatus {
  state: 'idle' | 'syncing' | 'error' | 'unconfigured' | 'conflict';
  lastSync?: string;
  message?: string;
  pending: number;
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

/** The document as sent to the service: purchases travel as operations, the token never travels in the body. */
export function docForSync(h: Household): Omit<Household, 'purchases' | 'sync'> {
  const copy = { ...h } as Partial<Household>;
  delete copy.purchases;
  delete copy.sync;
  return copy as Omit<Household, 'purchases' | 'sync'>;
}

export async function queueCheck(op: CheckOp): Promise<void> {
  await db.outbox.put({ opId: op.opId, kind: 'check', payload: op, at: op.at, rev: op.rev });
  setStatus({ pending: await db.outbox.count() });
}

/** Fold operations into the purchases map, newest `at` wins per (week, key). */
export function foldOps(purchases: Household['purchases'], ops: CheckOp[]): Household['purchases'] {
  const out: Household['purchases'] = Object.fromEntries(
    Object.entries(purchases).map(([k, v]) => [k, { ...v }]),
  );
  // Newest timestamp seen per (week, key), including unchecks that removed the entry.
  const latestAt = new Map<string, string>();
  for (const [w, items] of Object.entries(out))
    for (const [k, v] of Object.entries(items)) latestAt.set(`${w}|${k}`, v.at);
  for (const op of [...ops].sort((a, b) => a.at.localeCompare(b.at))) {
    const id = `${op.weekId}|${op.key}`;
    const seen = latestAt.get(id);
    if (seen && seen > op.at) continue;
    latestAt.set(id, op.at);
    const week = { ...(out[op.weekId] ?? {}) };
    if (op.checked)
      week[op.key] = {
        coveredG: op.coveredG,
        at: op.at,
        by: op.by,
        opId: op.opId,
        rev: op.rev,
      } satisfies Purchase;
    else delete week[op.key];
    out[op.weekId] = week;
  }
  return out;
}

async function api(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
}

export function serviceBase(serviceUrl: string): string {
  return serviceUrl.replace(/\/+$/, '');
}

/** Create a household on the service and store the returned token locally. */
export async function connectNew(serviceUrl: string): Promise<SyncStatus> {
  const h = store.get();
  const res = await api(`${serviceBase(serviceUrl)}/h`, {
    method: 'POST',
    body: JSON.stringify({ doc: docForSync(h) }),
  });
  if (!res.ok) throw new Error(`Service refused (${res.status})`);
  const { token, version } = (await res.json()) as { token: string; version: number };
  store.update((x) => ({ ...x, sync: { serviceUrl: serviceBase(serviceUrl), token, lastVersion: version } }));
  setStatus({ state: 'idle', lastSync: new Date().toISOString(), message: 'Connected' });
  return syncNow();
}

/** Join an existing household from a link: replace the local document with the service's. */
export async function joinExisting(serviceUrl: string, token: string): Promise<SyncStatus> {
  const base = serviceBase(serviceUrl);
  const res = await api(`${base}/h/${token}/state?since=0&sinceSeq=0`);
  if (!res.ok)
    throw new Error(res.status === 404 ? 'That link is not valid any more' : `Service error (${res.status})`);
  const data = (await res.json()) as { version: number; doc: unknown; ops: CheckOp[]; lastSeq: number };
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
  store.replace(merged);
  await db.outbox.clear();
  await db.kv.put({ key: 'sync.lastSeq', value: data.lastSeq, updatedAt: new Date().toISOString() });
  setStatus({ state: 'idle', lastSync: new Date().toISOString(), message: 'Joined', pending: 0 });
  return status;
}

export async function disconnect(): Promise<void> {
  store.update((x) => {
    const copy = { ...x };
    delete copy.sync;
    return copy;
  });
  await db.outbox.clear();
  await db.kv.delete('sync.lastSeq');
  setStatus({ state: 'unconfigured', pending: 0, message: undefined });
}

export async function rotateToken(): Promise<string> {
  const h = store.get();
  if (!h.sync) throw new Error('Not connected');
  const res = await api(`${h.sync.serviceUrl}/h/${h.sync.token}/rotate`, { method: 'POST' });
  if (!res.ok) throw new Error(`Service error (${res.status})`);
  const { token } = (await res.json()) as { token: string };
  store.update((x) => ({ ...x, sync: x.sync ? { ...x.sync, token } : x.sync }));
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
  setStatus({ state: 'syncing' });
  try {
    // 1. Push queued checks.
    const queued = (await db.outbox.toArray()).filter(
      (o): o is OutboxOp & { payload: CheckOp } => o.kind === 'check',
    );
    let conflicts: { opId: string; winner: CheckOp }[] = [];
    if (queued.length) {
      const res = await api(`${serviceUrl}/h/${token}/ops`, {
        method: 'POST',
        body: JSON.stringify({ ops: queued.map((o) => o.payload) }),
      });
      if (res.status === 404) throw new Error('The household is no longer on the service (token rotated?)');
      if (!res.ok) throw new Error(`Could not send ticks (${res.status})`);
      const body = (await res.json()) as {
        applied: string[];
        conflicts: { opId: string; winner: CheckOp }[];
      };
      conflicts = body.conflicts;
      await db.outbox.bulkDelete(queued.map((o) => o.opId));
    }
    // 2. Push the document if it changed since the last sync.
    const dirty = (await db.kv.get('sync.dirty'))?.value === true;
    let version = h.sync.lastVersion;
    if (dirty) {
      const res = await api(`${serviceUrl}/h/${token}/doc`, {
        method: 'PUT',
        body: JSON.stringify({ baseVersion: version, doc: docForSync(store.get()) }),
      });
      if (res.status === 409) {
        const body = (await res.json()) as { version: number; doc: unknown };
        // Someone else planned in the meantime: take theirs, keep our purchases (they are ops), report it.
        const remote = migrateHousehold({
          ...(body.doc as object),
          purchases: store.get().purchases,
          sync: { serviceUrl, token, lastVersion: body.version },
        });
        store.replace(remote);
        await db.kv.put({ key: 'sync.dirty', value: false, updatedAt: new Date().toISOString() });
        version = body.version;
        setStatus({
          state: 'conflict',
          message: 'The plan was changed on the other phone; showing their version.',
        });
      } else if (!res.ok) {
        throw new Error(`Could not send the plan (${res.status})`);
      } else {
        version = ((await res.json()) as { version: number }).version;
        await db.kv.put({ key: 'sync.dirty', value: false, updatedAt: new Date().toISOString() });
      }
    }
    // 3. Pull.
    const lastSeq = Number((await db.kv.get('sync.lastSeq'))?.value ?? 0);
    const res = await api(`${serviceUrl}/h/${token}/state?since=${version}&sinceSeq=${lastSeq}`);
    if (res.status === 404) throw new Error('The household is no longer on the service (token rotated?)');
    if (!res.ok) throw new Error(`Could not fetch (${res.status})`);
    const data = (await res.json()) as { version: number; doc?: unknown; ops: CheckOp[]; lastSeq: number };
    const current = store.get();
    let next: Household = current;
    if (data.doc) {
      next = migrateHousehold({
        ...(data.doc as object),
        purchases: current.purchases,
        sync: { serviceUrl, token, lastVersion: data.version },
      });
    } else {
      next = { ...current, sync: { serviceUrl, token, lastVersion: data.version } };
    }
    if (data.ops.length) next = { ...next, purchases: foldOps(next.purchases, data.ops) };
    store.replace(next);
    await db.kv.put({ key: 'sync.lastSeq', value: data.lastSeq, updatedAt: new Date().toISOString() });
    const pending = await db.outbox.count();
    setStatus({
      state: conflicts.length ? 'conflict' : status.state === 'conflict' ? 'conflict' : 'idle',
      lastSync: new Date().toISOString(),
      pending,
      message: conflicts.length
        ? `${conflicts.length} tick${conflicts.length > 1 ? 's' : ''} changed on the other phone`
        : status.state === 'conflict'
          ? status.message
          : undefined,
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
  await db.kv.put({ key: 'sync.dirty', value: true, updatedAt: new Date().toISOString() });
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
  window.addEventListener('online', kick);
  window.addEventListener('focus', kick);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && kick());
  const unsub = store.subscribe(() => {
    if (store.get().sync) scheduleSync();
  });
  kick();
  return () => {
    window.removeEventListener('online', kick);
    window.removeEventListener('focus', kick);
    unsub();
  };
}
