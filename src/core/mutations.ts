/**
 * Consumed-aware mutations. A day is half-eaten at 18:30: after lunch has been eaten the only legal
 * dinner operations are another dish for the same foods or another approved alternative; moving a day
 * (as a pranzo+cena pair) is allowed only while nothing on either day has been eaten.
 */
import type {
  Batch,
  Day,
  Dish,
  Food,
  MainMeal,
  Meal,
  Member,
  PlanRevision,
  Prefs,
  TasteEntry,
  Week,
} from './model';
import { MAIN_MEALS, isLibero, mealTemplate, templateFor } from './model';
import { checkWeek, type Violation } from './check';
import { isWeekend } from './dates';
import { foodMap, resolveMeal } from './resolve';
import { pickDish, liberoMeal, emptyMeal, excludedFoods } from './planner';
import { createRng } from './rng';
import { historyFromWeeks } from './variety';
import { dishFitsMeal } from './dishfit';
import { isConsumed, type Now } from './consumed';

export { isConsumed, type Now };

export interface MutationContext {
  rev: PlanRevision;
  foods: readonly Food[];
  dishes: readonly Dish[];
  members: readonly Member[];
  prefs: Prefs;
  taste: Record<string, TasteEntry>;
  history: readonly Week[];
  batches: readonly Batch[];
  now: Now;
}

export type MutationResult =
  | { ok: true; week: Week; batches: Batch[]; warnings: string[] }
  | { ok: false; reason: string; violations?: Violation[]; preview?: Week };

function clone(week: Week): Week {
  return structuredClone(week);
}

function dayOf(week: Week, date: string): Day {
  const d = week.days.find((x) => x.date === date);
  if (!d) throw new Error(`No day ${date} in week`);
  return d;
}

/** Remove batch links touching a meal (a replaced meal is no longer part of a cooked-once batch). */
function detachBatches(week: Week, batches: readonly Batch[], date: string, which: MainMeal): Batch[] {
  const meal = dayOf(week, date)[which];
  const ids = new Set<string>();
  if (meal.batchId) ids.add(meal.batchId);
  if (meal.leftoverOf) ids.add(meal.leftoverOf.batchId);
  if (ids.size === 0) return [...batches];
  for (const d of week.days) {
    for (const w of MAIN_MEALS) {
      const m = d[w];
      if (m.batchId && ids.has(m.batchId)) delete m.batchId;
      if (m.leftoverOf && ids.has(m.leftoverOf.batchId)) delete m.leftoverOf;
    }
  }
  return batches.filter((b) => !ids.has(b.id));
}

/** Re-prove the week. Minimum rules are warnings here (facts have been recorded; the counts stay visible). */
function finish(week: Week, batches: Batch[], ctx: MutationContext, warnings: string[] = []): MutationResult {
  const foods = foodMap(ctx.foods);
  const dishes = new Map(ctx.dishes.map((d) => [d.id, d]));
  const check = checkWeek(week, ctx.rev, foods, dishes, {
    batches,
    excluded: excludedFoods(ctx.prefs, ctx.taste),
    minRules: 'warn',
  });
  if (!check.ok)
    return {
      ok: false,
      reason: check.violations.map((v) => v.message).join('; '),
      violations: check.violations,
      preview: week,
    };
  return { ok: true, week, batches, warnings: [...warnings, ...check.warnings.map((w) => w.message)] };
}

export function replaceDish(
  week0: Week,
  date: string,
  which: MainMeal,
  dishId: string | undefined,
  ctx: MutationContext,
): MutationResult {
  const week = clone(week0);
  const day = dayOf(week, date);
  const meal = day[which];
  if (meal.kind !== 'planned') return { ok: false, reason: 'That meal is not a planned meal' };
  if (isConsumed(meal, date, which, ctx.now))
    return { ok: false, reason: 'That meal has already been eaten' };
  const foods = foodMap(ctx.foods);
  const mt = mealTemplate(templateFor(ctx.rev, day.template), which);
  if (!mt) return { ok: false, reason: 'No template for that meal' };
  const batches = detachBatches(week, ctx.batches, date, which);
  if (dishId) {
    const dish = ctx.dishes.find((d) => d.id === dishId);
    if (!dish) return { ok: false, reason: 'Unknown dish' };
    const fit = dishFitsMeal(dish, mt, resolveMeal(meal, mt, foods), foods, which);
    if (!fit.ok)
      return { ok: false, reason: `${dish.titleEn} does not fit these foods: ${fit.reasons.join('; ')}` };
    meal.dishId = dishId;
    const excluded = excludedFoods(ctx.prefs, ctx.taste);
    const vegFromDish = dish.freeVeg.filter((v) => foods.get(v)?.isFreeVeg && !excluded.has(v));
    if (vegFromDish.length) meal.veg = vegFromDish.slice(0, 3);
  } else {
    delete meal.dishId;
  }
  meal.status = 'planned';
  return finish(week, batches, ctx);
}

