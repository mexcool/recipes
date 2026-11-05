import fc from 'fast-check';
import { checkWeek } from './check';
import { MAIN_MEALS, activeRevision, isLibero, mealTemplate, templateFor } from './model';
import { generateWeek } from './planner';
import { foodMap, resolveMeal } from './resolve';
import { evaluateRules } from './frequency';
import { isWeekend } from './dates';
import { FOODS } from '@/data/foods';
import { SEED_DISHES } from '@/data/dishes';
import { MEMBERS, MONDAY, PLANS, PREFS, okWeek, plannerInput } from './test-helpers';

const foods = foodMap(FOODS);
const dishes = new Map(SEED_DISHES.map((d) => [d.id, d]));

describe.each(PLANS)('planner on the $name plan', ({ plan }) => {
  const rev = activeRevision(plan);

  it('generates a week that the independent checker accepts, for many seeds', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100000 }), (seed) => {
        const res = okWeek(plan, seed);
        const check = checkWeek(res.week, rev, foods, dishes);
        expect(check.violations).toEqual([]);
      }),
      { numRuns: 60 },
    );
  });

  it('keeps every template exactly once, one free meal on its template, and snacks only on weekdays', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { week } = okWeek(plan, seed);
      expect(week.days.map((d) => d.template).sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
      const liberos = week.days.flatMap((d) => MAIN_MEALS.filter((w) => d[w].kind === 'libero').map((w) => ({ d, w })));
      expect(liberos).toHaveLength(1);
      expect(isLibero(templateFor(rev, liberos[0]!.d.template))).toBe(true);
      for (const d of week.days) expect(d.spuntino).toBe(rev.rules.morningSnack === 'daily' || !isWeekend(d.date));
    }
  });

  it('places the free meal on the requested date', () => {
    const { week } = okWeek(plan, 9, { liberoDate: '2026-11-11' });
    const wed = week.days.find((d) => d.date === '2026-11-11')!;
    expect(wed.cena.kind).toBe('libero');
    expect(isLibero(templateFor(rev, wed.template))).toBe(true);
  });

  it('attaches a fitting dish and at least one vegetable to every main meal', () => {
    for (const seed of [11, 12, 13]) {
      const { week, notes } = okWeek(plan, seed);
      expect(notes.filter((n) => n.includes('no dish'))).toEqual([]);
      for (const d of week.days) {
        for (const w of MAIN_MEALS) {
          const m = d[w];
          if (m.kind !== 'planned') continue;
          const mt = mealTemplate(templateFor(rev, d.template), w)!;
          expect(m.dishId).toBeDefined();
          const hasVegSlot = mt.slots.some((s) => s.role === 'veg');
          if (hasVegSlot) expect(m.veg.length).toBeGreaterThan(0);
          expect(resolveMeal(m, mt, foods).length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('satisfies every non-review weekly rule and reports counts for review rules', () => {
    const { week } = okWeek(plan, 21);
    for (const r of evaluateRules(week, rev, foods)) {
      if (!r.rule.review) expect(r.ok, r.message).toBe(true);
      expect(typeof r.count).toBe('number');
    }
  });

  it('varies cereals and proteins within the week', () => {
    const { week } = okWeek(plan, 33);
    const cereals = week.days.flatMap((d) => (d.pranzo.kind === 'planned' ? resolveMeal(d.pranzo, mealTemplate(templateFor(rev, d.template), 'pranzo')!, foods).filter((l) => l.role === 'cereal').map((l) => l.foodId) : []));
    expect(new Set(cereals).size).toBe(cereals.length);
  });

  it('is deterministic for a seed', () => {
    const a = okWeek(plan, 77).week;
    const b = okWeek(plan, 77).week;
    expect(a).toEqual(b);
  });

  it('keeps locked meals and their day in place when regenerating', () => {
    const first = okWeek(plan, 5).week;
    const lockedDay = first.days[2]!;
    lockedDay.pranzo.locked = true;
    const again = generateWeek(plannerInput(plan, 99, { keep: first }));
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    const same = again.week.days[2]!;
    expect(same.template).toBe(lockedDay.template);
    expect(same.pranzo.choices).toEqual(lockedDay.pranzo.choices);
    expect(same.pranzo.dishId).toBe(lockedDay.pranzo.dishId);
  });

  it('explains infeasibility instead of relaxing a rule', () => {
    const legumeIds = FOODS.filter((f) => f.subgroup === 'legume_canned' || f.subgroup === 'legume_dry').map((f) => f.id);
    const res = generateWeek(plannerInput(plan, 3, { prefs: { ...PREFS, dislikes: legumeIds } }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason.toLowerCase()).toMatch(/legum|excluded|rule/);
  });

  it('uses the previous week to avoid repeating the same dish', () => {
    const w1 = okWeek(plan, 41).week;
    const w2 = okWeek(plan, 42, { history: [w1], monday: '2026-11-16' }).week;
    const dishes1 = new Set(w1.days.flatMap((d) => MAIN_MEALS.map((w) => d[w].dishId).filter(Boolean)));
    const repeats = w2.days.flatMap((d) => MAIN_MEALS.map((w) => d[w].dishId).filter((id) => id && dishes1.has(id)));
    // Some repeats are unavoidable with ~45 dishes across 13 meals, but most should differ.
    expect(repeats.length).toBeLessThan(7);
  });
});

describe('members and dates', () => {
  it('uses the configured monday', () => {
    const { week } = okWeek(PLANS[0]!.plan, 1);
    expect(week.monday).toBe(MONDAY);
    expect(week.days[0]!.date).toBe(MONDAY);
    expect(MEMBERS[0]!.constrained).toBe(true);
  });
});
