import type { Dish, Food, Household, Member, Plan } from './model';
import { HouseholdSchema, SCHEMA_VERSION } from './model';
import { hashString } from './rng';

export interface CreateHouseholdArgs {
  plan: Plan;
  dishes: readonly Dish[];
  members?: Member[];
  name?: string;
  now?: string;
}

export function createHousehold(a: CreateHouseholdArgs): Household {
  const now = a.now ?? new Date().toISOString();
  const members = a.members ?? [
    { id: 'g', name: 'G.', constrained: true, multiplier: 1 },
    { id: 'p', name: 'Partner', constrained: false, multiplier: 1 },
  ];
  return HouseholdSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    id: `hh-${hashString(now).toString(16)}`,
    name: a.name ?? 'Home',
    members,
    plans: [a.plan],
    activePlanId: a.plan.id,
    dishes: a.dishes,
    createdAt: now,
    updatedAt: now,
  });
}

/** Schema migrations: each step upgrades one version. Unknown future versions are rejected. */
const MIGRATIONS: Record<number, (doc: Record<string, unknown>) => Record<string, unknown>> = {
  // 0 → 1: first versioned shape.
  0: (doc) => ({ ...doc, schemaVersion: 1 }),
};

export function migrateHousehold(raw: unknown): Household {
  if (!raw || typeof raw !== 'object') throw new Error('Not a household document');
  let doc = raw as Record<string, unknown>;
  let v = typeof doc.schemaVersion === 'number' ? doc.schemaVersion : 0;
  if (v > SCHEMA_VERSION)
    throw new Error(`This file was made by a newer version of the app (schema ${v}). Update the app first.`);
  while (v < SCHEMA_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) throw new Error(`No migration from schema ${v}`);
    doc = step(doc);
    v = doc.schemaVersion as number;
  }
  return HouseholdSchema.parse(doc);
}

/** The backup file never carries the sync token: a file travels further than a phone. */
export function exportHousehold(h: Household): string {
  const copy = { ...h } as Partial<Household>;
  delete copy.sync;
  return JSON.stringify({ ...copy, exportedAt: new Date().toISOString() }, null, 2);
}

export function importHousehold(json: string): Household {
  const parsed: unknown = JSON.parse(json);
  if (parsed && typeof parsed === 'object' && 'sync' in parsed) delete (parsed as { sync?: unknown }).sync;
  return migrateHousehold(parsed);
}

export function touch(h: Household, now = new Date().toISOString()): Household {
  return { ...h, updatedAt: now };
}

export function foodsFor(h: Household, catalogue: readonly Food[]): Food[] {
  if (!h.foodOverrides.length) return [...catalogue];
  const map = new Map(catalogue.map((f) => [f.id, f]));
  for (const o of h.foodOverrides) map.set(o.id, o);
  return [...map.values()];
}
