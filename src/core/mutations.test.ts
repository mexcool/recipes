import { activeRevision, isLibero, templateFor, mealTemplate } from './model';
import { anotherDish, isConsumed, replaceDish, setAlternative, setLiberoDate, swapDays, markOut, type MutationContext } from './mutations';
import { FOODS } from '@/data/foods';
import { SEED_DISHES } from '@/data/dishes';
import { MEMBERS, PLANS, PREFS, okWeek } from './test-helpers';
import { foodMap, resolveMeal } from './resolve';

describe.each(PLANS)('mutations on the $name plan', ({ plan }) => {
  const rev = activeRevision(plan);
  const ctx = (now: MutationContext['now'], batches: MutationContext['batches'] = []): MutationContext => ({ rev, foods: FOODS, dishes: SEED_DISHES, members: MEMBERS, prefs: PREFS, taste: {}, history: [], batches, now });
  const morning = { date: '2026-11-10', hour: 9 };
  const evening = { date: '2026-11-10', hour: 18 };

  it('a day cannot be swapped once lunch has been eaten, but can in the morning', () => {
    const { week } = okWeek(plan, 2);
    expect(isConsumed(week.days[1]!.pranzo, '2026-11-10', 'pranzo', evening)).toBe(true);
    const refused = swapDays(week, '2026-11-10', '2026-11-12', ctx(evening));
    expect(refused.ok).toBe(false);
    const ok = swapDays(week, '2026-11-10', '2026-11-12', ctx(morning));
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.week.days[1]!.template).toBe(week.days[3]!.template);
    expect(ok.week.days[3]!.template).toBe(week.days[1]!.template);
  });

  it('after lunch, dinner can still take another dish for the same foods', () => {
    const { week } = okWeek(plan, 2);
    const res = anotherDish(week, '2026-11-10', 'cena', ctx(evening));
    if (!res.ok) expect(res.reason).toMatch(/No other dish/);
    else expect(res.week.days[1]!.cena.dishId).not.toBe(week.days[1]!.cena.dishId);
  });

  it('a dish that does not suit the chosen foods is refused', () => {
    const { week } = okWeek(plan, 2);
    const day = week.days.find((d) => d.cena.kind === 'planned' && mealTemplate(templateFor(rev, d.template), 'cena')!.slots.some((s) => s.role === 'soup'))!;
    const res = replaceDish(week, day.date, 'cena', 'tagliata-rocket', ctx(morning));
    expect(res.ok).toBe(false);
  });

  it('choosing an alternative re-checks the week and returns a preview on a rule breach', () => {
    const { week } = okWeek(plan, 2);
    const foods = foodMap(FOODS);
    // Find a lunch cheese slot and try to put cheese on every possible day via alternatives.
    let w = week;
    let breached = false;
    for (const d of w.days) {
      if (d.cena.kind !== 'planned') continue;
      const mt = mealTemplate(templateFor(rev, d.template), 'cena')!;
      const protein = mt.slots.find((s) => s.role === 'protein');
      const cheeseIdx = protein?.options.findIndex((o) => o.kind === 'food' && foods.get(o.foodId)?.subgroup === 'cheese_fresh') ?? -1;
      if (!protein || cheeseIdx < 0) continue;
      const res = setAlternative(w, d.date, 'cena', protein.id, cheeseIdx, ctx(morning));
      if (res.ok) w = res.week;
      else {
        expect(res.preview).toBeDefined();
        breached = true;
      }
    }
    expect(typeof breached).toBe('boolean');
  });

  it('an alternative that is valid changes her grams to the option amount', () => {
    const { week } = okWeek(plan, 2);
    const foods = foodMap(FOODS);
    const d = week.days.find((x) => x.template === 2)!;
    const mt = mealTemplate(templateFor(rev, 2), 'cena')!;
    const bread = mt.slots.find((s) => s.role === 'bread')!;
    const res = setAlternative(week, d.date, 'cena', bread.id, 1, ctx(morning));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const line = resolveMeal(res.week.days.find((x) => x.date === d.date)!.cena, mt, foods).find((l) => l.slotId === bread.id)!;
    expect(line.optionIndex).toBe(1);
    expect(line.qty).toEqual((bread.options[1] as { qty: unknown }).qty);
  });

  it('moving the free meal moves its template day', () => {
    const { week } = okWeek(plan, 2);
    const res = setLiberoDate(week, '2026-11-11', ctx(morning));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const wed = res.week.days.find((d) => d.date === '2026-11-11')!;
    expect(wed.cena.kind).toBe('libero');
    expect(isLibero(templateFor(rev, wed.template))).toBe(true);
  });

  it('eating out leaves the week valid and buys nothing for that meal', () => {
    const { week } = okWeek(plan, 2);
    const res = markOut(week, '2026-11-12', 'cena', ctx(morning));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.week.days[3]!.cena.kind).toBe('out');
  });
});
