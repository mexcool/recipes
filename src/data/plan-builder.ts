/** Small helpers to author a PlanRevision readably. */
import type {
  DayTemplate,
  Exchange,
  ExchangeList,
  FixedMenus,
  FrequencyRule,
  GlobalRules,
  MealTemplate,
  MealType,
  MenuOption,
  PlanRevision,
  Qty,
  Role,
  Slot,
  SlotOption,
  Subgroup,
} from '@/core/model';
import { PlanRevisionSchema } from '@/core/model';
import { count, g, ml } from '@/core/qty';

export { count, g, ml };

export const food = (foodId: string, qty: Qty, label?: string): SlotOption => ({
  kind: 'food',
  foodId,
  qty,
  ...(label ? { label } : {}),
});
export const sub = (subgroup: Subgroup, qty: Qty, label?: string): SlotOption => ({
  kind: 'subgroup',
  subgroup,
  qty,
  ...(label ? { label } : {}),
});
export const freeVeg = (): SlotOption => ({ kind: 'free' });
export const slot = (id: string, role: Role, options: SlotOption[]): Slot => ({ id, role, options });
export const meal = (slots: Slot[], note?: string): MealTemplate => ({ slots, ...(note ? { note } : {}) });

export function day(
  n: number,
  pranzo: MealTemplate,
  cena: MealTemplate | 'libero',
  opts: { hint?: string; weekendStyle?: boolean } = {},
): DayTemplate {
  return {
    n,
    weekendStyle: opts.weekendStyle ?? false,
    ...(opts.hint ? { hint: opts.hint } : {}),
    pranzo,
    cena: cena === 'libero' ? { libero: true } : cena,
  };
}

export const ex = (foodId: string, qty: Qty, label?: string): Exchange => ({
  foodId,
  qty,
  status: 'approved',
  ...(label ? { label } : {}),
});
export const exSub = (subgroup: Subgroup, qty: Qty, label?: string): Exchange => ({
  subgroup,
  qty,
  status: 'approved',
  ...(label ? { label } : {}),
});
export const list = (mealType: MealType, l: 'A' | 'B' | 'C' | 'D', items: Exchange[]): ExchangeList => ({
  meal: mealType,
  list: l,
  items,
});

export const menu = (
  id: string,
  label: string,
  items: { foodId: string; qty: Qty }[],
  when: MenuOption['when'] = 'always',
): MenuOption => ({ id, label, items, when });
export const item = (foodId: string, qty: Qty) => ({ foodId, qty });

export function rule(
  id: string,
  label: string,
  subject: FrequencyRule['subject'],
  bounds: { min?: number; max?: number },
  opts: Partial<
    Pick<FrequencyRule, 'countBy' | 'scope' | 'garnishExempt' | 'review' | 'per' | 'source' | 'enforce'>
  > = {},
): FrequencyRule {
  return {
    id,
    label,
    subject,
    per: opts.per ?? 'week',
    ...bounds,
    countBy: opts.countBy ?? 'meals',
    scope: opts.scope ?? 'all_meals',
    garnishExempt: opts.garnishExempt ?? true,
    source: opts.source ?? 'plan',
    review: opts.review ?? false,
    enforce: opts.enforce ?? true,
  };
}

export const COOKING_METHODS = [
  'padella',
  'forno',
  'vapore',
  'bollitura',
  'cartoccio',
  'friggitrice ad aria',
];
export const ALLOWED_CONDIMENTS = [
  'olio_evo',
  'salsa_pomodoro',
  'passata',
  'pelati',
  'erbe',
  'spezie',
  'aceto',
  'brodo_vegetale',
  'limone',
  'vino_bianco',
  'aglio',
  'cipolla',
  'basilico',
  'prezzemolo',
  'rosmarino',
  'peperoncino',
  'sale',
  'pepe',
  'zenzero',
  'curry',
  'paprika',
  'cumino',
  'origano',
  'salvia',
  'menta',
  'cannella',
];
// Not on the sheet (mustard, capers) — deliberately absent so the validator flags them.

export function rules(
  x: Partial<GlobalRules> &
    Pick<GlobalRules, 'oilPerDayG' | 'oilPerMealG' | 'morningSnack'> & { liberoTemplate: number },
): GlobalRules {
  return {
    weightsRaw: true,
    oilFoodId: 'olio_evo',
    oilPerDayG: x.oilPerDayG,
    oilPerMealG: x.oilPerMealG,
    pairingLocked: true,
    cerealInterchangeable: x.cerealInterchangeable ?? true,
    pastoLibero: { perWeek: 1, defaultTemplate: x.liberoTemplate },
    morningSnack: x.morningSnack,
    methods: x.methods ?? COOKING_METHODS,
    condiments: x.condiments ?? ALLOWED_CONDIMENTS,
    gratedCheeseMaxTsp: x.gratedCheeseMaxTsp ?? 2,
    veg: x.veg ?? {
      requiredAt: ['pranzo', 'cena'],
      limitSubgroups: ['veg_sugary'],
      notVeg: ['tuber', 'legume_canned', 'legume_dry'],
    },
  };
}

export function revision(
  x: Omit<PlanRevision, 'status' | 'sourceDifferences'> &
    Partial<Pick<PlanRevision, 'status' | 'sourceDifferences'>>,
): PlanRevision {
  return PlanRevisionSchema.parse({ status: 'draft', sourceDifferences: [], ...x });
}

export const fixedMenus = (x: FixedMenus): FixedMenus => x;
