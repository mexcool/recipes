import { MAIN_MEALS, activeRevision, mealTemplate, type Meal } from '@/core/model';
import { dishFitsMeal } from '@/core/dishfit';
import { foodMap, optionCandidates, resolveMeal } from '@/core/resolve';
import { PLANS } from '@/core/test-helpers';
import { FOODS, FOOD_BY_ID } from './foods';
import { SEED_DISHES } from './dishes';

const foods = foodMap(FOODS);

describe('seed dish book', () => {
  it('has unique ids and references only catalogue foods', () => {
    const ids = SEED_DISHES.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const d of SEED_DISHES) {
      for (const b of d.bindings)
        if (Array.isArray(b.foods))
          for (const f of b.foods) expect(FOOD_BY_ID.has(f), `${d.id} → ${f}`).toBe(true);
      for (const v of [...d.freeVeg, ...d.condiments]) expect(FOOD_BY_ID.has(v), `${d.id} → ${v}`).toBe(true);
      expect(d.steps.length).toBeGreaterThan(0);
      for (const s of d.steps) expect(s).not.toMatch(/\d+\s?(g|gr|ml|kg)\b/i);
    }
  });

  it.each(PLANS)(
    'covers every explicit option combination of every template meal on the $name plan',
    ({ plan }) => {
      const rev = activeRevision(plan);
      const gaps: string[] = [];
      for (const t of rev.templates) {
        for (const which of MAIN_MEALS) {
          const mt = mealTemplate(t, which);
          if (!mt) continue;
          // Enumerate explicit options per slot (subgroup wildcards represented by one food of the subgroup).
          const perSlot = mt.slots.map((s) =>
            s.options.flatMap((o, i) => {
              if (o.kind === 'free') return [{ i, food: null as string | null }];
              if (o.kind === 'food') return [{ i, food: o.foodId }];
              const c = optionCandidates(o, FOODS)[0];
              return c ? [{ i, food: c.id }] : [];
            }),
          );
          const combos = perSlot.reduce<{ i: number; food: string | null }[][]>(
            (acc, opts) => acc.flatMap((prefix) => opts.map((o) => [...prefix, o])),
            [[]],
          );
          for (const combo of combos) {
            const meal: Meal = {
              kind: 'planned',
              choices: {},
              wildcard: {},
              veg: [],
              status: 'planned',
              locked: false,
              partnerEats: true,
            };
            mt.slots.forEach((s, k) => {
              meal.choices[s.id] = combo[k]!.i;
              const o = s.options[combo[k]!.i]!;
              if (o.kind === 'subgroup' && combo[k]!.food) meal.wildcard[s.id] = combo[k]!.food!;
            });
            const lines = resolveMeal(meal, mt, foods);
            const fits = SEED_DISHES.filter(
              (d) => d.status !== 'draft' && dishFitsMeal(d, mt, lines, foods, which).ok,
            );
            if (fits.length === 0)
              gaps.push(`Day ${t.n} ${which}: ${lines.map((l) => l.foodId).join(' + ')}`);
          }
        }
      }
      expect(gaps).toEqual([]);
    },
  );
});