/** Another dish from the book for the same foods (excluding the current one). */
export function anotherDish(
  week0: Week,
  date: string,
  which: MainMeal,
  ctx: MutationContext,
  seed = 1,
): MutationResult {
  const week = clone(week0);
  const day = dayOf(week, date);
  const meal = day[which];
  if (meal.kind !== 'planned') return { ok: false, reason: 'That meal is not a planned meal' };
  if (isConsumed(meal, date, which, ctx.now))
    return { ok: false, reason: 'That meal has already been eaten' };
  const foods = foodMap(ctx.foods);
  const dishes = new Map(ctx.dishes.map((d) => [d.id, d]));
  const mt = mealTemplate(templateFor(ctx.rev, day.template), which);
  if (!mt) return { ok: false, reason: 'No template for that meal' };
  const lines = resolveMeal(meal, mt, foods);
  const excluded = excludedFoods(ctx.prefs, ctx.taste);
  const history = historyFromWeeks([...ctx.history, week], ctx.rev, foods, dishes);
  const candidates = ctx.dishes.filter((d) => d.id !== meal.dishId);
  const usedDishes = new Set(
    week.days.flatMap((d) => MAIN_MEALS.map((w) => d[w].dishId)).filter((x): x is string => !!x),
  );
  const picked = pickDish({
    day,
    which,
    mt,
    meal,
    lines,
    input: { ...plannerInputFrom(ctx, week), dishes: candidates },
    foods,
    excluded,
    history,
    usedDishes,
    rnd: createRng(seed),
  });
  if (!picked)
    return {
      ok: false,
      reason: 'No other dish in the book fits these foods. Add one in Recipes, or change the ingredient.',
    };
  const batches = detachBatches(week, ctx.batches, date, which);
  meal.dishId = picked.dish.id;
  meal.veg = picked.veg;
  return finish(week, batches, ctx);
}

function plannerInputFrom(ctx: MutationContext, week: Week) {
  return {
    planId: week.planId,
    rev: ctx.rev,
    foods: ctx.foods,
    dishes: ctx.dishes,
    members: ctx.members,
    prefs: ctx.prefs,
    taste: ctx.taste,
    history: ctx.history,
    monday: week.monday,
    seed: week.seed,
    now: ctx.now,
  };
}

export function setAlternative(
  week0: Week,
  date: string,
  which: MainMeal,
  slotId: string,
  optionIndex: number,
  ctx: MutationContext,
  wildcardFoodId?: string,
): MutationResult {
  const week = clone(week0);
  const day = dayOf(week, date);
  const meal = day[which];
  if (meal.kind !== 'planned') return { ok: false, reason: 'That meal is not a planned meal' };
  if (isConsumed(meal, date, which, ctx.now))
    return { ok: false, reason: 'That meal has already been eaten' };
  const mt = mealTemplate(templateFor(ctx.rev, day.template), which);
  const slot = mt?.slots.find((s) => s.id === slotId);
  const opt = slot?.options[optionIndex];
  if (!slot || !opt) return { ok: false, reason: 'Unknown option' };
  const batches = detachBatches(week, ctx.batches, date, which);
  meal.choices[slotId] = optionIndex;
  if (opt.kind === 'subgroup') {
    if (!wildcardFoodId) return { ok: false, reason: `Choose a ${opt.subgroup}` };
    meal.wildcard[slotId] = wildcardFoodId;
  } else {
    delete meal.wildcard[slotId];
  }
  // The current dish may no longer suit the new food: keep it only if it still fits.
  const foods = foodMap(ctx.foods);
  const warnings: string[] = [];
  if (meal.dishId && mt) {
    const dish = ctx.dishes.find((d) => d.id === meal.dishId);
    if (dish && !dishFitsMeal(dish, mt, resolveMeal(meal, mt, foods), foods, which).ok) {
      delete meal.dishId;
      warnings.push('The dish no longer suits the new ingredient; pick another dish.');
    }
  }
  return finish(week, batches, ctx, warnings);
}

/** Move a whole day (lunch and dinner travel together). Allowed only while nothing on either day has been eaten. */
export function swapDays(week0: Week, dateA: string, dateB: string, ctx: MutationContext): MutationResult {
  if (dateA === dateB) return { ok: true, week: clone(week0), batches: [...ctx.batches], warnings: [] };
  const week = clone(week0);
  const a = dayOf(week, dateA);
  const b = dayOf(week, dateB);
  for (const d of [a, b]) {
    if (d.date < ctx.now.date) return { ok: false, reason: `${d.date} is in the past` };
    for (const w of MAIN_MEALS) {
      if (d[w].kind !== 'libero' && isConsumed(d[w], d.date, w, ctx.now))
        return {
          ok: false,
          reason: `${d.date} has already been eaten in part; days can only be swapped in the morning`,
        };
      if (d[w].locked) return { ok: false, reason: `${d.date} ${w} is locked` };
    }
  }
  let batches = [...ctx.batches];
  for (const d of [a, b]) for (const w of MAIN_MEALS) batches = detachBatches(week, batches, d.date, w);
  const swap = <K extends keyof Day>(k: K) => {
    const t = a[k];
    a[k] = b[k];
    b[k] = t;
  };
  swap('template');
  swap('pranzo');
  swap('cena');
  swap('colazione');
  swap('merenda');
  for (const d of [a, b]) d.spuntino = ctx.rev.rules.morningSnack === 'daily' || !isWeekend(d.date);
  return finish(week, batches, ctx);
}

