import type { Batch, Day, Dish, Food, Household, MainMeal, Plan, PlanRevision, Week } from '@/core/model';
import { activePlan, activeRevision, mealTemplate, templateFor } from '@/core/model';
import { addDays, mondayOf } from '@/core/dates';
import { foodsFor } from '@/core/household';
import { FOODS } from '@/data/foods';
import { foodMap, resolveMeal, type ResolvedLine } from '@/core/resolve';
import { resolvePlates, type Plates } from '@/core/plates';
import { aggregateShopping, type ShoppingList } from '@/core/shopping';
import { evaluateRules, type RuleResult } from '@/core/frequency';
import { STORE_ORDERS } from '@/data/foods';
import type { Now } from '@/core/mutations';

export interface Ctx {
  h: Household;
  plan: Plan;
  rev: PlanRevision;
  foods: Food[];
  foodMap: Map<string, Food>;
  dishes: Map<string, Dish>;
}

export function ctxOf(h: Household): Ctx {
  const plan = activePlan(h);
  const rev = activeRevision(plan);
  const foods = foodsFor(h, FOODS);
  return { h, plan, rev, foods, foodMap: foodMap(foods), dishes: new Map(h.dishes.map((d) => [d.id, d])) };
}

export function weekFor(h: Household, date: string): Week | undefined {
  const monday = mondayOf(date);
  return h.weeks.find((w) => w.monday === monday);
}

/** The week to show: the one containing today; else the next planned week; else the latest. */
export function currentWeek(h: Household, now: Now): Week | undefined {
  const w = weekFor(h, now.date);
  if (w) return w;
  const future = h.weeks.filter((x) => x.monday > now.date).sort((a, b) => a.monday.localeCompare(b.monday));
  if (future[0]) return future[0];
  return [...h.weeks].sort((a, b) => b.monday.localeCompare(a.monday))[0];
}

export function nextMondayFrom(now: Now): string {
  const thisMonday = mondayOf(now.date);
  return addDays(thisMonday, 7);
}

export function dayOf(week: Week | undefined, date: string): Day | undefined {
  return week?.days.find((d) => d.date === date);
}

export function nextMealOf(now: Now): MainMeal {
  return now.hour < 15 ? 'pranzo' : 'cena';
}

export function linesFor(ctx: Ctx, day: Day, which: MainMeal): ResolvedLine[] {
  const meal = day[which];
  if (meal.kind !== 'planned') return [];
  const mt = mealTemplate(templateFor(ctx.rev, day.template), which);
  if (!mt) return [];
  try {
    return resolveMeal(meal, mt, ctx.foodMap);
  } catch {
    return [];
  }
}

export function platesFor(ctx: Ctx, day: Day, which: MainMeal): Plates | null {
  const meal = day[which];
  if (meal.kind !== 'planned') return null;
  const mt = mealTemplate(templateFor(ctx.rev, day.template), which);
  if (!mt) return null;
  try {
    return resolvePlates(meal, mt, ctx.rev, ctx.foodMap, ctx.h.members);
  } catch {
    return null;
  }
}

export function batchesOf(h: Household, week: Week): Batch[] {
  return h.batches.filter((b) => b.weekId === week.id);
}

export function shoppingFor(ctx: Ctx, week: Week): ShoppingList {
  return aggregateShopping({
    week,
    rev: ctx.rev,
    foods: ctx.foods,
    dishes: ctx.h.dishes,
    members: ctx.h.members,
    batches: batchesOf(ctx.h, week),
    pantry: ctx.h.pantry,
    purchases: ctx.h.purchases[week.id] ?? {},
    manual: ctx.h.manualItems[week.id] ?? [],
    prefs: ctx.h.prefs,
    store: ctx.h.prefs.store,
    storeOrders: STORE_ORDERS,
  });
}

export function rulesFor(ctx: Ctx, week: Week): RuleResult[] {
  return evaluateRules(week, ctx.rev, ctx.foodMap);
}

export function dishTitle(ctx: Ctx, dishId: string | undefined, lang: 'en' | 'it' = 'en'): string | undefined {
  const d = dishId ? ctx.dishes.get(dishId) : undefined;
  if (!d) return undefined;
  return lang === 'it' ? d.titleIt : d.titleEn;
}

/** Render a dish step: {{role}} placeholders become the chosen food and her amount. */
export function renderStep(step: string, lines: ResolvedLine[], ctx: Ctx, plates: Plates | null): string {
  return step.replace(/\{\{(\w+)\}\}/g, (_, role: string) => {
    const line = lines.find((l) => l.role === role);
    if (!line) return role;
    const food = ctx.foodMap.get(line.foodId);
    const her = plates?.members.find((m) => m.multiplier === 1)?.lines.find((l) => l.slotId === line.slotId);
    return `${food?.nameEn ?? line.foodId}${her ? ` (${her.display})` : ''}`;
  });
}
