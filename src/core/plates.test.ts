import fc from 'fast-check';
import { MAIN_MEALS, activeRevision, mealTemplate, templateFor } from './model';
import { displayFor, resolvePlates } from './plates';
import { foodMap, resolveMeal } from './resolve';
import { qtyEquals, scaleQty, toGrams } from './qty';
import { FOODS, foodById } from '@/data/foods';
import { MEMBERS, PLANS, okWeek } from './test-helpers';

const foods = foodMap(FOODS);

describe.each(PLANS)('plates on the $name plan', ({ plan }) => {
  const rev = activeRevision(plan);

  it("the constrained member's slot lines equal the plan to the gram; the partner's are her lines × the multiplier; the pot is the sum", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 5000 }), fc.double({ min: 0.5, max: 2.5, noNaN: true }), (seed, mult) => {
        const { week } = okWeek(plan, seed);
        for (const d of week.days) {
          for (const w of MAIN_MEALS) {
            const m = d[w];
            if (m.kind !== 'planned') continue;
            const mt = mealTemplate(templateFor(rev, d.template), w)!;
            const lines = resolveMeal(m, mt, foods);
            const plates = resolvePlates(m, mt, rev, foods, MEMBERS, { multiplierOverride: mult });
            const her = plates.members.find((p) => p.memberId === 'g')!;
            for (const l of lines) {
              const line = her.lines.find((x) => x.slotId === l.slotId)!;
              expect(qtyEquals(line.qty, l.qty)).toBe(true);
            }
            expect(her.lines.find((x) => x.role === 'oil')!.qty).toEqual({ kind: 'g', g: rev.rules.oilPerMealG });
            const partner = plates.members.find((p) => p.memberId === 'p')!;
            partner.lines.forEach((pl, i) => expect(qtyEquals(pl.qty, scaleQty(her.lines[i]!.qty, mult))).toBe(true));
            for (const pot of plates.pot) {
              const sum = pot.shares.reduce((s, x) => s + x.grams, 0);
              expect(pot.grams).toBe(sum);
              const expected = plates.members.reduce((s, mp) => s + mp.lines.filter((x) => x.foodId === pot.foodId && x.role === pot.role).reduce((t, x) => t + toGrams(x.qty, foods.get(x.foodId)), 0), 0);
              expect(pot.grams).toBe(expected);
            }
          }
        }
      }),
      { numRuns: 15 },
    );
  });
});

describe('display and scaling', () => {
  it('shows a pack that equals the portion as one piece', () => {
    expect(displayFor(foodById('mozzarella'), { kind: 'g', g: 125 })).toBe('1 × mozzarella 125 g');
    expect(displayFor(foodById('bresaola'), { kind: 'g', g: 70 })).toBe('1 × vaschetta 70 g');
    expect(displayFor(foodById('petto_pollo'), { kind: 'g', g: 140 })).toBe('140 g');
  });
  it('keeps counts as counts', () => {
    expect(displayFor(foodById('uova'), { kind: 'count', count: 2, unitG: 60 })).toBe('2 eggs (120 g)');
    expect(displayFor(foodById('uova'), { kind: 'count', count: 1, unitG: 60 })).toBe('1 egg (60 g)');
    expect(scaleQty({ kind: 'count', count: 2 }, 1.4)).toEqual({ kind: 'count', count: 3 });
    expect(scaleQty({ kind: 'count', count: 2 }, 1.2)).toEqual({ kind: 'count', count: 2.5 });
  });
  it('scales grams to 5 g and never touches a multiplier of 1', () => {
    expect(scaleQty({ kind: 'g', g: 140 }, 1.4)).toEqual({ kind: 'g', g: 195 });
    const q = { kind: 'g', g: 137 } as const;
    expect(scaleQty(q, 1)).toBe(q);
  });
  it('converts quantities to grams for shopping', () => {
    expect(toGrams({ kind: 'count', count: 2, unitG: 60 })).toBe(120);
    expect(toGrams({ kind: 'count', count: 1 }, foodById('mela'))).toBe(150);
    expect(toGrams({ kind: 'ml', ml: 200 })).toBe(200);
    expect(toGrams({ kind: 'free' })).toBe(0);
  });
});
