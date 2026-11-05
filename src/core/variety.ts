/**
 * The boredom model. Every meal has a signature on several axes; each axis has its own cooldown so
 * the planner fights specific boredoms (same protein, same cereal, same format…) instead of one slider.
 * Taste is inferred from taps; scores are multiplicative and always positive so weighted sampling works.
 */
import type { Dish, Food, Meal, PlanRevision, TasteEntry, Week } from './model';
import { MAIN_MEALS, mealTemplate, templateFor } from './model';
import { diffDays, monthOf } from './dates';
import { resolveMeal } from './resolve';

export interface Signature {
  dishId?: string;
  proteinFood?: string;
  proteinSub?: string;
  cerealFood?: string;
  breadFood?: string;
  format?: string;
  temperature?: string;
  flavour?: string;
  method?: string;
  veg?: string;
  vegs?: string[];
}

export interface HistoryEntry {
  date: string;
  which: 'pranzo' | 'cena';
  sig: Signature;
}

export const COOLDOWN_DAYS = {
  dishId: 21,
  proteinFood: 4,
  cerealFood: 6,
  breadFood: 2,
  format: 2,
  method: 1,
  veg: 3,
  flavour: 2,
} as const;

export const AXIS_WEIGHT: Record<keyof typeof COOLDOWN_DAYS, number> = {
  dishId: 0.95,
  proteinFood: 0.6,
  cerealFood: 0.5,
  breadFood: 0.2,
  format: 0.5,
  method: 0.3,
  veg: 0.4,
  flavour: 0.4,
};

export function signatureOf(
  meal: Meal,
  lines: { role: string; foodId: string }[],
  dish: Dish | undefined,
  foods: ReadonlyMap<string, Food>,
): Signature {
  const protein = lines.find((l) => l.role === 'protein');
  const cereal = lines.find((l) => l.role === 'cereal');
  const bread = lines.find((l) => l.role === 'bread');
  return {
    ...(dish
      ? {
          dishId: dish.id,
          format: dish.signature.format,
          temperature: dish.signature.temperature,
          flavour: dish.signature.flavour,
          method: dish.methods[0],
        }
      : {}),
    ...(protein ? { proteinFood: protein.foodId, proteinSub: foods.get(protein.foodId)?.subgroup } : {}),
    ...(cereal ? { cerealFood: cereal.foodId } : {}),
    ...(bread ? { breadFood: bread.foodId } : {}),
    ...(meal.veg[0] ? { veg: meal.veg[0], vegs: meal.veg } : {}),
  };
}

export function historyFromWeeks(
  weeks: readonly Week[],
  rev: PlanRevision,
  foods: ReadonlyMap<string, Food>,
  dishes: ReadonlyMap<string, Dish>,
): HistoryEntry[] {
  const out: HistoryEntry[] = [];
  for (const w of weeks) {
    for (const d of w.days) {
      const t = templateFor(rev, d.template);
      for (const which of MAIN_MEALS) {
        const m = d[which];
        if (m.kind !== 'planned') continue;
        const mt = mealTemplate(t, which);
        if (!mt) continue;
        let lines: { role: string; foodId: string }[];
        try {
          lines = resolveMeal(m, mt, foods);
        } catch {
          lines = [];
        }
        out.push({
          date: d.date,
          which,
          sig: signatureOf(m, lines, m.dishId ? dishes.get(m.dishId) : undefined, foods),
        });
      }
    }
  }
  return out;
}

/** Multiplicative variety factor in (0, 1]: 1 means nothing recent collides. */
export function varietyFactor(sig: Signature, history: readonly HistoryEntry[], date: string): number {
  let factor = 1;
  for (const axis of Object.keys(COOLDOWN_DAYS) as (keyof typeof COOLDOWN_DAYS)[]) {
    const value = sig[axis];
    if (!value) continue;
    const window = COOLDOWN_DAYS[axis];
    let worst = 0;
    for (const h of history) {
      if (h.sig[axis] !== value) continue;
      const days = Math.abs(diffDays(h.date, date));
      if (days < window) worst = Math.max(worst, 1 - days / window);
    }
    factor *= 1 - worst * AXIS_WEIGHT[axis];
  }
  return Math.max(factor, 0.02);
}

/** Days since a food was last eaten (Infinity if never). */
export function daysSinceFood(foodId: string, history: readonly HistoryEntry[], date: string): number {
  let best = Infinity;
  for (const h of history) {
    if (
      h.sig.proteinFood === foodId ||
      h.sig.cerealFood === foodId ||
      h.sig.breadFood === foodId ||
      h.sig.veg === foodId ||
      h.sig.vegs?.includes(foodId)
    ) {
      best = Math.min(best, Math.abs(diffDays(h.date, date)));
    }
  }
  return best;
}

export function tasteFactor(taste: Record<string, TasteEntry>, keys: readonly string[]): number {
  let f = 1;
  for (const k of keys) {
    const e = taste[k];
    if (!e) continue;
    if (e.hard === 'never') return 0;
    f *= Math.min(3, Math.max(0.2, 1 + 0.3 * e.score));
  }
  return f;
}

export function seasonFactor(
  vegIds: readonly string[],
  date: string,
  foods: ReadonlyMap<string, Food>,
): number {
  if (vegIds.length === 0) return 1;
  const m = monthOf(date);
  let inSeason = 0;
  for (const id of vegIds) {
    const f = foods.get(id);
    if (!f?.season || f.season.includes(m)) inSeason++;
  }
  const frac = inSeason / vegIds.length;
  return 0.5 + frac;
}

export const TASTE_SIGNALS = {
  up: 1,
  done: 0.5,
  more: 2,
  down: -2,
  notTonight: -0.5,
} as const;

export function applyTaste(
  taste: Record<string, TasteEntry>,
  key: string,
  delta: number,
  date: string,
  hard?: 'never',
): Record<string, TasteEntry> {
  const prev = taste[key] ?? { score: 0 };
  return {
    ...taste,
    [key]: {
      ...prev,
      score: Math.max(-6, Math.min(6, prev.score + delta)),
      lastEaten: date,
      ...(hard ? { hard } : {}),
    },
  };
}

export function decayTaste(
  taste: Record<string, TasteEntry>,
  today: string,
  halfLifeDays = 90,
): Record<string, TasteEntry> {
  const out: Record<string, TasteEntry> = {};
  for (const [k, e] of Object.entries(taste)) {
    if (!e.lastEaten) {
      out[k] = e;
      continue;
    }
    const days = Math.max(0, diffDays(e.lastEaten, today));
    out[k] = { ...e, score: e.score * Math.pow(0.5, days / halfLifeDays) };
  }
  return out;
}
