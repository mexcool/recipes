# How Italian dietitians express "schemi a grammature" and a data model for scaling recipes to them

Research date: 2026-11-04. Scope: G.'s diet (fixed grams of carb/protein/fat source per meal, "verdure a volontà").

## 0. Method and verification status

- Web search worked; direct page fetch (WebFetch/curl) was **blocked by the session network policy** for every external host tried (sinu.it, granapadano.it, dallegrave.it, asfo.sanita.fvg.it, maurobasilico.it, buttalapasta.it, unamelaperdietista.it). The environment's network policy denied these hosts; they would need to be added under Allowed domains in the environment settings.
- Consequence: every number below comes from **search-engine snippets quoting the source page**, not from opening the page. I label them **VERIFIED-SNIPPET** (the number appeared verbatim in a snippet attributed to that URL) or **INFERENCE** (my reading). Nothing here was read from the full PDF. The engineer should treat all tables as "very probably right, re-check before shipping as defaults".

## 1. The four ways Italian practitioners write a diet

1. **Schema a grammature** (what G. has). Five slots per day: colazione, spuntino, pranzo, merenda, cena. Pranzo/cena are written as *primo* (carb source, g raw), *secondo* (protein source, g raw), *condimento* (olio EVO, g or cucchiai), *contorno* ("verdure a volontà / a piacere / libere"), optional *pane* (g) and *frutta* (g). Usually followed by an "elenco sostituzioni / alimenti equivalenti" page. Hospital "prontuari dietetici" (ARNAS Civico Palermo, ASP Lamezia, Padova) use the same grammar with raw weights: pasta 80 g, riso per risotto 80 g, pane 50 g, olio 10 g, pasta in brodo 30 g, lasagne 60 g sfoglia, gnocchi 200 g (VERIFIED-SNIPPET, Montedomini/ASL Firenze, ARNAS Civico).
2. **Dieta a porzioni** (LARN/SINU "porzioni standard" × weekly frequencies). Same reference portions, expressed as "N porzioni/settimana".
3. **Dieta a scambi / equivalenti** (diabetes; ADA exchange logic). Unit = fixed grams of a nutrient (ADA: 15 g CHO per starch exchange; Italian diabetology hand-outs: 10 g sugar per fruit "equivalente", 15 g CHO per "porzione-carb").
4. **Dieta a Zona** (blocchi: 1 blocco = 7 g protein + 9 g CHO + 3 g fat; a meal is N blocks of each).

Models 1-2 scale by **reference-food grams**; 3-4 scale by **macronutrient grams**. The data model must support both (section 7).

## 2. Reference portions (LARN/SINU V revision 2024, raw, edible part)

| Food | Standard portion | Status |
|---|---|---|
| Pasta, riso, farro, orzo (secchi) | 80 g | VERIFIED-SNIPPET (sinu.it, dica33) |
| Pasta fresca all'uovo | 100 g; pasta ripiena 125 g | VERIFIED-SNIPPET (dica33) |
| Pane | 50 g | VERIFIED-SNIPPET |
| Sostituti del pane, cereali colazione, biscotti | 30 g | VERIFIED-SNIPPET (dica33) |
| Patate e tuberi | 200 g | VERIFIED-SNIPPET |
| Legumi secchi / freschi-surgelati-in scatola | 50 g / 150 g | VERIFIED-SNIPPET |
| Carne rossa o bianca | 100 g | VERIFIED-SNIPPET |
| Salumi | 50 g | VERIFIED-SNIPPET |
| Pesce, molluschi, crostacei freschi / conservati | 150 g / 50 g | VERIFIED-SNIPPET |
| Uova | 50 g (1 uovo) | VERIFIED-SNIPPET |
| Latte / yogurt | 125 ml / 125 g | VERIFIED-SNIPPET |
| Formaggio fresco / stagionato | 100 g / 50 g | VERIFIED-SNIPPET (ATS Brescia, dica33) |
| Verdure e ortaggi (crudi o cotti) / insalata a foglia | 200 g / 80 g | VERIFIED-SNIPPET (ATS Brescia) |
| Frutta fresca / frutta disidratata | 150 g / 30 g | VERIFIED-SNIPPET |
| Olio / burro | 10 ml (1 cucchiaio) / 10 g | VERIFIED-SNIPPET |

