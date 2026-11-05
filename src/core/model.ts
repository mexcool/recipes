/**
 * Domain model for Stasera.
 *
 * Everything the app knows about a household lives in one `Household` document validated by these
 * schemas. Quantities are never only grams: the plan has millilitres and pieces too. Grams are integers.
 * The nutritionist's plan is represented without loss in two layers: the exchange system (lists of
 * A/B/C/D items per meal type, with weekly frequency rules) and the day templates (seven lunch+dinner
 * pairs with approved alternatives at their own amounts). Dishes are *shapes* over slot roles and carry
 * no quantities: grams are always read from the plan, never computed.
 */
import { z } from 'zod';

export const SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------------------------
// Quantities
// ---------------------------------------------------------------------------------------------

export const QtySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('g'), g: z.number().int().nonnegative() }),
  z.object({ kind: z.literal('ml'), ml: z.number().int().nonnegative() }),
  z.object({ kind: z.literal('count'), count: z.number().nonnegative(), unitG: z.number().positive().optional() }),
  z.object({ kind: z.literal('free') }),
]);
export type Qty = z.infer<typeof QtySchema>;

// ---------------------------------------------------------------------------------------------
// Foods
// ---------------------------------------------------------------------------------------------

export const SUBGROUPS = [
  'cereal', 'bread', 'bread_sub', 'tuber', 'fresh_pasta', 'legume_dry', 'legume_canned', 'tofu', 'veg_burger',
  'cheese_fresh', 'cheese_aged', 'meat_white', 'meat_red', 'cured', 'egg', 'yogurt', 'dairy', 'fruit', 'oil',
  'veg', 'veg_sugary', 'frozen_soup', 'condiment', 'snack', 'sweet', 'nut', 'drink',
] as const;
export const SubgroupSchema = z.enum(SUBGROUPS);
export type Subgroup = z.infer<typeof SubgroupSchema>;

export const STORE_SECTIONS = [
  'produce', 'bakery', 'meat', 'deli', 'dairy', 'pasta_grains', 'canned', 'oils_condiments', 'breakfast_snacks',
  'frozen', 'drinks',
] as const;
export const StoreSectionSchema = z.enum(STORE_SECTIONS);
export type StoreSection = z.infer<typeof StoreSectionSchema>;

export const PURCHASE_FORMS = ['raw', 'dry', 'canned_drained', 'frozen', 'piece'] as const;
export const PurchaseFormSchema = z.enum(PURCHASE_FORMS);
export type PurchaseForm = z.infer<typeof PurchaseFormSchema>;

export const PurchaseUnitSchema = z.object({
  label: z.string(),
  /** Weight as sold. */
  netG: z.number().positive(),
  /** Edible/drained weight that counts against demand. */
  usableG: z.number().positive(),
  form: PurchaseFormSchema,
  /** True when one unit is exactly one of her portions ("1 mozzarella"). */
  equalsPortion: z.boolean().optional(),
});
export type PurchaseUnit = z.infer<typeof PurchaseUnitSchema>;

export const FoodSchema = z.object({
  id: z.string(),
  nameIt: z.string(),
  nameEn: z.string(),
  aliases: z.array(z.string()).default([]),
  subgroup: SubgroupSchema,
  /** Counts as "verdure a volontà". Potatoes, legumes and corn never do. */
  isFreeVeg: z.boolean().default(false),
  /** Months (1–12) when fresh and local in Liguria. */
  season: z.array(z.number().int().min(1).max(12)).optional(),
  /** Cooked weight ÷ raw weight (cous cous 2.5, short pasta 2.0). */
  cookedFactor: z.number().positive().optional(),
  /** Grams per piece for count-based foods (an egg ≈ 60 g). */
  pieceG: z.number().positive().optional(),
  purchaseUnits: z.array(PurchaseUnitSchema).default([]),
  section: StoreSectionSchema,
  /** Pantry staple: listed only when flagged "running low". */
  staple: z.boolean().default(false),
});
export type Food = z.infer<typeof FoodSchema>;

// ---------------------------------------------------------------------------------------------
// Plan: exchange system + day templates + fixed menus + global rules, in revisions
// ---------------------------------------------------------------------------------------------

