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

1. **Tonight** — tonight's dish, two plates (hers in the plan's exact grams, his scaled), one line of
   "why today", three buttons (*Cook*, *Not tonight*, *Done*). Tomorrow's lunch underneath, because weekday
   lunch is usually a lunchbox packed the night before.
2. **Week** — a week drafted for her: the nutritionist's seven day-templates permuted onto Mon–Sun, one
   approved alternative per slot, a dish per meal; she skims, swaps, locks, confirms.
3. **Shopping** — one list in purchasable packs ("2 × 400 g cans", "1 mozzarella"), in supermarket walking
   order, offline, shared, reconciled against pantry and purchases, with a small mid-week fresh list.
4. **Recipes** — her own dishes, entered as *shapes* (roles → foods, steps) with no quantities, validated
   against the plan ("fits the grain + legume lunch with the quinoa alternative; protein slot unfilled").
5. Later: "New idea" (model-generated dish ideas inside a strict contract), photo/PDF import of a new
   plan version, pantry-lite, a "questions for the nutritionist" list, a macro estimate view.

**Decisions taken (and what was rejected).**

| Decision | Chosen | Rejected, and why |
|---|---|---|
| Diet model | Two layers: the nutritionist's *exchange lists* (generative grammar) + her *7 day-templates* (approved preset). Versioned. | "Macro grams per meal" as the primary model: it is not how the plan is written and would let the app invent grams. Macros become a derived, labelled estimate (v2). |
| Active prescription | The newer document (day templates and its rules) is the active profile; the older exchange lists are the grammar for validation and, later, compose mode. | Generating weeks from the older portions by default: the first week would contradict the sheet she is on now. |
| Source conflicts | One active set of portions per profile revision; never average; a recipe never picks whichever document gives the convenient allowance; differences shown once in settings; weeks keep the revision they were generated from. | "Templates win, lists keep their own values" without a revision model: silently inconsistent. |
| Grams | Read from the plan, never computed. Dishes carry no quantities. | Recipe scaling / ingredient parsing / unit conversion on the critical path: unnecessary when dishes are shapes. Quantities exist only on imported external recipes, mapped before use. |
| Variety | Combinatorial chooser with per-axis cooldowns, taste memory inferred from taps, season table, pack economy. | A numeric optimiser (Eat This Much style): repeats by week 3–4 and produces bizarre combos. "A few variety preferences": too thin for the actual problem. |
| Compliance | An independent `checkWeek()` proves every generated week against every rule; the planner returns *why* when it cannot satisfy a rule; frequency counts are shown as numbers for a stated scope, never as a blanket badge. | "Correct by construction" with no checker. |
| Leftovers | Cooking *batches* with portions; meal slots *allocate* portions; frequencies count her eating occasions; the batch is bought once; cooked history is never rewritten. | A "cook double" flag: cannot represent allocations, counting or history. |
| Partner scaling | One multiplier, same proportions as her plate, adjustable per meal; raw per-person lines and a combined pot. | Per-role multipliers plus pot-division policies in v1: a homogeneous dish cannot be split into arbitrary ratios; keep it for later. |
| Model (LLM) | Build-time drafting of the seed dish book; runtime only for ideas, parsing and plan import, behind a strict JSON contract validated by the same code as hand-entered dishes; the app works with no model key. | A model in the first version's critical path: open-ended tuning with no usage to tune against. |
| Price comparison | Out of scope (owner decision). Supermarkets matter for *what* and *in which pack*. | PlanMyMeals' scraping layer: contractually risky, and not the household's problem. |
| Hosting | Static-first: a local-first PWA that runs from any static host (a GitHub Pages workflow is included) with JSON export/import; an optional sync service (one Cloudflare Worker + D1, capability link + QR) for two phones. The core workflow never depends on the sync service. | Supabase auth/RLS/Realtime for two people who share a kitchen; and any design where a missing service stops planning or shopping. |
| Code structure | One Vite app (React 19 + TypeScript) with a pure `src/core/` (zero DOM/network imports, enforced by lint). | A monorepo: an evening of tooling that buys nothing until a native rewrite exists. Capacitor wraps the same build. SvelteKit was the first pick; React is chosen for the owner's familiarity and lower API churn. |
| Interface language | English UI; Italian ingredient and dish names alongside; strings organised for an Italian toggle later. | Italian-first UI (owner preference). |
| First milestone | One phone, local storage, no backend: she plans and shops the first Sunday. | A milestone of types with no UI. |
| Privacy | Real plan in a git-ignored file / in-app import / JSON export; repo ships a generic demo plan; no personal data in the repo (it is public). | Committing the transcription "because it is just data". |