SINU states weights are "a crudo, al netto degli scarti" (VERIFIED-SNIPPET, dica33 paraphrase of SINU).

## 3. Equivalence tables actually used in hand-outs

### 3a. Carb sources (primo / pane). Sources disagree by ±30%; the *basis* differs (traditional portion vs CHO content vs kcal).

| Source | Pasta/riso (dry) | Pane | Patate | Gnocchi | Pasta fresca | Basis |
|---|---|---|---|---|---|---|
| Grana Padano table | 20 / 30 / 40 g | 30 / 40 / 60 g | 80 / 120 / 150 g | (col.) | – | portion rows (VERIFIED-SNIPPET) |
| CIRFOOD "equivalenze glucidiche" | 25 / 30 / 40 g | 30 / 40 / 50 g | 90 / 120 / 150 g (patate *o legumi*) | – | – | CHO (VERIFIED-SNIPPET) |
| ADIMI diabetologia | 35 g (pasta cruda, farina, polenta, riso, corn flakes) | 50 g | – | – | – | CHO (VERIFIED-SNIPPET) |
| Dietitian blogs (Cellai, Santini, Oggionni, "Una mela per dietista") for **80 g pasta** | 80 g riso/farro/orzo/polenta (1:1) | 100-120 g (1:1.5) | 250-300 g (1:3-4) | 180-200 g | 100-110 g (Cellai) or 160 g (Santini, 1:2) | mixed (VERIFIED-SNIPPET) |
| Melarossa rules | – | pane:patate 1:3 (50 g = 150 g) | pasta:patate ≈1:4 (50 g = 210 g) | – | – | kcal (VERIFIED-SNIPPET) |
| ASFO (diabetes) "porzione 15 g CHO" | 60 g pasta (sic, likely cooked or per-list) | 30 g | – | – | – | 15 g CHO (VERIFIED-SNIPPET, ambiguous) |

Recommended defaults (INFERENCE, median of above, per 80 g dry pasta): riso/farro/orzo/cous cous/polenta istantanea 80 g; pane 110 g; patate 280 g; gnocchi 200 g; pasta fresca 110 g (non-egg 160 g); fette biscottate/cracker/grissini ≈ 30 g per 50 g pane (ratio 1.6:1, VERIFIED-SNIPPET, low-quality source). Pizza is **not** treated as an equivalent (dough alone 220-250 g ≈ 2.5-3 primi); dietitians call it *pasto libero* (VERIFIED-SNIPPET, Martinelli, Pepino).

### 3b. Protein sources (secondo), per 100 g meat

| Source | Pesce | Uova | Formaggio fresco | Formaggio stagionato | Legumi secchi | Legumi cotti/scatola | Salumi/tonno |
|---|---|---|---|---|---|---|---|
| ASL Firenze dietetica (Montedomini PDF) | 150 g | 2 | 100 g | 80 g | 50 g | 150 g | sgombro filetti 100 g | 
| Grana Padano | 130 g | 2 (120 g) | – | – | 50 g | 150 g | prosciutto 50 g, bresaola 70 g, soia secca 30 g |
| Dietista Stavolone | 100 g | 2 | 130 g | 50 g | 50 g | – | crostacei/molluschi 100 g |
| Cookist | – | – | 100-125 g | 50 g | – | 150 g | tonno sgocciolato 50 g, bresaola/crudo sgrassato 50 g |
| Melarossa | carne:pesce 1:1 (120 g tacchino = 120 g merluzzo); max 2 uova | | | | | | |

