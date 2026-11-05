import type { Food, Qty } from './model';

export const g = (n: number): Qty => ({ kind: 'g', g: n });
export const ml = (n: number): Qty => ({ kind: 'ml', ml: n });
export const count = (n: number, unitG?: number): Qty => ({ kind: 'count', count: n, ...(unitG ? { unitG } : {}) });
export const free: Qty = { kind: 'free' };

/** Grams represented by a quantity (counts need unitG or the food's pieceG). */
export function toGrams(q: Qty, food?: Pick<Food, 'pieceG'>): number {
  switch (q.kind) {
    case 'g':
      return q.g;
    case 'ml':
      return q.ml; // water-like density is good enough for shopping
    case 'count':
      return q.count * (q.unitG ?? food?.pieceG ?? 0);
    case 'free':
      return 0;
  }
}

/** Scale a quantity by a multiplier. Grams round to 5 g, millilitres to 10 ml, counts to a half. */
export function scaleQty(q: Qty, m: number): Qty {
  if (m === 1) return q;
  switch (q.kind) {
    case 'g':
      return { kind: 'g', g: Math.max(0, Math.round((q.g * m) / 5) * 5) };
    case 'ml':
      return { kind: 'ml', ml: Math.max(0, Math.round((q.ml * m) / 10) * 10) };
    case 'count':
      return { ...q, count: Math.max(0, Math.round(q.count * m * 2) / 2) };
    case 'free':
      return q;
  }
}

export function qtyEquals(a: Qty, b: Qty): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'g':
      return a.g === (b as typeof a).g;
    case 'ml':
      return a.ml === (b as typeof a).ml;
    case 'count':
      return a.count === (b as typeof a).count;
    case 'free':
      return true;
  }
}

export function formatQty(q: Qty, food?: Pick<Food, 'nameEn' | 'pieceG'>, lang: 'en' | 'it' = 'en'): string {
  switch (q.kind) {
    case 'g':
      return `${q.g} g`;
    case 'ml':
      return `${q.ml} ml`;
    case 'count': {
      const n = Number.isInteger(q.count) ? String(q.count) : q.count.toFixed(1).replace('.0', '');
      const unit = food?.nameEn ?? (lang === 'it' ? 'pezzi' : 'pieces');
      return `${n} ${unit}`;
    }
    case 'free':
      return lang === 'it' ? 'a volontà' : 'as much as you like';
  }
}

/** Cooked-weight estimate for cereals and legumes. */
export function cookedEstimate(q: Qty, food: Pick<Food, 'cookedFactor'>): number | null {
  if (q.kind !== 'g' || !food.cookedFactor) return null;
  return Math.round((q.g * food.cookedFactor) / 5) * 5;
}
