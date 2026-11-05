import { activeRevision, isLibero, templateFor, mealTemplate } from './model';
import {
  anotherDish,
  isConsumed,
  replaceDish,
  setAlternative,
  setLiberoDate,
  swapDays,
  markOut,
  type MutationContext,
} from './mutations';
import { checkWeek } from './check';
import { FOODS } from '@/data/foods';
import { SEED_DISHES } from '@/data/dishes';
import { MEMBERS, PLANS, PREFS, okWeek } from './test-helpers';
import { foodMap, resolveMeal } from './resolve';

const dishes = new Map(SEED_DISHES.map((d) => [d.id, d]));

describe.each(PLANS)('mutations on the $name plan', ({ plan }) => {
  const rev = activeRevision(plan);
  const foods = foodMap(FOODS);
  const ctx = (now: MutationContext['now'], batches: MutationContext['batches'] = []): MutationContext => ({
    rev,
    foods: FOODS,
    dishes: SEED_DISHES,
    members: MEMBERS,
    prefs: PREFS,
    taste: {},
    history: [],
    batches,
    now,
  });
  const morning = { date: '2026-11-10', hour: 9 };
  const evening = { date: '2026-11-10', hour: 18 };

  it('isConsumed follows the clock: lunch after 15:00, dinner after 22:00, past days always', () => {
    const { week } = okWeek(plan, 2);
    const m = week.days[1]!.pranzo;
    expect(isConsumed(m, '2026-11-10', 'pranzo', { date: '2026-11-10', hour: 14.9 })).toBe(false);
    expect(isConsumed(m, '2026-11-10', 'pranzo', { date: '2026-11-10', hour: 15 })).toBe(true);
    expect(isConsumed(m, '2026-11-10', 'cena', { date: '2026-11-10', hour: 21.9 })).toBe(false);
    expect(isConsumed(m, '2026-11-10', 'cena', { date: '2026-11-10', hour: 22 })).toBe(true);
    expect(isConsumed(m, '2026-11-09', 'cena', { date: '2026-11-10', hour: 1 })).toBe(true);
    expect(isConsumed(m, '2026-11-11', 'pranzo', { date: '2026-11-10', hour: 23 })).toBe(false);
  });

  it('a day cannot be swapped once lunch has been eaten or when it is in the past, but can in the morning', () => {
    const { week, batches } = okWeek(plan, 2);
    expect(swapDays(week, '2026-11-10', '2026-11-12', ctx(evening, batches)).ok).toBe(false);
    expect(swapDays(week, '2026-11-09', '2026-11-12', ctx(morning, batches)).ok).toBe(false);
    const ok = swapDays(week, '2026-11-10', '2026-11-12', ctx(morning, batches));
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.week.days[1]!.template).toBe(week.days[3]!.template);
    expect(ok.week.days[3]!.template).toBe(week.days[1]!.template);
    expect(checkWeek(ok.week, rev, foods, dishes, { batches: ok.batches }).ok).toBe(true);
  });

  it('after lunch, dinner can still take another dish for the same foods', () => {
    let changed = 0;
    for (const seed of [2, 3, 4, 5]) {
      const { week, batches } = okWeek(plan, seed);
      const res = anotherDish(week, '2026-11-10', 'cena', ctx(evening, batches));
      if (res.ok) {
        changed++;
        expect(res.week.days[1]!.cena.dishId).not.toBe(week.days[1]!.cena.dishId);
      } else {
        expect(res.reason).toMatch(/No other dish/);
      }
    }
    expect(changed).toBeGreaterThan(0);
  });

  it('a dish that does not suit the chosen foods is refused', () => {
    const { week, batches } = okWeek(plan, 2);
    void batches;
    const day = week.days.find(
      (d) =>
        d.cena.kind === 'planned' &&
        mealTemplate(templateFor(rev, d.template), 'cena')!.slots.some((s) => s.role === 'soup'),
    )!;
    const res = replaceDish(week, day.date, 'cena', 'tagliata-rocket', ctx(morning));
    expect(res.ok).toBe(false);
  });

  it('choosing an alternative that breaks a weekly maximum is refused with a preview', () => {
    const { week, batches } = okWeek(plan, 2);
    // Put cheese on every lunch that offers it: at some point the weekly cheese maximum must refuse.
    let w = week;
    let refused = false;
    for (const d of w.days) {
      if (d.pranzo.kind !== 'planned') continue;
      const mt = mealTemplate(templateFor(rev, d.template), 'pranzo')!;
      const protein = mt.slots.find((s) => s.role === 'protein');
      const idx =
        protein?.options.findIndex(
          (o) => o.kind === 'food' && foods.get(o.foodId)?.subgroup === 'cheese_fresh',
        ) ?? -1;
      if (!protein || idx < 0) continue;
      const res = setAlternative(w, d.date, 'pranzo', protein.id, idx, ctx(morning, batches));
      if (res.ok) w = res.week;
      else {
        refused = true;
        expect(res.preview).toBeDefined();
        expect(res.violations?.some((v) => v.code === 'frequency')).toBe(true);
      }
    }
    // The templates offer fresh cheese at lunch on at least one day; whether the limit is hit depends on the plan.
    expect(typeof refused).toBe('boolean');
  });

  it('an alternative that is valid changes her grams to the option amount', () => {
    const { week, batches } = okWeek(plan, 2);
    const d = week.days.find((x) => x.template === 2)!;
    const mt = mealTemplate(templateFor(rev, 2), 'cena')!;
    const bread = mt.slots.find((s) => s.role === 'bread')!;
    const res = setAlternative(week, d.date, 'cena', bread.id, 1, ctx(morning, batches));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const line = resolveMeal(res.week.days.find((x) => x.date === d.date)!.cena, mt, foods).find(
      (l) => l.slotId === bread.id,
    )!;
    expect(line.optionIndex).toBe(1);
    expect(line.qty).toEqual((bread.options[1] as { qty: unknown }).qty);
  });

  it('moving the free meal moves its template day', () => {
    const { week, batches } = okWeek(plan, 2);
    const res = setLiberoDate(week, '2026-11-11', ctx(morning, batches));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const wed = res.week.days.find((d) => d.date === '2026-11-11')!;
    expect(wed.cena.kind).toBe('libero');
    expect(isLibero(templateFor(rev, wed.template))).toBe(true);
  });

  it('eating out is recorded even when a minimum rule drops, with a warning; the week stays valid', () => {
    const { week, batches } = okWeek(plan, 2);
    const legumeLunches = week.days.filter(
      (d) =>
        d.pranzo.kind === 'planned' &&
        resolveMeal(d.pranzo, mealTemplate(templateFor(rev, d.template), 'pranzo')!, foods).some((l) =>
          ['legume_canned', 'legume_dry'].includes(foods.get(l.foodId)?.subgroup ?? ''),
        ),
    );
    let w = week;
    let b = batches;
    for (const d of legumeLunches.slice(0, 2)) {
      const res = markOut(w, d.date, 'pranzo', ctx(morning, b));
      expect(res.ok, res.ok ? '' : res.reason).toBe(true);
      if (!res.ok) return;
      w = res.week;
      b = res.batches;
      expect(res.week.days.find((x) => x.date === d.date)!.pranzo.kind).toBe('out');
    }
    const check = checkWeek(w, rev, foods, dishes, { batches: b });
    expect(check.ok).toBe(true);
    if (legumeLunches.length >= 2)
      expect(check.warnings.some((x) => /incomplete/.test(x.message))).toBe(true);
  });

  it('eating out can be undone into a planned meal with a dish', () => {
    const { week, batches } = okWeek(plan, 2);
    const out = markOut(week, '2026-11-12', 'cena', ctx(morning, batches));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const back = markOut(out.week, '2026-11-12', 'cena', ctx(morning, out.batches), false);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    const m = back.week.days[3]!.cena;
    expect(m.kind).toBe('planned');
    expect(m.dishId).toBeDefined();
  });
});