export const MEAL_TYPES = ['colazione', 'spuntino', 'pranzo', 'merenda', 'cena', 'spuntino_serale'] as const;
export const MealTypeSchema = z.enum(MEAL_TYPES);
export type MealType = z.infer<typeof MealTypeSchema>;
export type MainMeal = 'pranzo' | 'cena';

export const ROLES = ['cereal', 'bread', 'protein', 'veg', 'soup', 'topping'] as const;
export const RoleSchema = z.enum(ROLES);
export type Role = z.infer<typeof RoleSchema>;

export const SlotOptionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('food'), foodId: z.string(), qty: QtySchema, label: z.string().optional() }),
  z.object({ kind: z.literal('subgroup'), subgroup: SubgroupSchema, qty: QtySchema, label: z.string().optional() }),
  z.object({ kind: z.literal('free') }),
]);
export type SlotOption = z.infer<typeof SlotOptionSchema>;

export const SlotSchema = z.object({
  id: z.string(),
  role: RoleSchema,
  /** options[0] is the reference; the rest are nutritionist-approved alternatives at their own amounts. */
  options: z.array(SlotOptionSchema).min(1),
});
export type Slot = z.infer<typeof SlotSchema>;

export const MealTemplateSchema = z.object({ slots: z.array(SlotSchema), note: z.string().optional() });
export type MealTemplate = z.infer<typeof MealTemplateSchema>;

export const DayTemplateSchema = z.object({
  n: z.number().int().min(1).max(7),
  hint: z.string().optional(),
  /** Written as a weekend day on the sheet (used only for default placement; snack rules are by calendar). */
  weekendStyle: z.boolean().default(false),
  pranzo: MealTemplateSchema,
  cena: z.union([MealTemplateSchema, z.object({ libero: z.literal(true) })]),
});
export type DayTemplate = z.infer<typeof DayTemplateSchema>;

export const ExchangeSchema = z.object({
  /** Either a specific food or a whole subgroup ("any cereal"). */
  foodId: z.string().optional(),
  subgroup: SubgroupSchema.optional(),
  qty: QtySchema,
  label: z.string().optional(),
  status: z.enum(['approved', 'inferred', 'confirmed']).default('approved'),
});
export type Exchange = z.infer<typeof ExchangeSchema>;

export const ExchangeListSchema = z.object({
  meal: MealTypeSchema,
  list: z.enum(['A', 'B', 'C', 'D']),
  items: z.array(ExchangeSchema),
});
export type ExchangeList = z.infer<typeof ExchangeListSchema>;

export const FrequencyRuleSchema = z.object({
  id: z.string(),
  label: z.string(),
  subject: z.union([z.object({ subgroups: z.array(SubgroupSchema) }), z.object({ foodIds: z.array(z.string()) })]),
  per: z.enum(['week', 'day']),
  min: z.number().int().nonnegative().optional(),
  max: z.number().int().nonnegative().optional(),
  /** Count eating occasions, or units (eggs). */
  countBy: z.enum(['meals', 'units']),
  /** Which meals contribute. */
  scope: z.enum(['all_meals', 'main_meals']),
  /** A small topping (grated cheese) never counts as an occasion. */
  garnishExempt: z.boolean().default(true),
  source: z.string(),
  /** The sheet's wording is ambiguous: show the count, flag for review. */
  review: z.boolean().default(false),
});
export type FrequencyRule = z.infer<typeof FrequencyRuleSchema>;

export const ExchangeSystemSchema = z.object({
  lists: z.array(ExchangeListSchema),
  oilEquivalents: z.array(z.object({ foodId: z.string(), qtyPer10gOil: QtySchema })).default([]),
  cookedFactors: z.record(z.string(), z.number().positive()).default({}),
  frequency: z.array(FrequencyRuleSchema).default([]),
});
export type ExchangeSystem = z.infer<typeof ExchangeSystemSchema>;

export const MenuItemSchema = z.object({ foodId: z.string(), qty: QtySchema });
export const MenuOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  items: z.array(MenuItemSchema),
  when: z.enum(['always', 'post_workout']).default('always'),
});
export type MenuOption = z.infer<typeof MenuOptionSchema>;

