# Nutrition data sources for Italian ingredients and products (research, 2026-11-04)

Method note: the session's egress proxy blocked every direct page fetch (403), so "VERIFIED" means confirmed through search-engine snippets quoting the named page, not by opening it. Re-read licence pages once before shipping.

## 1. Source by source

### CREA, Tabelle di Composizione degli Alimenti (alimentinutrizione.it)
- VERIFIED: 2019 update ("eTCA"): 900 foods, 20 categories, 120 nutrients, Italian names with English equivalents; online search only. No official CSV/Excel/API. Unofficial only: a ~3-year-old Kaggle scrape (`andreal2000/crea-food-composition-tables`) and paid Excel resellers.
- VERIFIED licence wording (no Creative Commons): "per usi scientifici, educativi o commerciali si chiede di rispettare i diritti di proprietà intellettuale e riportare la fonte originale"; "i dati non possono essere copiati o in altro modo riprodotti o trasmessi in qualsiasi forma e con qualsiasi mezzo senza una chiara indicazione della fonte originale". Citation: "CREA Centro di ricerca Alimenti e Nutrizione, Tabelle di composizione degli alimenti, Aggiornamento 2019" + URL.
- VERIFIED cooked entries with own codes: Pasta di semola cotta bollita (000805: 175 kcal, 54.3 g water/100 g), pasta integrale cotta (000855), riso brillato/parboiled/basmati/Venere/integrale cotto (000105/000125/000135/000145/000115), orzo perlato cotto (000095), ceci secchi cotti (004005), plus "piatti composti" recipes (PC0009 Risotto alla parmigiana, yield 0.72; PC0022 Gnocchi al sugo).
- VERIFIED yield table at https://www.alimentinutrizione.it/presentazione-dati (Yield Factor = peso cotto / peso crudo, boiled): pasta di semola lunga ~2.1, corta ~1.9, pasta all'uovo secca ~3.0, fresca ~1.4, riso basmati ~3.0, brillato ~2.6, parboiled ~2.4, Venere ~2.1, polenta precotta ~4.9. Exactly the raw-to-cooked data the diet needs, in Italian.
- INFERENCE: the EU/Italian sui generis database right (Dir. 96/9/EC; L. 633/1941 art. 102-bis) covers "substantial" extraction. Hand-curating ~150 values with attribution is low risk; re-shipping the 900-row scrape is not clearly permitted.

### IEO, Banca Dati di Composizione degli Alimenti (bda.ieo.it)
- VERIFIED: version 1.2022; ~1,109 foods in 17 groups; citation "Gnagnarella, Salvini, Parpinel, BDA 1.2022".
- VERIFIED terms: free online consultation; full Excel only after a donation to Fondazione IEO-MONZINO ETS (minimum EUR 50 for personal/research/non-commercial; other uses priced case by case; signed request form). "Data cannot be employed for commercial use without written authorization by the BDA Group"; attribution always required; "protected under Italian database law".
- INFERENCE: not shippable without a written agreement; cross-check source only.

### Open Food Facts (OFF)
- VERIFIED: ~4 M products worldwide (2025); it.openfoodfacts.org shows ~271,900 products (INFERENCE: products sold in Italy). Branded products only, label macros per 100 g; no generic raw ingredients, no yield factors.
- VERIFIED licence: data ODbL, images CC BY-SA. Attribution on every screen showing OFF data, in the store listing and the legal page; share back modified or mixed data; "combining Open Food Facts data with other databases means the result must also be released as open data". Custom User-Agent "AppName/Version (email)" mandatory. Limits: 100 req/min product reads, 10 req/min search, HTTP 503 when exceeded, applied per end user when calls come from users' devices. API v2 search is filter-only; full text needs /cgi/search.pl.
- VERIFIED bulk: JSONL.gz, CSV.gz (~0.9 GB compressed, ~9 GB raw), MongoDB dump, Parquet on Hugging Face (`openfoodfacts/product-database`), nightly deltas. Quality is crowdsourced; use per-product `completeness` (0-1) and `data_quality_*` tags (~1.7 M products worldwide lack nutrition data).
- VERIFIED related: Open Prices (prices.openfoodfacts.org), ODbL, >100k prices in its first year, daily Parquet export; Italian coverage unknown. Relevant to the Carrefour/Coop/Pam cost feature.

### USDA FoodData Central (FDC)
- VERIFIED: public domain, CC0 1.0; attribution requested, not required. API key from api.data.gov, 1,000 req/hour per IP. Full datasets downloadable as CSV/JSON; releases April and October. Types: Foundation, SR Legacy (frozen 2018, most raw/cooked pairs), FNDDS, Branded (US labels), Experimental.
- VERIFIED raw/cooked pairs, e.g. SR Legacy 169736 "Pasta, dry, enriched" (371 kcal/100 g) vs 169737 "Pasta, cooked, enriched, without added salt". English only; US products differ from Italian ones.
- VERIFIED yields: "USDA Table of Cooking Yields for Meat and Poultry, Release 2 (2014)", PDF + CSV, DOI 10.15482/USDA.ADC/1409031, public domain: best free source for meat shrinkage by cut and method.