All VERIFIED-SNIPPET. Spread: pesce 100-150 g, formaggio stagionato 50-80 g. Default (INFERENCE): pesce magro 1.3-1.5×, pesce grasso 1.0×, 2 uova, fresco 1.0-1.2×, stagionato 0.5×, legumi secchi 0.5×, legumi cotti 1.5×, salumi/tonno sgocciolato 0.5×. Hand-outs also give **weekly frequencies** (e.g., Starbene/Lertola: pesce 150 g F / 200 g M ×3, legumi secchi 60-80 g, formaggi freschi ×2, stagionati ×1; ASL Firenze: carne ×6, pesce ×2, uova 2, legumi ×1 — VERIFIED-SNIPPET).

### 3c. Fruit (per 150 g mela): banana/uva/cachi/fichi 100 g, fragole 200 g, cocomero 350 g (Grana Padano, VERIFIED-SNIPPET). ADIMI (10 g sugar basis): banana/uva/cachi/fichi 80 g; mela/pera/ananas/prugne 100 g; fragole/melone/anguria/pompelmo 160 g (VERIFIED-SNIPPET).

### 3d. Macro-unit systems (for mode 2 of the model)
- Zona: 1 blocco = 7 g P / 9 g CHO / 3 g F; carb-block examples 12 g pasta, 13 g pane, 50 g patate, 200 g pomodori, 330 g carote; 3-block meal = 21 P / 27 CHO / 4.5 F (sic, as published) — VERIFIED-SNIPPET (my-personaltrainer, abodybuilding).
- ADA exchange: starch 15 CHO/3 P/80 kcal; meat 7 g P (fat varies by grade); fat 5 g/45 kcal; vegetable 5 CHO/2 P/25 kcal; fruit 15 CHO/60 kcal; milk 12 CHO/8 P — VERIFIED-SNIPPET (MTSU Pressbooks appendix).

## 4. Raw vs cooked, waste, oil

- Convention: **all grams are raw ("a crudo"), edible part**, unless the schema says "cotto". If the schema just says "pasta 80 g", every source says it means raw (VERIFIED-SNIPPET, several nutritionist tables).
- Cooking yield factors (cooked = raw × f), ranges across tables (VERIFIED-SNIPPET: De Leuse PDF, latuanutrizionistaroma PDF, sgprogram, AMD table): pasta corta 1.88-2.0; pasta lunga 2.1-2.4; pasta all'uovo 3; riso 2.5; legumi secchi 2.5 (fagioli) - 3 (ceci); bovino magro 0.60-0.65; petto di pollo 0.90; coscia pollo 0.75; tacchino coscia 0.70; pesce bianco 0.85; pesce grasso/sgombro 0.65; tonno/pesce spada 0.7-0.8; fagiolini/piselli freschi 0.8-0.95.
- Waste (gross → edible): pollo intero 33-35 %, salmone intero 55 %, branzino 35 %, acciughe 25 % (VERIFIED-SNIPPET, incucinaconlochef). Needed only when the shopping list buys whole fish/bone-in.
- Olio: 1 cucchiaio = 10 g (raso ≈ 9 g, colmo ≈ 14 g); 1 cucchiaino = 5 g (VERIFIED-SNIPPET dica33, Grana Padano).
- Frying absorption: 8-20 % of food weight typical; well-done home fry ≤ 10 %; floured fish ≈ 6 g per 100 g; batter/tempura up to 50 g per 100 g (VERIFIED-SNIPPET, smartfood IEO + blogs).

## 5. What "verdure a volontà" excludes

No hand-out defines the phrase formally; practice converges (VERIFIED-SNIPPET, Comune di Empoli sportello nutrizionista; Santini; cookist): *verdura* = ortaggi freschi/surgelati including insalate and fagiolini. **Not verdura**: patate (tubero → carb group), legumi including piselli, fave, fagioli, ceci, lenticchie, soia (→ protein group), mais (→ carb group). Zucca, carote, barbabietola, carciofi are "verdure amidacee/zuccherine" flagged only in keto/diabetes contexts (carote ≈5-7 g CHO/100 g) — in a normal grammature schema they are free (INFERENCE). Olive, avocado are fats, not free veg (INFERENCE). Free veg is still "condita con l'olio previsto nel pasto": the oil budget is per meal, not per dish.

