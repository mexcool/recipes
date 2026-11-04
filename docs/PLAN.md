# Stasera — product plan and technical design

*Working name: **Stasera** ("tonight"), because the app exists to answer one question at 18:30.*

This document is the outcome of a research and design pass (November 2026): seven research threads
(PlanMyMeals, macro-based planners, recipe managers, Italian diet conventions, nutrition databases,
Sanremo supermarkets, tech stack), three independent design proposals judged by three reviewers, and the
two real nutritionist documents of the household member on the plan (referred to here as **G.**). The
research notes are in [`research/`](research/). The real documents are private and are not in this repo.

---

## 0. Summary and decisions

**The problem.** G. follows a nutritionist's *schema a grammature*: every main meal is one carbohydrate
item + one protein item + unlimited vegetables + a fixed oil budget, each item at a fixed raw weight,
with approved substitutions. She can follow the grams; what tires her is inventing varied, appealing
dishes that fit the slots every single day. Her partner eats the same dishes with no constraints.

**The insight.** The plan is not a nutrition target, it is a *grammar*. Variety is therefore not an
optimisation problem (where every macro planner on the market fails) but a combinatorial one: choose a
grain × a protein × vegetables × a cooking method × a format × a flavour, with cooldowns on each axis, and
dress the result as a dish. The app never computes a gram; it reads grams from the plan and dresses them.

**What we build.** A mobile-first PWA for two phones:

1. **Stasera** — tonight's dish, two plates (hers in the plan's exact grams, his bigger), one line of
   "why today", three buttons (*Cucina*, *Non mi va*, *Fatto*). Tomorrow's pranzo underneath, because weekday
   pranzo is usually a lunchbox packed the night before.
2. **Settimana** — a week drafted for her every Saturday night: the nutritionist's seven day-templates
   permuted onto Mon–Sun, one approved alternative per slot, a dish per meal; she skims, swaps, confirms.
3. **Spesa** — one shopping list in purchasable packs ("2 lattine da 400 g", "1 mozzarella"), in
   supermarket walking order, offline, shared, with a small mid-week "spesa fresca" for bread and leaves.
4. **Ricettario** — her own dishes, entered as *shapes* (roles → foods, steps) with no quantities, validated
   against the plan ("fits the grain + legume pranzo with the quinoa alternative; protein slot unfilled").
5. Later: "Nuova idea" (model-generated dish ideas inside a strict contract), photo/PDF import of a new
   plan version, pantry-lite and leftovers, a "questions for the nutritionist" list, a macro estimate view.

**Decisions taken (and what was rejected).**

| Decision | Chosen | Rejected, and why |
|---|---|---|
| Diet model | Two layers: the nutritionist's *exchange lists* (generative grammar) + her *7 day-templates* (approved preset). Versioned. | "Macro grams per meal" as the primary model: it is not how the plan is written and would let the app invent grams. Macros become a derived, labelled estimate (v2). |
| Grams | Read from the plan, never computed. Dishes carry no quantities. | Recipe scaling / ingredient parsing / unit conversion on the critical path: unnecessary when dishes are shapes. |
| Variety | Combinatorial chooser with per-axis cooldowns, taste memory inferred from taps, season table, pack economy. | A numeric optimiser (Eat This Much style): repeats by week 3–4 and produces bizarre combos. |
| Compliance | An independent `checkWeek()` proves every generated week against every rule; the planner returns *why* when it cannot satisfy a rule. | "Correct by construction" with no checker: silently wrong on frequency rules. |
| Model (LLM) | Build-time drafting of the seed dish book; runtime only for ideas, parsing and plan import, behind a strict JSON contract validated by the same code as hand-entered dishes. | A model in the first weekend: open-ended prompt tuning with no usage to tune against. |
| Price comparison | Out of scope (owner decision). Supermarkets matter for *what* and *in which pack*. | PlanMyMeals' scraping layer: contractually risky, and not the household's problem. |
| Accounts | A capability link + QR for the two phones; one Cloudflare Worker + D1. | Supabase auth/RLS/Realtime for two people who share a kitchen; and its free-tier pause after 7 idle days. |
| Code structure | One SvelteKit app with a pure `src/lib/core/` (zero DOM/network imports, enforced by lint). | A monorepo: an evening of tooling that buys nothing until a native rewrite exists. Capacitor wraps the same build. |
| First weekend | One phone, local storage, no backend: she plans and shops on Sunday. | A weekend of types with no UI. |
| Privacy | Real plan in a git-ignored file / in-app import; repo ships a generic demo plan; no personal data in the repo (it is public). | Committing the transcription "because it is just data". |

---

## 1. The problem, precisely

Two documents from the same nutritionist define G.'s diet. (Structure described here; contents stay private.)

**Document A, the exchange system (2024).** For each meal type (colazione, spuntino, pranzo, merenda,
cena) a set of lists: **A** carbohydrates, **B** proteins, **C** fibre (vegetables, free), **D** fats. Each
list entry is a food with its own amount (grams, millilitres or pieces). A meal is built by taking one item
from each list. Plus: oil equivalents (oil ↔ avocado ↔ olives…), raw→cooked multipliers for cereals,
weekly frequency rules (cheese at most *n* times a week, eggs between *n* and *m*, legumes at least *n*,
red meat at most *n*, white meat at most *n*, tubers *n–m*, fresh pasta at most *n*…), general rules
(raw weights net of waste, cooking methods, allowed condiments, one free meal a week, which vegetables do
*not* count as free), and a sample week.

**Document B, the day templates (2025).** Seven "giornate", each with a fixed pranzo and cena: for every
slot a reference food with grams and one to three approved alternatives with *their own* grams (e.g. a
legume slot that can be canned legumes at one weight, dry legumes at another, or tofu at a third). Fixed
menus for breakfast and snacks. Global rules: the pranzo–cena pairing of a day must stay together while
the order of days is free; pranzo and cena may never be swapped; one *pasto libero* per week at a default
position, movable; grams are raw; cereals are interchangeable at equal weight; vegetables unweighed and
required at both main meals; a daily oil budget split across the two meals; no mid-morning snack at the
weekend. Some days carry a one-line recipe hint — the nutritionist's own attempt at the problem this app
solves, written because G. asked for recipes.

