import { createApp } from './src/app';
import { MemoryStore } from './src/store';

const doc = (v: number) => ({ schemaVersion: 1, id: 'hh', weeks: [], marker: v });

async function setup() {
  const store = new MemoryStore();
  const app = createApp(store);
  const res = await app.request('/h', {
    method: 'POST',
    body: JSON.stringify({ doc: doc(1) }),
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.status).toBe(201);
  const { token, id } = (await res.json()) as { token: string; id: string };
  return { app, store, token, id };
}

describe('sync service', () => {
  it('creates a household and never stores the token itself', async () => {
    const { store, token } = await setup();
    const row = [...store.rows.values()][0]!;
    expect(row.tokenHash).not.toBe(token);
    expect(row.tokenHash).toHaveLength(64);
  });

  it('rejects a wrong token', async () => {
    const { app } = await setup();
    const res = await app.request('/h/state', { headers: { Authorization: 'Bearer not-a-token' } });
    expect(res.status).toBe(404);
  });

  it('returns the document only when the client is behind', async () => {
    const { app, token } = await setup();
    const a = (await (
      await app.request(`/h/state?since=0`, { headers: { Authorization: `Bearer ${token}` } })
    ).json()) as {
      version: number;
      doc?: unknown;
    };
    expect(a.version).toBe(1);
    expect(a.doc).toBeDefined();
    const b = (await (
      await app.request(`/h/state?since=1`, { headers: { Authorization: `Bearer ${token}` } })
    ).json()) as { doc?: unknown };
    expect(b.doc).toBeUndefined();
  });

  it('updates with compare-and-set and reports conflicts with the fresh document', async () => {
    const { app, token } = await setup();
    const ok = await app.request('/h/doc', {
      method: 'PUT',
      body: JSON.stringify({ baseVersion: 1, doc: doc(2) }),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { version: number }).version).toBe(2);
    const stale = await app.request('/h/doc', {
      method: 'PUT',
      body: JSON.stringify({ baseVersion: 1, doc: doc(3) }),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    });
    expect(stale.status).toBe(409);
    const body = (await stale.json()) as { version: number; doc: { marker: number } };
    expect(body.version).toBe(2);
    expect(body.doc.marker).toBe(2);
  });

  it('deduplicates operations by id and merges last-writer-wins, surfacing conflicts', async () => {
    const { app, token } = await setup();
    const op = (opId: string, checked: boolean, at: string) => ({
      opId,
      weekId: 'w1',
      key: 'pasta',
      checked,
      coveredG: checked ? 500 : 0,
      by: 'g',
      at,
      rev: 1,
    });
    const first = await app.request('/h/ops', {
      method: 'POST',
      body: JSON.stringify({ ops: [op('a', true, '2026-11-08T10:00:00Z')] }),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    });
    expect(((await first.json()) as { applied: string[] }).applied).toEqual(['a']);
    const again = await app.request('/h/ops', {
      method: 'POST',
      body: JSON.stringify({ ops: [op('a', true, '2026-11-08T10:00:00Z')] }),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    });
    expect(((await again.json()) as { applied: string[] }).applied).toEqual([]);
    // A newer uncheck from the other phone wins; an older check arriving late is reported as a conflict.
    await app.request('/h/ops', {
      method: 'POST',
      body: JSON.stringify({ ops: [op('b', false, '2026-11-08T10:05:00Z')] }),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    });
    const late = await app.request('/h/ops', {
      method: 'POST',
      body: JSON.stringify({ ops: [op('c', true, '2026-11-08T10:01:00Z')] }),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    });
    const body = (await late.json()) as {
      applied: string[];
      conflicts: { opId: string; winner: { opId: string } }[];
    };
    expect(body.applied).toEqual(['c']);
    expect(body.conflicts).toEqual([{ opId: 'c', winner: expect.objectContaining({ opId: 'b' }) }]);
    const state = (await (
      await app.request(`/h/state?sinceSeq=1`, { headers: { Authorization: `Bearer ${token}` } })
    ).json()) as {
      ops: { opId: string }[];
      lastSeq: number;
    };
    expect(state.ops.map((o) => o.opId)).toEqual(['b', 'c']);
    expect(state.lastSeq).toBe(3);
  });

  it('validates operations and limits batch size', async () => {
    const { app, token } = await setup();
    const bad = await app.request('/h/ops', {
      method: 'POST',
      body: JSON.stringify({ ops: [{ opId: 'x' }] }),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    });
    expect(bad.status).toBe(400);
  });

  it('rotates the token', async () => {
    const { app, token } = await setup();
    const res = await app.request('/h/rotate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const { token: fresh } = (await res.json()) as { token: string };
    expect((await app.request(`/h/state`, { headers: { Authorization: `Bearer ${token}` } })).status).toBe(
      404,
    );
    expect((await app.request('/h/state', { headers: { Authorization: `Bearer ${fresh}` } })).status).toBe(
      200,
    );
  });

  it('sets no-referrer and no-store headers', async () => {
    const { app, token } = await setup();
    const res = await app.request(`/h/state`, { headers: { Authorization: `Bearer ${token}` } });
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});

describe('cors', () => {
  it('allows the Authorization header in preflight responses', async () => {
    const app = createApp(new MemoryStore());
    const res = await app.request('/h/state', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://app.example',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization,content-type',
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-headers')?.toLowerCase()).toContain('authorization');
  });
});
