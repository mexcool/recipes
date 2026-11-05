/**
 * Shopping aggregation and reconciliation.
 *
 * Demand comes from cooking batches (not eating occasions), fixed breakfasts and snacks, vegetable
 * estimates and non-staple condiments. Each line tracks what the pantry covers and what checked purchases
 * cover; only the remainder is "to buy", rounded up to known pack sizes. An old check never hides new
 * demand, and manual entries survive regeneration.
 */
import type { Batch, Dish, Food, ManualItem, Member, PlanRevision, Prefs, Purchase, StoreSection, Week } from './model';
import { MAIN_MEALS, mealTemplate, templateFor } from './model';
import { weekdayIndex } from './dates';
import { foodMap } from './resolve';
import { resolvePlates } from './plates';
import { toGrams } from './qty';
import { inSeasonMonth } from './season';

export interface ShoppingItem {
  key: string;
  foodId: string;
  form: Food['purchaseUnits'][number]['form'] | 'unknown';
  section: StoreSection;
  demandG: number;
  pantryDeductedG: number;
  purchasedCoveredG: number;
  toBuyG: number;
  buy?: { n: number; unitLabel: string; unitUsableG: number; leftoverG: number };
  /** Count-based display for piece foods without packs ("4 lemons"). */
  pieces?: number;
  why: { date: string; meal: string; dish?: string }[];
  firstNeeded: string;
  estimate: boolean;
  staple: boolean;
  run: 'main' | 'fresh';
  checked: boolean;
  haveIt: boolean;
  note?: string;
}

export interface ShoppingSection {
  section: StoreSection;
  items: ShoppingItem[];
}

export interface ShoppingList {
  items: ShoppingItem[];
  sections: ShoppingSection[];
  freshRun: ShoppingItem[];
  manual: ManualItem[];
  staplesUsed: string[];
  totals: { lines: number; checked: number };
}

export interface ShoppingInput {
  week: Week;
  rev: PlanRevision;
  foods: readonly Food[];
  dishes: readonly Dish[];
  members: readonly Member[];
  batches: readonly Batch[];
  pantry: Record<string, number>;
  purchases: Record<string, Purchase>;
  manual: ManualItem[];
  prefs: Prefs;
  store: string;
  storeOrders?: Record<string, StoreSection[]>;
}

interface Demand {
  grams: number;
  why: ShoppingItem['why'];
  estimate: boolean;
  firstNeeded: string;
}

export const DEFAULT_STORE_ORDER: StoreSection[] = ['produce', 'bakery', 'meat', 'deli', 'dairy', 'pasta_grains', 'canned', 'oils_condiments', 'breakfast_snacks', 'frozen', 'drinks'];

const FRESH_SUBGROUPS = new Set<Food['subgroup']>(['bread', 'veg', 'veg_sugary', 'cheese_fresh']);

