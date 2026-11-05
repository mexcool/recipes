import type { Food, FrequencyRule, MealType, Member, PlanRevision, Week } from './model';
import { MAIN_MEALS, mealTemplate, templateFor } from './model';
import { toGrams } from './qty';
import { resolveMeal } from './resolve';
import { isWeekend } from './dates';

/** One eating occasion of one food by the person on the plan. */
export interface Occurrence {
  date: string;
  meal: MealType;
  foodId: string;
  subgroup: Food['subgroup'];
  /** Units for count-based foods (2 eggs), else 1. */
  units: number;
  garnish: boolean;
}

export interface RuleResult {
  rule: FrequencyRule;
  /** For per-week rules: the week total. For per-day rules: the worst day. */
  count: number;
  perDay?: { date: string; count: number }[];
  ok: boolean;
  message?: string;
  witnesses: Occurrence[];
}

export function collectOccurrences(week: Week, rev: PlanRevision, foods: ReadonlyMap<string, Food>, opts: { skipDates?: Set<string> } = {}): Occurrence[] {
  const out: Occurrence[] = [];
  for (const day of week.days) {
    if (opts.skipDates?.has(day.date)) continue;
    const t = templateFor(rev, day.template);
    if (day.colazione) {
      const opt = rev.fixedMenus.colazione.find((o) => o.id === day.colazione);
      for (const it of opt?.items ?? []) out.push(occ(day.date, 'colazione', it.foodId, it.qty.kind === 'count' ? it.qty.count : 1, foods));
    }
    if (day.spuntino) {
      const fruit = rev.fixedMenus.spuntino.tiers[0]?.foodIds[0];
      if (fruit) out.push(occ(day.date, 'spuntino', fruit, 1, foods));
    }
    if (day.merenda) {
      const opt = rev.fixedMenus.merenda.find((o) => o.id === day.merenda);
      for (const it of opt?.items ?? []) out.push(occ(day.date, 'merenda', it.foodId, 1, foods));
    }
    for (const which of MAIN_MEALS) {
      const meal = day[which];
      if (meal.kind !== 'planned') continue;
      const mt = mealTemplate(t, which);
      if (!mt) continue;
      for (const line of resolveMeal(meal, mt, foods)) {
        const units = line.qty.kind === 'count' ? line.qty.count : 1;
        out.push({ ...occ(day.date, which, line.foodId, units, foods), garnish: line.role === 'topping' });
      }
    }
  }
  return out;
}

function occ(date: string, meal: MealType, foodId: string, units: number, foods: ReadonlyMap<string, Food>): Occurrence {
  const f = foods.get(foodId);
  return { date, meal, foodId, subgroup: f?.subgroup ?? 'condiment', units, garnish: false };
}

export function ruleMatches(rule: FrequencyRule, o: Occurrence): boolean {
  if (rule.garnishExempt && o.garnish) return false;
  if (rule.scope === 'main_meals' && o.meal !== 'pranzo' && o.meal !== 'cena') return false;
  if ('subgroups' in rule.subject) return rule.subject.subgroups.includes(o.subgroup);
  return rule.subject.foodIds.includes(o.foodId);
}

function countOf(rule: FrequencyRule, occs: Occurrence[]): number {
  if (rule.countBy === 'units') return occs.reduce((s, o) => s + o.units, 0);
  return new Set(occs.map((o) => `${o.date}|${o.meal}`)).size;
}

export function evaluateRule(rule: FrequencyRule, occurrences: readonly Occurrence[], dates: readonly string[]): RuleResult {
  const matching = occurrences.filter((o) => ruleMatches(rule, o));
  if (rule.per === 'day') {
    const perDay = dates.map((date) => ({ date, count: countOf(rule, matching.filter((o) => o.date === date)) }));
    const bad = perDay.filter((d) => (rule.min !== undefined && d.count < rule.min) || (rule.max !== undefined && d.count > rule.max));
    const worst = perDay.reduce((w, d) => (d.count > w ? d.count : w), 0);
    return {
      rule,
      count: worst,
      perDay,
      ok: bad.length === 0,
      ...(bad.length ? { message: `${rule.label}: ${bad.map((d) => `${d.date} has ${d.count}`).join(', ')}` } : {}),
      witnesses: matching.filter((o) => bad.some((d) => d.date === o.date)),
    };
  }
  const count = countOf(rule, matching);
  const tooFew = rule.min !== undefined && count < rule.min;
  const tooMany = rule.max !== undefined && count > rule.max;
  return {
    rule,
    count,
    ok: !tooFew && !tooMany,
    ...(tooFew ? { message: `${rule.label}: only ${count} this week (minimum ${rule.min})` } : {}),
    ...(tooMany ? { message: `${rule.label}: ${count} this week (maximum ${rule.max})` } : {}),
    witnesses: matching,
  };
}

export function evaluateRules(week: Week, rev: PlanRevision, foods: ReadonlyMap<string, Food>): RuleResult[] {
  const occurrences = collectOccurrences(week, rev, foods);
  const dates = week.days.map((d) => d.date);
  return rev.exchange.frequency.map((r) => evaluateRule(r, occurrences, dates));
}

/** Grams of oil the plan allots on a date (two main meals unless one is the free meal). */
export function oilForDay(rev: PlanRevision, mealsPlanned: number): number {
  return rev.rules.oilPerMealG * mealsPlanned;
}

export function snackAllowed(rev: PlanRevision, date: string): boolean {
  return rev.rules.morningSnack === 'daily' || !isWeekend(date);
}

export { toGrams, type Member };
