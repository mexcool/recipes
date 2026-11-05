/**
 * Cooking is separate from eating: a batch holds portions cooked once; later meals allocate them.
 * A leftover allocation is valid only when the destination meal's resolved lines are identical to the
 * cooking meal's (same foods, same amounts for the person on the plan).
 */
import type { Batch, Dish, Food, Member, PlanRevision, Week } from './model';
import { MAIN_MEALS, mealTemplate, templateFor } from './model';
import { diffDays } from './dates';
import { resolveMeal, type ResolvedLine } from './resolve';
import { qtyEquals } from './qty';

export function sameLines(a: readonly ResolvedLine[], b: readonly ResolvedLine[]): boolean {
  if (a.length !== b.length) return false;
  const key = (l: ResolvedLine) => `${l.role}|${l.foodId}`;
  const sa = [...a].sort((x, y) => key(x).localeCompare(key(y)));
  const sb = [...b].sort((x, y) => key(x).localeCompare(key(y)));
  return sa.every((l, i) => key(l) === key(sb[i]!) && qtyEquals(l.qty, sb[i]!.qty));
}

/** Pair identical batchable meals (same meal type, within keepsDays) as one cooked-once batch. */
export function pairLeftovers(week: Week, rev: PlanRevision, foods: ReadonlyMap<string, Food>, dishes: ReadonlyMap<string, Dish>, members: readonly Member[]): Batch[] {
  const batches: Batch[] = [];
  for (const which of MAIN_MEALS) {
    const used = new Set<string>();
    for (let i = 0; i < week.days.length; i++) {
      const a = week.days[i]!;
      const ma = a[which];
      if (ma.kind !== 'planned' || !ma.dishId || ma.batchId || ma.leftoverOf || used.has(a.date)) continue;
      const dish = dishes.get(ma.dishId);
      if (!dish?.batchable) continue;
      const mta = mealTemplate(templateFor(rev, a.template), which);
      if (!mta) continue;
      const la = resolveMeal(ma, mta, foods);
      for (let j = i + 1; j < week.days.length; j++) {
        const b = week.days[j]!;
        const mb = b[which];
        if (mb.kind !== 'planned' || mb.locked || mb.status === 'consumed' || mb.leftoverOf || mb.batchId || used.has(b.date)) continue;
        if (diffDays(a.date, b.date) > dish.batchable.keepsDays) break;
        const mtb = mealTemplate(templateFor(rev, b.template), which);
        if (!mtb) continue;
        const lb = resolveMeal(mb, mtb, foods);
        if (!sameLines(la, lb)) continue;
        const batch: Batch = {
          id: `batch-${a.date}-${which}`,
          weekId: week.id,
          dishId: dish.id,
          cookAt: { date: a.date, meal: which },
          portions: members.map((m) => ({ memberId: m.id, n: 2 })),
          allocated: members.map((m) => ({ date: b.date, meal: which, memberId: m.id })),
        };
        ma.batchId = batch.id;
        mb.leftoverOf = { batchId: batch.id };
        mb.dishId = dish.id;
        mb.veg = ma.veg;
        batches.push(batch);
        used.add(a.date);
        used.add(b.date);
        break;
      }
    }
  }
  return batches;
}

/** Validate a manual leftover allocation from the cooking meal to a destination meal. */
export function validateLeftover(week: Week, rev: PlanRevision, foods: ReadonlyMap<string, Food>, from: { date: string; meal: 'pranzo' | 'cena' }, to: { date: string; meal: 'pranzo' | 'cena' }): { ok: boolean; reason?: string } {
  const a = week.days.find((d) => d.date === from.date);
  const b = week.days.find((d) => d.date === to.date);
  if (!a || !b) return { ok: false, reason: 'Unknown day' };
  const ma = a[from.meal];
  const mb = b[to.meal];
  if (ma.kind !== 'planned' || mb.kind !== 'planned') return { ok: false, reason: 'Both meals must be planned meals' };
  const mta = mealTemplate(templateFor(rev, a.template), from.meal);
  const mtb = mealTemplate(templateFor(rev, b.template), to.meal);
  if (!mta || !mtb) return { ok: false, reason: 'No template for that meal' };
  if (!sameLines(resolveMeal(ma, mta, foods), resolveMeal(mb, mtb, foods))) {
    return { ok: false, reason: `A ${from.meal} portion is not automatically a valid ${to.meal}: the foods or amounts differ` };
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