## 6. Condiments, mixed dishes, eating out

- Free condiments in practice: aceto, limone, spezie, erbe, aglio, cipolla (in quantità da soffritto), brodo sgrassato. Counted: olio, burro, pesto (oil+pinoli+formaggio), parmigiano on pasta (10-15 g "per insaporire" vs 50-100 g as secondo — VERIFIED-SNIPPET, Gozzo), maionese, panna, besciamella.
- Mixed dishes are decomposed: risotto = riso 80 g + olio/burro from the fat budget + parmigiano (flavour or part of protein); lasagne = sfoglia 60 g + ragù (meat from protein slot) + besciamella (fat/dairy); minestrone con pasta = pasta 30 g (brodo convention) + free veg; pasta e legumi = cereali 70 g + legumi secchi 30 g, or legumes replace the secondo (VERIFIED-SNIPPET, Prix/Di Tillio). Pasta 100 % di legumi counts as a secondo at 50 g (VERIFIED-SNIPPET, Di Tillio).
- Eating out: either *pasto libero* (1/week) or estimate with hand measures: palmo = 100-120 g protein, pugno = 70-80 g pasta raw, fetta di pane a mano aperta = 40-60 g, error ±15-25 % (VERIFIED-SNIPPET, smartfood IEO, theia). Pizza margherita ≈ 270 kcal/100 g, dough 220-250 g.

## 7. Proposed data model

```ts
// ---- Reference data (seeded from tables above, editable) ----
Food { id, name_it, aliases[], category: 'cereal'|'bread'|'bread_sub'|'tuber'|'legume_dry'|'legume_cooked'
      |'meat_red'|'meat_white'|'cured_meat'|'fish_lean'|'fish_fatty'|'seafood'|'fish_canned'|'egg'
      |'cheese_fresh'|'cheese_aged'|'milk'|'yogurt'|'veg_free'|'veg_starchy'|'fruit'|'oil'|'butter'
      |'nut'|'sweet'|'flavour',
      roles: ('carb'|'protein'|'fat'|'free_veg'|'fruit'|'dairy'|'flavour')[],   // may be >1 (legumes, cheese, salmon)
      per100g_raw_edible: {kcal, cho, pro, fat, fibre},
      state: 'raw'|'dry'|'cooked'|'canned', yield: {boil?, grill?, bake?, fry?},  // cooked = raw*yield
      waste_pct?, unit: {kind:'g'|'ml'|'piece', piece_g?}, shelf: 'fresh'|'pantry'|'frozen' }

EquivalenceGroup { id: 'PRIMO'|'PANE'|'SECONDO'|'FAT'|'FRUIT'|'BREAKFAST_DAIRY'|'BREAKFAST_CARB',
      reference: {food_id, grams},                     // e.g. PRIMO: pasta 80 g; SECONDO: carne 100 g
      entries: { [food_id]: grams_equivalent_to_reference },   // e.g. patate: 280, pane: 110, pesce: 150, uova: 120
      basis: 'dietitian_table'|'cho'|'protein'|'kcal', source_url, overridable_by_profile: true }

// ---- Diet profile (one per person) ----
DietProfile { person_id, mode: 'reference_grams'|'macros'|'blocks',
      slots: MealSlot[], weekly_rules: FrequencyRule[], free_veg: {include_categories:['veg_free'], exclude_food_ids:[]},
      free_condiments: food_id[], hidden_fat_policy: 'ignore'|'offset_oil'|'count_all',
      legume_policy: 'protein'|'split'|'carb', free_meals_per_week, weighing: 'raw'|'cooked', notes }

MealSlot { id, name: 'colazione'|'spuntino'|'pranzo'|'merenda'|'cena', days: Weekday[] | 'all',
      components: SlotComponent[] }

SlotComponent { role, target:
        | {kind:'reference_grams', group:'PRIMO', grams:80}          // "80 g pasta o equivalenti"
        | {kind:'macros', cho?, pro?, fat?, tolerance_pct}           // scambi/ADA
        | {kind:'blocks', n}                                         // Zona
        | {kind:'free'} ,                                            // verdure a volontà
      allowed: {categories?[], food_ids?[], exclude?[]}, optional: bool, choice_list?: food_id[] /* "a scelta tra" */ }

FrequencyRule { category|food_id, min_per_week, max_per_week }   // pesce ≥2, uova ≤2 ...

// ---- Recipes ----
RecipeTemplate { id, name, servings_base, method: 'boil'|'bake'|'grill'|'fry'|'raw'|'stew',
      ingredients: Ingredient[], tags, time, course: 'primo'|'secondo'|'piatto_unico'|'contorno'|'colazione' }
Ingredient { food_id, qty_base, unit, role_override?, role_share?: {carb?, protein?, fat?},
      scaling: 'with_role'|'fixed'|'with_servings', is_cooking_fat?: bool, lock_ratio_group?: string }

// ---- Household plating ----
Plate { person_id, overrides: {role → multiplier | absolute_grams} | 'unconstrained' }
PlannedMeal { date, slot_id, recipe_id, plates: Plate[], computed: {per_person: {ingredient → grams_raw}, pot_total} }
```