**What G. already cooks** (her examples, which are the first acceptance tests): cous cous with roasted
vegetables and feta; quinoa with chickpeas, lettuce and tomatoes; pumpkin soup with bresaola and bread;
tomato and mozzarella salad with bread or focaccia; pasta with tomato–aubergine sauce and a little
parmigiano; cous cous with tofu and steamed broccoli and carrots. Vegetarian-leaning, Mediterranean,
one-bowl. Note that two of them are *not* exact template matches (feta on a grain day; a pasta with no
protein slot filled) — the app must say so honestly rather than pretend.

**What she wants:** not to think. Open the app, see a dish that fits, cook it for two, and have bought
everything on Sunday.

---

## 2. What we learned from research

Full notes with sources and confidence levels are in [`research/`](research/).

**PlanMyMeals** (the inspiration) is a native iOS/Android app with a proprietary backend. Its planner is a
heuristic over a recipe database; generative AI is used for recipe import (links, TikToks, screenshots)
and for swap ideas, both metered on paid tiers. Prices come from scraping the Portuguese chains' public
online catalogues. Nutrition support is minimal (a protein goal on the top tier); nothing models a
dietitian's exchange plan. The mechanics worth copying are the household ones: who eats which meal,
per-meal diner counts, guests, pantry subtraction, batch meals, "copy last week". Traction figures are
founder-reported; press coverage, not virality, drove the growth.

**Macro-based planners** (Eat This Much, Macrostax, Strongr Fastr, Prospre, Fitia, Carb Manager…) all
optimise kcal/macro grams and scale recipes to hit them. None takes "fixed grams of a food class with a
substitution table and free vegetables". Variety is the universal complaint: repeats by week 3–4, or
bizarre combinations when the optimiser forces macros. The closest analogues: *RP Diet Coach* ("pick a
protein source, a carb source, a fat source; lock one and the rest recalculates") and *Fitia Sync Plan*
(one shared meal structure, each member scaled to their own targets, one household list). Only
professional dietitian tools (Nutrium, Italian NutriCloud) model exchanges, and they do not generate
plans. Melarossa is the closest Italian consumer product but ships its own diet. Mealime shut down in
October 2026 and PlateJoy in 2025: the category is consolidating.

**Recipe managers** (Paprika, Plan to Eat, Samsung Food, AnyList, Bring!, Tandoor, Mealie, Grocy…) converge
on: schema.org/Recipe JSON-LD for import, lists grouped by store category with a per-store order, sharing
via sync, offline check-off with later replay. None scales by anything other than servings. Tandoor's
food / unit-conversion / supermarket-category-order model and Mealie's per-line "which recipe put this
here" are the data models worth copying. There is no production Italian ingredient parser (dictionary +
model fallback is the realistic path). AGPL licences on Tandoor/Mealie/KitchenOwl mean copying ideas, not code.

**Italian diet conventions.** The *schema a grammature* is the standard format; grams are raw, edible
part; generic equivalence tables exist (SINU/LARN standard portions, hospital prontuari, dietitian
hand-outs) but vary by ±30 %, so **the household's own documents are the only source of truth and
generic tables are fallbacks**. Potatoes, legumes and corn are never "free vegetables". Raw→cooked
multipliers: short pasta ≈ 2, long pasta ≈ 2.2–2.4, rice/farro/cous cous ≈ 2.5, gnocchi ≈ 1.1, dry
legumes ≈ 2.5–3; needed only to read recipes written in cooked weights and to tell her "80 g raw ≈ 200 g cooked".

