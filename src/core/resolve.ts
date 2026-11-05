import type {
  Food,
  MainMeal,
  Meal,
  MealTemplate,
  PlanRevision,
  Qty,
  Role,
  Slot,
  SlotOption,
  Subgroup,
} from './model';
import { mealTemplate, templateFor } from './model';

/** A slot resolved to a concrete food and amount for the person on the plan. */
export interface ResolvedLine {
  slotId: string;
  role: Role;
  foodId: string;
  qty: Qty;
  optionIndex: number;
  fromSubgroup?: Subgroup;
}

export class ChoiceError extends Error {
  constructor(
    message: string,
    public readonly slotId: string,
  ) {
    super(message);
  }
}

export function optionFoodId(
  opt: SlotOption,
  slot: Slot,
  meal: Meal,
  foods: ReadonlyMap<string, Food>,
): string | null {
  if (opt.kind === 'free') return null;
  if (opt.kind === 'food') return opt.foodId;
  const wc = meal.wildcard[slot.id];
  if (!wc) throw new ChoiceError(`Slot ${slot.id}: a ${opt.subgroup} must be chosen`, slot.id);
  const f = foods.get(wc);
  if (!f) throw new ChoiceError(`Slot ${slot.id}: unknown food ${wc}`, slot.id);
  if (f.subgroup !== opt.subgroup)
    throw new ChoiceError(`Slot ${slot.id}: ${wc} is not a ${opt.subgroup}`, slot.id);
  return wc;
}

/** Resolve a planned meal's choices against its template. Free options produce no line. */
export function resolveMeal(meal: Meal, mt: MealTemplate, foods: ReadonlyMap<string, Food>): ResolvedLine[] {
  const out: ResolvedLine[] = [];
  for (const slot of mt.slots) {
    const idx = meal.choices[slot.id] ?? 0;
    const opt = slot.options[idx];
    if (!opt) throw new ChoiceError(`Slot ${slot.id}: option ${idx} does not exist`, slot.id);
    const foodId = optionFoodId(opt, slot, meal, foods);
    if (foodId === null || opt.kind === 'free') continue;
    out.push({
      slotId: slot.id,
      role: slot.role,
      foodId,
      qty: opt.qty,
      optionIndex: idx,
      ...(opt.kind === 'subgroup' ? { fromSubgroup: opt.subgroup } : {}),
    });
  }
  return out;
}

export function resolveDayMeal(
  rev: PlanRevision,
  templateN: number,
  which: MainMeal,
  meal: Meal,
  foods: ReadonlyMap<string, Food>,
): ResolvedLine[] {
  if (meal.kind !== 'planned') return [];
  const mt = mealTemplate(templateFor(rev, templateN), which);
  if (!mt) return [];
  return resolveMeal(meal, mt, foods);
}

/** All foods a slot option can stand for (expands subgroup wildcards). */
export function optionCandidates(opt: SlotOption, foods: readonly Food[]): Food[] {
  if (opt.kind === 'free') return [];
  if (opt.kind === 'food') {
    const f = foods.find((x) => x.id === opt.foodId);
    return f ? [f] : [];
  }
  return foods.filter((x) => x.subgroup === opt.subgroup);
}

export function slotHasFreeOption(slot: Slot): boolean {
  return slot.options.some((o) => o.kind === 'free');
}

export function foodMap(foods: readonly Food[]): Map<string, Food> {
  return new Map(foods.map((f) => [f.id, f]));
}
