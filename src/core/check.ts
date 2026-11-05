/**
 * Independent compliance checker. The planner must produce weeks that pass it; every mutation re-runs it.
 * It never relaxes a rule. Minimum rules can be reported as warnings instead of violations (for
 * fact-recording changes such as "we ate out"), and are always warnings when a meal's contents are unknown.
 */
import type { Batch, Dish, Food, PlanRevision, Week } from './model';
import { MAIN_MEALS, isLibero, mealTemplate, templateFor } from './model';
import { addDays, isWeekend } from './dates';
import { ChoiceError, resolveMeal, slotHasFreeOption } from './resolve';
import { evaluateRules } from './frequency';
import { dishFitsMeal } from './dishfit';
import { sameLines } from './batches';
import { dishTitle } from './title';

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
  | 'leftover_invalid'
  | 'excluded_food';

export interface Violation {
  code: ViolationCode;
  message: string;
  date?: string;
  meal?: 'pranzo' | 'cena';
}

export interface CheckOptions {
  batches?: readonly Batch[];
  /** Foods the household never uses (dislikes, allergies, "never again"). */
  excluded?: ReadonlySet<string>;
  /** 'error' (default): a minimum rule not met is a violation. 'warn': reported as a warning. */
  minRules?: 'error' | 'warn';
}

export interface CheckResult {
  ok: boolean;
  violations: Violation[];
  warnings: Violation[];
}