*Revision note.* This plan was revised after reviewing a second, independently written specification. Merged
from it: the source-conflict and revision policy, the batch/allocation model for leftovers, frequency scope
rules, shopping reconciliation arithmetic with a worked example, the shared oil allowance between cooking and
dressing, meal-scope preservation of substitutions, data export, the accessibility bar, single-multiplier partner
scaling, and acceptance tests as a table. Kept from the first draft: templates-first with the newer document
active, dish-as-shape, the variety engine, time-aware swaps and the lunchbox view, store walking order and
portions as pieces, and the nutritionist questions list.

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

Both documents are represented without loss. They disagree in several places (the newer one lowers the
canned-legume weight, lowers bread and meat weights slightly, raises the daily oil budget, drops the "light"
qualifier on the fresh cheese and changes the afternoon snack). Policy:

- A **profile revision** holds exactly one active set of portions. The first revision is the newer document's
  values, labelled *draft, from the December sheet* until G. reviews it in settings; the differences are
  shown once, side by side, in setup and settings, never in cooking flows.
- Values are never averaged, and a recipe or validator never picks whichever document gives the convenient
  allowance. A dish that only fits under the *other* document's values is reported as such and goes to the
  nutritionist questions list.
- Changing an amount creates a new revision and affects future generation only; existing weeks keep the
  revision they were generated from until explicitly recalculated.
- Meal scope is preserved: an option listed for lunch is not automatically a dinner substitution.
- Grams are canonical where the sheet gives grams; spoon descriptions never override gram entries.
  Genuinely unspecified amounts (free vegetables, "q.b." honey) stay unspecified rather than invented.

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
| Oil: cooking and dressing share the meal's allowance; neither may claim the full amount on its own | Plate resolution; dish validation rejects steps that add unlisted oil |
| Frequency scope: whole eggs count across breakfast, lunch, dinner, snacks and leftovers; a cheese garnish is not a cheese meal; ambiguous scopes are marked "for review" and shown as counts, not badges | `FrequencyRule.scope` + `checkWeek` + the Week screen |
| Counting unit: her eating occasions, not batches cooked or the partner's portions | Batch/allocation model (6.2) |
| Weights refer to the profile revision the week was generated from | `Week.planRef = {planId, revision}` |

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
  min?: number; max?: number; countBy: 'meals' | 'units'; scope: 'all_meals' | 'main_meals'; garnishExempt?: boolean;
  source: string; review?: boolean }                                      // review: ambiguous scope, shown as a count

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
  minutes: number; lunchboxOk: boolean; batchable?: { portionsMax: number; keepsDays: number };
  steps: string[];                                                     // '{{cereal}}' placeholders, no grams
  origin: 'seed' | 'user' | 'llm' | 'import'; status: 'approved' | 'proposed'; lastUsed?: string;
}

interface Member { id: string; name: string; constrained: boolean;
  multiplier: number }                                                  // partner: 1.0 by default, adjustable per meal; same proportions as her plate
interface Week { id: string; planRef: { planId: string; version: number }; monday: string; seed: number;
  days: { date: string; template: number; colazione?: string; merenda?: string;
          pranzo: Meal; cena: Meal | { libero: true } }[] }
interface Meal { choices: Record<string /*slotId*/, number /*option index*/>; dishId?: string; veg: string[];
  plates: Plate[]; status: 'planned' | 'consumed' | 'swapped' | 'out' | 'unknown';   // 'consumed' gates what may change
  batchId?: string; allocation?: { portionOf: string /*memberId*/; n: number }; locked?: boolean; partnerMultiplier?: number }

// Cooking is separate from eating: a batch holds prepared portions; meal slots allocate them.
interface Batch { id: string; dishId: string; cookedOn?: string; recipeSnapshot: Dish; choices: Meal['choices'];
  portions: { memberId: string; n: number; lines: Plate['lines'] }[];   // what was cooked; immutable once cookedOn is set
  allocated: { mealRef: { date: string; meal: 'pranzo' | 'cena' }; memberId: string }[] }  // never more than portions