### Scaling algorithm (deterministic)
1. For each ingredient compute its **reference-equivalent** for every role it carries: `eq = qty × (group.reference.grams / group.entries[food]) × role_share`. (Mode `macros`/`blocks`: use `per100g` instead.)
2. Sum per role → `R_role`. Solve one scale factor per role: `k_role = target_role / R_role`. Ingredients with `scaling:'with_role'` get `qty × k_role`; ingredients in a `lock_ratio_group` share the same k; `fixed` ones never move; `free_veg` and `flavour` scale `with_servings`.
3. Fat: `added_oil = max(0, target_fat − hidden_fat_offset)` where offset depends on `hidden_fat_policy` (default `ignore`: hand-outs count only added oil; `offset_oil`: subtract fat-equivalents of fatty fish/cheese/nuts).
4. Validate: every role in the slot has a non-empty contributor or is `optional`; warn when k drifts > 2× from recipe base (recipe shape would break).
5. Household: compute step 1-4 per Plate; the partner's plate uses `'unconstrained'` → recipe base qty × his multiplier (default 1.25×). Shopping list = Σ plates × days, converted to purchase units with `waste_pct` for whole fish/bone-in and pack rounding.

### Edge cases
- **Two carb sources** (pasta + patate, riso + piselli): both tagged `carb`, same `lock_ratio_group` → pro-rata so Σ equivalents = 80 g pasta-eq; or one tagged `veg_starchy` with `role_share.carb=0.5` if the dietitian allows. Ask dietitian.
- **Protein with fat** (salmone, formaggio, uova, salumi): role `protein` plus `role_share.fat`; policy flag decides whether oil is reduced. Fresh cheese 100 g counts as the whole secondo and typically the hand-out says "senza olio aggiunto" (INFERENCE).
- **Legumes**: `legume_policy` = `protein` (50 g dry = secondo; ASL Firenze), `split` (pasta e fagioli: 30-40 g dry legumes count ~50 % protein + ~50 % carb), or `carb` (CIRFOOD CHO tables treat legumi like patate). Pasta di legumi 100 % → secondo.
- **Hidden/cooking fat**: `is_cooking_fat` ingredients belong to the FAT role; frying adds `absorption_pct × food weight` (default 10 %, batter 30-50 %) to the fat ledger and triggers a warning.
- **Cooked-weight recipes** (user enters "200 g pasta cotta"): convert with `yield` to raw before scaling.
- **Mixed dish shared pot**: when plates have different k for the same role, the UI must say "cook pasta/protein separately or weigh raw per person; sauces/veg can be shared".
- **Ligurian specifics** (Sanremo): pesto = FAT+flavour (olio, pinoli, parmigiano) not free; focaccia = PANE (oil-rich, flag); farinata = legume (ceci flour) ⇒ protein/carb per policy; torta verde/pasqualina = egg+cheese+pastry ⇒ protein+fat+carb decomposition.

