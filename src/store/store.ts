/**
 * The household document store: one in-memory document, persisted to IndexedDB on every change,
 * exposed to React through useSyncExternalStore. All domain changes go through `update`, which applies a
 * pure function from src/core and never mutates in place.
 */
import { useSyncExternalStore } from 'react';
import type { Household } from '@/core/model';
import { createHousehold, migrateHousehold } from '@/core/household';
import { SEED_DISHES } from '@/data/dishes';
import { DEMO_PLAN } from '@/data/demo-plan';
import { db } from './db';

type Listener = () => void;

const KEY = 'household';

export class HouseholdStore {
  private doc: Household | null = null;
  private listeners = new Set<Listener>();
  private ready: Promise<void> | null = null;
  public lastError: string | null = null;

  init(): Promise<void> {
    if (!this.ready) this.ready = this.load();
    return this.ready;
  }

  private async load(): Promise<void> {
    try {
      const row = await db.kv.get(KEY);
      if (row?.value) {
        this.doc = migrateHousehold(row.value);
      }
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
      console.error('Could not load the household document', e);
    }
    if (!this.doc) {
      this.doc = createHousehold({ plan: DEMO_PLAN, dishes: SEED_DISHES });
      await this.persist();
    }
    this.emit();
  }

  isReady(): boolean {
    return this.doc !== null;
  }

  get(): Household {
    if (!this.doc) throw new Error('Store not ready');
    return this.doc;
  }

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = (): Household | null => this.doc;

  update(fn: (h: Household) => Household): Household {
    const prev = this.get();
    const next = fn(prev);
    this.doc = { ...next, updatedAt: new Date().toISOString() };
    if (next.sync && docChanged(prev, next))
      void db.kv.put({ key: 'sync.dirty', value: true, updatedAt: this.doc.updatedAt });
    this.emit();
    this.scheduleSave();
    return this.doc;
  }

  /** Replace the whole document (import, sync). */
  replace(h: Household): void {
    this.doc = h;
    this.emit();
    this.scheduleSave();
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }

  /** Writes are immediate but serialized: a tick made right before the app is closed is never lost. */
  private scheduleSave(): void {
    this.pending = true;
    if (!this.writing) void this.drain();
  }

  private pending = false;
  private writing: Promise<void> | null = null;

  private async drain(): Promise<void> {
    this.writing = (async () => {
      while (this.pending) {
        this.pending = false;
        await this.persist();
      }
    })();
    try {
      await this.writing;
    } finally {
      this.writing = null;
    }
  }

  async persist(): Promise<void> {
    if (!this.doc) return;
    try {
      await db.kv.put({ key: KEY, value: this.doc, updatedAt: this.doc.updatedAt });
      this.lastError = null;
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
      console.error('Could not save the household document', e);
      this.emit();
    }
  }

  async flush(): Promise<void> {
    if (this.writing) await this.writing;
    if (this.pending) await this.drain();
  }

  async reset(): Promise<void> {
    await db.kv.delete(KEY);
    await db.outbox.clear();
    this.doc = createHousehold({ plan: DEMO_PLAN, dishes: SEED_DISHES });
    await this.persist();
    this.emit();
  }
}

/** Anything but purchases (which travel as operations) and the sync config itself counts as a document change. */
function docChanged(a: Household, b: Household): boolean {
  for (const k of Object.keys(b) as (keyof Household)[]) {
    if (k === 'purchases' || k === 'sync' || k === 'updatedAt') continue;
    if (a[k] !== b[k]) return true;
  }
  return false;
}

export const store = new HouseholdStore();

export function useHousehold(): Household {
  const h = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  if (!h) throw new Error('useHousehold used before the store is ready');
  return h;
}

export function useHouseholdMaybe(): Household | null {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