interface Plate { memberId: string; lines: { foodId: string; qty: Qty; display: string }[] } // "1 mozzarella (125 g)"

interface ShoppingList { weekId: string; mode: 'draft' | 'snapshot';        // snapshot after the shop: deltas only
  items: ShoppingItem[]; deltas: ShoppingItem[]; freshRun?: ShoppingItem[] } // freshRun = mid-week bread/leaves
interface ShoppingItem { key: string; foodId: string; form: 'raw' | 'dry' | 'canned_drained' | 'frozen';
  demandG: number; pantryDeductedG: number; purchasedCoveredG: number;    // demand − pantry − covered = still to buy
  buy?: { n: number; unit: string; leftoverG: number };                   // only when a pack size is known; else grams
  section: StoreSection; why: { date: string; meal: string; dish: string }[];
  checked?: { by: string; at: string; opId: string; rev: number }; haveIt?: boolean; manual?: boolean; note?: string }
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

**Batches and leftovers:** a `batchable` dish (a lentil sauce, a soup) is cooked once as a *batch* with a
known number of portions per person; later meal slots *allocate* those portions. The list buys the batch once;
frequencies count each of her eating occasions; a lunch portion allocated to a dinner slot is validated
against the dinner slot's foods and amounts (a valid lunch is not automatically a valid dinner); replacing a
leftover meal detaches the allocation and exposes the unallocated portion; a cooked batch's ingredients and
consumed allocations are never rewritten. Expected leftovers from pack rounding (half a tofu pack, half a
pumpkin) earn a `leftoverBonus` for a dish within their shelf life.

### 6.3 Plates: read, never computed

G.'s plate takes each slot's chosen option verbatim (raw), plus the oil line from the meal's allowance
(shared between cooking and dressing), plus toppings at their fixed amount; free vegetables and condiments
are unquantified. The partner's plate is hers × one multiplier (default 1.0, adjustable per meal; rounded
to 10 g; counts stay counts), keeping the same ingredient proportions so a homogeneous dish divides cleanly.
Pot = sum of plates. Per-role multipliers are deferred: they would require portioning before combining.

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

Demand is generated from distinct cooking batches (not per eating occasion) plus fixed breakfasts, selected
snacks and manual entries, in the food's purchase form (drained for cans, dry for dry legumes, frozen for
frozen soup); a jar's net weight never stands in for its drained weight, and an unknown pack size stays a
quantity in grams rather than an invented pack count.

**Reconciliation.** Each line tracks `demandG`, `pantryDeductedG` (user-confirmed stock, deducted once) and
`purchasedCoveredG` (what checked purchases actually cover, including pack rounding). Worked example: recipes
need 900 g, the pantry has 100 g, packs are 500 g → buy 2 packs, 200 g remain after planned consumption;
checking those two packs records 1,000 g covered; if demand later rises to 1,100 g the packs still cover it
and nothing new appears; if it rises to 1,300 g only the uncovered remainder appears; if demand disappears
the generated requirement is removed but a manual entry with the same food is untouched. An old check never
makes genuinely uncovered demand look purchased. Aggregation is order-independent and idempotent (property
tests). Checked rows sink into "in the cart" and the unchecked part never re-sorts mid-aisle. Copy/share as
text as a fallback.

### 6.5 Validating a dish against the plan

`validateDish(dish, plan, week?) → Fit[]`. For every template meal, match the dish's bindings to slots
(a food fits a slot directly or via the subgroup wildcard) and report `{template, meal, matched, unfilled,
foreign, violations, exchangeFallback}` ranked by completeness. Violations: foods outside the options,
condiments or methods outside the rules, oil over budget, topping over the limit, sugary vegetables (soft).
With a `week` the check is **context-aware**: it also counts weekly frequencies, so a cheese-based dish that
is approved by the exchange lists is still flagged if it would exceed the weekly cheese limit. A garnish
(a teaspoon of grated cheese) is never accepted as the protein component, and a substitution is only accepted
for the meal type it is listed for. A dish with unmapped quantities (an imported recipe) can be saved as a
draft but never enters an automatically validated week.

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