/** Put the free meal on a date by moving the free-meal template day there. */
export function setLiberoDate(week0: Week, date: string, ctx: MutationContext): MutationResult {
  const liberoT = ctx.rev.templates.find(isLibero);
  if (!liberoT) return { ok: false, reason: 'This plan has no free meal' };
  const from = week0.days.find((d) => d.template === liberoT.n);
  if (!from) return { ok: false, reason: 'The free-meal day is not in this week' };
  return swapDays(week0, from.date, date, ctx);
}

export function setMealStatus(week0: Week, date: string, which: MainMeal, status: Meal['status']): Week {
  const week = clone(week0);
  dayOf(week, date)[which].status = status;
  return week;
}

export function toggleLock(week0: Week, date: string, which: MainMeal): Week {
  const week = clone(week0);
  const m = dayOf(week, date)[which];
  m.locked = !m.locked;
  return week;
}

export function setPartner(
  week0: Week,
  date: string,
  which: MainMeal,
  patch: { eats?: boolean; multiplier?: number },
): Week {
  const week = clone(week0);
  const m = dayOf(week, date)[which];
  if (patch.eats !== undefined) m.partnerEats = patch.eats;
  if (patch.multiplier !== undefined) m.partnerMultiplier = patch.multiplier;
  return week;
}

/** Eating out: the meal's contents are unknown; it leaves the weekly count incomplete and buys nothing. */
export function markOut(
  week0: Week,
  date: string,
  which: MainMeal,
  ctx: MutationContext,
  out = true,
): MutationResult {
  const week = clone(week0);
  const day = dayOf(week, date);
  const meal = day[which];
  if (meal.kind === 'libero') return { ok: false, reason: 'That is the free meal' };
  const batches = detachBatches(week, ctx.batches, date, which);
  if (out) {
    day[which] = { ...emptyMeal(), kind: 'out', locked: meal.locked, note: meal.note };
    return finish(week, batches, ctx);
  }
  // Back to a planned meal: reference options, then the best-fitting dish.
  const mt = mealTemplate(templateFor(ctx.rev, day.template), which);
  if (!mt) return { ok: false, reason: 'No template for that meal' };
  const foods = foodMap(ctx.foods);
  const dishes = new Map(ctx.dishes.map((d) => [d.id, d]));
  const fresh: Meal = { ...emptyMeal(), locked: meal.locked };
  for (const s of mt.slots) {
    fresh.choices[s.id] = 0;
    const o = s.options[0]!;
    if (o.kind === 'subgroup') {
      const f = ctx.foods.find(
        (x) => x.subgroup === o.subgroup && !excludedFoods(ctx.prefs, ctx.taste).has(x.id),
      );
      if (f) fresh.wildcard[s.id] = f.id;
    }
  }
  day[which] = fresh;
  const lines = resolveMeal(fresh, mt, foods);
  const excluded = excludedFoods(ctx.prefs, ctx.taste);
  const history = historyFromWeeks([...ctx.history, week], ctx.rev, foods, dishes);
  const usedDishes = new Set(
    week.days.flatMap((d) => MAIN_MEALS.map((w) => d[w].dishId)).filter((x): x is string => !!x),
  );
  const picked = pickDish({
    day,
    which,
    mt,
    meal: fresh,
    lines,
    input: plannerInputFrom(ctx, week),
    foods,
    excluded,
    history,
    usedDishes,
    rnd: createRng(7),
  });
  if (picked) {
    fresh.dishId = picked.dish.id;
    fresh.veg = picked.veg;
  } else {
    fresh.veg = ctx.foods
      .filter((f) => f.isFreeVeg && !excluded.has(f.id))
      .slice(0, 2)
      .map((f) => f.id);
  }
  return finish(week, batches, ctx);
}

export function setVeg(
  week0: Week,
  date: string,
  which: MainMeal,
  veg: string[],
  ctx: MutationContext,
): MutationResult {
  const week = clone(week0);
  const meal = dayOf(week, date)[which];
  if (meal.kind !== 'planned') return { ok: false, reason: 'That meal is not a planned meal' };
  meal.veg = veg;
  return finish(week, [...ctx.batches], ctx);
}

export { liberoMeal };
export type { Day };
