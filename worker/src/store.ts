/**
 * Storage behind the sync service. The HTTP app only talks to this interface, so the unit tests run
 * against the in-memory implementation and Wrangler's local mode exercises the D1 one.
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
  /** Insert ops, ignoring duplicates by opId; returns the ops that were new. */
  insertOps(id: string, ops: ListOp[]): Promise<StoredOp[]>;
  opsSince(id: string, seq: number): Promise<StoredOp[]>;
  latestOpFor(id: string, weekId: string, key: string): Promise<StoredOp | null>;
}

export class MemoryStore implements SyncStore {
  rows = new Map<string, HouseholdRow>();
  ops = new Map<string, StoredOp[]>();
  private seq = 0;

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
      const stored = { ...op, seq: ++this.seq };
      list.push(stored);
      fresh.push(stored);
    }
    this.ops.set(id, list);
    return fresh;
  }
  async opsSince(id: string, seq: number) {
    return (this.ops.get(id) ?? []).filter((o) => o.seq > seq);
  }
  async latestOpFor(id: string, weekId: string, key: string) {
    const list = (this.ops.get(id) ?? []).filter((o) => o.weekId === weekId && o.key === key);
    return list.sort((a, b) => b.at.localeCompare(a.at) || b.seq - a.seq)[0] ?? null;
  }
}

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
  async insertOps(id: string, ops: ListOp[]) {
    const fresh: StoredOp[] = [];
    for (const op of ops) {
      const exists = await this.db.prepare('SELECT op_id FROM list_op WHERE op_id = ?').bind(op.opId).first();
      if (exists) continue;
      const seqRow = await this.db
        .prepare('SELECT COALESCE(MAX(seq), 0) AS s FROM list_op WHERE household_id = ?')
        .bind(id)
        .first<{ s: number }>();
      const seq = (seqRow?.s ?? 0) + 1;
      await this.db
        .prepare(
          'INSERT INTO list_op (op_id, household_id, seq, week_id, key, checked, covered_g, by, at, rev) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .bind(op.opId, id, seq, op.weekId, op.key, op.checked ? 1 : 0, op.coveredG, op.by, op.at, op.rev)
        .run();
      fresh.push({ ...op, seq });
    }
    return fresh;
  }
  async opsSince(id: string, seq: number) {
    const res = await this.db
      .prepare('SELECT * FROM list_op WHERE household_id = ? AND seq > ? ORDER BY seq')
      .bind(id, seq)
      .all<Record<string, unknown>>();
    return res.results.map(opFromDb);
  }
  async latestOpFor(id: string, weekId: string, key: string) {
    const r = await this.db
      .prepare(
        'SELECT * FROM list_op WHERE household_id = ? AND week_id = ? AND key = ? ORDER BY at DESC, seq DESC LIMIT 1',
      )
      .bind(id, weekId, key)
      .first<Record<string, unknown>>();
    return r ? opFromDb(r) : null;
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