Bottom tabs: **Tonight · Week · Shopping · Recipes · Settings**. English interface; Italian ingredient and
dish names shown alongside (the shopping list is what she reads in an Italian supermarket); all visible
strings live in one catalogue so an Italian toggle can be added. Accessibility bar: 360–430 px layouts with
no horizontal scroll, 44 px primary touch targets, visible keyboard focus, labelled controls, readable
contrast, reduced-motion support, and real empty/loading/offline/error states; no visible control is ever a
placeholder. Large tap targets and no swipe gestures in the store; wake-lock in the cook view.

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

**Settings.** Diet profile (view and edit every amount; revisions; source differences shown side by side once;
next appointment date), breakfast and snack routine, dislikes and allergies, partner multiplier, "running
low" staples, household QR and sync status, **JSON export/import of the whole household** (so the first
deployment is never the only copy), and **"Questions for the nutritionist"** (collected from validator and
import verdicts, exportable before the appointment).

**Partner's view.** Same app via the household QR; *Stasera* leads with his plate; he ticks the list and
can mark "ho cucinato io"; a dish he proposes runs through the same validation and appears tagged "proposta da M.".

**First run (v1.2).** A single screen: *"Fotografa la tua dieta"*. Until then, the demo plan loads and the
private plan is imported from JSON by the developer.

---

## 8. Architecture

**Stack.** Vite 8 + React 19 + TypeScript, TanStack Router, Tailwind CSS 4, `vite-plugin-pwa` (manifest,
precache, offline fallback, "new version" banner), Zod 4, Dexie 4 (IndexedDB), Vitest + fast-check +
Testing Library, Playwright for the phone-sized browser journey. `src/core/` is the product: plan model,
revisions, planner, checker, boredom model, plates, batches, aggregation and reconciliation, validation,
migrations. An ESLint `no-restricted-imports` rule forbids React, the DOM and `fetch` inside it. Exact
versions are checked against the npm registry at build time.

**Hosting, static-first.** The app is a local-first SPA: everything (plan, dishes, weeks, list, pantry,
taste memory) lives in IndexedDB on the phone, with JSON export/import for backup and for moving to a second
phone. It runs from any static host; the repo includes a GitHub Pages workflow. **Nothing in the core
workflow depends on a server.**

**Sync service (optional, for two phones).** A separate `worker/` on Cloudflare Workers free tier + D1
(SQLite), tested locally with Wrangler's local mode. Tables: `household(id, token_hash, doc JSON,
schema_version, version, updated_at)`, `list_op(household_id, week_id, key, checked, by, at, op_id, rev)`.
Endpoints: `GET /h/:t/state?since=v`; `PUT /h/:t/doc {baseVersion, doc}` (409 on conflict → reload; one
person plans at a time); `POST /h/:t/list/ops` (idempotent batches keyed by `op_id`, last-writer-wins by
`at`, conflicts between a check and a newer uncheck surfaced, not overwritten). `household_id` is derived
from the token in exactly one function so passkeys can front the same tables later. Deploying it requires
the owner's Cloudflare login; the app shows sync as "not configured" until a service URL is set.

**Identity.** A capability link `https://…/h/<128-bit token>`; the Worker stores `sha256(token)`; the second
phone joins by QR; the token is rotatable from Settings; `Referrer-Policy: no-referrer`. No accounts, no
email templates, no database that pauses over the holidays. Private cached data is cleared when the household
token changes; auth-bearing responses are never put in the shared service-worker cache.

**Offline and sync.** IndexedDB holds the household and an outbox of mutations with a unique operation id and
the item revision observed; replayed on `online`, `visibilitychange`, after each mutation and on explicit
refresh; no Background Sync on iOS. The server deduplicates retries by operation id. Polling on focus is
sufficient for two phones (usually one cart); no websockets.

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

The first three milestones are built in one autonomous run (see [`BUILD.md`](BUILD.md) for the operational brief).

