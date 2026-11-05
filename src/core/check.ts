/**
 * Independent compliance checker. The planner must produce weeks that pass it; every mutation re-runs it.
 * It never relaxes a rule: a week that fails here is not shown.
 */
import type { Dish, Food, PlanRevision, Week } from './model';
import { MAIN_MEALS, isLibero, mealTemplate, templateFor } from './model';
import { addDays, isWeekend } from './dates';
import { ChoiceError, resolveMeal, slotHasFreeOption } from './resolve';
import { evaluateRules } from './frequency';
import { dishFitsMeal } from './dishfit';

export type ViolationCode =
  | 'days'
  | 'template_unique'
  | 'choice_invalid'
  | 'libero_count'
  | 'libero_position'
  | 'veg_missing'
  | 'oil_budget'
  | 'snack_weekend'
  | 'frequency'
  | 'dish_mismatch'
  | 'leftover_invalid';

export interface Violation {
  code: ViolationCode;
  message: string;
  date?: string;
  meal?: 'pranzo' | 'cena';
}

export interface CheckResult {
  ok: boolean;
  violations: Violation[];
}

export function checkWeek(week: Week, rev: PlanRevision, foods: ReadonlyMap<string, Food>, dishes: ReadonlyMap<string, Dish> = new Map()): CheckResult {
  const v: Violation[] = [];

  // 1. Seven consecutive days from Monday, each template exactly once.
  if (week.days.length !== 7) v.push({ code: 'days', message: `Expected 7 days, got ${week.days.length}` });
  week.days.forEach((d, i) => {
    if (d.date !== addDays(week.monday, i)) v.push({ code: 'days', message: `Day ${i + 1} is ${d.date}, expected ${addDays(week.monday, i)}` });
  });
  const seen = new Set<number>();
  for (const d of week.days) {
    if (seen.has(d.template)) v.push({ code: 'template_unique', message: `Template ${d.template} appears twice`, date: d.date });
    seen.add(d.template);
  }

  // 2. Exactly one free meal, and only where the template says so.
  let liberoCount = 0;
  for (const d of week.days) {
    const t = templateFor(rev, d.template);
    for (const which of MAIN_MEALS) {
      const meal = d[which];
      if (meal.kind === 'libero') {
        liberoCount++;
        if (!(which === 'cena' && isLibero(t))) v.push({ code: 'libero_position', message: `Free meal on ${d.date} ${which} is not where the plan puts it`, date: d.date, meal: which });
      }
      if (which === 'cena' && isLibero(t) && meal.kind === 'planned') v.push({ code: 'libero_position', message: `Template ${t.n} dinner must be the free meal`, date: d.date, meal: which });
    }
  }
  if (liberoCount !== rev.rules.pastoLibero.perWeek) v.push({ code: 'libero_count', message: `Expected ${rev.rules.pastoLibero.perWeek} free meal, found ${liberoCount}` });

  // 3. Every choice is one of the slot's options; vegetables present; dish compatible.
  for (const d of week.days) {
    const t = templateFor(rev, d.template);
    for (const which of MAIN_MEALS) {
      const meal = d[which];
      if (meal.kind !== 'planned') continue;
      const mt = mealTemplate(t, which);
      if (!mt) continue;
      try {
        const lines = resolveMeal(meal, mt, foods);
        const needsVeg = rev.rules.veg.requiredAt.includes(which) && mt.slots.some((s) => s.role === 'veg' && slotHasFreeOption(s));
        if (needsVeg && meal.veg.length === 0) v.push({ code: 'veg_missing', message: `No vegetables on ${d.date} ${which}`, date: d.date, meal: which });
        for (const vegId of meal.veg) {
          const f = foods.get(vegId);
          if (!f || !f.isFreeVeg) v.push({ code: 'veg_missing', message: `${vegId} is not a free vegetable`, date: d.date, meal: which });
        }
        if (meal.dishId) {
          const dish = dishes.get(meal.dishId);
          if (!dish) v.push({ code: 'dish_mismatch', message: `Unknown dish ${meal.dishId}`, date: d.date, meal: which });
          else {
            const fit = dishFitsMeal(dish, mt, lines, foods, which);
            if (!fit.ok) v.push({ code: 'dish_mismatch', message: `${dish.titleEn}: ${fit.reasons.join('; ')}`, date: d.date, meal: which });
          }
        }
      } catch (e) {
        if (e instanceof ChoiceError) v.push({ code: 'choice_invalid', message: e.message, date: d.date, meal: which });
        else throw e;
      }
    }
    if (d.spuntino && rev.rules.morningSnack === 'weekdays_only' && isWeekend(d.date)) v.push({ code: 'snack_weekend', message: `Morning snack on ${d.date} (weekend)`, date: d.date });
  }

  // 4. Oil budget is structural: two meals' allowance never exceeds the day.
  if (rev.rules.oilPerMealG * 2 > rev.rules.oilPerDayG) v.push({ code: 'oil_budget', message: `Oil per meal × 2 exceeds the daily budget` });

  // 5. Weekly frequency rules.
  if (!v.some((x) => x.code === 'choice_invalid')) {
    for (const r of evaluateRules(week, rev, foods)) {
      if (!r.ok && !r.rule.review) v.push({ code: 'frequency', message: r.message ?? r.rule.label });
    }
  }

  return { ok: v.length === 0, violations: v };
}