export const FruitRuleSchema = z.object({
  tiers: z.array(z.object({ qty: QtySchema, foodIds: z.array(z.string()) })),
  weekdaysOnly: z.boolean().default(false),
  optional: z.boolean().default(false),
});
export type FruitRule = z.infer<typeof FruitRuleSchema>;

export const FixedMenusSchema = z.object({
  colazione: z.array(MenuOptionSchema),
  spuntino: FruitRuleSchema,
  merenda: z.array(MenuOptionSchema),
  spuntinoSerale: FruitRuleSchema.optional(),
});
export type FixedMenus = z.infer<typeof FixedMenusSchema>;

export const GlobalRulesSchema = z.object({
  weightsRaw: z.literal(true).default(true),
  oilFoodId: z.string().default('olio_evo'),
  oilPerDayG: z.number().int().positive(),
  oilPerMealG: z.number().int().positive(),
  pairingLocked: z.literal(true).default(true),
  cerealInterchangeable: z.boolean().default(true),
  pastoLibero: z.object({ perWeek: z.literal(1), defaultTemplate: z.number().int().min(1).max(7) }),
  morningSnack: z.enum(['weekdays_only', 'daily']),
  methods: z.array(z.string()),
  condiments: z.array(z.string()),
  gratedCheeseMaxTsp: z.number().int().nonnegative().default(2),
  veg: z.object({
    requiredAt: z.array(z.enum(['pranzo', 'cena'])),
    limitSubgroups: z.array(SubgroupSchema).default(['veg_sugary']),
    notVeg: z.array(SubgroupSchema).default(['tuber', 'legume_canned', 'legume_dry']),
  }),
});
export type GlobalRules = z.infer<typeof GlobalRulesSchema>;

export const SourceDifferenceSchema = z.object({ rule: z.string(), older: z.string(), newer: z.string() });

export const PlanRevisionSchema = z.object({
  revision: z.number().int().positive(),
  label: z.string(),
  validFrom: z.string(),
  /** Draft until the person on the plan reviews it in Settings. */
  status: z.enum(['draft', 'reviewed']).default('draft'),
  sourceNote: z.string().optional(),
  exchange: ExchangeSystemSchema,
  templates: z.array(DayTemplateSchema).length(7),
  fixedMenus: FixedMenusSchema,
  rules: GlobalRulesSchema,
  sourceDifferences: z.array(SourceDifferenceSchema).default([]),
});
export type PlanRevision = z.infer<typeof PlanRevisionSchema>;

export const PlanSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** The person this plan is for (member id). */
  memberId: z.string(),
  revisions: z.array(PlanRevisionSchema).min(1),
  activeRevision: z.number().int().positive(),
  nextAppointment: z.string().optional(),
});
export type Plan = z.infer<typeof PlanSchema>;

// ---------------------------------------------------------------------------------------------
// Dishes: shapes over slot roles, no quantities
// ---------------------------------------------------------------------------------------------

export const POT_POLICIES = ['separate', 'together_weigh_cooked', 'share_ratio'] as const;
export const PotPolicySchema = z.enum(POT_POLICIES);
export type PotPolicy = z.infer<typeof PotPolicySchema>;

export const DishBindingSchema = z.object({
  role: RoleSchema,
  /** Specific foods this dish works with for the role, or a whole subgroup. */
  foods: z.union([z.array(z.string()), z.literal('any_cereal'), z.literal('any_bread'), z.literal('any')]),
  prep: z.string().default(''),
  pot: PotPolicySchema.default('separate'),
});
export type DishBinding = z.infer<typeof DishBindingSchema>;

export const DISH_FORMATS = ['bowl', 'plate', 'soup', 'sandwich', 'pasta', 'salad'] as const;
export const DISH_FLAVOURS = ['mediterranean', 'eastern', 'spiced', 'fresh', 'comfort'] as const;

