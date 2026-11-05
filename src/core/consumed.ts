import type { MainMeal, Meal } from './model';

export interface Now {
  date: string;
  hour: number;
}

/** A day is half-eaten at 18:30: lunch counts as eaten after 15:00, dinner after 22:00, past days always. */
export function isConsumed(meal: Meal, date: string, which: MainMeal, now: Now): boolean {
  if (meal.status === 'consumed') return true;
  if (date < now.date) return true;
  if (date > now.date) return false;
  return which === 'pranzo' ? now.hour >= 15 : now.hour >= 22;
}
