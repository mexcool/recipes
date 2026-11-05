import { activeRevision } from './model';
import { batchIsConsistent, validateLeftover } from './batches';
import { FOODS } from '@/data/foods';
import { PLANS, okWeek } from './test-helpers';
import { foodMap } from './resolve';

describe.each(PLANS)('batches on the $name plan', ({ plan }) => {
  const rev = activeRevision(plan);
  const foods = foodMap(FOODS);

  it('a lunch portion is not automatically a valid dinner', () => {
    const { week } = okWeek(plan, 6);
    const res = validateLeftover(week, rev, foods, { date: week.days[0]!.date, meal: 'pranzo' }, { date: week.days[1]!.date, meal: 'cena' });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/not automatically/);
  });

  it('batches never allocate more portions than cooked', () => {
    expect(batchIsConsistent({ id: 'b', weekId: 'w', dishId: 'd', cookAt: { date: '2026-11-09', meal: 'cena' }, portions: [{ memberId: 'g', n: 2 }], allocated: [{ date: '2026-11-11', meal: 'cena', memberId: 'g' }] })).toBe(true);
    expect(batchIsConsistent({ id: 'b', weekId: 'w', dishId: 'd', cookAt: { date: '2026-11-09', meal: 'cena' }, portions: [{ memberId: 'g', n: 2 }], allocated: [{ date: '2026-11-11', meal: 'cena', memberId: 'g' }, { date: '2026-11-12', meal: 'cena', memberId: 'g' }] })).toBe(false);
  });

  it('paired leftovers point at a batch cooked earlier in the same meal type', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const { week, batches } = okWeek(plan, seed);
      for (const b of batches) {
        const cook = week.days.find((d) => d.date === b.cookAt.date)![b.cookAt.meal];
        expect(cook.batchId).toBe(b.id);
        for (const a of b.allocated) {
          expect(a.date > b.cookAt.date).toBe(true);
          expect(a.meal).toBe(b.cookAt.meal);
          expect(week.days.find((d) => d.date === a.date)![a.meal].leftoverOf?.batchId).toBe(b.id);
        }
        expect(batchIsConsistent(b)).toBe(true);
      }
    }
  });
});
