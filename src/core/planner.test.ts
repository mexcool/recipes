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
        const check = checkWeek(res.week, rev, foods, dishes, { batches: res.batches });
        expect(check.violations).toEqual([]);
      }),
      { numRuns: 300 },
    );
  });

  it('keeps every template exactly once, one free meal on its template, and snacks only on weekdays', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { week } = okWeek(plan, seed);
      expect(week.days.map((d) => d.template).sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
      const liberos = week.days.flatMap((d) =>
        MAIN_MEALS.filter((w) => d[w].kind === 'libero').map((w) => ({ d, w })),
      );
      expect(liberos).toHaveLength(1);
      expect(isLibero(templateFor(rev, liberos[0]!.d.template))).toBe(true);
      for (const d of week.days)
        expect(d.spuntino).toBe(rev.rules.morningSnack === 'daily' || !isWeekend(d.date));
    }
  });

  it('places the free meal on the requested date and rejects a date outside the week', () => {
    const { week } = okWeek(plan, 9, { liberoDate: '2026-11-11' });
    const wed = week.days.find((d) => d.date === '2026-11-11')!;
    expect(wed.cena.kind).toBe('libero');
    expect(isLibero(templateFor(rev, wed.template))).toBe(true);
    const bad = generateWeek(plannerInput(plan, 9, { liberoDate: '2026-12-01' }));
    expect(bad.ok).toBe(false);
  });

  it('attaches a fitting dish and at least one vegetable to every main meal, with no dish repeated in the week except as leftovers', () => {
    for (const seed of [11, 12, 13, 14, 15, 16]) {
      const { week, notes } = okWeek(plan, seed);
      expect(notes.filter((n) => n.includes('no dish'))).toEqual([]);
      const seen = new Map<string, number>();
      for (const d of week.days) {
        for (const w of MAIN_MEALS) {
          const m = d[w];
          if (m.kind !== 'planned') continue;
          const mt = mealTemplate(templateFor(rev, d.template), w)!;
          expect(m.dishId).toBeDefined();
          if (!m.leftoverOf) seen.set(m.dishId!, (seen.get(m.dishId!) ?? 0) + 1);
          if (mt.slots.some((s) => s.role === 'veg')) expect(m.veg.length).toBeGreaterThan(0);
          expect(resolveMeal(m, mt, foods).length).toBeGreaterThan(0);
        }
      }
      const repeats = [...seen.values()].filter((n) => n > 1);
      expect(repeats, `seed ${seed}`).toEqual([]);
    }
  });

  it('never serves a breakfast cereal as a lunch grain', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const { week } = okWeek(plan, seed, {
        prefs: { ...PREFS, preferMore: ['cornflakes', 'fiocchi_avena'] },
      });
      for (const d of week.days)
        for (const w of MAIN_MEALS) {
          if (d[w].kind !== 'planned') continue;
          for (const l of resolveMeal(d[w], mealTemplate(templateFor(rev, d.template), w)!, foods))
            expect(foods.get(l.foodId)?.subgroup).not.toBe('breakfast_cereal');
        }
    }
  });

  it('satisfies every enforced weekly rule and reports counts for the rest', () => {
    const { week } = okWeek(plan, 21);
    for (const r of evaluateRules(week, rev, foods)) {
      if (r.rule.enforce) expect(r.ok, r.message).toBe(true);
      expect(typeof r.count).toBe('number');
    }
  });

  it('varies cereals within the week', () => {
    for (const seed of [33, 34, 35]) {
      const { week } = okWeek(plan, seed);
      const cereals = week.days.flatMap((d) =>
        d.pranzo.kind === 'planned' && !d.pranzo.leftoverOf
          ? resolveMeal(d.pranzo, mealTemplate(templateFor(rev, d.template), 'pranzo')!, foods)
              .filter((l) => l.role === 'cereal')
              .map((l) => l.foodId)
          : [],
      );
      expect(new Set(cereals).size).toBe(cereals.length);
    }
  });

  it('does not repeat a vegetable on consecutive meals most of the time', () => {
    let consecutive = 0;
    let pairs = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const { week } = okWeek(plan, seed);
      const meals = week.days
        .flatMap((d) => MAIN_MEALS.map((w) => d[w]))
        .filter((m) => m.kind === 'planned' && m.veg.length);
      for (let i = 1; i < meals.length; i++) {
        pairs++;
        if (meals[i]!.veg.some((v) => meals[i - 1]!.veg.includes(v))) consecutive++;
      }
    }
    expect(consecutive / pairs).toBeLessThan(0.35);
  });

  it('is deterministic for a seed', () => {
    expect(okWeek(plan, 77).week).toEqual(okWeek(plan, 77).week);
  });

  it('keeps locked meals and their day in place when regenerating, without aliasing them', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 6 }),
        fc.constantFrom(...MAIN_MEALS),
        fc.integer({ min: 1, max: 500 }),
        (dayIdx, which, seed) => {
          const first = okWeek(plan, seed).week;
          const day = first.days[dayIdx]!;
          if (day[which].kind !== 'planned') return;
          day[which].locked = true;
          const again = generateWeek(plannerInput(plan, seed + 1000, { keep: first }));
          expect(again.ok, again.ok ? '' : `${again.reason} ${again.witnesses.join(',')}`).toBe(true);
          if (!again.ok) return;
          const same = again.week.days[dayIdx]!;
          expect(same.template).toBe(day.template);
          expect(same[which].choices).toEqual(day[which].choices);
          expect(same[which].wildcard).toEqual(day[which].wildcard);
          expect(same[which].dishId).toBe(day[which].dishId);
          expect(same[which]).not.toBe(day[which]);
          expect(same.colazione).toBe(day.colazione);
          expect(checkWeek(again.week, rev, foods, dishes, { batches: again.batches }).ok).toBe(true);
        },
      ),
      { numRuns: 40 },
    );
  });

  it('keeps meals eaten by the clock and eating-out meals when regenerating mid-week', () => {
    const first = okWeek(plan, 8).week;
    first.days[2]!.cena = { ...first.days[2]!.cena, kind: 'out', dishId: undefined };
    const now = { date: first.days[1]!.date, hour: 18 };
    const again = generateWeek(plannerInput(plan, 9, { keep: first, now }));
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.week.days[0]!.template).toBe(first.days[0]!.template);
    expect(again.week.days[1]!.template).toBe(first.days[1]!.template);
    expect(again.week.days[1]!.pranzo.dishId).toBe(first.days[1]!.pranzo.dishId);
    expect(again.week.days[2]!.cena.kind).toBe('out');
  });

  it('respects allergies in breakfasts, snacks and main meals, and explains when nothing is left', () => {
    const { week } = okWeek(plan, 4, { prefs: { ...PREFS, allergies: ['noci', 'yogurt_magro', 'tofu'] } });
    for (const d of week.days) {
      const b = rev.fixedMenus.colazione.find((o) => o.id === d.colazione)!;
      expect(b.items.some((i) => i.foodId === 'noci')).toBe(false);
      const m = rev.fixedMenus.merenda.find((o) => o.id === d.merenda)!;
      expect(m.items.some((i) => i.foodId === 'yogurt_magro')).toBe(false);
    }
    const allBreakfastFoods = [
      ...new Set(rev.fixedMenus.colazione.flatMap((o) => o.items.map((i) => i.foodId))),
    ];
    const none = generateWeek(plannerInput(plan, 4, { prefs: { ...PREFS, allergies: allBreakfastFoods } }));
    expect(none.ok).toBe(false);
    if (!none.ok) expect(none.reason).toMatch(/breakfast/);
  });

  it('explains infeasibility instead of relaxing a rule', () => {
    const legumeIds = FOODS.filter((f) => f.subgroup === 'legume_canned' || f.subgroup === 'legume_dry').map(
      (f) => f.id,
    );
    const res = generateWeek(plannerInput(plan, 3, { prefs: { ...PREFS, dislikes: legumeIds } }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason.toLowerCase()).toMatch(/legum|excluded|rule|never use/);
  });

  it('uses the previous week to avoid repeating dishes', () => {
    const w1 = okWeek(plan, 41).week;
    const w2 = okWeek(plan, 42, { history: [w1], monday: '2026-11-16' }).week;
    const dishes1 = new Set(w1.days.flatMap((d) => MAIN_MEALS.map((w) => d[w].dishId).filter(Boolean)));
    const repeats = w2.days.flatMap((d) =>
      MAIN_MEALS.map((w) => d[w].dishId).filter((id) => id && dishes1.has(id)),
    );
    expect(repeats.length).toBeLessThan(5);
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
