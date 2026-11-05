/**
 * Storage behind the sync service. The HTTP app only talks to this interface, so the unit tests run
 * against the in-memory implementation and Wrangler's local mode exercises the D1 one.
 *
 * Operation ids are unique per household (a retry is a duplicate, another household's identical id is
 * not), and sequence numbers are allocated per household inside the insert statement itself, so two
 * phones pushing at the same moment can never share one.
 */
export interface HouseholdRow {
  id: string;
  tokenHash: string;
  doc: string;
  schemaVersion: number;
  version: number;
  updatedAt: string;
}

export interface ListOp {
  opId: string;
  weekId: string;
  key: string;
  checked: boolean;
  coveredG: number;
  by: string;
  at: string;
  rev: number;
}

export interface StoredOp extends ListOp {
  seq: number;
}

export interface SyncStore {
  getByTokenHash(tokenHash: string): Promise<HouseholdRow | null>;
  create(row: HouseholdRow): Promise<void>;
  /** Compare-and-set on version; returns false when baseVersion is stale. */
  updateDoc(
    id: string,
    baseVersion: number,
    doc: string,
    schemaVersion: number,
    updatedAt: string,
  ): Promise<boolean>;
  rotateToken(id: string, tokenHash: string): Promise<void>;
  /** Insert ops, ignoring ids already stored for this household; returns the ops that were new, in order. */
  insertOps(id: string, ops: ListOp[]): Promise<StoredOp[]>;
  opsSince(id: string, seq: number): Promise<StoredOp[]>;
  /** The newest op (by `at`, then seq) per requested (week, key), keyed `${weekId}\u0000${key}`. */
  latestOpsFor(id: string, keys: { weekId: string; key: string }[]): Promise<Map<string, StoredOp>>;
  /** Forget operations older than `before` (ISO timestamp); sequence numbers keep counting up. */
  pruneOps(id: string, before: string): Promise<void>;
}

export const pairKey = (weekId: string, key: string): string => `${weekId}\u0000${key}`;

export class MemoryStore implements SyncStore {
  rows = new Map<string, HouseholdRow>();
  ops = new Map<string, StoredOp[]>();

  async getByTokenHash(tokenHash: string) {
    return [...this.rows.values()].find((r) => r.tokenHash === tokenHash) ?? null;
  }
  async create(row: HouseholdRow) {
    this.rows.set(row.id, { ...row });
  }
  async updateDoc(id: string, baseVersion: number, doc: string, schemaVersion: number, updatedAt: string) {
    const r = this.rows.get(id);
    if (!r || r.version !== baseVersion) return false;
    this.rows.set(id, { ...r, doc, schemaVersion, version: r.version + 1, updatedAt });
    return true;
  }
  async rotateToken(id: string, tokenHash: string) {
    const r = this.rows.get(id);
    if (r) this.rows.set(id, { ...r, tokenHash });
  }
  async insertOps(id: string, ops: ListOp[]) {
    const list = this.ops.get(id) ?? [];
    const fresh: StoredOp[] = [];
    for (const op of ops) {
      if (list.some((x) => x.opId === op.opId)) continue;
      const stored = { ...op, seq: (list.at(-1)?.seq ?? 0) + 1 };
      list.push(stored);
      fresh.push(stored);
    }
    this.ops.set(id, list);
    return fresh;
  }
  async opsSince(id: string, seq: number) {
    return (this.ops.get(id) ?? []).filter((o) => o.seq > seq);
  }
  async pruneOps(id: string, before: string) {
    this.ops.set(
      id,
      (this.ops.get(id) ?? []).filter((o) => o.at >= before),
    );
  }
  async latestOpsFor(id: string, keys: { weekId: string; key: string }[]) {
    const out = new Map<string, StoredOp>();
    const list = this.ops.get(id) ?? [];
    for (const k of keys) {
      const pk = pairKey(k.weekId, k.key);
      if (out.has(pk)) continue;
      const best = list
        .filter((o) => o.weekId === k.weekId && o.key === k.key)
        .sort((a, b) => b.at.localeCompare(a.at) || b.seq - a.seq)[0];
      if (best) out.set(pk, best);
    }
    return out;
  }
}

const OP_COLUMNS = 'op_id, household_id, seq, week_id, key, checked, covered_g, by, at, rev';

export class D1Store implements SyncStore {
  constructor(private db: D1Database) {}