### EuroFIR
- VERIFIED: FoodEXplorer federates ~36-40 national databases (CREA contributes). Access via membership (2023 document: ~EUR 1,000-3,000/year, +10% from 2024) or pay-per-view (1 week to 3 months, "limited downloads", prices unpublished). Bognár 2002 "Tables on weight yield of food and retention factors" (BFE-R-02-03, publikationen.bibliothek.kit.edu/9642002/1928) is the EuroFIR-recommended yield reference and freely readable.
- INFERENCE: no redistribution path for a consumer app; developer lookup only.

### Commercial APIs
- Edamam Food Database. VERIFIED: Basic $14/mo 100k calls, Core $69/mo, Plus $299/mo; free "Minimum Service" plan "very limited"; "Powered by Edamam" attribution; only human end-user-driven requests, caching only where a paid plan allows. INFERENCE: English only.
- Nutritionix. VERIFIED: public free tier discontinued; Starter $499/mo, MVP $999/mo, billed annually. US/English. Not viable.
- FatSecret Platform. VERIFIED: Basic free, US dataset only, attribution badge mandatory; Premier (quote) unlocks 56 country datasets including region IT with Italian default language, white-label. INFERENCE: the only API with Italian-language generic foods, but paywalled and not storable.
- Spoonacular. VERIFIED (official page, old): Free 50 points/day; Cook $29 1,500 pts/day; Culinarian $79; Chef $149; 1 point per request + 0.01 per result (secondary sources claim 150/day). English only.

### SINU LARN, Standard quantitativi delle porzioni (2024, V revisione)
- VERIFIED PDF: https://sinu.it/wp-content/uploads/2025/01/Standard-Quantitativi-delle-Porzioni.pdf. Portions are raw, net of waste: pasta/riso/cereali 80 g (pasta fresca 100, ripiena 125); pane 50; carne 100; salumi 50; pesce 150; uova 50; legumi secchi 50 / freschi-in scatola 150; verdure 200, insalata 80; frutta 150; olio 9 g (10 g in 2014); burro 10; latte 125 ml; yogurt 125; formaggio fresco 100 / stagionato 50.
- VERIFIED: the 2024 edition introduces raw-to-cooked weight changes for the first time (Tabella 3, yield factor per cooking method); secondary sources quote pasta corta x1.88 (80 to 150 g) and legumi secchi x2.70 (50 to 135 g).
- INFERENCE: copyrighted document; portion numbers are facts and can be encoded with citation; do not bundle the PDF.

### Swiss Food Composition Database (bonus)
- VERIFIED: XLS download at naehrwertdaten.ch/de/downloads/ (BLV), catalogued on opendata.swiss with licence "Non-commercial Allowed / Commercial Allowed / Reference Required"; names in IT/DE/FR/EN. INFERENCE: ~1,100 generic foods including cooked variants; the closest legally clean, Italian-named generic table.

## 2. Raw vs cooked: what the diet needs
Grammature are raw, net of waste (SINU convention). Per ingredient the app needs macros/100 g raw, edible part (CREA and Swiss give it), a raw-to-cooked yield factor with method (CREA for cereals, SINU Tabella 3, USDA meat yields, Bognár for the rest) and reverse factors for foods bought cooked or canned (legumi sgocciolati ~3x dry weight per SINU 150 vs 50 g). Nutrient retention can be ignored for macros; absorbed oil is charged as the fat-source item.

## 3. Recommended layered strategy
1. Core curated table (~150 ingredients, shipped in-app, hand-built): Italian name + synonyms, diet class (carboidrati / proteine / grassi / verdura libera), macros/100 g raw, edible part, yield factor + method, default SINU portion, source note. Values from CREA with "Fonte: CREA 2019" citation, cross-checked against Swiss FCDB and USDA. USDA (CC0) and Swiss (attribution) values are redistributable outright; CREA values used selectively with attribution.
2. Long-tail generic foods (optional, offline): Swiss FCDB XLS + USDA SR Legacy/Foundation; use Swiss Italian names for matching.
3. Branded products: OFF by barcode via API (User-Agent, per-user limits) or a filtered Italian subset of the Parquet dump. Keep OFF data in a separate store with its own attribution screen; never merge it into the core table, so ODbL share-alike does not attach to the curated database. Open Prices for crowd prices.
4. Not shipped: BDA IEO, EuroFIR, Nutritionix; Edamam/FatSecret/Spoonacular only if English-only or paid Italian data becomes acceptable.