## Key findings
- Italian "schema a grammature" = five slots; per meal a primo (carb source, g raw), a secondo (protein source, g raw), olio in g or cucchiai, verdure a volontà, optional pane and frutta, plus a substitution page; hospital prontuari use pasta 80 g / pane 50 g / olio 10 g / pasta in brodo 30 g / gnocchi 200 g.
- All grams are raw, edible part, unless explicitly "cotto"; yield factors pasta ≈2, riso 2.5, legumi secchi 2.5-3, carne 0.6-0.9, pesce 0.65-0.85 are needed only to parse cooked-weight recipes.
- LARN/SINU 2024 standard portions give a consistent reference set: pasta 80, pane 50, patate 200, legumi secchi 50 (cotti 150), carne 100, pesce 150, uova 50, latte 125, yogurt 125, formaggio fresco 100 / stagionato 50, verdure 200 / insalata 80, frutta 150, olio 10 ml.
- Carb equivalences vary by ±30 % between sources; usable medians per 80 g pasta: riso/cereali 80, pane 110, patate 280, gnocchi 200, pasta fresca 110-160; pizza is never an equivalent (pasto libero).
- Protein equivalences per 100 g carne: pesce 100-150, 2 uova, formaggio fresco 100-130, stagionato 50-80, legumi secchi 50 (cotti 150), salumi/tonno sgocciolato 50.
- "Verdure a volontà" means fresh/frozen ortaggi incl. insalata and fagiolini; patate, legumi (incl. piselli, fave), mais are never free; zucca/carote/barbabietola are flagged only in keto/diabetes contexts.
- Oil is budgeted per meal (1 cucchiaio = 10 g, cucchiaino 5 g) and covers the free vegetables too; frying absorbs ≈10 % (batter up to 50 %).
- Mixed dishes are handled by decomposition into primo/secondo/condimento components (lasagne 60 g sfoglia, risotto 80 g riso, pasta e legumi 70 g + 30 g secchi); legumes may count as protein, as carb, or split, depending on the dietitian.
- Two numeric paradigms coexist (reference-food grams vs macro units like Zona blocks or ADA/15 g CHO exchanges); the data model supports both via `target.kind`.
- Eating out is handled as one weekly "pasto libero" or by hand-measure estimation (palmo ≈ 100-120 g protein, pugno ≈ 75 g pasta raw, ±20 %).
- Equivalence tables must be profile-overridable: G.'s own hand-out page is the source of truth, defaults are only a fallback.

