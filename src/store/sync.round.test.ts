/**
 * A sync round against a mocked service: a round that finds nothing new must change nothing locally
 * and must not schedule another round (the loop the final review caught).
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHousehold } from '@/core/household';
import { DEMO } from '@/core/test-helpers';
import { SEED_DISHES } from '@/data/dishes';
import { db } from './db';
import { store } from './store';
import { __resetSyncForTests, awaitIdle, installSyncTriggers, queueCheck, syncNow } from './sync';

/** Let IndexedDB (real macrotasks) and any round that a timer started finish. */
async function settle(ms: number) {
  await vi.advanceTimersByTimeAsync(ms);
  for (let i = 0; i < 20; i++) {
    await awaitIdle();
    await new Promise((r) => setImmediate(r));
  }
}

const SERVICE = 'https://sync.example';

function mockService(remote: { version: number; doc?: unknown; ops?: unknown[] }) {
  const calls: { method: string; path: string; body?: unknown }[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path: url.pathname + url.search, body });
    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
    if (url.pathname === '/h/state') {
      const since = Number(url.searchParams.get('since') ?? 0);
      return json({
        id: 'hh',
        version: remote.version,
        schemaVersion: 1,
        updatedAt: '2026-11-05T06:00:00.000Z',
        ...(remote.version > since ? { doc: remote.doc } : {}),
        ops: remote.ops ?? [],
        lastSeq: remote.ops?.length ?? 0,
        serverTime: '2026-11-05T06:00:00.000Z',
      });
    }
    if (url.pathname === '/h/ops')
      return json({ applied: body.ops.map((o: { opId: string }) => o.opId), conflicts: [] });
    if (url.pathname === '/h/doc') {
      remote.version += 1;
      return json({ version: remote.version });
    }
    return json({ error: 'not found' }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

describe('a sync round', () => {
  beforeEach(async () => {
    __resetSyncForTests();
    await store.flush();
    await db.kv.clear();
    await db.outbox.clear();
    const h = createHousehold({ plan: DEMO, dishes: SEED_DISHES, now: '2026-11-05T06:00:00.000Z' });
    store.replace({ ...h, sync: { serviceUrl: SERVICE, token: 'tok', lastVersion: 1 } });
    await db.kv.put({ key: 'sync.lastSeq', value: 0, updatedAt: '' });
    // Only the debounce timers are faked: IndexedDB (fake-indexeddb) schedules its own work.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('that finds nothing new changes nothing and does not schedule another round', async () => {
    const calls = mockService({ version: 1 });
    const stop = installSyncTriggers();
    const before = store.get();
    await settle(400); // the install kick
    expect(calls.filter((c) => c.path.startsWith('/h/state'))).toHaveLength(1);
    expect(store.get()).toBe(before);
    await settle(20_000);
    expect(calls.filter((c) => c.path.startsWith('/h/state'))).toHaveLength(1);
    stop();
  });

  it('pulls a newer document once and then stays quiet', async () => {
    const newerDoc = { ...store.get(), name: 'Changed elsewhere' };
    delete (newerDoc as { sync?: unknown }).sync;
    const calls = mockService({ version: 2, doc: newerDoc });
    const stop = installSyncTriggers();
    await settle(400);
    expect(store.get().name).toBe('Changed elsewhere');
    expect(store.get().sync?.lastVersion).toBe(2);
    await settle(20_000);
    expect(calls.filter((c) => c.path.startsWith('/h/state'))).toHaveLength(1);
    stop();
  });

  it('a shopping tick travels as an operation and never as a document push', async () => {
    const calls = mockService({ version: 1 });
    await queueCheck({
      opId: 'op-1',
      weekId: 'w',
      key: 'pasta',
      checked: true,
      coveredG: 500,
      by: 'me',
      at: '2026-11-05T06:01:00.000Z',
      rev: 1,
    });
    await syncNow();
    expect(calls.map((c) => `${c.method} ${c.path.split('?')[0]}`)).toEqual(['POST /h/ops', 'GET /h/state']);
    expect(await db.outbox.count()).toBe(0);
  });

  it('pushes a dirty document with compare-and-set and clears the flag', async () => {
    const calls = mockService({ version: 1 });
    store.update((h) => ({ ...h, name: 'Edited here' }));
    await syncNow();
    const put = calls.find((c) => c.method === 'PUT') as
      { body: { baseVersion: number; doc: { name: string; sync?: unknown } } } | undefined;
    expect(put?.body.baseVersion).toBe(1);
    expect(put?.body.doc.name).toBe('Edited here');
    expect(put?.body.doc.sync).toBeUndefined();
    expect(store.get().sync?.lastVersion).toBe(2);
    expect((await db.kv.get('sync.dirty'))?.value).toBe(false);
  });
});
