import type { Dish, DishBinding, Food, MainMeal, MealTemplate, Slot } from './model';
import type { ResolvedLine } from './resolve';

export interface DishFit {
  ok: boolean;
  reasons: string[];
}

export function bindingAccepts(b: DishBinding, foodId: string, foods: ReadonlyMap<string, Food>): boolean {
  if (b.foods === 'any') return true;
  const f = foods.get(foodId);
  if (!f) return false;
  if (b.foods === 'any_cereal') return f.subgroup === 'cereal';
  if (b.foods === 'any_bread')
    return f.subgroup === 'bread' || f.subgroup === 'bread_sub' || f.subgroup === 'tuber';
  return b.foods.includes(foodId);
}

/** Does a dish shape fit this meal as chosen: every binding matches a slot's food, every non-optional slot is covered. */
export function dishFitsMeal(
  dish: Dish,
  mt: MealTemplate,
  lines: readonly ResolvedLine[],
  foods: ReadonlyMap<string, Food>,
  which: MainMeal,
): DishFit {
  const reasons: string[] = [];
  if (!dish.mealTypes.includes(which)) reasons.push(`not meant for ${which}`);
  const covered = new Set<string>();
  for (const b of dish.bindings) {
    if (b.role === 'veg') continue;
    const line = lines.find(
      (l) => l.role === b.role && !covered.has(l.slotId) && bindingAccepts(b, l.foodId, foods),
    );
    if (!line) {
      const slotExists = mt.slots.some((s) => s.role === b.role);
      reasons.push(
        slotExists
          ? `${b.role}: the chosen food does not suit this dish`
          : `${b.role}: this meal has no such slot`,
      );
      continue;
    }
    covered.add(line.slotId);
  }
  for (const s of mt.slots) {
    if (s.role === 'veg' || s.role === 'topping') continue;
    const line = lines.find((l) => l.slotId === s.id);
    if (line && !covered.has(s.id)) reasons.push(`${s.role} (${line.foodId}) is not used by the dish`);
  }
  return { ok: reasons.length === 0, reasons };
}

export function slotRoles(mt: MealTemplate): Slot['role'][] {
  return mt.slots.map((s) => s.role);
}