## Load-bearing claims
- SINU/LARN standard portions: pasta 80 g, pane 50 g, patate 200 g, legumi secchi 50 g/cotti 150 g, carne 100 g, salumi 50 g, pesce 150 g, uova 50 g, latte 125 ml, yogurt 125 g, olio 10 ml, cereali/biscotti 30 g; weights raw, net of waste | https://sinu.it/wp-content/uploads/2025/01/Standard-Quantitativi-delle-Porzioni.pdf and https://www.dica33.it/guida-alimenti/larn-tabella-principali-alimenti/porzioni-standard.asp | high (snippet-verified, not opened)
- Verdure 200 g, insalata 80 g, frutta 150 g, formaggio fresco 100 g / stagionato 50 g, frutta disidratata 30 g (LARN 2024 V rev.) | https://ats-brescia.it/system/files/pagina_standard/files/356/19518/Porzioni%20standard%20degli%20alimenti%20per%20la%20popolazione%20adulta.pdf | high
- ASL Firenze dietetica: 100 g carne = 150 g pesce = 100 g formaggio fresco = 80 g stagionato = 2 uova = 50 g legumi secchi = 150 g legumi in scatola; pasta asciutta 80 g, in brodo 30 g, lasagne 60 g, gnocchi 200 g | https://www.montedomini.net/public/f60c457c-dc28-43ca-900d-628c4889f56b.pdf | high
- Grana Padano equivalence rows: pane 30/40/60 g ↔ pasta 20/30/40 g ↔ patate 80/120/150 g; carne 100 g ↔ pesce 130 g ↔ 2 uova (120 g) ↔ legumi secchi 50 g/freschi 150 g ↔ prosciutto 50 g, bresaola 70 g; frutta mela 150 = banana/uva/cachi/fichi 100 = fragole 200 = cocomero 350 | https://www.educazionenutrizionale.granapadano.it/it/stile-di-vita/tabelle-alimenti-equivalenti | medium-high
- CHO-based equivalences: pane 30/40/50 g ↔ pasta-riso 25/30/40 g ↔ patate-legumi 90/120/150 g | https://scuole.cirfood.com/udine/it/consigli/le-equivalenze-glucidiche-informazioni-utili-per-il-giusto-apporto-di-carboidrati | medium
- ADIMI (diabetology, 10 g sugar unit): pane 50 g ↔ pasta cruda/riso/polenta/farina 35 g; frutta banana/uva/cachi/fichi 80 g, mela/pera 100 g, fragole/melone/anguria 160 g | https://www.adimi.org/wp-content/uploads/2025/02/Equivalenze-degli-alimenti.pdf | medium
- Dietitian blogs for 80 g pasta: riso/farro/orzo/polenta 80 g; pane 100-120 g; patate 250-300 g; gnocchi 180-200 g; pasta fresca 100-110 g (Cellai) or 160 g (Santini) | https://caterinacellai.it/tra-camice-e-grembiule/come-sostituire-i-carboidrati-in-una-dieta/ ; https://nutrizionistasantini.it/come-sostituire-i-carboidrati-tra-loro/ ; https://comeunamela.it/sostituzioni-tra-i-carboidrati/ | medium
- Melarossa rules: pane:patate 1:3; pasta:patate ≈1:4; carne:pesce 1:1; max 2 uova per swap | https://www.melarossa.it/dieta/dimagrire/abc-delle-sostituzioni-cereali-e-derivati/ | medium
- Stavolone: 100 g carne = 100 g pesce = 50 g legumi secchi = 2 uova = 130 g formaggio fresco = 50 g stagionato = 100 g crostacei/molluschi | https://paolastavolone.com/come-sostituire-la-carne-a-tavola/ | medium
- Cookist: tonno sgocciolato 50 g, bresaola/crudo 50 g, formaggi freschi 100-125 g, stagionati 50 g, legumi cotti 150 g | https://www.cookist.it/come-sostituire-le-fonti-proteiche/ | medium
- Patate, legumi (incl. piselli, fave, soia) and mais are not "verdura"; verdura = ortaggi freschi/surgelati incl. insalate e fagiolini | https://sportello-del-nutrizionista.comune.empoli.fi.it/le-patate-il-mais-e-i-piselli-sono-verdura/ ; https://www.nutrizionistasantini.it/i-piselli-sono-verdure-o-legumi/ | high
- Raw→cooked factors: pasta corta 1.88-2.0, lunga 2.1-2.4, uovo 3, riso 2.5, legumi secchi 2.5-3, bovino magro 0.60-0.65, petto pollo 0.90, pesce bianco 0.85, sgombro 0.65 | https://martinadeleusebiologanutrizionista.it/wp-content/uploads/Tabelle-di-conversione-peso-cibi-da-crudi-a-cotti.pdf ; https://www.latuanutrizionistaroma.it/wp-content/uploads/2022/02/TABELLA-DI-CONVERSIONE.pdf ; https://aemmedi.it/wp-content/uploads/2016/09/04_tabelle-conversioni-crudo-cotto.pdf | medium-high
- Waste: pollo intero 35 %, salmone 55 %, branzino 35 %, acciughe 25 % | https://www.incucinaconlochef.it/tabella-scarti-e-rese-degli-alimenti-guida/ | medium
- Cucchiaio olio 10 g (raso 9, colmo 14), cucchiaino 5 g | https://www.dica33.it/guida-alimenti/larn-peso-cucchiaio/alimenti-peso-cucchiaio.asp | high
- Frying absorption 8-20 % typical, ≤10 % if done well, batter up to 50 g/100 g, floured fish ≈6 g/100 g | https://smartfood.ieo.it/nutrizione-e-salute/be-smart/cucinare-gli-alimenti/frittura/ | medium
- Zona block = 7 g P / 9 g CHO / 3 g F; 1 carb block = 12 g pasta, 13 g pane, 50 g patate, 200 g pomodori | https://www.my-personaltrainer.it/alimentazione/esempio-dieta-a-zona.html ; https://www.abodybuilding.com/MED22.html | medium
- ADA exchanges: starch 15 CHO/3 P/80 kcal; meat 7 P; fat 5 g/45 kcal; vegetable 5 CHO/2 P/25 kcal; fruit 15 CHO; milk 12 CHO/8 P | https://mtsu.pressbooks.pub/nutrition/back-matter/appendix-b-the-exchange-lists-for-meal-planning/ | high
- Pasta e legumi: 70 g cereali + 30 g legumi secchi; pasta 100 % legumi = secondo at 50 g | https://www.prixquality.com/rubriche/alimentazione/pasta-e-legumi/ ; https://dietistasilviaditillio.it/pasta-di-legumi-come-considerarla/ | medium
- Pizza = pasto libero, not a pasta equivalent; dough 220-250 g; margherita ≈270 kcal/100 g | https://www.sandramartinelli.it/news/pizza-a-dieta-istruzioni-per-luso/ ; https://pepinonutrizionista.it/pasto-libero/ | medium
- Hand measures: palmo 100-120 g protein, pugno 70-80 g pasta raw, fetta pane 40-60 g, error ±15-25 % | https://www.smartfood.ieo.it/la-domanda-la-fai-tu/calcolare-quantita-porzioni-alimenti/ ; https://www.theia.it/post/come-pesare-a-occhio-gli-alimenti-5-metodi-pratici-senza-bilancia | medium
- Weekly frequencies in hand-outs (pesce 150 g F/200 g M ×3, legumi secchi 60-80 g, formaggi freschi ×2, stagionati ×1) | https://www.starbene.it/content/uploads/2017/03/schema-lertola.pdf | medium

