import type { Dish, Food, Role } from './model';

/**
 * Dish titles may carry the same `{{role}}` placeholders as steps ("{{cereal}} with chickpeas"), so a
 * dish that works with couscous, quinoa or spelt is named after the grain actually chosen for the meal.
 *
 * Without lines (the recipe book, messages), the placeholder renders the dish's first food for that
 * role; a wildcard binding renders a generic word.
 */
export type Lang = 'en' | 'it';

const GENERIC: Record<Lang, Record<Role, string>> = {
  en: {
    cereal: 'grain',
    bread: 'bread',
    protein: 'protein',
    veg: 'vegetables',
    soup: 'soup',
    topping: 'topping',
  },
  it: {
    cereal: 'cereali',
    bread: 'pane',
    protein: 'proteine',
    veg: 'verdure',
    soup: 'zuppa',
    topping: 'guarnizione',
  },
};

export interface TitleLine {
  role: Role;
  foodId: string;
}

const PLACEHOLDER = /\{\{(\w+)\}\}/g;

export function hasTitlePlaceholders(title: string): boolean {
  return /\{\{\w+\}\}/.test(title);
}

/** The title of a dish in one language, with placeholders filled in. */
export function dishTitle(
  dish: Pick<Dish, 'titleEn' | 'titleIt' | 'bindings'>,
  foods: ReadonlyMap<string, Food>,
  lines?: readonly TitleLine[],
  lang: Lang = 'en',
): string {
  const raw = lang === 'it' ? dish.titleIt || dish.titleEn : dish.titleEn;
  if (!hasTitlePlaceholders(raw)) return raw;
  const out = raw.replace(PLACEHOLDER, (_, role: string) => {
    const r = role as Role;
    const chosen = lines?.find((l) => l.role === r);
    const binding = dish.bindings.find((b) => b.role === r);
    const foodId = chosen?.foodId ?? (binding && Array.isArray(binding.foods) ? binding.foods[0] : undefined);
    const food = foodId ? foods.get(foodId) : undefined;
    if (food) return lang === 'it' ? food.nameIt : food.nameEn;
    return GENERIC[lang][r] ?? role;
  });
  return out.charAt(0).toUpperCase() + out.slice(1);
}

/** Both titles at once; the Italian one is omitted when it would only repeat the English. */
export function dishTitles(
  dish: Pick<Dish, 'titleEn' | 'titleIt' | 'bindings'>,
  foods: ReadonlyMap<string, Food>,
  lines?: readonly TitleLine[],
): { en: string; it?: string } {
  const en = dishTitle(dish, foods, lines, 'en');
  const it = dishTitle(dish, foods, lines, 'it');
  return it && it !== en ? { en, it } : { en };
}
