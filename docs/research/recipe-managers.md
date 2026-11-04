# Recipe managers, shopping-list apps and reusable building blocks — survey (4 Nov 2026)

Scope: Paprika, Plan to Eat, Samsung Food (ex-Whisk), AnyList, Mela, Crouton, Bring!, Listonic; open-source Tandoor, Mealie, Grocy, KitchenOwl (+ RecipeSage as a bonus); then schema.org/Recipe scraping, Cooklang, ingredient parsers, unit conversion, recipe datasets and licences; closing with "what makes a shopping list good in the store" and which data models to copy.

Verification legend: **[V]** = I opened the source (GitHub repo/raw file, or a search-engine excerpt quoting the vendor page verbatim); **[S]** = only seen through search-result excerpts (vendor site itself was not reachable); **[I]** = inference / prior knowledge, not re-verified today.

Environment caveat: in this session the following hosts were NOT resolvable (network allow-list), so vendor pages could not be opened directly: paprikaapp.com, plantoeat.com, samsungfood.com, anylist.com, mela.recipes, crouton.app, getbring.com, listonic.com, docs.mealie.io, docs.tandoor.dev, docs.kitchenowl.org, cooklang.org, kaggle.com, huggingface.co, zenodo.org, schema.org, sites.google.com; pypi.org returned a bot challenge and npmjs.com a 403. github.com and raw.githubusercontent.com worked, so all open-source claims below come from the repos themselves. The shared web-search budget ran out near the end, so a handful of commercial-app details (Paprika pricing, Crouton tiers, Listonic/Samsung Food APIs) stay at [S]/[I].

---

## 1. Commercial apps

