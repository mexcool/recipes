import type { Food, MainMeal, Meal, MealTemplate, Member, PlanRevision, Qty, Role } from './model';
import { mealTemplate, templateFor } from './model';
import { cookedEstimate, formatQty, scaleQty, toGrams } from './qty';
import { resolveMeal, type ResolvedLine } from './resolve';

export type LineRole = Role | 'oil';

export interface PlateLine {
  foodId: string;
  role: LineRole;
  qty: Qty;
  /** What to show: "1 mozzarella (125 g)", "2 eggs", "140 g". */
  display: string;
  cookedG?: number;
  slotId?: string;
}

export interface MemberPlate {
  memberId: string;
  multiplier: number;
  lines: PlateLine[];
}

export interface PotLine {
  foodId: string;
  role: LineRole;
  grams: number;
  cookedG?: number;
  /** Each member's raw share, for "cook together then split". */
  shares: { memberId: string; grams: number }[];
}

export interface Plates {
  members: MemberPlate[];
  pot: PotLine[];
}

export function displayFor(food: Food, qty: Qty): string {
  if (qty.kind === 'count') {
    const n = Number.isInteger(qty.count) ? String(qty.count) : qty.count.toFixed(1);
    const name = qty.count === 1 ? singular(food.nameEn) : food.nameEn;
    const grams = qty.unitG ?? food.pieceG;
    return grams ? `${n} ${name} (${Math.round(qty.count * grams)} g)` : `${n} ${name}`;
  }
  if (qty.kind === 'g') {
    const unit = food.purchaseUnits.find((u) => u.equalsPortion && u.usableG === qty.g);
    if (unit) return `1 × ${unit.label}`;
    return `${qty.g} g`;
  }
  return formatQty(qty, food);
}

function singular(name: string): string {
  if (name === 'eggs') return 'egg';
  if (name.endsWith('ies')) return name.slice(0, -3) + 'y';
  if (name.endsWith('s') && !name.endsWith('ss')) return name.slice(0, -1);
  return name;
}

function lineFor(food: Food, role: LineRole, qty: Qty, slotId?: string): PlateLine {
  const cooked = cookedEstimate(qty, food);
  return {
    foodId: food.id,
    role,
    qty,
    display: displayFor(food, qty),
    ...(cooked ? { cookedG: cooked } : {}),
    ...(slotId ? { slotId } : {}),
  };
}

/**
 * The constrained member's plate is READ from the plan: each slot's chosen amount verbatim, plus the
 * meal's oil allowance. Other members get the same lines × their multiplier (same proportions).
 */
export function resolvePlates(
  meal: Meal,
  mt: MealTemplate,
  rev: PlanRevision,
  foods: ReadonlyMap<string, Food>,
  members: readonly Member[],
  opts: { multiplierOverride?: number } = {},
): Plates {
  const lines = resolveMeal(meal, mt, foods);
  const constrained = members.find((m) => m.constrained);
  const base: PlateLine[] = lines.map((l) => lineFor(mustFood(foods, l.foodId), l.role, l.qty, l.slotId));
  const oil = foods.get(rev.rules.oilFoodId);
  if (oil) base.push(lineFor(oil, 'oil', { kind: 'g', g: rev.rules.oilPerMealG }));

  const out: MemberPlate[] = [];
  for (const m of members) {
    if (m.constrained) {
      out.push({ memberId: m.id, multiplier: 1, lines: base });
      continue;
    }
    if (!meal.partnerEats) continue;
    const mult = opts.multiplierOverride ?? meal.partnerMultiplier ?? m.multiplier;
    out.push({
      memberId: m.id,
      multiplier: mult,
      lines: base.map((l) =>
        lineFor(
          mustFood(foods, l.foodId),
          l.role,
          l.role === 'topping' ? l.qty : scaleQty(l.qty, mult),
          l.slotId,
        ),
      ),
    });
  }
  if (!constrained && out.length === 0) out.push({ memberId: 'anyone', multiplier: 1, lines: base });

  const pot = new Map<string, PotLine>();
  for (const mp of out) {
    for (const l of mp.lines) {
      const food = mustFood(foods, l.foodId);
      const grams = toGrams(l.qty, food);
      const key = `${l.foodId}:${l.role}`;
      const p = pot.get(key) ?? { foodId: l.foodId, role: l.role, grams: 0, shares: [] };
      p.grams += grams;
      p.shares.push({ memberId: mp.memberId, grams });
      pot.set(key, p);
    }
  }
  for (const p of pot.values()) {
    const food = mustFood(foods, p.foodId);
    if (food.cookedFactor) p.cookedG = Math.round((p.grams * food.cookedFactor) / 5) * 5;
  }
  return { members: out, pot: [...pot.values()] };
}

export function platesForDay(
  rev: PlanRevision,
  templateN: number,
  which: MainMeal,
  meal: Meal,
  foods: ReadonlyMap<string, Food>,
  members: readonly Member[],
): Plates | null {
  if (meal.kind !== 'planned') return null;
  const mt = mealTemplate(templateFor(rev, templateN), which);
  if (!mt) return null;
  return resolvePlates(meal, mt, rev, foods, members);
}

function mustFood(foods: ReadonlyMap<string, Food>, id: string): Food {
  const f = foods.get(id);
  if (!f) throw new Error(`Unknown food ${id}`);
  return f;
}

export type { ResolvedLine };