## Key findings
- CREA 2019 (900 foods, 120 nutrients, Italian names) is online-only with no official download or API; reuse is "allowed with source citation" but there is no explicit open licence.
- CREA already publishes the raw-to-cooked yield factors the diet needs (pasta corta ~1.9, lunga ~2.1, riso brillato ~2.6, basmati ~3.0) plus cooked entries for pasta, rice, barley and legumes.
- BDA IEO (1.2022, ~1,109 foods) requires a donation for the Excel and written authorization for any commercial use, so it cannot be shipped.
- USDA FoodData Central is CC0, bulk-downloadable, has raw/cooked pairs and a public-domain meat cooking-yield table, but is English-only and US-product-based.
- Open Food Facts covers ~270k Italian-market branded products under ODbL; it needs per-screen attribution, a custom User-Agent, 100/10 req/min limits, and isolation from the curated table to avoid share-alike contamination.
- The Swiss Food Composition Database is downloadable as XLS under an attribution licence allowing commercial use and carries Italian names: the cleanest redistributable generic table.
- SINU LARN 2024 gives raw, net-of-waste standard portions (pasta 80 g, carne 100 g, pesce 150 g, olio 9 g, verdure 200 g) and, for the first time, raw-to-cooked factors (Tabella 3).
- Nutritionix has no free tier ($499/mo+); Edamam starts at $14/mo; Spoonacular free is 50 points/day; all English-only. FatSecret alone has Italian generic data (region IT) but only on quote-priced Premier.
- Recommended: hand-curated ~150-ingredient core table with yields and SINU portions; Swiss+USDA for the long tail; OFF (isolated) for barcodes; Open Prices for prices; EuroFIR (membership or pay-per-view only) not shipped.

## Load-bearing claims
- CREA: reuse allowed with source citation, no CC licence, no official bulk download | https://www.alimentinutrizione.it/sezioni/tabelle-nutrizionali | medium (snippet only)
- CREA publishes a cooking yield-factor table for pasta and rice | https://www.alimentinutrizione.it/presentazione-dati | medium
- BDA IEO: commercial use needs written authorization; Excel only after donation (min EUR 50 non-commercial) | https://bda.ieo.it/?page_id=51&lang=en | high
- USDA FDC is CC0 with bulk CSV/JSON downloads and a 1,000 req/h API | https://fdc.nal.usda.gov/download-datasets/ | high
- USDA meat and poultry cooking yields (Release 2, 2014) are public-domain PDF+CSV | https://catalog.data.gov/dataset/usda-table-of-cooking-yields-for-meat-and-poultry | high
- OFF is ODbL: per-screen attribution, combined databases become open data, User-Agent mandatory, 100/10 req/min | https://wiki.openfoodfacts.org/ODBL_License | high
- OFF bulk exports exist (JSONL, CSV, MongoDB, Parquet) | https://it.openfoodfacts.org/data | high
- Swiss FCDB XLS is "commercial allowed, reference required" and has Italian names | https://ckan.opendata.swiss/it/dataset/naehrwerte_lebensmittel | medium (terms page not opened)
- SINU 2024 portions are raw net of waste; PDF includes Tabella 3 raw-to-cooked factors | https://sinu.it/wp-content/uploads/2025/01/Standard-Quantitativi-delle-Porzioni.pdf | medium (factor values via secondary sources)
- FatSecret: Basic free US-only with attribution; Italian dataset (region IT) only on Premier | https://platform.fatsecret.com/docs/guides/localization | high
- Nutritionix: public free tier discontinued; paid from $499/mo | https://developer.nutritionix.com/ | high
- Edamam Food DB: paid from $14/mo, attribution required, caching restricted | https://developer.edamam.com/food-database-api | medium
- Spoonacular free plan 50 points/day (official) vs 150 (secondary) | https://spoonacular.com/food-api/pricing | medium
- EuroFIR access is membership or pay-per-view only | https://www.eurofir.org/why-join-eurofir-aisbl/pay-per-view | medium

## Open questions
- Does CREA's "cite the source" wording permit redistributing a curated subset inside a commercial app, and would ~150 hand-selected values be "substantial" under the database right? One email to CREA Alimenti e Nutrizione could settle it.
- Exact SINU Tabella 3 values for meat, fish, vegetables and legumes (only pasta 1.88 and legumi 2.70 surfaced); needs the PDF opened.
- Actual Italian coverage of Open Prices and whether Carrefour/Coop/Pam Sanremo stores appear.
- Does the naehrwertdaten.ch terms page add conditions beyond the opendata.swiss "by" licence?
- Does the Kaggle CREA scrape carry a licence, and is the 2019 data unchanged since?
- FatSecret Premier pricing and whether its IT dataset includes generic raw ingredients with cooked variants.
- Whether OFF's current API docs still state 100/10 req/min (figures come from the older doc site).
