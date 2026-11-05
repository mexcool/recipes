/**
 * Validate a dish shape against the active plan: which template meals it fits, which slots it leaves
 * unfilled, which foods fall outside the day templates (and whether the exchange lists accept them),
 * and any rule violations (cooking methods, condiments, vegetables that are not free, quantities in steps).
 */
import type { Dish, DishBinding, Exchange, Food, MainMeal, PlanRevision, Slot, SlotOption, Week } from './model';
import { MAIN_MEALS, mealTemplate } from './model';
import { optionCandidates } from './resolve';
import { collectOccurrences, evaluateRule, ruleMatches, type Occurrence } from './frequency';

export interface FitMatch {
  role: DishBinding['role'];
  slotId: string;
  optionIndex: number;
  foodId: string;
  label: string;
  isReference: boolean;
}

export interface FitIssue {
  level: 'error' | 'warning';
  code: 'unfilled' | 'foreign' | 'method' | 'condiment' | 'not_free_veg' | 'sugary_veg' | 'grams_in_steps' | 'garnish_only' | 'meal_type';
  message: string;
}

export interface ExchangeFallback {
  role: DishBinding['role'];
  foodId: string;
  exchange: Exchange;
  message: string;
}

export interface Fit {
  template: number;
  meal: MainMeal;
  hint?: string;
  matches: FitMatch[];
  unfilled: Slot[];
  foreign: DishBinding[];
  exchangeFallbacks: ExchangeFallback[];
  issues: FitIssue[];
  complete: boolean;
  score: number;
}

export interface Verdict {
  fits: Fit[];
  best?: Fit;
  summary: string;
  questions: string[];
  issues: FitIssue[];
}

const GRAMS_IN_TEXT = /\d+\s?(g|gr|ml|kg)\b/i;

function bindingFoods(b: DishBinding, foods: readonly Food[]): Food[] {
  if (b.foods === 'any') return [...foods];
  if (b.foods === 'any_cereal') return foods.filter((f) => f.subgroup === 'cereal');
  if (b.foods === 'any_bread') return foods.filter((f) => f.subgroup === 'bread' || f.subgroup === 'bread_sub' || f.subgroup === 'tuber');
  const ids = new Set(b.foods);
  return foods.filter((f) => ids.has(f.id));
}

function optionLabel(opt: SlotOption, food: Food | undefined): string {
  if (opt.kind === 'free') return 'free';
  const q = opt.qty;
  const amount = q.kind === 'g' ? `${q.g} g` : q.kind === 'ml' ? `${q.ml} ml` : q.kind === 'count' ? `${q.count} ${food?.nameEn ?? 'pieces'}` : '';
  return `${food?.nameEn ?? (opt.kind === 'subgroup' ? opt.subgroup : opt.foodId)} ${amount}`.trim();
}

/** Issues that do not depend on which meal the dish is matched against. */
export function dishIssues(dish: Dish, rev: PlanRevision, foods: ReadonlyMap<string, Food>): FitIssue[] {
  const issues: FitIssue[] = [];
  for (const m of dish.methods) {
    if (!rev.rules.methods.includes(m)) issues.push({ level: 'error', code: 'method', message: `Cooking method "${m}" is not in the plan (allowed: ${rev.rules.methods.join(', ')})` });
  }
  for (const c of dish.condiments) {
    if (!rev.rules.condiments.includes(c)) issues.push({ level: 'warning', code: 'condiment', message: `${foods.get(c)?.nameEn ?? c} is not in the plan's condiment list` });
  }
  for (const v of dish.freeVeg) {
    const f = foods.get(v);
    if (!f) continue;
    if (!f.isFreeVeg) issues.push({ level: 'error', code: 'not_free_veg', message: `${f.nameEn} is not a free vegetable on this plan` });
    else if (rev.rules.veg.limitSubgroups.includes(f.subgroup)) issues.push({ level: 'warning', code: 'sugary_veg', message: `${f.nameEn}: sugary vegetable, keep it small` });
  }
  if (dish.steps.some((s) => GRAMS_IN_TEXT.test(s))) issues.push({ level: 'error', code: 'grams_in_steps', message: 'Steps must not contain quantities: amounts always come from the plan' });
  return issues;
}