export function checkWeek(
  week: Week,
  rev: PlanRevision,
  foods: ReadonlyMap<string, Food>,
  dishes: ReadonlyMap<string, Dish> = new Map(),
  opts: CheckOptions = {},
): CheckResult {
  const v: Violation[] = [];
  const w: Violation[] = [];
  const excluded = opts.excluded ?? new Set<string>();

  // 1. Seven consecutive days from Monday, each template exactly once.
  if (week.days.length !== 7) v.push({ code: 'days', message: `Expected 7 days, got ${week.days.length}` });
  week.days.forEach((d, i) => {
    if (d.date !== addDays(week.monday, i))
      v.push({ code: 'days', message: `Day ${i + 1} is ${d.date}, expected ${addDays(week.monday, i)}` });
  });
  const seen = new Set<number>();
  for (const d of week.days) {
    if (seen.has(d.template))
      v.push({ code: 'template_unique', message: `Template ${d.template} appears twice`, date: d.date });
    seen.add(d.template);
  }

  // 2. Exactly one free meal, and only where the template says so.
  let liberoCount = 0;
  let unknownMeals = 0;
  for (const d of week.days) {
    const t = templateFor(rev, d.template);
    for (const which of MAIN_MEALS) {
      const meal = d[which];
      if (meal.kind === 'out') unknownMeals++;
      if (meal.kind === 'libero') {
        liberoCount++;
        if (!(which === 'cena' && isLibero(t)))
          v.push({
            code: 'libero_position',
            message: `Free meal on ${d.date} ${which} is not where the plan puts it`,
            date: d.date,
            meal: which,
          });
      }
      if (which === 'cena' && isLibero(t) && meal.kind === 'planned')
        v.push({
          code: 'libero_position',
          message: `Template ${t.n} dinner must be the free meal`,
          date: d.date,
          meal: which,
        });
    }
  }
  if (liberoCount !== rev.rules.pastoLibero.perWeek)
    v.push({
      code: 'libero_count',
      message: `Expected ${rev.rules.pastoLibero.perWeek} free meal, found ${liberoCount}`,
    });

  // 3. Every choice is one of the slot's options (and nothing else); vegetables present; dish compatible; nothing excluded.
  const batchById = new Map((opts.batches ?? []).map((b) => [b.id, b]));
  for (const d of week.days) {
    const t = templateFor(rev, d.template);
    if (d.colazione && !rev.fixedMenus.colazione.some((o) => o.id === d.colazione))
      v.push({ code: 'choice_invalid', message: `Unknown breakfast option ${d.colazione}`, date: d.date });
    if (d.merenda && !rev.fixedMenus.merenda.some((o) => o.id === d.merenda))
      v.push({
        code: 'choice_invalid',
        message: `Unknown afternoon snack option ${d.merenda}`,
        date: d.date,
      });
    for (const id of [d.colazione, d.merenda]) {
      const opt = [...rev.fixedMenus.colazione, ...rev.fixedMenus.merenda].find((o) => o.id === id);
      for (const it of opt?.items ?? [])
        if (excluded.has(it.foodId))
          v.push({
            code: 'excluded_food',
            message: `${opt?.label} uses ${foods.get(it.foodId)?.nameEn ?? it.foodId}, which is excluded`,
            date: d.date,
          });
    }
    for (const which of MAIN_MEALS) {
      const meal = d[which];
      if (meal.kind !== 'planned') continue;
      const mt = mealTemplate(t, which);
      if (!mt) continue;
      const slotIds = new Set(mt.slots.map((s) => s.id));
      for (const key of Object.keys(meal.choices))
        if (!slotIds.has(key))
          v.push({
            code: 'choice_invalid',
            message: `${d.date} ${which}: choice for unknown slot ${key}`,
            date: d.date,
            meal: which,
          });
      for (const key of Object.keys(meal.wildcard)) {
        const slot = mt.slots.find((s) => s.id === key);
        const opt = slot?.options[meal.choices[key] ?? 0];
        if (!slot || !opt || opt.kind !== 'subgroup')
          v.push({
            code: 'choice_invalid',
            message: `${d.date} ${which}: wildcard on ${key} is not a subgroup option`,
            date: d.date,
            meal: which,
          });
      }
      try {
        const lines = resolveMeal(meal, mt, foods);
        for (const l of lines)
          if (excluded.has(l.foodId))
            v.push({
              code: 'excluded_food',
              message: `${d.date} ${which}: ${foods.get(l.foodId)?.nameEn ?? l.foodId} is excluded`,
              date: d.date,
              meal: which,
            });
        const needsVeg =
          rev.rules.veg.requiredAt.includes(which) &&
          mt.slots.some((s) => s.role === 'veg' && slotHasFreeOption(s));
        if (needsVeg && meal.veg.length === 0)
          v.push({
            code: 'veg_missing',
            message: `No vegetables on ${d.date} ${which}`,
            date: d.date,
            meal: which,
          });
        for (const vegId of meal.veg) {
          const f = foods.get(vegId);
          if (!f || !f.isFreeVeg)
            v.push({
              code: 'veg_missing',
              message: `${vegId} is not a free vegetable`,
              date: d.date,
              meal: which,
            });
          else if (excluded.has(vegId))
            v.push({
              code: 'excluded_food',
              message: `${d.date} ${which}: ${f.nameEn} is excluded`,
              date: d.date,
              meal: which,
            });
        }
        if (meal.dishId) {
          const dish = dishes.get(meal.dishId);
          if (!dish)
            v.push({
              code: 'dish_mismatch',
              message: `Unknown dish ${meal.dishId}`,
              date: d.date,
              meal: which,
            });
          else {
            const fit = dishFitsMeal(dish, mt, lines, foods, which);
            if (!fit.ok)
              v.push({
                code: 'dish_mismatch',
                message: `${dishTitle(dish, foods, lines)}: ${fit.reasons.join('; ')}`,
                date: d.date,
                meal: which,
              });
          }
        }
        if (meal.leftoverOf) {
          const b = batchById.get(meal.leftoverOf.batchId);
          if (!b)
            v.push({
              code: 'leftover_invalid',
              message: `${d.date} ${which}: leftovers of a batch that no longer exists`,
              date: d.date,
              meal: which,
            });
          else {
            const cookDay = week.days.find((x) => x.date === b.cookAt.date);
            const cookMeal = cookDay?.[b.cookAt.meal];
            const cookMt = cookDay ? mealTemplate(templateFor(rev, cookDay.template), b.cookAt.meal) : null;
            if (!cookDay || !cookMeal || cookMeal.kind !== 'planned' || cookMeal.batchId !== b.id || !cookMt)
              v.push({
                code: 'leftover_invalid',
                message: `${d.date} ${which}: the cooking meal of its batch is missing`,
                date: d.date,
                meal: which,
              });
            else if (!(b.cookAt.date < d.date))
              v.push({
                code: 'leftover_invalid',
                message: `${d.date} ${which}: leftovers cooked after they are eaten`,
                date: d.date,
                meal: which,
              });
            else if (!sameLines(resolveMeal(cookMeal, cookMt, foods), lines))
              v.push({
                code: 'leftover_invalid',
                message: `${d.date} ${which}: leftover portion differs from what was cooked`,
                date: d.date,
                meal: which,
              });
            else if (!b.allocated.some((a) => a.date === d.date && a.meal === which))
              v.push({
                code: 'leftover_invalid',
                message: `${d.date} ${which}: batch does not allocate a portion here`,
                date: d.date,
                meal: which,
              });
          }
        }
        if (meal.batchId && !batchById.has(meal.batchId))
          v.push({
            code: 'leftover_invalid',
            message: `${d.date} ${which}: cooks a batch that no longer exists`,
            date: d.date,
            meal: which,
          });
      } catch (e) {
        if (e instanceof ChoiceError)
          v.push({ code: 'choice_invalid', message: e.message, date: d.date, meal: which });
        else throw e;
      }
    }
    if (d.spuntino && rev.rules.morningSnack === 'weekdays_only' && isWeekend(d.date))
      v.push({ code: 'snack_weekend', message: `Morning snack on ${d.date} (weekend)`, date: d.date });
  }

  // 4. Oil budget is structural: two meals' allowance never exceeds the day.
  if (rev.rules.oilPerMealG * 2 > rev.rules.oilPerDayG)
    v.push({ code: 'oil_budget', message: `Oil per meal × 2 exceeds the daily budget` });

  // 5. Weekly frequency rules (enforced ones). Minimums are warnings when a meal's contents are unknown.
  if (!v.some((x) => x.code === 'choice_invalid')) {
    const minAsWarning = opts.minRules === 'warn' || unknownMeals > 0;
    for (const r of evaluateRules(week, rev, foods)) {
      if (r.ok || !r.rule.enforce) continue;
      const isMin =
        r.rule.min !== undefined &&
        r.count < r.rule.min &&
        !(r.rule.max !== undefined && r.count > r.rule.max);
      const msg =
        unknownMeals > 0 && isMin
          ? `${r.message} — ${unknownMeals} meal${unknownMeals > 1 ? 's' : ''} eaten out, coverage incomplete`
          : (r.message ?? r.rule.label);
      if (isMin && minAsWarning) w.push({ code: 'frequency', message: msg });
      else v.push({ code: 'frequency', message: msg });
    }
  }

  return { ok: v.length === 0, violations: v, warnings: w };
}