## Open questions
- Does G.'s hand-out include its own "sostituzioni/equivalenti" page? If yes, it overrides all defaults above: we should photograph/transcribe it into `EquivalenceGroup` entries.
- Are her grams raw or cooked, and gross or net (e.g., "pesce 150 g" of fillet or whole)?
- Is olio specified per meal, per day, or per dish? Does it cover the vegetables and cooking, or only dressing? Is burro/pesto/parmigiano allowed within it?
- Which vegetables, if any, does her dietitian exclude from "a volontà" (patate certainly; zucca, carote, barbabietola, carciofi, olive, avocado, legumi/piselli?) and is there a minimum (e.g., 200 g)?
- How are legumes placed: as secondo (50-60 g secchi), as primo, or as pasta e legumi split? Is pasta di legumi allowed?
- How are formaggi and salumi placed: as secondo with reduced oil? Fresh vs stagionato grams?
- Fatty fish (salmone, sgombro) and uova: same grams as carne, or reduced, and does oil drop on those days?
- Are there weekly frequency limits (carne rossa, uova, formaggi, salumi, pesce ≥ N) and a weekly pasto libero? How should pizza/eating out be logged?
- Is pane part of pranzo/cena alongside the primo, or an alternative to it? Are fette biscottate/cracker/focaccia/farinata acceptable pane substitutes?
- Breakfast and snacks: fixed foods or equivalence groups (latte/yogurt, fette biscottate/cereali, frutta)? Is fruit per day or per slot?
- Does the dietitian accept "piatto unico" compositions (risotto with secondo inside, lasagne) or does she require separate primo/secondo?
- For the partner: fixed multiplier (e.g., 1.25×) or his own targets? Does he eat the same free vegetables and oil?
- Mode question for the engineer: do we implement `macros` and `blocks` modes now, or only `reference_grams` with macro accounting as a hidden check?
- Network: sinu.it, granapadano.it, dallegrave.it and other dietitian sites must be allowed in the session network settings before the seed tables can be verified against the full PDFs.