export function validateDish(dish: Dish, rev: PlanRevision, foodList: readonly Food[]): Verdict {
  const foods = new Map(foodList.map((f) => [f.id, f]));
  const general = dishIssues(dish, rev, foods);
  const fits: Fit[] = [];
  for (const t of rev.templates) {
    for (const which of MAIN_MEALS) {
      const mt = mealTemplate(t, which);
      if (!mt) continue;
      const issues: FitIssue[] = [...general];
      if (!dish.mealTypes.includes(which)) issues.push({ level: 'warning', code: 'meal_type', message: `The dish is written for ${dish.mealTypes.join('/')}, this is ${which}` });
      const matches: FitMatch[] = [];
      const usedSlots = new Set<string>();
      const foreign: DishBinding[] = [];
      for (const b of dish.bindings) {
        if (b.role === 'veg') continue;
        const bf = bindingFoods(b, foodList);
        let found: FitMatch | undefined;
        for (const s of mt.slots) {
          if (s.role !== b.role || usedSlots.has(s.id)) continue;
          for (let i = 0; i < s.options.length && !found; i++) {
            const opt = s.options[i]!;
            const cands = optionCandidates(opt, foodList).filter((f) => bf.some((x) => x.id === f.id));
            const pick = cands[0];
            if (pick) found = { role: b.role, slotId: s.id, optionIndex: i, foodId: pick.id, label: optionLabel(opt, pick), isReference: i === 0 };
          }
          if (found) break;
        }
        if (found) {
          matches.push(found);
          usedSlots.add(found.slotId);
        } else if (b.role === 'topping') {
          issues.push({ level: 'warning', code: 'garnish_only', message: `Grated cheese here is a garnish (max ${rev.rules.gratedCheeseMaxTsp} tsp), not a protein` });
        } else {
          foreign.push(b);
        }
      }
      const unfilled = mt.slots.filter((s) => s.role !== 'veg' && s.role !== 'topping' && !usedSlots.has(s.id) && !s.options.every((o) => o.kind === 'free'));
      for (const s of unfilled) {
        const ref = s.options[0]!;
        const refFood = ref.kind === 'food' ? foods.get(ref.foodId) : undefined;
        issues.push({ level: 'error', code: 'unfilled', message: `${s.role} slot unfilled — add ${optionLabel(ref, refFood)}` });
      }
      const exchangeFallbacks: ExchangeFallback[] = [];
      for (const b of foreign) {
        const listId = b.role === 'protein' ? 'B' : b.role === 'cereal' || b.role === 'bread' ? 'A' : undefined;
        const list = rev.exchange.lists.find((l) => l.meal === which && l.list === listId);
        const candidate = bindingFoods(b, foodList)[0];
        const ex = list?.items.find((e) => (e.foodId && bindingFoods(b, foodList).some((f) => f.id === e.foodId)) || (e.subgroup && bindingFoods(b, foodList).some((f) => f.subgroup === e.subgroup)));
        if (ex && candidate) {
          const exFood = ex.foodId ? foods.get(ex.foodId) : candidate;
          exchangeFallbacks.push({ role: b.role, foodId: exFood?.id ?? candidate.id, exchange: ex, message: `${exFood?.nameEn ?? candidate.nameEn} is accepted by the exchange lists for ${which} (${optionLabel({ kind: 'food', foodId: exFood?.id ?? candidate.id, qty: ex.qty }, exFood)}) but not by this day template — ask the nutritionist` });
        } else {
          issues.push({ level: 'error', code: 'foreign', message: `${b.role}: ${candidate?.nameEn ?? 'this food'} has no place in this meal` });
        }
      }
      const errors = issues.filter((i) => i.level === 'error').length;
      const complete = unfilled.length === 0 && foreign.length === 0 && errors === 0;
      const score = (complete ? 100 : 0) - errors * 10 - foreign.length * 5 - issues.filter((i) => i.level === 'warning').length + matches.filter((m) => m.isReference).length;
      fits.push({ template: t.n, meal: which, ...(t.hint ? { hint: t.hint } : {}), matches, unfilled, foreign, exchangeFallbacks, issues, complete, score });
    }
  }
  fits.sort((a, b) => b.score - a.score || a.template - b.template);
  const best = fits[0];
  const questions: string[] = [];
  const summary = summarise(dish, best, foods);
  if (best && !best.complete && best.exchangeFallbacks.length) questions.push(`${dish.titleEn}: ${best.exchangeFallbacks.map((e) => e.message).join('; ')}`);
  return { fits, ...(best ? { best } : {}), summary, questions, issues: general };
}

function summarise(dish: Dish, best: Fit | undefined, foods: ReadonlyMap<string, Food>): string {
  if (!best) return 'No template meal on this plan has the right slots for this dish.';
  const where = `Day ${best.template} ${best.meal}`;
  const alts = best.matches.filter((m) => !m.isReference).map((m) => `${foods.get(m.foodId)?.nameEn ?? m.foodId} alternative`);
  const withAlts = alts.length ? ` with the ${alts.join(' and ')}` : '';
  if (best.complete) return `Fits ${where}${withAlts}; complete.`;
  const problems = best.issues.filter((i) => i.level === 'error').map((i) => i.message);
  if (best.exchangeFallbacks.length) problems.push(...best.exchangeFallbacks.map((e) => e.message));
  return `Closest: ${where}${withAlts}. ${problems.join(' ')}`;
}

/** Would placing this dish's protein on a given meal push a weekly rule over its maximum? */
export function contextWarnings(dish: Dish, week: Week, rev: PlanRevision, foods: ReadonlyMap<string, Food>, date: string, which: MainMeal, foodList: readonly Food[]): string[] {
  const occ = collectOccurrences(week, rev, foods).filter((o) => !(o.date === date && o.meal === which));
  const extra: Occurrence[] = [];
  for (const b of dish.bindings) {
    if (b.role === 'veg' || b.role === 'topping') continue;
    const f = bindingFoods(b, foodList)[0];
    if (f) extra.push({ date, meal: which, foodId: f.id, subgroup: f.subgroup, units: 1, garnish: false });
  }
  const dates = week.days.map((d) => d.date);
  const out: string[] = [];
  for (const r of rev.exchange.frequency) {
    if (r.max === undefined || !extra.some((o) => ruleMatches(r, o))) continue;
    const res = evaluateRule(r, [...occ, ...extra], dates);
    if (!res.ok) out.push(res.message ?? r.label);
  }
  return out;
}
