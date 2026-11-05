import { MAIN_MEALS, activeRevision, mealTemplate, templateFor } from './model';
import { alignTo, batchIsConsistent, validateLeftover } from './batches';
import { checkWeek } from './check';
import { FOODS } from '@/data/foods';
import { SEED_DISHES } from '@/data/dishes';
import { MEMBERS, PLANS, okWeek } from './test-helpers';
import { foodMap, resolveMeal } from './resolve';
import { aggregateShopping } from './shopping';
import { PREFS } from './test-helpers';

const foods = foodMap(FOODS);
const dishes = new Map(SEED_DISHES.map((d) => [d.id, d]));

describe.each(PLANS)('batches on the $name plan', ({ plan }) => {
  const rev = activeRevision(plan);

  it('a lunch portion is not automatically a valid dinner, and leftovers are never eaten before they are cooked', () => {
    const { week } = okWeek(plan, 6);
    const res = validateLeftover(
      week,
      rev,
      foods,
      dishes,
      { date: week.days[0]!.date, meal: 'pranzo' },
      { date: week.days[1]!.date, meal: 'cena' },
    );
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/not automatically/);
    const back = validateLeftover(
      week,
      rev,
      foods,
      dishes,
      { date: week.days[2]!.date, meal: 'pranzo' },
      { date: week.days[0]!.date, meal: 'pranzo' },
    );
    expect(back.ok).toBe(false);
    expect(back.reason).toMatch(/after they are cooked/);
  });

  it('batches never allocate more portions than cooked', () => {
    expect(
      batchIsConsistent({
        id: 'b',
        weekId: 'w',
        dishId: 'd',
        cookAt: { date: '2026-11-09', meal: 'cena' },
        portions: [{ memberId: 'g', n: 2 }],
        allocated: [{ date: '2026-11-11', meal: 'cena', memberId: 'g' }],
      }),
    ).toBe(true);
    expect(
      batchIsConsistent({
        id: 'b',
        weekId: 'w',
        dishId: 'd',
        cookAt: { date: '2026-11-09', meal: 'cena' },
        portions: [{ memberId: 'g', n: 2 }],
        allocated: [
          { date: '2026-11-11', meal: 'cena', memberId: 'g' },
          { date: '2026-11-12', meal: 'cena', memberId: 'g' },
        ],
      }),
    ).toBe(false);
  });

  it('plans a cooked-once batch in most weeks, pointing at a later meal of the same type with identical lines', () => {
    let withBatch = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const { week, batches } = okWeek(plan, seed);
      if (batches.length) withBatch++;
      for (const b of batches) {
        const cookDay = week.days.find((d) => d.date === b.cookAt.date)!;
        const cook = cookDay[b.cookAt.meal];
        expect(cook.batchId).toBe(b.id);
        expect(dishes.get(b.dishId)?.batchable).toBeDefined();
        for (const a of b.allocated) {
          expect(a.date > b.cookAt.date).toBe(true);
          expect(a.meal).toBe(b.cookAt.meal);
          const leftDay = week.days.find((d) => d.date === a.date)!;
          const left = leftDay[a.meal];
          expect(left.leftoverOf?.batchId).toBe(b.id);
          expect(left.dishId).toBe(b.dishId);
          const la = resolveMeal(
            cook,
            mealTemplate(templateFor(rev, cookDay.template), b.cookAt.meal)!,
            foods,
          );
          const lb = resolveMeal(left, mealTemplate(templateFor(rev, leftDay.template), a.meal)!, foods);
          expect(lb.map((l) => `${l.role}:${l.foodId}:${JSON.stringify(l.qty)}`).sort()).toEqual(
            la.map((l) => `${l.role}:${l.foodId}:${JSON.stringify(l.qty)}`).sort(),
          );
        }
        expect(batchIsConsistent(b)).toBe(true);
        expect(checkWeek(week, rev, foods, dishes, { batches }).ok).toBe(true);
      }
    }
    expect(withBatch).toBeGreaterThanOrEqual(8);
  });

  it('a batch buys once and the leftover meal adds no demand', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { week, batches } = okWeek(plan, seed);
      const b = batches[0];
      if (!b) continue;
      const list = aggregateShopping({
        week,
        rev,
        foods: FOODS,
        dishes: SEED_DISHES,
        members: MEMBERS,
        batches,
        pantry: {},
        purchases: {},
        manual: [],
        prefs: PREFS,
        store: 'coop',
      });
      const leftoverRefs = list.items
        .flatMap((i) => i.why)
        .filter((w) => b.allocated.some((a) => a.date === w.date && a.meal === w.meal));
      expect(leftoverRefs).toEqual([]);
      const cookDay = week.days.find((d) => d.date === b.cookAt.date)!;
      const lines = resolveMeal(
        cookDay[b.cookAt.meal],
        mealTemplate(templateFor(rev, cookDay.template), b.cookAt.meal)!,
        foods,
      );
      const protein = lines.find((l) => l.role === 'protein')!;
      const item = list.items.find((i) => i.foodId === protein.foodId)!;
      const fromCook = item.why.filter((w) => w.date === b.cookAt.date && w.meal === b.cookAt.meal).length;
      expect(fromCook).toBeGreaterThan(0);
      return;
    }
  });

  it('alignTo reproduces lines through explicit and subgroup options, or refuses', () => {
    const { week } = okWeek(plan, 3);
    const d = week.days.find(
      (x) =>
        x.pranzo.kind === 'planned' &&
        mealTemplate(templateFor(rev, x.template), 'pranzo')!.slots.some((s) => s.role === 'cereal'),
    )!;
    const mt = mealTemplate(templateFor(rev, d.template), 'pranzo')!;
    const lines = resolveMeal(d.pranzo, mt, foods);
    const same = alignTo(lines, mt, foods)!;
    expect(resolveMeal({ ...d.pranzo, choices: same.choices, wildcard: same.wildcard }, mt, foods)).toEqual(
      lines,
    );
    const dinnerMt =
      mealTemplate(templateFor(rev, d.template), 'cena') ?? mealTemplate(templateFor(rev, 1), 'cena')!;
    expect(alignTo(lines, dinnerMt, foods)).toBeNull();
  });

  it('a kept leftover meal never dangles after regeneration', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const first = okWeek(plan, seed);
      const b = first.batches[0];
      if (!b) continue;
      const a = b.allocated[0]!;
      const day = first.week.days.find((d) => d.date === a.date)!;
      day[a.meal].locked = true;
      const again = okWeek(plan, seed + 100, { keep: first.week });
      const kept = again.week.days.find((d) => d.date === a.date)![a.meal];
      expect(kept.leftoverOf).toBeUndefined();
      expect(checkWeek(again.week, rev, foods, dishes, { batches: again.batches }).ok).toBe(true);
      for (const d of again.week.days)
        for (const w of MAIN_MEALS) {
          const m = d[w];
          if (m.leftoverOf) expect(again.batches.some((x) => x.id === m.leftoverOf!.batchId)).toBe(true);
          if (m.batchId) expect(again.batches.some((x) => x.id === m.batchId)).toBe(true);
        }
      return;
    }
  });
});
