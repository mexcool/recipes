# PlanMyMeals (Portugal) — deep-dive for the Sanremo meal-planner project

Research date: 4 November 2026.

## 0. Evidence quality / method caveat

Direct page fetches were blocked by this session's egress policy (HTTP 403 CONNECT for `planmymeals.ai`, `apps.apple.com`, `play.google.com`, `tek.sapo.pt`, `4gnews.pt`, `postal.pt`, `pcguia.pt`, `jn.pt`, `sabado.pt`, `thenextbigidea.pt`). Everything below therefore comes from search-engine result summaries that quote the pages (marked **[SNIPPET]** = verbatim text surfaced from the named page; reliable but not opened by me), plus my own **[INFERENCE]**. Nothing here is "I opened the page". Where sources disagree, both versions are given.

Namesake traps (NOT the same product): `planmymeal.ai` (US web tool, $8.25/mo), `planmymeals.co` (US), `planmymeals.co.za` (South Africa, R149/mo), `planmymeals.ch`, App Store id6737757727 "PlanMyMeals" by Raihan Rizqullah (Singapore), GitHub repos named PlanMyMeals. Only the Portuguese app is covered here.

## 1. Identity, listings, legal entity

| Item | Value | Evidence |
|---|---|---|
| Product name | PlanMyMeals; store title "PlanMyMeals: Ementa Semanal" (PT App Store); "PlanMyMeals: Meal Planner" in an Appfigures chart | [SNIPPET] App Store, Appfigures |
| Website | https://www.planmymeals.ai/ (EN), https://planmymeals.ai/pt (PT); `planmymeals.pt` also resolves with title "PlanMyMeals.app" (alias/redirect, unconfirmed) | search results |
| iOS | https://apps.apple.com/pt/app/planmymeals-ementa-semanal/id6803866194 — iPhone only, free + in-app purchases | [SNIPPET] |
| Android | Google Play, package `com.felllabs.planmymeals` (from the site's structured data / Softonic). Softonic lists developer "Fell St Labs", version 1.12, "Latest update November 1, 2026". Relationship between "Fell (St) Labs" and the Portuguese entity is unconfirmed; likely just the Play developer-account name | [SNIPPET] Softonic; [INFERENCE] |
| Legal entity / seller | LUCAS VICENTE, UNIPESSOAL LDA (single-member Lda, Lisbon address on the App Store listing) | [SNIPPET] App Store, site JSON-LD |
| Languages | European Portuguese and English | [SNIPPET] Postal |
| Ratings (small base) | App Store 4.8★ / 21 ratings (one snapshot); site says "copied from the stores on 31 October 2026": App Store 4.9★ / 30 ratings, Google Play 5.0★ / 9 ratings | [SNIPPET] |
| Versions | App Store shows 1.11, 1.12, 1.13 (1.13 released ~early Nov 2026) | [SNIPPET] |

## 2. Founders

- **Duarte Cruz** — computer engineer. Built the first version for his own household ("to organise meals with his girlfriend", The Next Big Idea 19 Oct 2026). Tek (8 Oct 2026): "works at TryHackMe, a cybersecurity company, mainly in product and growth areas" → matches the "Growth Engineer at TryHackMe" description in the brief (exact title not confirmed by Tek). Quote (Tek): "Nenhuma das aplicações que experimentámos fazia tudo aquilo de que precisávamos. Como sou engenheiro, comecei por construir uma solução para nós." Sábado (31 Oct) misprints him as "Duarte Carvalho". A GitHub user `DuarteCruz6` (IST Lisbon, "Ex @Nmbrs") exists but is not confirmed to be him.
- **Lucas Vicente** — computer engineer; Tek: currently at a fintech, previously Bounce, Ryanair and Volkswagen Digital Solutions. Owner of the legal entity. LinkedIn (from the site's structured data): https://www.linkedin.com/in/lucas-dh-vicente/. A ZoomInfo record (Senior SWE at Plan A Technologies → Reply → Bounce) may be the same person (unconfirmed).
- Sábado: "two friends who had worked together before". Tek: Duarte showed the app to friends, they asked for it, Lucas joined for the "produtização" (productisation) and the App Store release.
- Anomaly: search summaries attribute a LinkedIn post ("Lucas Vicente and I built it in the evenings and on weekends, around our full-time jobs... #1 most-installed app in Portugal... 22,000+ users, 39,000+ meals planned... €0 on marketing") to the profile page of **Franco Prontera** (CPO of Poppins, Belgium; ex-Country Director Too Good To Go BE). [INFERENCE] This is almost certainly Duarte Cruz's own post appearing in other people's LinkedIn activity feeds (the same text shows up on Pedro Pinheiro's and Diogo Castro's profile pages too). Treat Prontera as a resharer, not a founder. The "10k+ sign-ups/day" figure from the brief did **not** appear in any snippet; only "22,000+ users" and "39,000+ meals planned" did. With a 22k total, 10k/day is implausible unless it refers to a 2–3 day spike after hitting #1.

## 3. Timeline (all 2026)

- Pre-Aug: personal "app rascunho" for Duarte's household.
- 2–8 Aug: date of the example week used for the pricing demo on the homepage (32-item basket) → app was in real use by August.
- **September: App Store launch** (Postal, Tek). iOS-only, Swift.
- 8 Oct: Tek feature ("nasceu de uma necessidade pessoal e transformou-se num negócio"): iOS only, Android "próximo passo, ainda sem data"; a native Kotlin + Compose base already existed.
- 11 Oct: Tek weekly apps roundup.
- 14 Oct: 4gnews — "chegou agora também ao Android (Google Play)".
- 16 Oct: PCGuia "App do dia".
- 19 Oct: The Next Big Idea — "Fartos de decidir o jantar, dois engenheiros criaram uma app de refeições. Hoje, já está em 3.500 casas".
- 31 Oct: Sábado — ">3,500 users".
- 1 Nov: Jornal de Notícias; Softonic Android update (v1.12). 2 Nov: Postal.
- ~3 Nov: LinkedIn post — #1 most-installed app in Portugal (App Store + Google Play), 22,000+ users, 39,000+ meals planned, €0 marketing. Appfigures "Top Overall / Free, iPhone, Portugal" snapshot shows "PlanMyMeals: Meal Planner" at #1 ahead of "Claude by Anthropic" (snapshot undated).
- ~early Nov: iOS 1.13.

So: 3,500 households (19–31 Oct) → 22,000 users (~3 Nov). [INFERENCE] The jump is the press wave (JN + Postal + Sábado in 72 h) plus App Store chart feedback loop, not product virality in the TikTok sense. No Reddit / Product Hunt / podcast / TV coverage found.

## 4. Feature set (consolidated)

**Household**
- Create a household; invite members; one subscription covers the household; adjust "how many are eating at each meal"; guests without an account are free; "native iPhone guest form with allergy and ingredient preferences".
- Pro: per-person meal assignment ("who eats each meal"), portions per person, **protein goals per person**. No carb/fat/calorie targets found anywhere → no real macro/diet-schema support.

**Weekly plan**
- Plans "lunches, dinners and batch-cooked meals" for the week; inputs per press: number of people, dietary preferences/restrictions, available cooking time, budget. Site (PT): "Utilizamos algoritmos inteligentes que consideram suas preferências alimentares, restrições e histórico de refeições". Takes pantry and leftovers into account.
- Swap a meal; "AI ideas when you swap a meal" is Pro-only; 1.13 notes mention "more reliable swaps for batch-cooked meals". One user review: asked to swap a menu for another protein and the plan adjusted.
- Plus: longer plans (14 days, monthly, custom dates), plan history, copy a past week. Free: 4 new weeks per month.

**Recipes**
- Full recipe library on free; "community" discovery with "Add to collection"; collections; share recipes; community recipe review + notifications (1.12/1.13 notes).
- Import from TikTok, Instagram Reels, videos, websites, screenshots/photos: share link → app extracts → user reviews ingredients and steps → saved ("a receita fica guardada se saíres da app a meio"). Imported recipes "são convertidas para uma estrutura comum" so they immediately feed the plan, dose calculation and shopping list. Free: 1 import/week; Plus/Pro unlimited. "Create recipes with AI" is Pro.

**Shopping list**
- Generated from the plan, quantities scaled to diners, pantry items subtracted ("identificar apenas os ingredientes em falta"), shared with the household.

**Price comparison**
- Chains: Continente, Pingo Doce, Lidl, Auchan (site, 4gnews, Postal). JN/PCGuia/Next Big Idea mention only Continente, Pingo Doce, Auchan, and the homepage demo basket has no Lidl total → [INFERENCE] Lidl coverage is partial/newer.
- Free: prices from 1 supermarket. Plus: list priced at every supermarket, cheapest store, cheaper product choices, "spend-less swaps", offers at each store, "ways to get back under budget". Pro: split the list across supermarkets, "order online", spending history.
- Demo on homepage: 32-item basket, 2–8 Aug plan: Pingo Doce €192.21, Continente €205.88, Auchan €234.73 (spread €42.52). Disclaimer: "totals use available store prices and estimates where an item has no matched price; prices, promotions and availability vary by store and date; the final checkout price may differ".

## 5. How they obtain prices

- Tek [SNIPPET]: "Os preços dos catálogos públicos dos supermercados são normalizados, associados aos respectivos ingredientes e guardados com a origem e a data de observação." Duarte: "Uma das partes mais exigentes foi reunir informação proveniente de fontes muito diferentes num único sistema."
- No partnership, API or data-provider statement anywhere. [INFERENCE] They scrape the chains' public online catalogues, keep a normalized product table with `source`, `observed_at`, map products → canonical ingredients, and compute basket totals with a fallback estimate when a match is missing.
- Online-shop landscape in Portugal (what makes this feasible):
  - **Continente** (continente.pt): mature nationwide e-commerce; catalogue on Salesforce Commerce Cloud/Demandware (`dw/image` paths in scraper samples); strikethrough promo prices parsable.
  - **Auchan** (auchan.pt): online shop with delivery/click-and-collect; product microdata.
  - **Pingo Doce** (pingodoce.pt): own online shop since May 2025 (left the Mercadão marketplace; Lisbon/Porto delivery first, click-and-collect nationally); product microdata.
  - **Lidl** (lidl.pt): **no food e-commerce**; online shop announced for 2027, non-food only. lidl.pt does publish product/promo pages and weekly folhetos with prices → scrapeable but incomplete; explains the missing Lidl total in the demo.
- Ecosystem evidence that scraping these sites is routine: Apify actors for Continente/Pingo Doce/Auchan (trovevault, plastic_bisque, studio-amba); open-source `jlfernandes22/PriceScoutPT` (Python, Continente/Pingo Doce/Auchan/Lidl/Aldi, daily GitHub Actions → PostgreSQL; full Continente run ≈30 min over 16 categories) and `tiagoisaelguerreiro/mercadosportugues` (TypeScript, 7 chains, daily); consumer comparators supersave.pt, oprecocerto.pt (39+ retailers), radarsuper.com, bourmet.pt/ingredientes.

## 6. Monetization

- Free: household up to 2 accounts, 4 new weeks/month, 1 recipe import/week, prices from 1 supermarket, all recipes, "limits on AI tools".
- Plus: site says €6.99/mo or €49.99/yr (≈€4.17/mo), up to 6 accounts. App Store IAP list is size-tiered: Plus individual €6.99/mo–€49.99/yr; 2 people €6.99/mo–€69.99/yr; 4 people €9.99/mo–€99.99/yr; 6 people €12.99/mo–€129.99/yr. Tek calls this "Casa Plus".
- Pro: €14.99/mo or €99.99/yr (≈€8.33/mo).
- Auto-renewing via App Store/Google Play; one subscription per household; guests free.

## 7. Tech-stack signals

- iOS: native Swift, "backend próprio" (Tek). Android: native Kotlin + Jetpack Compose (Tek), shipped mid-Oct 2026. No cross-platform framework.
- Website: could not be fetched; has JSON-LD with founders/legal entity/app IDs and programmatic SEO recipe pages (e.g. `/brazilian-recipes/chicken-with-okra`), an "In the press" section (5 EN / 6 PT items) and a press kit.
- Billing through store IAP; no web checkout found.
- AI: used for recipe extraction from video/screenshots/links (vision + LLM, inferred), AI swap ideas (Pro), AI recipe creation (Pro). Plan generation is described as "algoritmos inteligentes" over preferences/restrictions/history → [INFERENCE] deterministic/heuristic planner over a recipe DB, LLM only on the edges; free-tier "AI limits" confirm per-call cost control.
- No GitHub org, job posts or engineering blog found.

## 8. What users say

- Very few public reviews (≈30 iOS, 9 Android). Site shows a curated feed ("We show the 4- and 5-star reviews and leave out those by the founders and people close to them"). Praise: weekly menu ideas, ease of use, swap-by-protein worked. No negative reviews, Reddit threads or forum complaints found. Softonic's 4.2 is its own editorial rating.

## 9. Onboarding and main flow (reconstructed from sources; sequence is [INFERENCE])

1. Install → account → create household → invite members (2 free) → household profile: number of people, dietary preferences/restrictions, allergies, cooking time, budget, preferred supermarket (free picks one).
2. Plan the week: pick which meals (lunch/dinner/batch); app proposes a plan from its recipe DB + your collections/history; adjust diners per meal, add guests (guest form with allergies), swap meals.
3. Recipes tab: browse community/all recipes, collections, import from link/photo → review → save.
4. Shopping list: auto-generated, scaled, pantry subtracted, shared; priced at the chosen store; (Plus) compare stores, pick cheapest, cheaper-product swaps, see offers; (Pro) split across stores / order online.
5. Cook from recipe view with per-person portions; leftovers/batch flow back into the plan.

## 10. Recommendations for our app

1. **Copy the data model, not the product**: household → members (+guests) → weekly plan → meal slots with diner count → recipes normalized to a common schema → shopping list → store-price overlay with `source`, `observed_at`, `is_estimate`. This is exactly what PlanMyMeals describes and it is the right skeleton.
2. **Differentiate on the "schema a grammature"**: PlanMyMeals only offers protein goals per person on a €14.99 tier; nobody in this niche solves "fixed grams of carb/protein/fat source + free vegetables". Model recipes as templates with typed slots (CARB, PROTEIN, FAT, VEG_FREE, flavour extras) and a scaler that resolves each slot to G.'s prescribed grams (with an equivalence table: 80 g pasta ≡ 100 g bread ≡ 240 g potatoes etc.). Her partner's portions scale freely. That is a deterministic solver, no LLM needed.
3. **Variety engine**: generate the week by sampling slot fillers (cuisine, cooking method, protein type) with constraints (no repeats within N days, pantry reuse, max cook time). Use an LLM only to (a) extract recipes from links/photos into the schema and (b) suggest swaps/"turn these two recipes into something new" — gate these behind a daily cap as PlanMyMeals does.
4. **Prices**: same approach as PlanMyMeals — scrape public online catalogues, normalize, map to canonical ingredients, store observation dates, flag estimates. For Sanremo the targets are Carrefour (carrefour.it e-commerce), Coop (Coop Liguria via easycoop.com / coopshop) and Pam (Pam a Casa / pampanorama.it); verify each has an online catalogue with prices before promising comparison. Ship with one chain first (Carrefour) exactly as PlanMyMeals' free tier does.
5. **Mobile-first PWA**: PlanMyMeals went native Swift first and then had to rebuild in Kotlin; a PWA (Next.js/SvelteKit + Postgres, share-target API for "share a TikTok link to the app") avoids that for a two-person household.
6. **Keep the generous free loop**: plan → list → one store price is the hook; everything else is nice-to-have for a 2-person household.

## Sources (as surfaced by search; not opened directly)

- https://www.planmymeals.ai/ and https://planmymeals.ai/pt
- https://apps.apple.com/pt/app/planmymeals-ementa-semanal/id6803866194
- https://planmymeals-meal-planner.en.softonic.com/android
- https://tek.sapo.pt/mobile/apps/artigos/planmymeals-aplicacao-portuguesa-nasceu-de-uma-necessidade-pessoal-e-transformou-se-num-negocio/ (8 Oct 2026)
- https://tek.sapo.pt/mobile/apps/artigos/do-futebol-feminino-aos-quebra-cabecas-quatro-apps-para-renovar-o-smartphone-esta-semana/ (11 Oct 2026)
- https://4gnews.pt/esta-app-portuguesa-planeia-as-refeicoes-e-diz-quanto-vais-gastar-no-supermercado/ (14 Oct 2026)
- https://www.pcguia.pt/2026/10/app-do-dia-planmymeals-ementa-semanal/ (16 Oct 2026)
- https://thenextbigidea.pt/ (19 Oct 2026 item)
- https://www.sabado.pt/vida/detalhe/sem-vontade-de-planear-refeicoes-ou-fazer-a-lista-de-compras-esta-aplicacao-ajuda-com-isso-e-muito-mais (31 Oct 2026)
- https://www.jn.pt/nacional/artigo/ha-uma-aplicacao-criada-por-portugueses-para-poupar-no-supermercado/18143426 (1 Nov 2026)
- https://postal.pt/nacional/nova-aplicacao-desenvolvida-por-portugueses-ajuda-a-organizar-as-refeicoes-da-semana-e-compara-precos-entre-supermercados/ (2 Nov 2026)
- https://app.appfigures.com/top-apps/ios-app-store/portugal/iphone/top-overall
- https://www.linkedin.com/in/lucas-dh-vicente/ ; https://www.linkedin.com/in/franco-prontera/ (post reshare)
- https://careers.tryhackme.com/jobs/6527370-growth-engineer
- https://eco.sapo.pt/2025/05/14/pingo-doce-comeca-a-vender-online-e-larga-mercadao/
- https://echoboomer.pt/oficial-lidl-tera-loja-online-portugal-2027/ ; https://www.nit.pt/comida/gourmet-e-vinhos/lidl-vai-chegar-300-lojas-e-vai-criar-uma-loja-online-com-produtos-nao-alimentares
- https://github.com/jlfernandes22/PriceScoutPT ; https://github.com/tiagoisaelguerreiro/mercadosportugues
- https://apify.com/trovevault/portugal-supermarket-prices ; https://apify.com/plastic_bisque/continente-portugal-scraper
- https://supersave.pt/ ; https://oprecocerto.pt/ ; https://radarsuper.com/pt/lidl ; https://bourmet.pt/ingredientes