**Nutrition data.** No Italian food-composition table is cleanly licensed for shipping in an app (CREA is
"cite the source", IEO's requires written authorisation, EuroFIR is paywalled). The legally clean bulk
sources are USDA FoodData Central (public domain, English) and the Swiss FCDB (attribution, Italian names).
Open Food Facts covers Italian branded products but its share-alike licence means it must stay in its
own store. Conclusion: a **hand-curated table of ~150 ingredients** (Italian names, macros per 100 g raw,
yield factors, standard portions), used only for the derived macro view and for classifying unlisted foods.

**Sanremo supermarkets.** Carrefour (Market and Express), Coop Liguria (Corso Matuzia), Pam (Via Agosti),
several Conad City, Lidl, Eurospin, MD, Basko; no Esselunga. For converting weekly grams into purchasable
units, the chains' online catalogues expose names and package sizes; several brand/size pairs on the diet
sheet are outdated (e.g. the frozen minestrone is sold in 750 g bags, the crackers in 380 g packs, the
cheese snack as 5 × 20 g), and some branded items (a specific quinoa, cous cous and kamut pasta brand) are
not evidenced in local chains, so the foods table needs own-brand substitutes and per-chain availability.
Standard formats that *equal her portions*: mozzarella 125 g, tofu 2 × 125 g, bresaola 70 g trays, legume
cans 400 g ≈ 240 g drained. Italian store walk order is stable enough to hard-code: ortofrutta → pane →
carne → salumi/formaggi → frigo (latticini, tofu) → pasta/riso/cereali → conserve/legumi → olio/condimenti
→ colazione/snack → surgelati → bevande.

**Tech.** SvelteKit 3 (Vite 8) with `@vite-pwa/sveltekit` is the leanest PWA path; Cloudflare Workers'
free tier (100k requests/day, unlimited static assets, cron triggers, D1) hosts everything at €0. iOS 26
removed PWA installability criteria (any Home Screen site opens as a web app); installed web apps are
exempt from Safari's 7-day storage cap but there is no Background Sync, so offline mutations replay on
foreground. Claude models as of November 2026: Opus 5.5 ($4/$20 per million tokens), Sonnet 5.5 ($2/$10),
Haiku 5.5 ($0.10/$0.50); structured outputs via `output_config.format`; prompt caching; batch API at 50 %
off. Structured outputs cannot enforce numeric ranges, which is one more reason the numbers live in code.

---

## 3. Product concept

**Stasera** is dish-first on top and exchange-grammar underneath. G. never sees "A item + B item"; she sees
*"Cous cous con ceci e pomodorini al forno"* and two plate chips. Three things make it different from
PlanMyMeals, Eat This Much and Melarossa:

1. **The nutritionist's documents are the engine.** Nothing on the market models "one A item + one B item
   + free vegetables + oil budget" with named alternatives at their own grams. Output is correct to the
   gram by construction *and* proven by an independent checker.
2. **Variety is combinatorial, not numerical.** Cereal × protein × vegetable × method × format × flavour,
   each axis with its own cooldown, taste memory learned from taps she already makes, a season table for
   Liguria, and a "why today" line that makes the variety felt.
3. **One pot, two plates, one list.** The dish is cooked once; the cook view says what to weigh raw, what
   to cook together and weigh cooked, what to split by ratio. The partner's plate is a multiplier, never a
   second recipe. The list is in packs and in walking order, and most of her protein portions *are* a pack.

**The shareable sentence** (the PlanMyMeals lesson: people share a specific surprise, not "a meal
planner"): *"L'app ha letto la dieta della nutrizionista e mi ha detto che alla mia pasta alle melanzane
mancavano le proteine — lenticchie nel sugo."* The photo-of-the-PDF import (v1.2) is therefore the
acquisition moment, and the validator's verdict card is the screen designed to be screenshotted.

**Explicitly not:** price comparison, calorie tracking, a recipe feed, anything social.

---

## 4. The diet model

### 4.1 Two layers, versioned

```
Plan (one version; several versions over time, one active)
├── exchange: ExchangeSystem        // Document A: per meal type, lists A/B/C/D of (food, amount)
│   ├── lists[meal][role] → Exchange[]        // Exchange.status: approved | inferred | confirmed
│   ├── oilEquivalents                        // 10 g oil ≈ 60 g avocado ≈ 40 g olives …
│   ├── cookedFactors                         // short pasta ×2, rice ×2.5 …
│   └── frequency: FrequencyRule[]            // per week / day / main meal; count by meals or units
├── templates: DayTemplate[7]        // Document B: pranzo + cena slots, each with options at own grams
├── fixedMenus                       // colazione / spuntino / merenda choices (ml, pieces, grams)
└── rules: GlobalRules               // pairing locked, pasto libero, oil per day, weekend snack, free veg …
```

Both documents are represented without loss. Where they disagree (the newer document raised the oil budget
and changed one legume weight) the templates' values win for planning and the exchange list keeps its own
values for validation, with the discrepancy surfaced in the "questions for the nutritionist" list.

Planning has two modes over the same pipeline:

- **Templates mode (MVP).** Permute the seven day-templates onto Mon–Sun, choose one approved alternative
  per slot, attach a dish. Safest: every pranzo–cena pair is nutritionist-approved.
- **Compose mode (v2).** Build each of the 14 main meals from the exchange lists (one A + one B + C + D)
  under the weekly frequency rules. More variety; only enabled once the nutritionist confirms it is still allowed.

### 4.2 Rules the engine must enforce

| Rule | Where enforced |
|---|---|
| A day's pranzo and cena stay together; days may be reordered; pranzo ↔ cena never swapped | Planner moves days as pairs; the UI has no operation that breaks it; `checkWeek` asserts it |
| Exactly one pasto libero per week, default position, movable | Planner; moving it moves its template-day |
| Grams are raw, edible part; cereals interchangeable at equal weight | Slot options carry a `subgroup` wildcard at the reference grams |
| Vegetables free, required at both main meals, sugary ones limited, starchy ones not "vegetables" | Food table flags; dish validation (soft warning on sugary veg) |
| Oil budget per day, split across meals, with equivalents | Plate resolution adds the oil line; `checkWeek` sums per day |
| No mid-morning snack on Saturday/Sunday | **Calendar** rule (not a template property): applied by weekday |
| Weekly frequencies (cheese, eggs incl. breakfast eggs, red/white meat, legumes, tubers, fresh pasta…) | Planner (hard) + `checkWeek` + context-aware dish validation |
| Allowed cooking methods and condiments; grated cheese on primi limited | Dish validation |
| Weights refer to the plan version the week was generated from | `Week.planRef = {planId, version}` |

### 4.3 Privacy and copyright

The documents are the nutritionist's copyrighted work and contain personal data. Consequently:

- The real plan lives in `plans/private/*.json` (git-ignored) on the developer's machine and in the
  household's database; the repo ships `plans/demo.json` with the same shape and invented values.
- Tests run against the demo plan in CI and additionally against the private file locally.
- Plan import (v1.2) processes page images in memory and stores only the structured result.
- No names, dates of birth or weights anywhere in the codebase or fixtures.

---

## 5. Domain model

TypeScript sketch of `src/lib/core/` (pure: no DOM, no network, no database imports; Zod schemas at every boundary; integer grams).

```ts
// Quantities are never only grams: breakfast has ml and pieces, eggs are counted.
type Qty = { g: number } | { ml: number } | { count: number; unitG?: number } | { free: true };

type Role = 'cereal' | 'bread' | 'protein' | 'veg' | 'soup' | 'topping' | 'fat' | 'fruit' | 'dairy';
type Subgroup = 'cereal' | 'bread' | 'bread_sub' | 'tuber' | 'fresh_pasta' | 'legume_dry' | 'legume_canned'
  | 'tofu' | 'veg_burger' | 'cheese_fresh' | 'cheese_aged' | 'meat_white' | 'meat_red' | 'cured' | 'egg'
  | 'yogurt' | 'fruit' | 'oil' | 'veg' | 'veg_sugary' | 'frozen_soup' | 'condiment' | 'snack';
type PotPolicy = 'separate' | 'together_weigh_cooked' | 'share_ratio';

interface Food {
  id: string; nameIt: string; nameEn: string; aliases: string[];
  subgroup: Subgroup; isFreeVeg: boolean; season?: number[];           // months fresh in Liguria
  cookedFactor?: number;                                               // 80 g raw cous cous ≈ 200 g cooked
  purchaseUnits: { label: string; netG: number; usableG: number; chains?: string[]; equalsPortion?: boolean }[];
  section: StoreSection; staple: boolean;                              // staples listed only when "sto finendo"
  per100gRaw?: { kcal: number; cho: number; pro: number; fat: number; source: string }; // v2 macro view
}

interface Plan {
  id: string; version: number; label: string; validFrom: string; nextAppointment?: string;
  status: 'draft' | 'active' | 'superseded'; source: 'manual' | 'import' | 'demo';
  exchange: ExchangeSystem; templates: DayTemplate[]; fixedMenus: FixedMenus; rules: GlobalRules;
}
interface ExchangeSystem {
  lists: { meal: MealType; role: 'A' | 'B' | 'C' | 'D'; items: Exchange[] }[];
  oilEquivalents: { foodId: string; qtyPer10gOil: Qty }[];
  cookedFactors: Record<string, number>;
  frequency: FrequencyRule[];
}
interface Exchange { foodId: string; qty: Qty; status: 'approved' | 'inferred' | 'confirmed'; sourcePage?: number }
interface FrequencyRule { subject: Subgroup | { foodId: string }; per: 'week' | 'day' | 'main_meal';
  min?: number; max?: number; countBy: 'meals' | 'units' }

interface DayTemplate { n: 1|2|3|4|5|6|7; hint?: string; pranzo: MealTemplate; cena: MealTemplate | { libero: true } }
interface MealTemplate { slots: Slot[]; note?: string }
interface Slot { id: string; role: Role; options: SlotOption[] }                     // options[0] = reference
type SlotOption = { foodId: string; qty: Qty } | { subgroup: Subgroup; qty: Qty } | { free: true };

interface FixedMenus { colazione: MenuOption[]; spuntino: FruitRule; merenda: MenuOption[]; spuntinoSerale?: FruitRule }
interface MenuOption { id: string; label: string; items: { foodId: string; qty: Qty }[]; when?: 'post_workout' }
interface FruitRule { tiers: { qty: Qty; foodIds: string[] }[]; weekdaysOnly: boolean }

interface GlobalRules { weightsRaw: true; oilPerDayG: number; oilPerMealG: number; pairingLocked: true;
  pastoLibero: { perWeek: 1; default: { template: number; meal: 'cena' } };
  morningSnack: 'weekdays_only' | 'daily'; methods: string[]; condiments: string[]; gratedCheeseMaxTsp: number;
  veg: { requiredAt: ('pranzo' | 'cena')[]; limitSubgroups: Subgroup[]; notVeg: Subgroup[] } }

// A dish is a SHAPE over slot roles. It carries no quantities, ever.
interface Dish {
  id: string; titleIt: string; titleEn: string; whyIt?: string;
  bindings: { role: Role; foods: string[] | 'any_cereal'; prep: string; pot: PotPolicy }[];
  freeVeg: string[]; condiments: string[]; methods: string[];
  signature: { format: 'bowl'|'piatto'|'zuppa'|'panino'|'pasta'|'insalatona'; temperature: 'caldo'|'freddo';
               flavour: 'mediterraneo'|'orientale'|'speziato'|'fresco'|'comfort' };
  minutes: number; lunchboxOk: boolean; cookDouble?: boolean;
  steps: string[];                                                     // '{{cereal}}' placeholders, no grams
  origin: 'seed' | 'user' | 'llm' | 'import'; status: 'approved' | 'proposed'; lastUsed?: string;
}

interface Member { id: string; name: string; constrained: boolean;
  multiplier: Partial<Record<Role, number>> }                          // partner: cereal 1.5, bread 1.5, protein 1.3
interface Week { id: string; planRef: { planId: string; version: number }; monday: string; seed: number;
  days: { date: string; template: number; colazione?: string; merenda?: string;
          pranzo: Meal; cena: Meal | { libero: true } }[] }
interface Meal { choices: Record<string /*slotId*/, number /*option index*/>; dishId?: string; veg: string[];
  plates: Plate[]; status: 'planned' | 'consumed' | 'swapped' | 'out' }   // 'consumed' gates what may change
interface Plate { memberId: string; lines: { foodId: string; qty: Qty; display: string }[] } // "1 mozzarella (125 g)"

interface ShoppingList { weekId: string; mode: 'draft' | 'snapshot';        // snapshot after the shop: deltas only
  items: ShoppingItem[]; deltas: ShoppingItem[]; freshRun?: ShoppingItem[] } // freshRun = mid-week bread/leaves
interface ShoppingItem { key: string; foodId: string; needQty: Qty; buy: { n: number; unit: string }; leftoverG: number;
  section: StoreSection; why: { date: string; meal: string; dish: string }[];
  checked?: { by: string; at: string }; haveIt?: boolean; manual?: boolean }
interface TasteMemory { key: string; score: number; lastEaten?: string; hard?: 'never' }
interface Household { schemaVersion: number; token?: never /* server-side hash only */; members: Member[];
  plans: Plan[]; activePlanId: string; dishes: Dish[]; foods: Food[]; weeks: Week[]; taste: TasteMemory[];
  pantry: { foodId: string; gramsLeft: number; expires?: string }[]; questions: NutritionistQuestion[] }
interface NutritionistQuestion { id: string; text: string; source: 'validator' | 'import' | 'user'; answered?: string }
```

**Mapping the real plan.** A grain-and-legume pranzo template becomes
`slots: [{role:'cereal', options:[{foodId:'cous_cous', qty:{g:80}}, {foodId:'quinoa', qty:{g:80}}, {subgroup:'cereal', qty:{g:80}}]}, {role:'protein', options:[{foodId:'legumi_scatola', qty:{g:…}}, {foodId:'legumi_secchi', qty:{g:…}}]}, {role:'veg', options:[{free:true}]}]`
— the third cereal option encodes "cereals are interchangeable". A soup-night cena has a `soup` slot, a
`topping` slot with a fixed few grams of grated cheese, a `protein` slot and a small `bread` slot. The free
meal is `cena: {libero: true}`. An egg dinner is `{foodId:'uova', qty:{count:2, unitG:60}}` so the partner's
plate says "3 uova", never "155 g". Breakfast options carry `{ml:200}` and `{count:3}` where the sheet does.
(Values above are illustrative; the real ones live in the private file.)

---

## 6. Algorithms

All functions are pure and seeded: same inputs, same week. `core` exposes `generateWeek`, `checkWeek`,
`resolvePlates`, `aggregate`, `validateDish`, `applyMutation`, and later `classifyFood`, `estimateMacros`.

### 6.1 Weekly planner (templates mode)

```
generateWeek(plan, household, history, pantry, monday, seed):
  libero  = override ?? rules.pastoLibero.default              // travels with its template-day
  place the libero template on its calendar day; the other weekend-style template on the other weekend day
  for each of the 120 permutations of the remaining five templates over the remaining days:
      hard: dislikes; pinned days
      score: adjacent same protein subgroup, adjacent soup nights, adjacent meat nights,
             same weekday as last week / two weeks ago (history), seasonal fit of hints
  take the top k orders; for each: choose slot options by backtracking with propagation on FrequencyRules
      (counts by subgroup per week/day/main meal; eggs by units INCLUDING breakfast choices)
      soft: per-axis cooldowns, taste memory, pack economy (two legume meals → one 400 g can each;
            a 750 g frozen-soup bag → both soup nights in the same week), season
      if no assignment: return Unsatisfiable{rule, witnesses} → UI: "Con patate due volte supereresti il massimo di tuberi"
  cereal slots: rotate so no cereal repeats within the week
  each main meal: dish = pickDish(...)  (6.2); veg = 2 seasonal, 3-day cooldown; lunchboxOk required for Mon–Fri pranzo
  colazione / merenda: rotate the fixed menu options; morning snack by CALENDAR (weekdays only)
  week = …; assert checkWeek(week, plan).ok
```

`checkWeek(week, plan)` is written independently of the solver and is the property-test target: pairing
intact, exactly one libero, vegetables at every main meal, oil per day within budget, morning snack only on
weekdays, every option is one of the slot's options (or the subgroup wildcard at reference grams), every
frequency rule satisfied, every constrained plate's slot grams equal the plan to the gram. A week that
fails the checker is never shown. The checker also runs on every mutation (swap, alternative, day move).

**Time-awareness.** A day is half-eaten at 18:30. `Meal.status = 'consumed'` is set by *Fatto* or by the
clock (pranzo after 15:00). Mutations are legal only if they do not touch a consumed meal: after pranzo the
only cena operations are *another dish for the same foods* or *another approved alternative within the same
template*; *move the day* is offered only in the morning. This is what keeps the pairing true on the plate,
not only in the data.

### 6.2 Variety engine ("boredom model")

Every dish has a signature (format, method, protein subgroup, cereal, dominant vegetable, temperature,
flavour). Each axis has its own cooldown, so the engine fights specific boredoms rather than one slider:

| Axis | Window | Note |
|---|---|---|
| same dish | 21 days (7 if marked favourite) | relaxed automatically for slots with few dishes (soup nights) |
| same protein food | 4 days | legume days alternate ceci / lenticchie / tofu |
| same cereal | 6 days | |
| same format | 2 days | no two soups or two cold bowls in a row |
| same method | 1 day | |
| same dominant vegetable | 3 days | |
| same flavour profile | 2 days | |

`score(dish) = taste · Π(1 − penalty_axis) · season(veg) · effortFit(context) · leftoverBonus`, selection
weighted-random among the top three (never argmax; scores floored at a small positive value so negative
taste never breaks the sampler). `effortFit` prefers ≤25 min on weekday evenings and ≤15 min for lunchboxes
but only *prefers*: a long-cooking dish is still allowed on a weekend. If the best candidate is below a
boredom threshold the meal is queued for "Nuova idea" (6.6).

**Taste memory, inferred, never asked:** 👍 +1; *Fatto* +0.5; "ripeti più spesso" +2 and cooldown halved;
👎 −2 and a 14-day dish cooldown; *Non mi va* at 18:30 −0.5 on the dish and −0.25 on its axes (mood is noisy);
"mai più" is a hard filter. 90-day half-life. The partner's signals count 0.5.

**Season:** a static Liguria table by month (November: zucca, cavolo nero, broccoli, finocchi, bietole,
carciofi). In-season ×1.5, out-of-season fresh ×0.5, frozen ×1. The "why today" line names the dominant
factor (season, leftover, favourite, "nuovo").

**Cook-double and leftovers:** dishes flagged `cookDouble` (a lentil sauce, a soup) can be planned once and
reheated two days later; the second meal is still a plan-compliant meal with its own plate lines, and the
list buys for both. Expected leftovers from pack rounding (half a tofu pack, half a pumpkin) earn a
`leftoverBonus` for a dish within their shelf life.

### 6.3 Plates: read, never computed

G.'s plate takes each slot's chosen option verbatim (raw), plus the oil line from the daily budget, plus
toppings at their fixed amount; free vegetables and condiments are unquantified. The partner's plate
multiplies slot lines by `multiplier[role]` (rounded to 10 g; counts stay counts). Pot = sum of plates.

Each dish binding has a **pot policy** that drives the cook-view wording: `separate` → "pesa a crudo:
80 g · 120 g" (bread, cured meat, cheese); `together_weigh_cooked` → "cuoci 200 g in una pentola, poi pesa
≈200 g cotto per G." using `cookedFactor`; `share_ratio` → "dividi il sugo 2 : 3" when the protein is cooked
into a sauce. Dishes written in cooked weights are converted to raw once, on save.

**Portions as pieces.** When a purchase unit `equalsPortion`, the plate line displays the piece, not the
weight: "1 mozzarella (125 g)", "1 confezione di bresaola (70 g)", "2 uova", "½ panetto di tofu". The scale
stays in the drawer on most nights, and the list prefers those packs.

Invariants (property tests): constrained slot grams equal the plan exactly; Σ plates = pot per food;
raw→cooked→raw within 1 g; multiplier is homogeneous and never touches the constrained plate; no negatives.

### 6.4 Shopping list

```
need[food] = Σ over all meals of the week (main meals AND colazione/spuntini/merenda) over all plates
           + indicative free veg (150 g per person per main meal) for the dishes' listed vegetables
need      -= pantry.gramsLeft (not expired); staples only when flagged "sto finendo"
buy        = fewest units then least leftover over purchaseUnits, in the food's purchase state (drained for cans)
freshRun   = bread, leafy vegetables, fresh cheese needed after Wednesday → a second small list
group by section in the chosen store's walk order; each line keeps "why" (which meals)
```

Aggregation is order-independent and idempotent (property test). **After the shop the list becomes a
snapshot**: later plan edits produce *deltas* (added/removed lines) rather than re-generating and
un-ticking everything (the Mealime lesson). Checked rows sink into "nel carrello" and the unchecked part
never re-sorts mid-aisle. Share-as-text to WhatsApp as a fallback.

### 6.5 Validating a dish against the plan

`validateDish(dish, plan, week?) → Fit[]`. For every template meal, match the dish's bindings to slots
(a food fits a slot directly or via the subgroup wildcard) and report `{template, meal, matched, unfilled,
foreign, violations, exchangeFallback}` ranked by completeness. Violations: foods outside the options,
condiments or methods outside the rules, oil over budget, topping over the limit, sugary vegetables (soft).
With a `week` the check is **context-aware**: it also counts weekly frequencies, so a cheese-based dish that
is approved by the exchange lists is still flagged if it would be the third cheese meal that week.

Expected verdicts for G.'s six dishes (acceptance tests, generic wording):
quinoa + chickpeas + lettuce + tomatoes → *fits the grain + legume pranzo with the quinoa alternative; complete*.
cous cous + tofu + broccoli and carrots → *fits the rice/legume pranzo (cereals interchangeable) with the tofu alternative; carrots: sugary vegetable, limit*.
pumpkin soup + bresaola + bread → *fits the bread + cured-meat pranzo; complete (soup as the vegetable)*.
tomato and mozzarella + bread → *fits the bread + fresh-cheese pranzo; focaccia is not an option, use the bread at its weight*.
pasta + tomato–aubergine sauce + parmigiano → *cereal slot OK, grated cheese within the limit, **protein slot unfilled** — add the legume option in the sauce*.
cous cous + roasted vegetables + feta → *no exact template; accepted by the exchange lists (fresh cheese at its listed weight) → "non approvato nelle giornate, chiedi alla nutrizionista"*, and the question is added to the nutritionist list.

### 6.6 Where the model is used, and its contract

Principle: **the model does creativity and parsing; code does every number.** The model never emits a gram.

| Use | When | Model | Notes |
|---|---|---|---|
| Draft the seed dish book (~40 dishes covering every slot combination) | build time, weekend 1 | Opus 5.5 | reviewed with G. over dinner; the dish format + validator are the contract |
| "Nuova idea" for a meal | runtime, v1.1 | Opus 5.5 (ideas are low-volume; quality over cents) | structured output, stable schema with the full food enum, per-meal subset enforced in code |
| Parse a typed/pasted recipe into bindings | runtime, v1.1 | Haiku 5.5 | dictionary first, model fallback |
| Import a new plan version from photos/PDF | runtime, v1.2 | Opus 5.5 with document input | per-field confidence + source page; review screen; nothing active until confirmed |
| Pre-generate next week's ideas | runtime, v1.1 | Batch API (50 % off), Saturday night | optional |

Idea contract (request → response):

```ts
interface IdeaRequest { meal: { bound: { role: Role; foodId: string }[]; context: 'pranzo_feriale'|'cena_feriale'|'pranzo_domenica'|'zuppa'|'swap_frigo';
  maxMinutes: number; lunchbox: boolean; vegOnHand: string[]; seasonVeg: string[]; avoidSignatures: Signature[] };
  dislikes: string[]; recentTitles: string[]; n: 3 }
type IdeaResponse = { ideas: Omit<Dish, 'id'|'origin'|'status'|'lastUsed'>[] }   // bindings reference roles only
```

Validation in code, in order: Zod parse → every bound role used exactly once and nothing else → `freeVeg`
⊆ free-veg enum with at most one sugary → `condiments` ⊆ rules → `methods` ⊆ rules → `minutes ≤ max` →
no dislike anywhere → steps rejected if they match `/\d+\s?(g|gr|ml)\b/` → `validateDish` passes. One retry
with the error list, then the dish book is the fallback. Ideas enter the book as `proposed`; 👍 or *Fatto*
promotes them to `approved`. Every request/response pair is recorded as a test fixture. API keys live only
in the Worker; the system prompt (rules, enums, season table) is cached.

### 6.7 Macro estimate and classification (v2)

The owner asked for a translation into macro targets. It is a **derived** view, never the driver. From the
curated food table, each exchange list gets an envelope `{kcal, cho, pro, fat}` as min/median/max over its
approved items (a protein list spans lean meat to tofu, hence an envelope, not a number). Uses: (a) a
per-meal/per-day "stimato" panel; (b) `classifyFood(food) → {role, meal, qty, confidence}` for foods not on
any list (fish, seitan, skyr): solve the amount so the role's dominant macro meets the median and the others
fall inside the envelope, store it as an `Exchange` with `status: 'inferred'`, badge it, exclude it from the
planner until confirmed, and add it to the nutritionist questions.

---

## 7. UX (mobile-first, Italian first)

Bottom tabs: **Stasera · Settimana · Spesa · Ricettario · Io**. Italian copy by default, English toggle;
dish titles always in both languages. Large tap targets, no swipe gestures in the store, wake-lock in the cook view.

**Stasera (Tuesday 18:30).** Tonight's dish: title, "why today", time/method glyphs, two plate chips
("G. · pollo 150 g · pane 60 g · verdure · olio 1½ cucchiai" / "M. · pollo 200 g · pane 90 g"),
*Cucina*, *Non mi va*, *Fatto*. Below: **"Domani a pranzo: … — tira fuori i ceci"** with its own grams,
because the lunchbox is packed tonight. Before 15:00 the card shows pranzo instead.

**Cucina.** Full-screen steps with resolved amounts and pot callouts ("pesa separatamente", "cuoci insieme,
poi pesa 200 g cotto per G.", "dividi 2 : 3"), inline timers, big type. *Fatto* asks only 👍/👎, skippable.

**Non mi va (time- and consumed-aware).** One-tap options, grouped: (1) *Altro piatto, stessa spesa* — same
bound foods, different dish, from the book or (v1.1) a live idea constrained to this week's purchases and
pantry; (2) *Cambia ingrediente* — a nutritionist alternative that is in the house, with a delta line on the
list; (3) *Mangio fuori* — the plan's eating-out templates, logged as `out`; *Stasera libero* if unused this
week (the displaced cena is dropped, not moved: the pairing is never broken). In the morning only: *Scambia
la giornata con domani* (the pair moves together).

**Settimana (Sunday 11:00).** Seven rows, pranzo and cena titles, template badges, a star on the libero.
Drag rows to reorder days (pairs travel together). *Rigenera* keeps locked meals. *Conferma → Spesa*. The
week is one screenshot-able image ("ecco la mia settimana").

**Spesa (at Coop, no signal).** Store picker sets the section order. Rows like "Ceci in scatola — 2 lattine
da 400 g" with a chevron for the why. Tap to check; checked rows sink; "ho già"; free-text extras; the
mid-week *spesa fresca* as a second small list. Offline with queued mutations; the partner sees ticks on the
next sync.

**Ricettario.** Her dishes with "si adatta a…" badges; an editor that binds each ingredient to a role, free
vegetable, condiment or oil by tapping — no quantities to type; inline verdict. Later: paste a URL or text.

**Io.** Plan version (view; v1.2 import/review/activate; next appointment date), breakfast and merenda
routine, dislikes, partner multipliers, "sto finendo" staples, household QR, language, **"Domande per la
nutrizionista"** (collected from validator and import verdicts, exportable before the appointment).

**Partner's view.** Same app via the household QR; *Stasera* leads with his plate; he ticks the list and
can mark "ho cucinato io"; a dish he proposes runs through the same validation and appears tagged "proposta da M.".

**First run (v1.2).** A single screen: *"Fotografa la tua dieta"*. Until then, the demo plan loads and the
private plan is imported from JSON by the developer.

---

## 8. Architecture

**Stack.** SvelteKit 3 + Svelte 5 + TypeScript, `@vite-pwa/sveltekit` (manifest, precache, offline
fallback, "nuova versione" banner), `adapter-cloudflare` (one Worker serving static assets and the API
routes), Zod 4, Paraglide for it/en, Vitest 5 + fast-check 4. `src/lib/core/` is the product: plan model,
planner, checker, boredom model, plates, aggregation, validation, migrations. An ESLint
`no-restricted-imports` rule forbids `$app`, `svelte`, DOM and `fetch` inside it. (If the owner prefers to
maintain React, the UI layer swaps to React Router v7 or TanStack Start with `vite-plugin-pwa`; `core` is
framework-agnostic. Decide before weekend 2.)

**Backend and data.** Weekend 1 has no backend: `core` runs against local storage on one phone. From
weekend 2: Cloudflare Workers free tier + D1 (SQLite). Tables: `household(id, token_hash, doc JSON,
schema_version, version, updated_at)`, `list_item(household_id, week_id, key, checked, by, at, op_id)`,
`list_extra`. Endpoints: `GET /h/:t/state?since=v`; `PUT /h/:t/doc {baseVersion, doc}` (409 on conflict →
reload; one person plans at a time); `POST /h/:t/list/ops` (idempotent batches, last-writer-wins by `at`).
`household_id` is derived from the token in exactly one function so passkeys can front the same tables later.

**Identity.** A capability link `https://…/h/<128-bit token>`; the Worker stores `sha256(token)`; the second
phone joins by QR; the token is rotatable from *Io*; `Referrer-Policy: no-referrer`. No accounts, no email
templates, no RLS, no database that pauses over the holidays.

**Offline and sync.** IndexedDB (`idb-keyval` is enough) holds the household snapshot and an outbox of
mutations, replayed on `online`, `visibilitychange` and after each mutation; no Background Sync on iOS.
Polling on focus is sufficient for two phones (usually one cart); no websockets.

**Schema evolution.** `schemaVersion` on the household doc and on the private fixture; `core/migrate.ts`
runs on load (client and Worker); the service-worker update banner forces a refresh before a newer schema
is written. Zod schemas will change weekly for a month; this is what prevents the 409 loop between a
weekend-2 server and a weekend-1 phone.

**Model integration (v1.1+).** Worker routes `/api/idea`, `/api/parse`, `/api/import-plan` call the Claude
Messages API (TypeScript SDK) with structured outputs and a cached system prompt; outputs pass the same Zod
schemas and `validateDish` as user input; 30 ideas/day rate limit; fixtures recorded for tests.

**Cost.** Hosting €0 (Workers free, static assets free, D1 free). Model: €0 in MVP; later roughly one weekly
idea batch plus a handful of live swaps, under €3/month; a plan import once or twice a year. Domain ~€10/year.

**Testing.**
- Property tests on `core`: `checkWeek` accepts every solver output and rejects mutated weeks; plates
  invariants (6.3); aggregation commutative and idempotent, `units × usable ≥ need`, leftover ≥ 0; 1,000
  seeded weeks keep the pairing, have one libero, respect frequencies and cooldowns; solver agrees with
  brute force on a shrunk plan.
- Acceptance: the six dishes with the verdicts in 6.5; every rule in 4.2 as a named table-driven test on
  the demo plan; plan JSON round-trips through Zod without loss; the demo plan rendered to an image and
  re-imported (v1.2) reproduces the fixture.
- Private: the real plan runs the same suite locally from the git-ignored path, plus a checklist test that
  every amount of the transcription appears exactly once.
- Model calls are tested only against recorded fixtures; the live contract is guarded by Zod + `validateDish`.

**Native path.** Capacitor wraps the same static build when notifications matter (native push, not web
push); `core` unchanged. Android TWA is the cheaper alternative. App Store guideline 4.2 is defensible for an
app with real utility beyond a repackaged site.

---

## 9. Roadmap

| Phase | Scope |
|---|---|
| **Weekend 1 — one phone** | `core` types + Zod with `Qty`, `SlotOption` wildcard, `FrequencyRule`, `PotPolicy`; demo plan + private transcription (budget 3 h, settling drained-vs-net, tuber min/max and breakfast eggs with G.); ~60 foods with packs and sections; `generateWeek` + `checkWeek`, `resolvePlates`, `aggregate`, `validateDish`; a CLI that prints a week and its list; fast-check; seed book of ~40 dishes drafted with the model and reviewed with G.; *Stasera*, *Cucina*, *Settimana*, *Spesa* on local storage; static deploy. **She plans and shops on Sunday.** |
| **Weekend 2 — two phones** | Worker + D1 + capability link + QR; outbox and offline *Spesa* with snapshot/deltas; PWA install and update banner; `schemaVersion` + migrate; *Non mi va* with the three deterministic, consumed-aware actions; iPhone test on both phones. |
| **Weekend 3 — the loop** | 👍/👎/Fatto/mai più and per-axis cooldowns; "why today"; tomorrow's lunchbox on *Stasera*; *spesa fresca*; cook-double; *Ricettario* editor with inline verdict; cross-week history; share-as-text; acceptance tests and demo fixtures in the repo. |
| **v1.1 — Nuova idea** | `/api/idea` behind a flag; proposed → approved book; *stessa spesa* swaps against this week's purchases; pack-reuse nudge; recipe text/URL parsing. |
| **v1.2 — Import = acquisition** | Photo/PDF → Plan JSON with per-field confidence → review diff → activate; plan versions; first-run screen "Fotografa la tua dieta"; next-appointment reminder for the new sheet. |
| **v1.3 — Pantry-lite** | "ho già" / "sto finendo", expected leftovers from pack rounding, leftover echo in the planner. |
| **v2** | Compose mode over the exchange lists with `checkWeek` and Italian "unsatisfiable" messages; macro "stimato" panel and `classifyFood`; "Domande per la nutrizionista" export; verdict card and week image designed for sharing. |
| **Later** | Passkeys, more households and more than one constrained member; Capacitor build; barcodes via Open Food Facts (isolated store). |
| **Never** | Prices, calorie tracking, a feed, anything social. |

---

## 10. Risks

- **Transcription errors in the private plan.** Mitigation: checklist test; *Io* shows every amount; the
  import flow (v1.2) with source-page crops replaces hand transcription.
- **The dish book is too thin and boredom returns around week 5.** Mitigation: 40 reviewed seed dishes;
  add-dish under a minute with no quantities to type; "Nuova idea" first in v1.1; the planner degrades to
  "slot foods only, cucina come vuoi" rather than repeating.
- **Valid but joyless model ideas.** Mitigation: proposed-until-liked gate; seed book as fallback.
- **The documents disagree, or the nutritionist changes rules verbally.** Mitigation: versions; the
  questions list; `validUntil` / next appointment prompting for the new sheet.
- **Brand/size drift on the sheet.** Mitigation: packs are data per food, with own-brand substitutes; grams follow the plan, brands do not.
- **iOS PWA quirks** (storage eviction, update flow). Mitigation: installed app, precache, update banner, real-device test in weekend 2.
- **Gold-plating sync.** Mitigation: weekend 1 is single-device by design.

---

## 11. Open questions for G. and the nutritionist

Collected from the design reviews; the app will carry these in *Io → Domande per la nutrizionista*.

1. Fish is absent from both documents' protein lists but mentioned in hints: allowed, at what weight, in which slot?
2. May a substitution cross templates (e.g. the soup-night fresh cheese on a grain pranzo, as in her cous cous + feta)?
3. Is composing freely from the exchange lists still allowed alongside the day templates?
4. If the free meal moves to a weekday, what happens to the displaced cena of that template-day?
5. Where the two documents differ (oil per meal, one legume weight), which is current?
6. Does the grated cheese on primi count toward the weekly cheese limit? Does evening fruit count toward daily fruit?
7. Are the vegetable figures on the sheet a minimum or indicative? Are carrots and pumpkin "limit" or free?
8. Is weekday pranzo eaten at home or carried? (Drives the lunchbox default.)
9. Does she weigh raw per person or cook a shared pot and weigh cooked? (Drives pot-policy defaults.)
10. Partner multipliers: start at cereal 1.5, bread 1.5, protein 1.3, or "quanto vuole"?
11. Which supermarket is the usual one? (Drives the default walk order.)

---

## 12. Acceptance criteria for the MVP

- A generated week passes `checkWeek` for every seed and satisfies every rule in 4.2 on both the demo and the private plan.
- The six example dishes produce the verdicts in 6.5.
- G.'s plate lines equal the plan to the gram for every meal of every generated week; the partner's are multiples; the pot is the sum.
- The shopping list for a generated week lists every food of every meal, including breakfast and snacks, in packs, in the chosen store's order, works offline, and survives a mid-week swap as deltas without un-ticking.
- Nothing in the repository or its fixtures contains the nutritionist's documents or any personal data.
- She uses it to plan and shop on the first Sunday.
