import { docForSync, foldOps, joinLink, serviceBase } from './sync';
import { createHousehold } from '@/core/household';
import { DEMO } from '@/core/test-helpers';
import { SEED_DISHES } from '@/data/dishes';

describe('sync helpers', () => {
  const h = createHousehold({ plan: DEMO, dishes: SEED_DISHES, now: '2026-11-05T06:00:00.000Z' });

  it('strips purchases and the token from the document sent to the service', () => {
    const withSync = {
      ...h,
      sync: { serviceUrl: 'https://x', token: 'secret', lastVersion: 1 },
      purchases: { w: { pasta: { coveredG: 500, at: 'a', by: 'g', opId: 'o', rev: 1 } } },
    };
    const doc = docForSync(withSync);
    expect(JSON.stringify(doc)).not.toContain('secret');
    expect('purchases' in doc).toBe(false);
  });

  it('folds operations last-writer-wins per week and key', () => {
    const ops = [
      {
        opId: 'a',
        weekId: 'w',
        key: 'pasta',
        checked: true,
        coveredG: 500,
        by: 'g',
        at: '2026-11-08T10:00:00Z',
        rev: 1,
      },
      {
        opId: 'b',
        weekId: 'w',
        key: 'pasta',
        checked: false,
        coveredG: 0,
        by: 'p',
        at: '2026-11-08T10:05:00Z',
        rev: 2,
      },
      {
        opId: 'c',
        weekId: 'w',
        key: 'pasta',
        checked: true,
        coveredG: 500,
        by: 'g',
        at: '2026-11-08T10:01:00Z',
        rev: 1,
      },
      {
        opId: 'd',
        weekId: 'w',
        key: 'rice',
        checked: true,
        coveredG: 1000,
        by: 'g',
        at: '2026-11-08T10:02:00Z',
        rev: 1,
      },
    ];
    const folded = foldOps({}, ops);
    expect(folded.w?.pasta).toBeUndefined();
    expect(folded.w?.rice?.coveredG).toBe(1000);
    const older = foldOps(
      { w: { pasta: { coveredG: 500, at: '2026-11-08T11:00:00Z', by: 'g', opId: 'z', rev: 3 } } },
      ops,
    );
    expect(older.w?.pasta?.opId).toBe('z');
  });

  it('builds a join link with the token in the hash only', () => {
    const link = joinLink(
      { ...h, sync: { serviceUrl: 'https://sync.example.com/', token: 'tok', lastVersion: 1 } },
      'https://app.example.com/',
    );
    expect(link).toBe('https://app.example.com/#/join?s=https%3A%2F%2Fsync.example.com%2F&t=tok');
    expect(serviceBase('https://s/')).toBe('https://s');
    expect(joinLink(h, 'https://app.example.com/')).toBeNull();
  });
});