export function aggregateShopping(input: ShoppingInput): ShoppingList {
  const { week, rev, members, prefs } = input;
  const foods = foodMap(input.foods);
  const dishes = new Map(input.dishes.map((d) => [d.id, d]));
  const demand = new Map<string, Demand>();
  const add = (foodId: string, grams: number, why: ShoppingItem['why'][number], estimate = false) => {
    if (grams <= 0) return;
    const d = demand.get(foodId) ?? { grams: 0, why: [], estimate: false, firstNeeded: why.date };
    d.grams += grams;
    d.why.push(why);
    d.estimate = d.estimate || estimate;
    if (why.date < d.firstNeeded) d.firstNeeded = why.date;
    demand.set(foodId, d);
  };

  for (const day of week.days) {
    const t = templateFor(rev, day.template);
    // Fixed menus: the routine of the person on the plan.
    if (day.colazione) {
      const opt = rev.fixedMenus.colazione.find((o) => o.id === day.colazione);
      for (const it of opt?.items ?? []) add(it.foodId, toGrams(it.qty, foods.get(it.foodId)), { date: day.date, meal: 'breakfast', dish: opt?.label });
    }
    if (day.merenda) {
      const opt = rev.fixedMenus.merenda.find((o) => o.id === day.merenda);
      for (const it of opt?.items ?? []) add(it.foodId, toGrams(it.qty, foods.get(it.foodId)), { date: day.date, meal: 'afternoon snack', dish: opt?.label });
    }
    if (day.spuntino) {
      const tier = rev.fixedMenus.spuntino.tiers[0];
      const month = Number(day.date.slice(5, 7));
      const fruit = tier?.foodIds.map((id) => foods.get(id)).find((f) => f && inSeasonMonth(f, month)) ?? (tier?.foodIds[0] ? foods.get(tier.foodIds[0]) : undefined);
      if (fruit && tier) add(fruit.id, toGrams(tier.qty, fruit), { date: day.date, meal: 'morning snack', dish: 'fruit of your choice' }, true);
    }
    for (const which of MAIN_MEALS) {
      const meal = day[which];
      if (meal.kind !== 'planned' || meal.leftoverOf) continue;
      const mt = mealTemplate(t, which);
      if (!mt) continue;
      const dish = meal.dishId ? dishes.get(meal.dishId) : undefined;
      const plates = resolvePlates(meal, mt, rev, foods, members);
      const batch = meal.batchId ? input.batches.find((b) => b.id === meal.batchId) : undefined;
      for (const mp of plates.members) {
        const portions = batch?.portions.find((p) => p.memberId === mp.memberId)?.n ?? 1;
        for (const l of mp.lines) {
          add(l.foodId, toGrams(l.qty, foods.get(l.foodId)) * portions, { date: day.date, meal: which, dish: dish?.titleEn });
        }
      }
      // Free vegetables: an editable estimate per person per meal, split across the meal's vegetables.
      const eaters = plates.members.length || 1;
      const vegIds = meal.veg.filter((v) => foods.get(v)?.isFreeVeg);
      const perVeg = vegIds.length ? (prefs.vegEstimateG * 1.5 * eaters) / vegIds.length : 0;
      for (const v of vegIds) add(v, Math.round(perVeg / 10) * 10, { date: day.date, meal: which, dish: dish?.titleEn }, true);
      // Non-staple condiments the dish calls for.
      for (const c of dish?.condiments ?? []) {
        const f = foods.get(c);
        if (!f || f.staple) continue;
        const grams = f.pieceG ?? (f.purchaseUnits[0] ? Math.round(f.purchaseUnits[0].usableG / 4) : 0);
        if (grams) add(c, grams, { date: day.date, meal: which, dish: dish?.titleEn }, true);
      }
    }
  }

  const items: ShoppingItem[] = [];
  const staplesUsed: string[] = [];
  for (const [foodId, d] of demand) {
    const f = foods.get(foodId);
    if (!f) continue;
    if (f.staple && !prefs.runningLow.includes(foodId)) {
      staplesUsed.push(foodId);
      continue;
    }
    const unit = f.purchaseUnits[0];
    const pantryDeductedG = Math.min(d.grams, input.pantry[foodId] ?? 0);
    const purchasedCoveredG = input.purchases[foodId]?.coveredG ?? 0;
    const toBuyG = Math.max(0, d.grams - pantryDeductedG - purchasedCoveredG);
    const buy = unit && toBuyG > 0 ? (() => {
      const n = Math.ceil(toBuyG / unit.usableG);
      return { n, unitLabel: unit.label, unitUsableG: unit.usableG, leftoverG: n * unit.usableG - toBuyG };
    })() : undefined;
    const pieces = !unit && f.pieceG ? Math.ceil(toBuyG / f.pieceG) : undefined;
    const fresh = prefs.splitFreshRun && FRESH_SUBGROUPS.has(f.subgroup) && weekdayIndex(d.firstNeeded) >= 3;
    items.push({
      key: foodId,
      foodId,
      form: unit?.form ?? 'unknown',
      section: f.section,
      demandG: Math.round(d.grams),
      pantryDeductedG: Math.round(pantryDeductedG),
      purchasedCoveredG: Math.round(purchasedCoveredG),
      toBuyG: Math.round(toBuyG),
      ...(buy ? { buy } : {}),
      ...(pieces !== undefined ? { pieces } : {}),
      why: d.why,
      firstNeeded: d.firstNeeded,
      estimate: d.estimate,
      staple: f.staple,
      run: fresh ? 'fresh' : 'main',
      checked: toBuyG === 0 && purchasedCoveredG > 0,
      haveIt: toBuyG === 0 && purchasedCoveredG === 0 && pantryDeductedG >= d.grams,
    });
  }
  const orders = input.storeOrders ?? {};
  const order = orders[input.store] ?? DEFAULT_STORE_ORDER;
  const byName = (a: ShoppingItem, b: ShoppingItem) => (foods.get(a.foodId)?.nameIt ?? '').localeCompare(foods.get(b.foodId)?.nameIt ?? '');
  const sections: ShoppingSection[] = order
    .map((section) => ({ section, items: items.filter((i) => i.section === section && i.run === 'main').sort(byName) }))
    .filter((s) => s.items.length > 0);
  const freshRun = items.filter((i) => i.run === 'fresh').sort((a, b) => order.indexOf(a.section) - order.indexOf(b.section) || byName(a, b));
  const manual = [...input.manual].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return {
    items,
    sections,
    freshRun,
    manual,
    staplesUsed,
    totals: { lines: items.length + manual.length, checked: items.filter((i) => i.checked || i.haveIt).length + manual.filter((m) => m.checked).length },
  };
}

/** Checking a line records what the selected purchase actually covers (including pack rounding). */
export function purchaseForCheck(item: ShoppingItem, previous: Purchase | undefined, by: string, at: string, opId: string): Purchase {
  const extra = item.buy ? item.buy.n * item.buy.unitUsableG : item.toBuyG;
  return { coveredG: (previous?.coveredG ?? 0) + extra, at, by, opId, rev: (previous?.rev ?? 0) + 1 };
}

export function listAsText(list: ShoppingList, foods: ReadonlyMap<string, Food>, sectionLabel: (s: StoreSection) => string): string {
  const lines: string[] = [];
  for (const s of list.sections) {
    lines.push(`${sectionLabel(s.section)}`);
    for (const it of s.items) lines.push(`${it.checked || it.haveIt ? '[x]' : '[ ]'} ${describeItem(it, foods)}`);
    lines.push('');
  }
  if (list.freshRun.length) {
    lines.push('Mid-week fresh run');
    for (const it of list.freshRun) lines.push(`${it.checked || it.haveIt ? '[x]' : '[ ]'} ${describeItem(it, foods)}`);
    lines.push('');
  }
  if (list.manual.length) {
    lines.push('Extras');
    for (const m of list.manual) lines.push(`${m.checked ? '[x]' : '[ ]'} ${m.text}`);
  }
  return lines.join('\n').trim();
}

export function describeItem(it: ShoppingItem, foods: ReadonlyMap<string, Food>): string {
  const f = foods.get(it.foodId);
  const name = f?.nameIt ?? it.foodId;
  if (it.toBuyG === 0) return `${name} (${it.haveIt ? 'already have' : 'bought'})`;
  if (it.buy) return `${name} — ${it.buy.n} × ${it.buy.unitLabel}`;
  if (it.pieces) return `${name} — ${it.pieces}`;
  return `${name} — ${it.toBuyG} g${it.estimate ? ' (estimate)' : ''}`;
}