export const DishSchema = z.object({
  id: z.string(),
  titleIt: z.string(),
  titleEn: z.string(),
  bindings: z.array(DishBindingSchema),
  /** Free vegetables the dish uses (ids); the planner may swap for seasonal ones. */
  freeVeg: z.array(z.string()).default([]),
  condiments: z.array(z.string()).default([]),
  methods: z.array(z.string()).default([]),
  signature: z.object({
    format: z.enum(DISH_FORMATS),
    temperature: z.enum(['hot', 'cold']),
    flavour: z.enum(DISH_FLAVOURS),
  }),
  minutes: z.number().int().positive(),
  lunchboxOk: z.boolean().default(false),
  mealTypes: z.array(z.enum(['pranzo', 'cena'])).default(['pranzo', 'cena']),
  batchable: z.object({ portionsMax: z.number().int().min(2), keepsDays: z.number().int().min(1) }).optional(),
  /** Steps with {{role}} placeholders; never contain quantities. */
  steps: z.array(z.string()),
  origin: z.enum(['seed', 'user', 'llm', 'import']).default('seed'),
  status: z.enum(['approved', 'proposed', 'draft']).default('approved'),
  tags: z.array(z.string()).default([]),
  createdAt: z.string().optional(),
});
export type Dish = z.infer<typeof DishSchema>;

// ---------------------------------------------------------------------------------------------
// Household, weeks, meals, batches, shopping state
// ---------------------------------------------------------------------------------------------

export const MemberSchema = z.object({
  id: z.string(),
  name: z.string(),
  constrained: z.boolean(),
  /** Partner plate = constrained plate × multiplier (same proportions). */
  multiplier: z.number().positive().default(1),
});
export type Member = z.infer<typeof MemberSchema>;

export const MealSchema = z.object({
  kind: z.enum(['planned', 'libero', 'out']),
  /** slotId → option index (for subgroup options, the chosen food is in `wildcard`). */
  choices: z.record(z.string(), z.number().int().nonnegative()).default({}),
  wildcard: z.record(z.string(), z.string()).default({}),
  dishId: z.string().optional(),
  veg: z.array(z.string()).default([]),
  status: z.enum(['planned', 'consumed', 'skipped']).default('planned'),
  locked: z.boolean().default(false),
  partnerMultiplier: z.number().positive().optional(),
  partnerEats: z.boolean().default(true),
  /** Leftover allocation: this meal eats a portion cooked earlier. */
  leftoverOf: z.object({ batchId: z.string() }).optional(),
  /** This meal cooks a batch (its own portion plus leftovers). */
  batchId: z.string().optional(),
  note: z.string().optional(),
});
export type Meal = z.infer<typeof MealSchema>;

export const DaySchema = z.object({
  date: z.string(),
  template: z.number().int().min(1).max(7),
  colazione: z.string().optional(),
  merenda: z.string().optional(),
  spuntino: z.boolean().default(false),
  pranzo: MealSchema,
  cena: MealSchema,
});
export type Day = z.infer<typeof DaySchema>;

export const WeekSchema = z.object({
  id: z.string(),
  planId: z.string(),
  revision: z.number().int().positive(),
  monday: z.string(),
  seed: z.number().int(),
  days: z.array(DaySchema).length(7),
  generatedAt: z.string(),
  confirmed: z.boolean().default(false),
  /** Pantry stock used by this week has been subtracted (done once when the next week starts). */
  pantryApplied: z.boolean().default(false),
});
export type Week = z.infer<typeof WeekSchema>;

export const BatchSchema = z.object({
  id: z.string(),
  weekId: z.string(),
  dishId: z.string(),
  /** The meal that cooks it. */
  cookAt: z.object({ date: z.string(), meal: z.enum(['pranzo', 'cena']) }),
  cookedOn: z.string().optional(),
  /** Portions cooked per member (each portion = that member's plate at the cook meal). */
  portions: z.array(z.object({ memberId: z.string(), n: z.number().int().positive() })),
  /** Allocations: which later meals eat a portion. */
  allocated: z.array(z.object({ date: z.string(), meal: z.enum(['pranzo', 'cena']), memberId: z.string() })),
});
export type Batch = z.infer<typeof BatchSchema>;

