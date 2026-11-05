import type { Day, Dish, MainMeal } from '@/core/model';
import type { Plates } from '@/core/plates';
import type { ResolvedLine } from '@/core/resolve';
import { inSeasonMonth } from '@/core/season';
import { monthOf } from '@/core/dates';
import { linesFor, platesFor, type Ctx } from '@/store/selectors';
import { t } from '@/i18n/en';

export interface MealView {
  kind: 'planned' | 'libero' | 'out';
  title: string;
  titleIt?: string;
  dish?: Dish;
  lines: ResolvedLine[];
  plates: Plates | null;
  foodsLine: string;
  badges: { text: string; tone: 'neutral' | 'olive' | 'terra' | 'ok' | 'warn' }[];
  whyToday?: string;
  consumed: boolean;
  locked: boolean;
}

export function mealView(ctx: Ctx, day: Day, which: MainMeal): MealView {
  const meal = day[which];
  if (meal.kind === 'libero')
    return {
      kind: 'libero',
      title: t.tonight.free,
      lines: [],
      plates: null,
      foodsLine: '',
      badges: [{ text: t.tonight.free, tone: 'terra' }],
      consumed: meal.status === 'consumed',
      locked: meal.locked,
    };
  if (meal.kind === 'out')
    return {
      kind: 'out',
      title: t.tonight.out,
      lines: [],
      plates: null,
      foodsLine: '',
      badges: [{ text: t.tonight.out, tone: 'neutral' }],
      consumed: meal.status === 'consumed',
      locked: meal.locked,
    };
  const dish = meal.dishId ? ctx.dishes.get(meal.dishId) : undefined;
  const lines = linesFor(ctx, day, which);
  const plates = platesFor(ctx, day, which);
  const names = lines
    .filter((l) => l.role !== 'topping')
    .map((l) => ctx.foodMap.get(l.foodId)?.nameEn ?? l.foodId);
  const vegNames = meal.veg.map((v) => ctx.foodMap.get(v)?.nameEn ?? v);
  const foodsLine = [...names, ...(vegNames.length ? [vegNames.join(', ')] : [])].join(' · ');
  const badges: MealView['badges'] = [];
  if (meal.leftoverOf) badges.push({ text: t.week.leftover, tone: 'olive' });
  if (meal.batchId) badges.push({ text: t.week.cooksBatch, tone: 'olive' });
  if (meal.locked) badges.push({ text: t.week.locked, tone: 'neutral' });
  if (dish?.status === 'proposed') badges.push({ text: t.recipes.proposed, tone: 'warn' });
  return {
    kind: 'planned',
    title: dish ? dish.titleEn : names.length ? `${names.join(', ')}` : t.tonight.noDish,
    ...(dish ? { titleIt: dish.titleIt } : {}),
    ...(dish ? { dish } : {}),
    lines,
    plates,
    foodsLine,
    badges,
    ...(whyToday(ctx, day, which, dish) ? { whyToday: whyToday(ctx, day, which, dish) } : {}),
    consumed: meal.status === 'consumed',
    locked: meal.locked,
  };
}

function whyToday(ctx: Ctx, day: Day, which: MainMeal, dish: Dish | undefined): string | undefined {
  const meal = day[which];
  if (meal.kind !== 'planned') return undefined;
  if (meal.leftoverOf) return 'Cooked earlier this week — just reheat.';
  const month = monthOf(day.date);
  const seasonal = meal.veg
    .map((v) => ctx.foodMap.get(v))
    .find((f) => f && f.season && f.season.includes(month) && f.season.length < 12);
  if (seasonal) return `${capitalize(seasonal.nameEn)} is in season.`;
  if (dish?.tags.includes('favourite')) return 'One of your favourites.';
  if (dish?.tags.includes('hint')) return 'Suggested on your plan.';
  if (dish?.status === 'proposed') return 'A new idea — tell us if you like it.';
  if (dish && dish.minutes <= 15) return 'Quick one.';
  const anyVeg = meal.veg.map((v) => ctx.foodMap.get(v)).find((f) => f && inSeasonMonth(f, month));
  if (anyVeg) return `${capitalize(anyVeg.nameEn)} today.`;
  return undefined;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const POT_HINT: Record<string, string> = {
  separate: 'Weigh raw, per person',
  together_weigh_cooked: 'Cook together, then weigh her share cooked',
  share_ratio: 'Cook together, split by the ratio',
};
