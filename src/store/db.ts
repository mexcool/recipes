import Dexie, { type EntityTable } from 'dexie';

export interface KvRow {
  key: string;
  value: unknown;
  updatedAt: string;
}

/** Queued sync operation (M3). Each has a unique id so the server can deduplicate retries. */
export interface OutboxOp {
  opId: string;
  kind: 'doc' | 'check';
  payload: unknown;
  at: string;
  rev: number;
}

export class StaseraDB extends Dexie {
  kv!: EntityTable<KvRow, 'key'>;
  outbox!: EntityTable<OutboxOp, 'opId'>;

  constructor(name = 'stasera') {
    super(name);
    this.version(1).stores({ kv: 'key', outbox: 'opId, at' });
  }
}

export const db = new StaseraDB();