| Phase | Scope |
|---|---|
| **M1 — core and fixtures** | `src/core` types + Zod with `Qty`, `SlotOption` wildcard, `FrequencyRule` scopes, revisions, batches; demo plan (generic values) + private plan file (git-ignored); ~60 foods with purchase forms, packs and sections; `generateWeek` + `checkWeek` with bounded search and explained infeasibility; `resolvePlates`; batches/allocations; `aggregate` + reconciliation; `validateDish`; migrations; the six dish verdicts; property tests. |
| **M2 — the app on one phone** | Tonight (with tomorrow's lunchbox), Cook view, Week (generate, lock, replace with preview, move day as a pair, free meal, counts for the configured scopes), Shopping (packs, walking order per store, pantry deductions, covered purchases, manual items, fresh list, copy/export), Recipes (search, filters, feedback, editor with inline verdict, variations), Settings (profile revisions, source differences, routine, partner multiplier, export/import, nutritionist questions); seed book of ~40 dishes; PWA install and update banner; empty/loading/offline/error states; accessibility bar; Playwright phone journey; screenshots. |
| **M3 — two phones** | `worker/` with D1, capability link + QR join, outbox with operation ids and revisions, conflict surfacing, two-session sync test in local mode; GitHub Pages workflow; deployment runbook for the owner's Cloudflare account. |
| **v1.1 — New idea** | `/api/idea` behind a flag; proposed → approved book; "same shopping" swaps against this week's purchases; pack-reuse nudge; recipe text/URL parsing. |
| **v1.2 — Import** | Photo/PDF → plan JSON with per-field confidence → review diff → new revision; first-run screen "photograph your diet sheet"; next-appointment reminder. |
| **v1.3 — Pantry-lite** | "I have it" / "running low", expected leftovers from pack rounding, leftover echo in the planner. |
| **v2** | Compose mode over the exchange lists with `checkWeek` and explained infeasibility; macro "estimated" panel and `classifyFood`; nutritionist questions export; verdict card and week image designed for sharing. |
| **Later** | Passkeys, more households and more than one constrained member; Capacitor build; barcodes via Open Food Facts (isolated store); Italian interface toggle. |
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

## 12. Acceptance criteria

| Case | Required result |
|---|---|
| Generated week | Passes `checkWeek` for every seed on both the demo and the private plan: pairing intact, one free meal, vegetables at both main meals, oil within the daily budget, weekend snack rule by calendar, every option from the slot, every frequency rule met. |
| Her plate | Slot lines equal the active revision to the gram for every meal of every generated week; the partner's lines are her lines × the multiplier; the pot is the sum. |
| Source profile | A revision uses its own quantities consistently; a dish cannot silently change a legume weight by borrowing the other document's value; changing an amount creates a revision and old weeks keep theirs. |
| Meal scope | Lunch and dinner amounts stay distinct; a lunch-only substitution is not validated at dinner; focaccia is not silently treated as bread. |
| Oil and components | Cooking and dressing cannot each claim the full allowance; pasta with only a cheese garnish is not a complete meal. |
| The six dishes | Produce the verdicts in 6.5. |
| Weekly counting | Whole eggs include breakfast; leftovers count per her eating occasion; the partner's portions never consume her allowance; unknown meals leave coverage incomplete and say so. |
| Feasibility | Locks and exclusions preserved; impossible combinations yield an actionable explanation within the work limit, never a relaxed rule or an endless loop. |
| Batches | Two people and planned leftovers produce correct allocations and buy the batch once; a lunch-to-dinner allocation is validated against dinner; cooked ingredients and consumption history are never rewritten. |
| Purchase arithmetic | 900 g demand / 100 g pantry / 500 g packs → 2 packs; raw, cooked and drained forms are never merged; unknown pack sizes stay in grams. |
| Regeneration | Manual items survive; unrelated checks remain; only demand beyond pantry and covered purchases becomes additional shopping. |
| Persistence | Reload and a second browser context see saved recipes, settings, weeks and shopping changes (local-first), and via the sync service when configured. |
| Offline | The current list opens offline; checks survive reload and sync once; reconnect conflicts and increased demand are handled visibly. |
| Access | With the sync service, a wrong token cannot read or modify another household; the household id is never client-supplied. |
| Mobile journey | On a phone-sized browser: set up, generate a week, lock and replace a meal, add a dish, shop offline, open cooking instructions. Screenshots recorded. |
| Privacy | Nothing in the repository, fixtures or screenshots contains the nutritionist's documents or personal data. |
| Quality gates | Production build, type check, lint, unit/property tests and the Playwright journey all pass in CI. |
