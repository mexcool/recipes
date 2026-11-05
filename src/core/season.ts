import type { Food } from './model';

export function inSeasonMonth(food: Pick<Food, 'season'>, month: number): boolean {
  return !food.season || food.season.includes(month);
}

export const SEASON_NOTES: Record<number, string[]> = {
  1: ['cavolo nero', 'finocchi', 'broccoli', 'carciofi', 'spinaci'],
  2: ['carciofi', 'cavolfiore', 'bietole', 'radicchio'],
  3: ['asparagi', 'agretti', 'carciofi', 'spinaci'],
  4: ['asparagi', 'fave', 'carciofi', 'lattuga'],
  5: ['zucchine', 'pomodorini', 'asparagi', 'cetrioli'],
  6: ['zucchine', 'pomodori', 'melanzane', 'fagiolini'],
  7: ['pomodori', 'melanzane', 'peperoni', 'zucchine'],
  8: ['pomodori', 'melanzane', 'peperoni', 'fagiolini'],
  9: ['zucca', 'funghi', 'pomodori', 'melanzane'],
  10: ['zucca', 'cavolo nero', 'funghi', 'finocchi'],
  11: ['zucca', 'cavolo nero', 'broccoli', 'finocchi', 'bietole', 'carciofi'],
  12: ['cavolo nero', 'broccoli', 'finocchi', 'carciofi', 'verza'],
};