  async getByTokenHash(tokenHash: string) {
    const r = await this.db
      .prepare(
        'SELECT id, token_hash, doc, schema_version, version, updated_at FROM household WHERE token_hash = ?',
      )
      .bind(tokenHash)
      .first<Record<string, unknown>>();
    return r ? rowFromDb(r) : null;
  }
  async create(row: HouseholdRow) {
    await this.db
      .prepare(
        'INSERT INTO household (id, token_hash, doc, schema_version, version, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .bind(row.id, row.tokenHash, row.doc, row.schemaVersion, row.version, row.updatedAt)
      .run();
  }
  async updateDoc(id: string, baseVersion: number, doc: string, schemaVersion: number, updatedAt: string) {
    const res = await this.db
      .prepare(
        'UPDATE household SET doc = ?, schema_version = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?',
      )
      .bind(doc, schemaVersion, updatedAt, id, baseVersion)
      .run();
    return (res.meta.changes ?? 0) > 0;
  }
  async rotateToken(id: string, tokenHash: string) {
    await this.db.prepare('UPDATE household SET token_hash = ? WHERE id = ?').bind(tokenHash, id).run();
  }
  /**
   * One statement per op, all in one batch (a single transaction): the sequence number is computed by
   * the statement that inserts it, so it is unique even under concurrent pushes; a duplicate op id for
   * the household is ignored and yields no row.
   */
  async insertOps(id: string, ops: ListOp[]) {
    if (!ops.length) return [];
    const insert = this.db.prepare(
      `INSERT OR IGNORE INTO list_op (${OP_COLUMNS}) VALUES (?, ?, (SELECT COALESCE(MAX(seq), 0) + 1 FROM list_op WHERE household_id = ?), ?, ?, ?, ?, ?, ?, ?) RETURNING seq`,
    );
    const results = await this.db.batch<{ seq: number }>(
      ops.map((op) =>
        insert.bind(
          op.opId,
          id,
          id,
          op.weekId,
          op.key,
          op.checked ? 1 : 0,
          op.coveredG,
          op.by,
          op.at,
          op.rev,
        ),
      ),
    );
    const fresh: StoredOp[] = [];
    results.forEach((r, i) => {
      const seq = r.results[0]?.seq;
      if (typeof seq === 'number') fresh.push({ ...ops[i]!, seq });
    });
    return fresh;
  }
  async pruneOps(id: string, before: string) {
    await this.db.prepare('DELETE FROM list_op WHERE household_id = ? AND at < ?').bind(id, before).run();
  }
  async opsSince(id: string, seq: number) {
    const res = await this.db
      .prepare(`SELECT ${OP_COLUMNS} FROM list_op WHERE household_id = ? AND seq > ? ORDER BY seq`)
      .bind(id, seq)
      .all<Record<string, unknown>>();
    return res.results.map(opFromDb);
  }
  async latestOpsFor(id: string, keys: { weekId: string; key: string }[]) {
    const out = new Map<string, StoredOp>();
    const unique = [...new Map(keys.map((k) => [pairKey(k.weekId, k.key), k])).values()];
    if (!unique.length) return out;
    const q = this.db.prepare(
      `SELECT ${OP_COLUMNS} FROM list_op WHERE household_id = ? AND week_id = ? AND key = ? ORDER BY at DESC, seq DESC LIMIT 1`,
    );
    const results = await this.db.batch<Record<string, unknown>>(
      unique.map((k) => q.bind(id, k.weekId, k.key)),
    );
    results.forEach((r, i) => {
      const row = r.results[0];
      if (row) out.set(pairKey(unique[i]!.weekId, unique[i]!.key), opFromDb(row));
    });
    return out;
  }
}

function rowFromDb(r: Record<string, unknown>): HouseholdRow {
  return {
    id: String(r.id),
    tokenHash: String(r.token_hash),
    doc: String(r.doc),
    schemaVersion: Number(r.schema_version),
    version: Number(r.version),
    updatedAt: String(r.updated_at),
  };
}

function opFromDb(r: Record<string, unknown>): StoredOp {
  return {
    opId: String(r.op_id),
    seq: Number(r.seq),
    weekId: String(r.week_id),
    key: String(r.key),
    checked: Number(r.checked) === 1,
    coveredG: Number(r.covered_g),
    by: String(r.by),
    at: String(r.at),
    rev: Number(r.rev),
  };
}
