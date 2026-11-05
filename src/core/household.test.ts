import { createHousehold, exportHousehold, importHousehold, migrateHousehold } from './household';
import { SCHEMA_VERSION } from './model';
import { DEMO } from './test-helpers';
import { SEED_DISHES } from '@/data/dishes';

describe('household document', () => {
  it('exports and imports losslessly', () => {
    const h = createHousehold({ plan: DEMO, dishes: SEED_DISHES, now: '2026-11-05T06:00:00.000Z' });
    const back = importHousehold(exportHousehold(h));
    expect(back).toEqual(h);
  });
  it('migrates an unversioned document', () => {
    const h = createHousehold({ plan: DEMO, dishes: SEED_DISHES, now: '2026-11-05T06:00:00.000Z' });
    const raw = { ...h } as Record<string, unknown>;
    delete raw.schemaVersion;
    expect(migrateHousehold(raw).schemaVersion).toBe(SCHEMA_VERSION);
  });
  it('rejects a document from a newer app', () => {
    const h = createHousehold({ plan: DEMO, dishes: SEED_DISHES, now: '2026-11-05T06:00:00.000Z' });
    expect(() => migrateHousehold({ ...h, schemaVersion: SCHEMA_VERSION + 1 })).toThrow(/newer version/);
  });
});