### 1.1 Paprika Recipe Manager 3 (Hindsight Labs; iOS/Android/macOS/Windows)
- Import: built-in browser with a "Download recipe" button; structured-data sites parse cleanly, otherwise manual highlight-to-field. [S]
- Scaling: scale to any serving count and convert measurements; scaled amount now shown when printing/emailing. [S]
- Meal calendar: daily/weekly/monthly; reusable multi-day "menus"; custom meal types. [S]
- Shopping list: ingredients from recipes are **combined automatically and sorted by aisle**; custom aisles, reorderable; multiple lists; pantry; move items between lists and pantry. [S]
- Sharing: cloud sync is per Paprika account; couples typically share one account (no multi-user household concept). [I]
- Offline: all data is stored locally, so recipes/lists work without connectivity; sync is paid (free tier: 50 recipes, no sync). [S]
- API: none. Export format `.paprikarecipes` = zip of per-recipe **gzip-compressed JSON** with `name, description, servings, cook_time, prep_time, directions, notes, nutritional_info, source, source_url, categories[], ingredients` (one newline-separated string, i.e. unparsed lines), `image_url`, `photo_data` (base64). [V — read from Tandoor's importer `cookbook/integration/paprika.py`]

### 1.2 Plan to Eat (US; iOS/Android/web; subscription, 14-day trial)
- Import: browser share-sheet import; vendor claims import from Instagram/TikTok/Facebook/Pinterest/YouTube/Substack; bulk file import on the website. [S]
- Planner: drag recipes onto dates/meals, per-entry servings scaling, leftovers/freezer notes that do not hit the list. [S]
- Shopping list: generated for a **date range** of the plan, extras can be added, updates when the plan changes; staples list. [S]
- Sharing: "household sharing included on every subscription"; sync across devices; offline access claimed. [S]
- API: none. Export is a plain-text dump, blocks separated by `--------------`, with labelled lines `Title:, Description:, Serves:, Source:, Photo Url:, Prep Time:, Cook Time:, Tags:, Ingredients:, Directions:`. [V — Tandoor `plantoeat.py` importer]

### 1.3 Samsung Food (formerly Whisk; acquired 2019, rebranded 30 Aug 2023) [V via TechCrunch excerpt]
- Save recipes from any website into a standardised format; AI-generated weekly plans by dietary preference; shopping list from saved recipes; nutrition info; "Samsung Food+" paid tier. [S]
- Limits reported by reviewers: instructions sometimes must be pasted manually; only one grocery store can be attached to the list (2026 review). [S]
- API: Whisk used to run a B2B developer platform; no public Samsung Food developer API was found in 2025–2026 sources. [S/I]

### 1.4 AnyList (Purple Cover; iOS/Android/web/Mac; last store update Sep 2025)
- Lists: free creation and sharing; items grouped by **category/aisle**, with a per-store category order (the "Stores" feature). [S for grouping; I for per-store order]
- Recipes: web import via share/action extension (paid), scaling, recipe collections. Meal-planning calendar that feeds the list (paid). [S]
- Pricing: AnyList Complete USD 9.99/yr individual, 14.99/yr household. [S]
- Offline: imported recipes available offline per user reviews; lists cache locally (typical). [S/I]
- API: none official. Unofficial, reverse-engineered Node package `anylist` (github.com/codetheweb/anylist, 151 stars): email/password login, add/check/remove items, create recipes/collections, calendar events; cannot create lists. [V]

### 1.5 Mela (Silvio Rizzi; iPhone/iPad/Mac; one-time purchase; iCloud sync)
- Import: web importer incl. ML importer for pages without structured data; OCR scanner for books; imports Paprika collections. [S]
- Scaling present (rounding fixes in release notes); reviewers call scaling options limited. [S]
- Calendar: meal plan is written to **Calendar.app**; grocery list is written to **Reminders.app** (list "Mela" by default), which is how the list reaches a partner's phone and works offline. [S]
- Format `.melarecipe` = one JSON object: `title, ingredients` (newline string), `instructions, text, notes, yield, prepTime, cookTime, categories[], favorite, link, images[]` (base64); nutrition not imported by Tandoor. [V — Tandoor `melarecipes.py`]
- API: none.

### 1.6 Crouton (Devin Davies; iOS/macOS/watch; iCloud)
- Import: URL, plain text, images, OCR from books, AI import from a single photo; meal plan can be **auto-generated from your dinner recipes**; grocery list from recipes with **Reminders integration**; share recipes via iCloud; cookware/timers. [S]
- Pricing: "Crouton Plus" USD 4.99 IAP on the App Store; AI import reported to sit in a USD 14.99/yr "Discover" tier (claim by a competitor's comparison page). [S]
- API: none.

### 1.7 Bring! (Bring! Labs AG, Zurich; very popular in DACH and Italy) [I for popularity]
- Lists shared in real time; items auto-assigned to **sections from Bring's own catalogue** (localised item names + categories via `loadCatalog(locale)`/`loadTranslations`); "recently purchased" list; offers/flyers; recipe import from websites and social media (vendor comparison pages). [S/V]
- **Official publisher integration** ("Bring! Import" widget): page loads `platform.getbring.com/.../import.js` with a `data-bring-import` element; the page **must carry schema.org Recipe JSON-LD**; app-to-app deeplink: `POST/GET https://api.getbring.com/rest/bringrecipes/deeplink` with recipe URL, baseQuantity, requestedQuantity; GET returns HTTP 307 with the deeplink in `Location`. Dev guide revisions 2020/2022. [S — Google Sites dev guide blocked; excerpts quoted]
- Mealie's Bring recipe action uses exactly this deeplink (Bring must be able to fetch your recipe page), and the community `felixschndr/mealie-bring-api` (AGPL-3.0) instead **pushes** ingredients with the unofficial Python lib. [V]
- Unofficial APIs: Python `bring-api` (miaucl, MIT): `login`, `load_lists`, `get_list`, `save_item(itemId, spec, uuid)`, `batch_update_list(ADD|COMPLETE|REMOVE)`, uses the same endpoint as the mobile app. Node `bring-shopping` (MIT, v2.0.2, 27 Jan 2026): `loadLists, getItems, saveItem, removeItem, loadCatalog, loadTranslations`, batch ops. Both: email/password, unofficial, may break. **Inspirations API returns recipe metadata only, no ingredients.** [V]
- Offline: list cached on device, syncs when online. [I]

### 1.8 Listonic (Poland; iOS/Android/web)
- Auto-categorisation into sections; custom categories with icons; **drag to reorder categories to match your supermarket**; a manual category change is remembered. [S]
- Sharing via link/WhatsApp (no account needed) or email (both need accounts); real-time sync; offline use with later sync; voice input; smartwatch; price estimates; new AI assistant (Listonic AI, Sep 2025). [S]
- API: none public found. [S]

---

## 2. Open-source apps (all verified from GitHub unless noted)

### 2.1 Tandoor Recipes — github.com/TandoorRecipes/recipes
- AGPL-3.0 with a "common clause" selling exception (since 0.10.0); ~8.7k stars; latest 2.7.2 (27 Oct 2026); Django REST backend, Vue 3 frontend (2.x rewrite). [V]
- Import: URL importer for sites with ld+json/microdata; file imports from ~25 apps (Tandoor zip, Nextcloud Cookbook, Mealie, Chowdown, Safron, **Paprika, Plan to Eat, Mela, Cookmate, Cooklang .cook**, RecipeSage JSON-LD, CopyMeThat, Pestle, Recipe Keeper, MealMaster…); export to Tandoor zip, Safron, RecipeSage JSON-LD. [V `docs/features/import_export.md`]
- AI (via **LiteLLM**, any OpenAI-compatible endpoint): import from image/PDF/raw text, step sorting + ingredient-to-step assignment, nutrition/property extraction; default spend cap ≈ 1 USD/month per space; `AI_RATELIMIT` 60 req/h. [V `docs/features/ai.md`]
- Automations: Food/Unit/Keyword alias, regex Description/Instruction/Title replace, Food/Unit replace, **Never Unit** (e.g. "uovo" is never a unit), **Transpose Words**; applied on import and on shopping-list quick-add. [V]
- Ingredient parser: rule-based, position-based (amount → unit → food → note), handles `1,5`, `½`, `2 1/2`, ranges (keeps min), parentheses → note, alternate measures `1 cup (240 ml)`; no English word lists, so usable for Italian lines. [V `cookbook/helper/ingredient_parser.py`]
- Meal plan: multiple meals per day, `MealType` (name, order, time, color), `MealPlan(recipe, servings, from_date, to_date, note, shared)`; auto-add to shopping (`mealplan_autoadd_shopping`), auto-exclude on-hand foods, include related recipes. [V `models.py`]
- Shopping list: per-list **Supermarket** with `SupermarketCategoryRelation(order)`; `Food.supermarket_category`, `Food.ignore_shopping`, `Food.onhand_users`, `Food.substitute`, `preferred_shopping_unit`; `ShoppingListEntry(food, unit, amount, checked, delay_until, list_recipe→ShoppingListRecipe(servings, mealplan))`; user prefs `shopping_auto_sync`, `shopping_recent_days`, `filter_to_supermarket`, `default_delay`, `shopping_share`. Entries carry `original_text`. Export to Google Keep-style text; Home Assistant todo **connector** (beta). [V]
- Households (2.x): users in a household automatically share meal plan + shopping list; Spaces are tenants. [V `households.md`]
- Units: `Unit(base_unit, open_data_slug)`, `UnitConversion(base_amount, base_unit, converted_amount, converted_unit, food)` → per-food conversions (e.g. 1 pezzo → 60 g). `PropertyType.category ∈ {NUTRITION, ALLERGEN, PRICE, GOAL, OTHER}` — a price property already exists in the model. [V]
- API: full REST API (DRF) with token auth; `api-token-auth/` endpoint removed in 2.7.0 in favour of the new auth. [V release notes]
- Offline: mobile-optimised web app; no real offline list mode found. [S]

### 2.2 Mealie — github.com/mealie-recipes/mealie
- AGPL-3.0; ~13.8k stars; v3.30.0 (31 Oct 2026); FastAPI + Nuxt/Vue [V stars/licence/release; stack I].
- Import: URL scraper (recipe-scrapers), paste HTML/JSON, **"Import with AI"** (v3.23.0: URL, text, HTML, schema.org JSON, one or more photos, video transcription via audio model), AI fallback when scraping fails (v1.9.0), optional translation on import; migrations from Tandoor, Nextcloud, Paprika, Chowdown, Plan to Eat, Recipe Keeper, Copy Me That, My Recipe Box, Cook'n. [V]
- Ingredient parsing: NLP parser (**ingredient-parser-nlp**, bumped in v3.29/3.30), brute parser (position-based like Tandoor's), OpenAI parser (v1.7.0; unit list is sent in the prompt); guided one-ingredient-at-a-time workflow (v3.3.0). [V]
- Data model: `RecipeIngredient(quantity, unit, food, note, display, title, original_text, substitutions, reference_id)`; `IngredientUnit(name, plural_name, abbreviation, plural_abbreviation, fraction, use_abbreviation, aliases[], standard_quantity/standard_unit)`; `IngredientFood(name, plural_name, label, aliases[], substitutions, households_with_ingredient_food)` (= on-hand per household). [V `recipe_ingredient.py`]
- Planner: per-entry servings; random picks constrained by **planner rules** (tags/categories/foods/labels × meal type × weekday); iCal feed. [V]
- Shopping: `ShoppingListItem(position, checked, quantity, unit, food, note, label, recipe_references[{recipe_id, recipe_quantity, recipe_scale, recipe_note}])`; **labels ordered per list** via `ShoppingListMultiPurposeLabel(position)`; v3.29 type-ahead food matching; condensed view (v3.28). Groups are isolated tenants; Households inside a group share recipes but keep **separate meal plans and shopping lists**. [V]
- Integrations: Apprise notifiers, scheduled webhooks with meal-plan JSON, **recipe actions** (link/POST, Bring! example). API: long-lived tokens, OpenAPI at `/docs`, `queryFilter` syntax, `perPage=-1`. [V]
- Offline: PWA-installable, but shopping list needs connectivity. [I]

### 2.3 Grocy — github.com/grocy/grocy
- MIT; ~9.7k stars; 4.7.1 (4 Sep 2026); PHP 8.5 + SQLite. **Stock-centric** ("ERP beyond your fridge"). [V]
- Products: `qu_id_purchase`, `qu_id_stock`, `product_group_id`, `min_stock_amount`, `shopping_location_id`; per-product **quantity-unit conversions** (`quantity_unit_conversions`, resolved view `quantity_unit_conversions_resolved`; 4.6.0 auto-creates 1:1 conversions). [V OpenAPI]
- Recipes: fulfilment check against stock; `POST /recipes/{id}/add-not-fulfilled-products-to-shoppinglist`; `/recipes/{id}/consume`; meal plan with sections; shopping list endpoints `/stock/shoppinglist/add-product|remove-product|clear|add-missing-products`; "Group by product group" on list printing. [V]
- Barcode lookup via Open Food Facts plugin; REST API with Swagger at `/api`, `GROCY-API-KEY` header; **PWA has no offline capability** (README). [V]

### 2.4 KitchenOwl — github.com/TomBursch/kitchenowl
- AGPL-3.0; ~3.8k stars; v0.7.10 (26 Jul 2026); Flask backend, **Flutter** apps for Android/iOS/web/desktop (Play, F-Droid, App Store); Home Assistant integration; Python client; MCP tools (v0.7.7). [V]
- Model: `Household`; `Category(name, ordering, default_key, household)` with `reorder()`/`merge()`; `Item(name, icon, category, ordering, support, default_key, household)` where `support` drives suggestions; `Recipe(name, description, yields, time, cook_time, prep_time, photo, source, visibility PRIVATE/LINK/PUBLIC, tags)`; `RecipeItems(item, description, optional)` — **amounts are free text** in `description`, not structured quantities. [V]
- Features: real-time shared lists, recipes scraped via recipe-scrapers, meal planner, expenses/balances, **partial offline support** (list usable without signal), multiple households per instance. [V]

### 2.5 RecipeSage (bonus) — github.com/julianpoy/RecipeSage
- AGPL-3.0 for non-commercial use, commercial licence on request; ~990 stars; PWA with **offline recipe search**; import from URL/image/PDF/text; shopping list auto-categorised with similar items combined; export JSON-LD. [V]

---

## 3. Reusable building blocks

### 3.1 schema.org/Recipe + scraping
- schema.org/Recipe (JSON-LD) is the lingua franca: `name, image, recipeIngredient[]` (free-text lines), `recipeInstructions` (Text | HowToStep[] | HowToSection[]), `recipeYield`, `prepTime/cookTime/totalTime` (ISO-8601 durations), `recipeCategory`, `recipeCuisine`, `keywords`, `nutrition: NutritionInformation` (calories, fatContent, carbohydrateContent, proteinContent…), `suitableForDiet`. Bring!, Mealie, Tandoor, RecipeSage and recipe-scrapers all consume/produce it. [I — schema.org blocked; stable knowledge]
- **recipe-scrapers** (Python, MIT; 15.13.0 released 18 Oct 2026; Python ≥ 3.11; ~480 scraper classes / ~600 hostnames). Generic fallback: `scrape_html(html, org_url=url, supported_only=False)` → `SchemaScraperFactory` parses schema.org from any site, raises `NoSchemaFoundInWildMode` otherwise (`wild_mode` is deprecated). Methods: `title, ingredients, ingredient_groups` (`IngredientGroup(purpose, ingredients)` detected from WPRM/Tasty headings), `instructions_list, yields, total_time, prep_time, cook_time, nutrients, category, cuisine, equipment, keywords, dietary_restrictions, language, canonical_url, to_json`. No networking: you fetch the HTML. **Italian sites with dedicated scrapers: GialloZafferano, Cucchiaio, FattoInCasaDaBenedetta, LaCucinaItaliana, Misya, Blogghetti, RicettePerBimby, Ricetta, Vegolosi, PastificioSorrentino.** [V]
- JS/TS: no equivalent of recipe-scrapers' breadth; practical path is "fetch → extract `<script type=application/ld+json>` → pick `@type: Recipe` (handle `@graph`) → normalise", or run recipe-scrapers in a tiny Python service / Lambda. [I]

### 3.2 Cooklang (text recipe format)
- Spec (github.com/cooklang/spec): `@ingredient{qty%unit}`, `#cookware{}`, `~timer{25%minutes}`, YAML front-matter metadata; conventions: `servings`, `yield: 500%g`, linear scaling from servings, `{=1%tsp}` fixed quantities, referenced recipes `@./sub{2%servings}`; **aisle config**: `[produce]`/`[Carrefour]` headers listing items with `|` synonyms, order = store layout; `.shopping-list` and append-only `.shopping-checked` files. [V `conventions.md`]
- Parsers: **cooklang-rs** (Rust, MIT, 125 stars: parse, scale, unit conversion, aisle-config parser; UniFFI bindings Swift 0.18.0 / Kotlin `com.github.cooklang:parser:0.18.0`); official JS/TS = **`@cooklang/cooklang`** (WASM build of cooklang-rs, MIT, tracks core 0.17.x, exposes `Parser`, `ingredients`, `cookware`, `timers`, `quantity_display`, `grouped_quantity_display`); the pure-TS `@cooklang/cooklang-ts` was **archived 23 Nov 2025** (never implemented scaling). [V]
- Relevance: good as an *authoring/interchange* format and its aisle-config idea is worth copying; not necessary as the runtime model.

### 3.3 Ingredient-line parsers
- **ingredient-parser-nlp** (Python, MIT, Tom Strange; CRF via python-crfsuite; trained on 88k+ sentences; 94.98 % sentence / 98.05 % token accuracy). Output: `name (text, confidence)`, `amount (quantity, quantity_max, unit as pint Unit, flags APPROXIMATE/RANGE/MULTIPLIER/PREPARED_INGREDIENT…)`, `size, preparation, comment, purpose, foundation_foods`; `convert_to(..., density=)` via **pint**. Training data is English (NYT/Cookstr/AllRecipes/BBC style) → **English-only in practice**. Used by Mealie. [V output/accuracy; I for language]
- **parse-ingredient** (npm, MIT, TypeScript, dep `numeric-quantity`): `quantity, quantity2` (ranges), `unitOfMeasure, unitOfMeasureID, description, isGroupHeader`; localisation knobs `additionalUOMs, decimalSeparator, rangeSeparators, groupHeaderPatterns, leadingQuantityPrefixes, partialUnitMatching`. With an Italian unit table (g, gr, kg, ml, l, cucchiaio/cucchiai, cucchiaino, pizzico, fetta, spicchio, q.b.) it handles Italian lines. [V]
- **@magrinj/parse-ingredients** (npm, MIT, zero deps, locales en/fr/es/**it**/de/pt; `parse/combine/pretty`) — tiny project (3 stars). **recipe-ingredient-parser-v3** (eng/deu/**ita**, `parse/combine`) — low activity. [V]
- Rule-based parsers in Tandoor and Mealie (position-based, comma decimals, unicode fractions, parentheses → note) are language-agnostic enough for Italian and are small enough to port to TS. [V]
- Practical recommendation: deterministic parser first (parse-ingredient with Italian UOMs, or a port of Tandoor's), LLM structured-output fallback for lines with low confidence (Mealie/Tandoor both ended up adding exactly this).

### 3.4 Unit conversion
- JS: `convert-units` (chained API; mass→volume throws — density needed), `js-quantities` 1.8.0 (no deps, TS types, ported from Ruby Units), mathjs units. Python: **pint** (what ingredient-parser uses; `convert_to(density=120*ureg("g/cup"))`, defaults to water). [V/S]
- For a grams-based diet schema the hard part is not unit algebra but **per-food piece weights and volume densities** (1 uovo ≈ 55–60 g, 1 cucchiaio olio ≈ 10 g, 1 fetta pane ≈ 25–30 g). None of the libraries ship this; Tandoor's `UnitConversion(food=…)` and Grocy's per-product QU conversions are the right shape to store it. [I]

### 3.5 Recipe datasets and licences
- **RecipeNLG** (PUT Poznań; 2,231,142 recipes, ~1.6 M `source=Gathered`; fields title, ingredients, directions, link, source, NER): access by request form; terms = **non-commercial research/education only**, employer bound, indemnity; HF card lists licence "unknown". Not usable in a product. [V repo + HF excerpts]
- **Food.com Recipes and Interactions** (Kaggle shuyangli94; 231,637 recipes in `RAW_recipes.csv` with name, minutes, tags, nutrition, n_steps, steps, ingredients, n_ingredients; 1.1 M interactions; Majumder et al. EMNLP 2019). Kaggle licence field not verifiable today (believed GPL-2 — low confidence); scraped content, English, US units → low value here. [S/I]
- **Italian**: Zenodo records 7265253 / 7265211 "Italian gastronomic recipes dataset" (**CC BY 4.0**, derived from giallozafferano.it) and a Kaggle mirror (marcogtt, CC BY 4.0); GitHub scrapers `Biolazard/GialloZafferano` and `lorcalhost/RNN-ICR` (MIT code, GialloZafferano-trained). Caveat: the CC BY tag is the compiler's; GialloZafferano's ToS and copyright on instruction text still apply — ingredient lists/quantities are facts, prose is not. Safer plan: scrape only for *personal* import (user pastes URL) and seed the app's recipe library with original recipes. [S/I]
- **Open Food Facts** (1.7 M+ products, 150 countries; software AGPL-3.0; data under ODbL): Italian product names, brands, package sizes and per-100 g nutrition by barcode — useful for pack-size suggestions and for G.'s partner's macro curiosity. [V count; I for ODbL]
- Nutrition per 100 g for Italian foods: CREA food-composition tables (separate research track). [I]

---

## 4. What makes a shopping list genuinely good while standing in the supermarket

Synthesised from the apps above and the one explicit design discussion found (kitchenai issue #345); items marked [I] are design inference.

1. **Grouped by store section in walking order, per store.** Every strong product does this (Bring catalogue sections, AnyList per-store order, Listonic reorderable categories, Tandoor `SupermarketCategoryRelation.order`, Mealie per-list label order, Grocy product groups, Cooklang aisle config). Keep one default order and let the user drag once per store (Carrefour vs Coop vs Pam differ); remember manual re-categorisation (Listonic). [V/I]
2. **Aggregated, purchasable quantities with the "why".** Sum grams across the week (240 g + 160 g chicken → 400 g) *and* show the recipe references (Mealie `recipe_references`, Tandoor `list_recipe`), e.g. "pollo 400 g — Mar: pollo al limone, Gio: insalata". Without the why, partners delete things they think are stale. [V issue #345]
3. **Need vs buy.** Show both "serve 400 g" and "compra 1 vaschetta da ~500 g"; store typical pack sizes per food/store (Grocy `qu_id_purchase` + conversion; Open Food Facts quantities). Leftover grams can feed next week's plan. [I]
4. **Checked items sink but stay visible** ("in the cart" section), undo by tap; never re-sort the unchecked part while the user is mid-aisle. [V issue #345 / I]
5. **Offline-first with optimistic sync.** The store is a signal dead-zone (Paprika is local-first; Listonic and KitchenOwl advertise offline; Grocy explicitly has none). Local IndexedDB + background sync; conflicts resolved per item (last-writer-wins is fine). [V/I]
6. **One-thumb ergonomics**: big tap targets (≥44 px), check by tapping the whole row, no swipe-to-check (accidental), search-to-add with type-ahead over the household's item catalogue (Mealie v3.29, KitchenOwl `support` ranking, Bring catalogue). [I]
7. **Pantry/on-hand exclusion and delay**: Tandoor `onhand_users`/`ignore_shopping`/`delay_until`, Grocy stock fulfilment, KitchenOwl pantry — olive oil, salt and spices should never appear unless running low. [V]
8. **Free-text extras and non-food items** live on the same list (Bring/Listonic); a "staples" quick-add list (Plan to Eat). [S]
9. **Split by store when prices differ**: with store price estimates, the list should be viewable "all at Carrefour" or "best split", each with its own section order. PlanMyMeals' hook is exactly this comparison. [I]
10. **Shareable with a partner in real time**, and the plain-text export fallback (Tandoor → Keep; Mealie → Bring action) for people who refuse another app. [V]

---

## 5. Open-source data models worth copying

- **Tandoor**: `Food` tree with `supermarket_category`, `ignore_shopping`, `onhand_users`, `substitute`, `preferred_shopping_unit`, `open_data_slug`, `fdc_id`; `Unit` + `UnitConversion(base_amount, base_unit, converted_amount, converted_unit, food?)`; `Ingredient(food, unit, amount, note, is_header, no_amount, original_text, order)`; `Supermarket` ⇄ `SupermarketCategory` through `SupermarketCategoryRelation(order)`; `ShoppingListEntry(food, unit, amount, checked, delay_until, list_recipe)` + `ShoppingListRecipe(servings, mealplan)`; `MealType(order, time, color)`; `PropertyType.category = PRICE`; user shopping flags (`mealplan_autoadd_shopping`, `mealplan_autoexclude_onhand`, `filter_to_supermarket`, `default_delay`). This is the most complete model for "plan → list sorted by my supermarket". [V]
- **Mealie**: `IngredientUnit(abbreviation, fraction, aliases, standard_quantity/standard_unit)`, `IngredientFood(label, aliases, substitutions, households_with_ingredient_food)`, `ShoppingListItem.recipe_references[{recipe_id, recipe_quantity, recipe_scale}]`, per-list `ShoppingListMultiPurposeLabel.position`, Group/Household split, planner rules. [V]
- **Grocy**: per-product `qu_id_purchase` vs `qu_id_stock` with conversion factors, `product_group`, `min_stock_amount`, `shopping_location_id` — the pack-size/stock-unit distinction is exactly "need vs buy". [V]
- **KitchenOwl**: `Category.ordering` + `Item.ordering` per household, `Item.support` for suggestions, `Recipe.visibility` enum, `RecipeItems.optional`. Simple and good for a 2-person household; but no structured amounts. [V]
- **Cooklang** aisle config (`[section]` + `item|synonym` lines) as the human-editable form of the per-store ordering table; recipe-scrapers `IngredientGroup(purpose, ingredients)` for sectioned ingredient lists. [V]

---

## 6. Recommendations for our app (Sanremo, grams-based diet schema)

1. **Do not build on Mealie/Tandoor as the backend.** They are mature but recipe-centric and AGPL; neither has slot-based scaling (fixed grams of carb/protein/fat per meal), nor price comparison. Build our own, but copy the Tandoor/Mealie models above almost verbatim (Food, Unit, UnitConversion-per-food, Supermarket/Category order, ShoppingListEntry with recipe references, Household).
2. **Canonical quantity = grams** (diet schema is in grams); every `Food` gets `macro_role ∈ {carb, protein, fat, veg, free}` and per-100 g macros; `Recipe` ingredients are "slots" (e.g. `carb_slot: pasta`, `protein_slot: pollo`) so a recipe is scaled slot-wise to G.'s grams, while her partner's portion is the same dish × a multiplier. Piece→gram conversions (uovo, fetta, cucchiaio) live in `UnitConversion(food=…)`.
3. **Import pipeline**: user pastes URL → fetch HTML server-side → JSON-LD Recipe extraction (or recipe-scrapers in a small Python worker for the 10 Italian sites with dedicated scrapers) → ingredient lines through `parse-ingredient` with an Italian UOM table (or a TS port of Tandoor's position parser) → low-confidence lines to an LLM with structured output → user confirms the Food/Unit mapping (Mealie's one-at-a-time flow). Photo import (dietitian's printed schema, cookbooks) = vision LLM, same as Mealie/Tandoor.
4. **Shopping list**: offline-first PWA (IndexedDB + background sync), grouped by per-store section order with drag-to-reorder once per store, aggregated grams + suggested pack ("compra 1×500 g"), recipe references per line, checked-items sink, pantry exclusion (`on_hand`), `delay_until`, free-text extras, share with partner, plain-text export and (optional) Bring! push through the unofficial API or Bring's JSON-LD deeplink if we expose public recipe pages.
5. **Keep Cooklang-style aisle config and Tandoor-style Open Data in mind for seed data**: ship a seed JSON of ~300 Italian foods with macro role, per-100 g macros, default section, typical pack sizes per supermarket; let users correct it (Listonic's "remember my change").
6. **Datasets**: do not ingest RecipeNLG/Food.com; seed with our own recipes + Zenodo CC BY Italian dataset only for ingredient-name/section vocabulary, not for prose; use Open Food Facts for pack sizes.
