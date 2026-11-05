/**
 * Cooking is separate from eating: a batch holds portions cooked once; later meals allocate them.
 * A leftover allocation is valid only when the destination meal's resolved lines are identical to the
 * cooking meal's (same foods, same amounts for the person on the plan) and it is eaten later, within the
 * dish's keeping time.
 */
import type { Batch, Dish, Food, Member, PlanRevision, TasteEntry, Week } from './model';
import { MAIN_MEALS, mealTemplate, templateFor } from './model';
import { diffDays } from './dates';
import { resolveMeal, type ResolvedLine } from './resolve';
import { qtyEquals } from './qty';
import { checkWeek } from './check';
import { isWeekend } from './dates';
import { dishFitsMeal } from './dishfit';
import { dishTitle } from './title';

export function sameLines(a: readonly ResolvedLine[], b: readonly ResolvedLine[]): boolean {
  if (a.length !== b.length) return false;
  const key = (l: ResolvedLine) => `${l.role}|${l.foodId}`;
  const sa = [...a].sort((x, y) => key(x).localeCompare(key(y)));
  const sb = [...b].sort((x, y) => key(x).localeCompare(key(y)));
  return sa.every((l, i) => key(l) === key(sb[i]!) && qtyEquals(l.qty, sb[i]!.qty));
}

interface PlanLeftoversOpts {
  excluded?: ReadonlySet<string>;
  /** Meals the planner must not touch (locked, eaten, eating out). */
  isKept?: (date: string, which: 'pranzo' | 'cena') => boolean;
  taste?: Record<string, TasteEntry>;
  /** At most this many batches per week (variety). */
  maxBatches?: number;
}

/**
 * Deliberately plan cooked-once batches: for a batchable dish at meal A, find a later meal of the same
 * type whose template can be aligned to A's exact lines, align it, and allocate the leftovers to it.
 */
export function planLeftovers(
  week: Week,
  rev: PlanRevision,
  foods: ReadonlyMap<string, Food>,
  dishes: ReadonlyMap<string, Dish>,
  members: readonly Member[],
  opts: PlanLeftoversOpts = {},
): Batch[] {
  const batches: Batch[] = [];
  const max = opts.maxBatches ?? 1;
  const kept = (m: Week['days'][number], which: 'pranzo' | 'cena') =>
    m[which].locked ||
    m[which].status === 'consumed' ||
    m[which].kind !== 'planned' ||
    (opts.isKept?.(m.date, which) ?? false);
  const usedDishes = new Set(
    week.days.flatMap((d) => MAIN_MEALS.map((w) => d[w].dishId)).filter((x): x is string => !!x),
  );
  for (const which of MAIN_MEALS) {
    for (let i = 0; i < week.days.length && batches.length < max; i++) {
      const a = week.days[i]!;
      const ma = a[which];
      if (ma.kind !== 'planned' || ma.batchId || ma.leftoverOf || kept(a, which)) continue;
      const mta = mealTemplate(templateFor(rev, a.template), which);
      if (!mta) continue;
      const la = resolveMeal(ma, mta, foods);
      // The dish at A: its own if batchable, else the best batchable dish that fits A's lines (not used this week).
      const current = ma.dishId ? dishes.get(ma.dishId) : undefined;
      const candidates = current?.batchable
        ? [current]
        : [...dishes.values()].filter(
            (d) =>
              d.batchable &&
              d.status !== 'draft' &&
              d.id !== ma.dishId &&
              !usedDishes.has(d.id) &&
              d.mealTypes.includes(which) &&
              dishFitsMeal(d, mta, la, foods, which).ok &&
              !d.freeVeg.some((v) => opts.excluded?.has(v)),
          );
      const dish = candidates.find(
        (d) =>
          (opts.taste?.[`dish:${d.id}`]?.score ?? 0) >= 0 && opts.taste?.[`dish:${d.id}`]?.hard !== 'never',
      );
      if (!dish?.batchable) continue;
      for (let j = i + 1; j < week.days.length; j++) {
        const b = week.days[j]!;
        const mb = b[which];
        const gap = diffDays(a.date, b.date);
        if (gap > dish.batchable.keepsDays) break;
        if (mb.kind !== 'planned' || kept(b, which) || mb.leftoverOf || mb.batchId) continue;
        if (
          which === 'pranzo' &&
          !isWeekend(b.date) &&
          !dish.lunchboxOk &&
          !dish.mealTypes.includes('pranzo')
        )
          continue;
        const mtb = mealTemplate(templateFor(rev, b.template), which);
        if (!mtb) continue;
        const aligned = alignTo(la, mtb, foods);
        if (!aligned) continue;
        const before = structuredClone(mb);
        const beforeA = structuredClone(ma);
        mb.choices = aligned.choices;
        mb.wildcard = aligned.wildcard;
        mb.dishId = dish.id;
        if (ma.dishId !== dish.id) {
          ma.dishId = dish.id;
          const vegFromDish = dish.freeVeg.filter((v) => foods.get(v)?.isFreeVeg && !opts.excluded?.has(v));
          if (vegFromDish.length) ma.veg = vegFromDish.slice(0, 3);
        }
        mb.veg = [...ma.veg];
        const lb = resolveMeal(mb, mtb, foods);
        if (!sameLines(la, lb) || !checkWeek(week, rev, foods, dishes, { excluded: opts.excluded }).ok) {
          b[which] = before;
          a[which] = beforeA;
          continue;
        }
        const eatsAtB = (m: Member) => m.constrained || mb.partnerEats;
        const eatsAtA = (m: Member) => m.constrained || ma.partnerEats;
        const batch: Batch = {
          id: `batch-${a.date}-${which}`,
          weekId: week.id,
          dishId: dish.id,
          cookAt: { date: a.date, meal: which },
          portions: members.filter(eatsAtA).map((m) => ({ memberId: m.id, n: 1 + (eatsAtB(m) ? 1 : 0) })),
          allocated: members
            .filter((m) => eatsAtA(m) && eatsAtB(m))
            .map((m) => ({ date: b.date, meal: which, memberId: m.id })),
        };
        ma.batchId = batch.id;
        mb.leftoverOf = { batchId: batch.id };
        batches.push(batch);
        break;
      }
    }
  }
  return batches;
}

