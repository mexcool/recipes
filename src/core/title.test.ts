import { describe, expect, it } from 'vitest';
import { dishTitle, dishTitles } from './title';
import { DISH_BY_ID, SEED_DISHES } from '@/data/dishes';
import { FOOD_BY_ID } from '@/data/foods';

const byId = (id: string) => {
  const d = DISH_BY_ID.get(id);
  if (!d) throw new Error(`no dish ${id}`);
  return d;
};

describe('dishTitle', () => {
  it('names the food chosen for the meal, capitalised at the start', () => {
    const d = byId('ham-fennel-orange-plate');
    const lines = [
      { role: 'protein' as const, foodId: 'bresaola' },
      { role: 'bread' as const, foodId: 'pane_integrale' },
    ];
    expect(dishTitle(d, FOOD_BY_ID, lines)).toBe('Bresaola with fennel salad and wholemeal bread');
    expect(dishTitle(d, FOOD_BY_ID, lines, 'it')).toBe('Bresaola con insalata di finocchi e pane integrale');
  });

  it('falls back to the first food of the binding when no meal is given (the recipe book)', () => {
    expect(dishTitle(byId('couscous-chickpeas-tomatoes'), FOOD_BY_ID)).toBe(
      'Couscous with chickpeas and cherry tomatoes',
    );
    expect(dishTitle(byId('couscous-chickpeas-tomatoes'), FOOD_BY_ID, undefined, 'it')).toBe(
      'Cous cous con ceci e pomodorini',
    );
  });

  it('renders a wildcard role with a generic word and leaves plain titles alone', () => {
    const d = {
      titleEn: '{{cereal}} bowl',
      titleIt: 'Bowl di {{cereal}}',
      bindings: [
        { role: 'cereal' as const, foods: 'any_cereal' as const, prep: '', pot: 'separate' as const },
      ],
    };
    expect(dishTitle(d, FOOD_BY_ID)).toBe('Grain bowl');
    expect(dishTitle(d, FOOD_BY_ID, [{ role: 'cereal', foodId: 'quinoa' }])).toBe('Quinoa bowl');
    expect(dishTitle(byId('caprese-bread'), FOOD_BY_ID)).toBe('Tomato and mozzarella salad with bread');
  });

  it('omits the Italian title when it only repeats the English', () => {
    const d = {
      titleEn: '{{protein}} salad',
      titleIt: '',
      bindings: [{ role: 'protein' as const, foods: ['bresaola'], prep: '', pot: 'separate' as const }],
    };
    expect(dishTitles(d, FOOD_BY_ID)).toEqual({ en: 'Bresaola salad' });
  });

  it('every seed title renders without a leftover placeholder for every food its bindings allow', () => {
    for (const d of SEED_DISHES) {
      for (const b of d.bindings) {
        const ids = Array.isArray(b.foods) ? b.foods : [];
        for (const foodId of ids) {
          const en = dishTitle(d, FOOD_BY_ID, [{ role: b.role, foodId }]);
          const it = dishTitle(d, FOOD_BY_ID, [{ role: b.role, foodId }], 'it');
          expect(en, `${d.id} en`).not.toMatch(/\{\{|\}\}/);
          expect(it, `${d.id} it`).not.toMatch(/\{\{|\}\}/);
        }
      }
      expect(dishTitle(d, FOOD_BY_ID)).not.toMatch(/\{\{/);
    }
  });
});