export const PurchaseSchema = z.object({ coveredG: z.number().nonnegative(), at: z.string(), by: z.string(), opId: z.string(), rev: z.number().int() });
export type Purchase = z.infer<typeof PurchaseSchema>;

export const ManualItemSchema = z.object({
  id: z.string(),
  text: z.string(),
  section: StoreSectionSchema.default('produce'),
  checked: z.boolean().default(false),
  createdAt: z.string(),
});
export type ManualItem = z.infer<typeof ManualItemSchema>;

export const TasteEntrySchema = z.object({ score: z.number(), lastEaten: z.string().optional(), hard: z.enum(['never']).optional() });
export type TasteEntry = z.infer<typeof TasteEntrySchema>;

export const QuestionSchema = z.object({
  id: z.string(),
  text: z.string(),
  source: z.enum(['validator', 'import', 'user', 'plan']),
  createdAt: z.string(),
  answered: z.string().optional(),
});
export type Question = z.infer<typeof QuestionSchema>;

export const PrefsSchema = z.object({
  dislikes: z.array(z.string()).default([]),
  allergies: z.array(z.string()).default([]),
  store: z.string().default('coop'),
  lunchbox: z.boolean().default(true),
  maxMinutesWeekdayDinner: z.number().int().positive().default(35),
  vegEstimateG: z.number().int().positive().default(150),
  splitFreshRun: z.boolean().default(true),
  runningLow: z.array(z.string()).default([]),
  /** Food ids she wants more or less often. */
  preferMore: z.array(z.string()).default([]),
  preferLess: z.array(z.string()).default([]),
});
export type Prefs = z.infer<typeof PrefsSchema>;

export const SyncConfigSchema = z.object({ serviceUrl: z.string(), token: z.string(), lastVersion: z.number().int().default(0) });

export const HouseholdSchema = z.object({
  schemaVersion: z.number().int(),
  id: z.string(),
  name: z.string().default('Home'),
  members: z.array(MemberSchema).min(1),
  plans: z.array(PlanSchema),
  activePlanId: z.string(),
  dishes: z.array(DishSchema),
  /** Household edits to the catalogue (pack sizes, new foods). */
  foodOverrides: z.array(FoodSchema).default([]),
  weeks: z.array(WeekSchema).default([]),
  batches: z.array(BatchSchema).default([]),
  /** foodId → grams on hand (user-confirmed). */
  pantry: z.record(z.string(), z.number().nonnegative()).default({}),
  /** weekId → item key → purchase. */
  purchases: z.record(z.string(), z.record(z.string(), PurchaseSchema)).default({}),
  manualItems: z.record(z.string(), z.array(ManualItemSchema)).default({}),
  taste: z.record(z.string(), TasteEntrySchema).default({}),
  questions: z.array(QuestionSchema).default([]),
  prefs: PrefsSchema.prefault({}),
  sync: SyncConfigSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Household = z.infer<typeof HouseholdSchema>;

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

export function activeRevision(plan: Plan): PlanRevision {
  const rev = plan.revisions.find((r) => r.revision === plan.activeRevision);
  if (!rev) throw new Error(`Plan ${plan.id} has no revision ${plan.activeRevision}`);
  return rev;
}

export function activePlan(h: Household): Plan {
  const p = h.plans.find((x) => x.id === h.activePlanId);
  if (!p) throw new Error(`Household has no active plan ${h.activePlanId}`);
  return p;
}

export function constrainedMember(h: Household): Member {
  const m = h.members.find((x) => x.constrained);
  if (!m) throw new Error('Household has no constrained member');
  return m;
}

export function templateFor(rev: PlanRevision, n: number): DayTemplate {
  const t = rev.templates.find((x) => x.n === n);
  if (!t) throw new Error(`No template ${n}`);
  return t;
}

export function isLibero(t: DayTemplate): boolean {
  return 'libero' in t.cena;
}

export function mealTemplate(t: DayTemplate, meal: MainMeal): MealTemplate | null {
  if (meal === 'pranzo') return t.pranzo;
  return 'libero' in t.cena ? null : t.cena;
}

export const MAIN_MEALS: MainMeal[] = ['pranzo', 'cena'];