/** Choose options on a template meal that reproduce the given lines exactly, if the template allows it. */
export function alignTo(
  lines: readonly ResolvedLine[],
  mt: NonNullable<ReturnType<typeof mealTemplate>>,
  foods: ReadonlyMap<string, Food>,
): { choices: Record<string, number>; wildcard: Record<string, string> } | null {
  const choices: Record<string, number> = {};
  const wildcard: Record<string, string> = {};
  const used = new Set<string>();
  for (const l of lines) {
    const food = foods.get(l.foodId);
    if (!food) return null;
    let done = false;
    for (const s of mt.slots) {
      if (used.has(s.id) || s.role !== l.role) continue;
      const idx = s.options.findIndex(
        (o) =>
          (o.kind === 'food' && o.foodId === l.foodId && qtyEquals(o.qty, l.qty)) ||
          (o.kind === 'subgroup' && o.subgroup === food.subgroup && qtyEquals(o.qty, l.qty)),
      );
      if (idx < 0) continue;
      choices[s.id] = idx;
      if (s.options[idx]!.kind === 'subgroup') wildcard[s.id] = l.foodId;
      used.add(s.id);
      done = true;
      break;
    }
    if (!done) return null;
  }
  // Every non-free slot of the destination must be covered, otherwise the destination needs food A does not have.
  for (const s of mt.slots) {
    if (used.has(s.id)) continue;
    if (s.options.every((o) => o.kind === 'free')) continue;
    return null;
  }
  return { choices, wildcard };
}

/** Validate a manual leftover allocation from the cooking meal to a destination meal. */
export function validateLeftover(
  week: Week,
  rev: PlanRevision,
  foods: ReadonlyMap<string, Food>,
  dishes: ReadonlyMap<string, Dish>,
  from: { date: string; meal: 'pranzo' | 'cena' },
  to: { date: string; meal: 'pranzo' | 'cena' },
): { ok: boolean; reason?: string } {
  const a = week.days.find((d) => d.date === from.date);
  const b = week.days.find((d) => d.date === to.date);
  if (!a || !b) return { ok: false, reason: 'Unknown day' };
  if (!(to.date > from.date))
    return { ok: false, reason: 'Leftovers can only be eaten after they are cooked' };
  const ma = a[from.meal];
  const mb = b[to.meal];
  if (ma.kind !== 'planned' || mb.kind !== 'planned')
    return { ok: false, reason: 'Both meals must be planned meals' };
  const dish = ma.dishId ? dishes.get(ma.dishId) : undefined;
  if (dish?.batchable && diffDays(from.date, to.date) > dish.batchable.keepsDays)
    return {
      ok: false,
      reason: `${dishTitle(dish, foods)} keeps ${dish.batchable.keepsDays} day${dish.batchable.keepsDays > 1 ? 's' : ''}`,
    };
  const mta = mealTemplate(templateFor(rev, a.template), from.meal);
  const mtb = mealTemplate(templateFor(rev, b.template), to.meal);
  if (!mta || !mtb) return { ok: false, reason: 'No template for that meal' };
  if (!sameLines(resolveMeal(ma, mta, foods), resolveMeal(mb, mtb, foods))) {
    return {
      ok: false,
      reason: `A ${from.meal} portion is not automatically a valid ${to.meal}: the foods or amounts differ`,
    };
  }
  return { ok: true };
}

/** Allocations never exceed portions; cooked batches are never rewritten. */
export function batchIsConsistent(b: Batch): boolean {
  const perMember = new Map<string, number>();
  for (const p of b.portions) perMember.set(p.memberId, p.n);
  const used = new Map<string, number>();
  for (const a of b.allocated) used.set(a.memberId, (used.get(a.memberId) ?? 0) + 1);
  for (const [m, n] of used) if (n + 1 > (perMember.get(m) ?? 0)) return false; // +1 for the cook meal itself
  return true;
}
