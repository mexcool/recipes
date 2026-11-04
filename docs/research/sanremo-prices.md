# Sanremo supermarkets, online catalogues and package sizes — research report (revised scope), 4 Nov 2026

Scope (revised by the coordinator): price comparison is OUT. Supermarkets matter for *what can be bought* and *in which package sizes*; prices/ToS only as a short note. A previous price-focused draft at this path was merged into this one; its store-level details are kept, its price/receipt/PlanMyMeals sections are condensed into section 5.

**Method caveat.** The session's egress proxy blocked every retailer/press host (carrefour.it, coop.it, coopshop.it, conad.it, pampanorama.it, everli.com, openfoodfacts.org...). Only github.com could be opened. "VERIFIED" = confirmed from search-engine excerpts of the named page (~50 searches); "INFERENCE" = my reading. Addresses need a live check before being hard-coded.

## 1. Chains with stores in Sanremo (CAP 18038) and their formats

| Chain | Stores found | Format | Conf. |
|---|---|---|---|
| Carrefour (GS S.p.A.) | Carrefour Market Corso G. Marconi 152 (official carrefour.it store page); Carrefour Market Corso Garibaldi 135 (carrefour.it store id 2760; also on Everli); Carrefour Express Via della Repubblica 90; Carrefour Express Via Agosti 1 (carrefour.it id 2035); Carrefour Market Via Aurelia 3; "Carrefour Market Bussana" (Deliveroo). Nearest large Carrefour: Taggia, Via del Piano | **Market** = mid-size, food-centred weekly-shop supermarket (fresh counters, full dry grocery); **Express** = small convenience store, limited range (no diet-specialty brands expected); no **Iper** (>2,500 m², wide non-food) in Sanremo | high / medium |
| Coop Liguria | Coop Corso Matuzia 113 (e-coop.it store 824, tel 0184 695026, ~1,490 m², opened 1997), 08:00-22:00; home delivery + online pickup point | mid-size supermarket; only Coop in town; Coop own brands (Vivi Verde, Bene.sì, Origine) | high |
| Pam Panorama | Pam Via Pietro Agosti 307 (opened May 2020, 967 m², 60 parking, tel 0184 1912048); a second Pam (Piazza Colombo / Via Privata Canessa Sghirla 1) only in directories | mid-size supermarket | high / low |
| Conad (Conad Nord Ovest) | Conad City Via Galileo Galilei 419 and Via Solaro 78 (official conad.it pages); Conad City Corso Cavallotti 161, Corso Nazario Sauro 44, Via P. Agosti 111, Via Borea 74 (directories) | **Conad City** = small urban format, independently owned, store-specific assortment | high / medium |
| Lidl | Corso G. Marconi 48 | discount (own brands, weekly rotating offers) | high |
| Eurospin | present; addresses conflict (Via Martiri della Libertà / Via San Francesco) | discount | low |
| MD | Corso G. Mazzini 501/503 | discount | medium |
| iN's Mercato | Via Pietro Agosti 188 | discount | medium |
| Penny | Corso Nino Bixio 37 | discount | medium |
| Basko (Sogegross) | Via San Francesco 35/43 | supermarket (Ligurian chain) | medium |
| Ekom (Sogegross), Sigma, Ok Market, Crai | directory/flyer pages only | discount / small supermarkets | low |
| Esselunga | none in Sanremo or in the province of Imperia | — | high |

Design note: NewPrinces completed the purchase of Carrefour Italia on 1-2 Dec 2025; the Carrefour sign stays until 2028, then stores become **GS**. Use stable internal chain/store ids, not brand strings.

## 2. Do online catalogues expose product names and package sizes?

**carrefour.it — yes, the best structured source.** Product URL pattern `https://www.carrefour.it/p/<slug-with-size>/<EAN13>.html`; the 13-digit segment is the EAN (cross-checked: Zorbas Light 8013165060057 appears both in the carrefour.it URL and in an unrelated retailer's listing; Orogel 8003495104668; Carrefour Bio tofu 8012666070251). Pages show "Peso confezione: 125.0 g", price per kg, total price and an availability flag ("Prodotto al momento non disponibile" was displayed on several pages at crawl time). Multipacks are named "3 x 125 g". Category URLs form a usable taxonomy: `/spesa-online/salumi-e-formaggi/formaggi/mozzarella/`, `/spesa-online/salumi-e-formaggi/salumi/bresaola-e-altri-salumi/`, `/spesa-online/condimenti-e-conserve/sottaceti-sottoli-legumi-e-verdure-in-scatola/ceci/`, `/spesa-online/gelati-e-surgelati/minestroni-e-zuppe/`. The catalogue is national; availability depends on the CAP/store chosen. Whether carrefour.it's own delivery/click-and-collect covers 18038 is unconfirmed (a DoveConviene page mentions "clicca & ritira" for Sanremo; Carrefour routes fast delivery via Everli/Glovo/Deliveroo). An Apify actor claims the product sitemap and product pages are crawlable (robots.txt blocks only `/search`).

**spesaonline.conad.it — yes.** Product URL `/p/<slug-with-size>--<id>` (e.g. `/p/parmareggio-snack-parmigiano-reggiano-dop-5-x-20-g--11081020`, `/p/conad-cous-cous-500-g--356459`, `/p/de-cecco-spaghetti-n12-500-g--10564382`); the title carries the weight; multipacks show total weight separately (3 x 125 g → 375 g); variable-weight items are flagged with a ±20% tolerance in the sales conditions. Category URLs are numbered reparti: `/c/conserve-salse-condimenti--08`, `/c/prodotti-da-forno--09`, `/c/piatti-pronti--12`. Liguria is an active province; Conad City Via Galilei 419 offers "Ordina e ritira". Assortment is store-specific (INFERENCE, high).

**Coop — partially.** coopshop.it (Coop Consorzio Nord Ovest platform for Coop Liguria/Lombardia/Nova Coop) delivers in Sanremo city (coop.it "CoopShop a Imperia"), but no coopshop.it product page surfaced in search, so its page structure is unverified. Its Android app id `it.digitelematica.ebsn.ccno` shows it runs on Digitelematica's "ebsn" platform, which on sibling sites exposes `https://<host>/ebsn/api/products?barcode=<EAN>` and `category` endpoints (VERIFIED on the SpesaClick GitHub README for clickcoop.it/dupliclick.it; INFERENCE that coopshop.it matches). The public **"Il prodotto Coop" catalogue** on coop.it exposes own-brand names with sizes, e.g. `coop.it/il-prodotto-coop/vivi-verde/.../tofu-al-naturale-biologico-2-x-125-g`, `.../cous-cous-100-italiano-500-g`. Other Coop e-shops (coopacasa.coopetruria, prenotalaspesa.coopfirenze) show size + €/kg. EasyCoop is a different cooperative's platform (Emilia-Romagna/Veneto/Lazio), irrelevant here.

**Pam a casa — national catalogue only.** Serves 9 provinces (Bologna, Genova, Milano, Padova, Roma, Torino, Trento, Trieste, Venezia), not Imperia; usable as a name/size reference, not as Sanremo availability.

**Everli (it.everli.com/it/p/prodotti/<id>-<slug>)** lists Carrefour Market Corso Marconi 152 and Corso Garibaldi 135 and shows per product the chains/stores stocking it (e.g. Zorbas Light: Carrefour, Carrefour Express, Ipercoop, Decò); no EANs exposed, matching by name. Lidl, Eurospin, MD, iN's, Penny: flyers only; no catalogue with sizes (Lidl own brands are well covered on Open Food Facts).

**Open Food Facts (it.openfoodfacts.org)** is the best open source for package sizes: EAN-keyed, `quantity` string (e.g. "2 x 125 g") plus numeric `product_quantity` (INFERENCE on the numeric field), ODbL, public API with `fields=` filter, daily dumps; Italian coverage is large (Kioene, Conad, Crai, Decò, Lidl Vemondo items found). Use it to resolve "name + size → EAN" and normalise grams, then check chain availability via the retailer catalogues above.

## 3. The diet sheet's specific products — stocked in Italy, and in which size?

| Diet item | Finding | Conf. |
|---|---|---|
| Mozzarella 125 g | Standard: Carrefour Classic 125 g (EAN 3560070060252), Nonno Nanni 125 g, Carrefour Extra Fior di Latte 125 g, 3 x 125 g multipacks | high |
| Legumi 400 g can (≈240 g drained) | Carrefour Ceci 400 g (3560070361083); 400 g net / 240 g drained is the usual ratio; some listings quote drained weight only (Carrefour Bio ceci "240 g") — model both net and drained | high / medium |
| Tofu 2 x 125 g | Standard format: Carrefour Bio 2 x 125 g (8012666070251), Coop Vivi Verde bio 2 x 125 g, Lidl Vemondo, Crai, Decò, Esselunga | high |
| Bresaola 70 g tray | Carrefour Classic Punta d'Anca 70 g (8012666058747), Beretta, Citterio 70 g | high |
| Orogel Minestrone Leggerezza 600 g | Sold as **750 g** (8003495104668): carrefour.it €3.29 (unavailable at crawl), Conad flyer €3.19, Coop promo. No 600 g pack found; Carrefour Classic "Minestrone Leggero" 600 g is a private-label alternative. The 600 g on the diet sheet is probably an old size or a mix-up | high |
| Galbusera Magretti crackers | Pack is **380 g** (12 portions ≈ 31.7 g) per galbusera.it; stocked at Carrefour and online | high |
| Parmareggio snack 20 g | Sold as 5 x 20 g multipack (Conad online id 11081020) | high |
| Kioene burger | Formats: 2 x 100 g (melanzane), 200 g (funghi), 180 g (2 "Kroccanti" tofu burgers); no 2 x 125 g; found on Decò/Piccolo/Cosicomodo e-shops, not on Carrefour/Conad pages | medium |
| Zorbas feta light | Sold as "Zorbas Light Formaggio Greco 200 g" (8013165060057) on carrefour.it (€3.99); Everli lists it at Carrefour, Carrefour Express, Ipercoop. (Not labelled "feta": DOP feta cannot be "light" — INFERENCE) | high |
| Primeal quinoa | French organic brand (Ekibio), 500 g packs; no Italian supermarket listing found — expect bio shops/online only; substitute Carrefour Bio / Coop Vivi Verde quinoa | medium (absence) |
| Agnesi cous cous | Not found online; Conad Cous Cous 500 g (id 356459) and Coop 100% Italiano / Integrale 500 g are the stocked equivalents | medium |
| De Cecco kamut pasta | Exists: Spaghetti n°12 and Fusilli n°34 KAMUT khorasan, 500 g, €4.00 on shop.dececco.com; not found on Conad online; Carrefour unknown | medium |

Implication: the product model needs *size variants*, *net vs drained weight*, *brand → own-brand substitutes* and a per-chain "last seen available" flag; several brand/size pairs on the diet sheet are not current.

## 4. Typical Italian supermarket reparti (for grouping the shopping list)

No normative standard; design sources converge on this walk order: **Ortofrutta** (entrance) → **Panetteria/Forno** (often beside produce) → **Macelleria** → **Pescheria** (not in every store) → **Gastronomia / banco salumi e formaggi** → **Banco frigo**: latte, yogurt, formaggi confezionati, salumi confezionati, uova, tofu/vegetali freschi, pasta fresca → central aisles: **Pasta, riso e cereali** (cous cous, quinoa, legumi secchi) · **Scatolame e conserve** (legumi in scatola, pelati, tonno) · **Olio, aceto e condimenti** · **Colazione e biscotti** (crackers, fette) · **Snack e dolci** · **Dispensa** (farine, zucchero) · **Bevande** · **Cura casa** · **Cura persona** · **Pet** → **Surgelati** (last, near checkouts). Carrefour's and Conad's category URLs can seed the taxonomy; discounters follow the same single-loop order. Suggested app sections: Ortofrutta, Pane, Carne, Pesce, Salumi & formaggi al banco, Frigo (latticini/uova/veg), Dispensa secca, Conserve, Colazione & snack, Surgelati, Bevande, Casa/Persona.

## 5. Short note on prices and ToS (for later)

carrefour.it, spesaonline.conad.it, coopshop.it and Everli show prices; Carrefour's sales conditions state online prices may differ from the pickup store's shelf prices, and Everli may add a markup. No chain publishes a public API; carrefour.it general conditions forbid copying/commercial exploitation (no explicit bot clause found); CJEU C-30/14 lets a site restrict reuse by contract. Flyer data (ShopFully: DoveConviene, PromoQui, Tiendeo, VolantinoFacile) is closed. Open fallbacks: MIMIT Osservaprezzi (monthly average per product per province, HTML only, community CLI `openosservaprezzi`) and Open Prices (ODbL, thin Italian coverage, Gemini receipt extraction in production). If prices are ever added, prefer user-side capture (own receipts, own cart) over server scraping.

## Key findings
- Sanremo has Carrefour Market (2-3) and Express (2), Coop Liguria (Corso Matuzia 113, ~1,490 m²), Pam (Via Agosti 307, 967 m²), Conad City (4-6 small stores), Lidl, Eurospin, MD, iN's, Penny, Basko; no Esselunga; Carrefour becomes GS by 2028.
- carrefour.it product pages are the richest structured source: EAN in the URL, "Peso confezione" in grams, €/kg, multipack naming "3 x 125 g", availability flag, category taxonomy.
- spesaonline.conad.it exposes names with sizes, multipack totals and numbered category codes; Sanremo's Conad City Via Galilei 419 supports click-and-collect, but Conad assortments are store-specific.
- Coop's public "Il prodotto Coop" catalogue gives own-brand names/sizes; coopshop.it delivers in Sanremo and very likely runs the ebsn `/ebsn/api/products?barcode=` platform, but its pages were not verified.
- Pam a casa does not serve Imperia; use it only as a name/size reference.
- Open Food Facts resolves name+size to EAN and normalised grams for most Italian supermarket products under ODbL.
- Several diet-sheet sizes are wrong or outdated: Orogel Minestrone Leggerezza is 750 g, Galbusera Magretti 380 g, Parmareggio snack 5 x 20 g, Kioene burgers 2 x 100 g / 180 g / 200 g.
- Mozzarella 125 g, tofu 2 x 125 g, bresaola 70 g and 400 g legume cans (≈240 g drained) are standard formats across chains.
- Primeal quinoa, Agnesi cous cous and De Cecco kamut are not evidenced in Sanremo mainstream chains; own-brand substitutes exist.
- The product model needs size variants, drained vs net weight, brand → own-brand substitutes and per-chain availability.
- Italian store walk order is stable enough to hard-code 11-12 list sections, seeded from Carrefour/Conad category trees.
- Price data is feasible later (carrefour.it/Conad/Everli show prices) but ToS-constrained; no public API.

## Load-bearing claims
- carrefour.it product URLs embed the EAN and pages show "Peso confezione" in grams and €/kg | https://www.carrefour.it/p/carrefour-classic-mozzarella-125-g/3560070060252.html ; https://www.carrefour.it/p/zorbas-light-formaggio-greco-200-g/8013165060057.html | high
- spesaonline.conad.it shows sizes in titles, multipack totals and category codes; Liguria active; Sanremo Via Galilei 419 offers Ordina e Ritira | https://spesaonline.conad.it/p/parmareggio-snack-parmigiano-reggiano-dop-5-x-20-g--11081020 ; https://www.conad.it/ricerca-negozi/conad-city-via-galileo-galilei-419-18038-sanremo--001236 | high
- Coop Liguria's CoopShop delivers in Sanremo and the Corso Matuzia store has an online pickup point | https://www.coop.it/cooperative/coop-liguria/coopshop-imperia ; https://www.e-coop.it/scegli-il-tuo-negozio/negozi-e-promozioni/824/sanremo | medium
- coopshop.it runs on the Digitelematica ebsn platform with a `/ebsn/api/products?barcode=` endpoint | https://play.google.com/store/apps/details?id=it.digitelematica.ebsn.ccno ; https://github.com/ianes1978/SpesaClick | medium (sibling sites verified, coopshop.it inferred)
- Pam a casa serves only 9 provinces, not Imperia | https://pamacasa.pampanorama.it/ ; https://gruppo-pam.zendesk.com/hc/it/articles/10739189097373 | medium-high
- Orogel Minestrone Leggerezza is sold as 750 g, not 600 g | https://www.carrefour.it/p/orogel-il-benessere-minestrone-leggerezza-surgelati-750-g/8003495104668.html | high
- Galbusera Magretti pack is 380 g | https://www.galbusera.it/prodotti/magretti/magretti-cracker/ | high
- Tofu 2 x 125 g is a standard format at Carrefour, Coop, Lidl | https://www.carrefour.it/p/carrefour-bio-tofu-al-naturale-2-x-125-g/8012666070251.html ; https://www.coop.it/il-prodotto-coop/vivi-verde/gastronomia-e-piatti-pronti/alimenti-freschi/gastronomia-vegana/tofu-al-naturale-biologico-2-x-125-g | high
- Kioene burgers come in 2 x 100 g / 180 g / 200 g, not 2 x 125 g | https://it.openfoodfacts.org/product/8027890009151/burger-vegetale-alle-melanzane-kioene ; https://www.cosicomodo.it/spesa-online/Alimenti-vegetali/Kioene-Kroccanti-di-tofu-e-pomodori-secchi-2-Burger-180-g/p/8027890012281 | medium
- De Cecco kamut pasta exists in 500 g (own shop); Agnesi cous cous and Primeal quinoa not found in Italian chains | https://shop.dececco.com/it-it/prodotto/pasta-kamut-spaghetti-n-12-kamut-marchio-di-grano-khorasan-de-cecco ; https://spesaonline.conad.it/p/conad-cous-cous-500-g--356459 | medium
- Carrefour Italia sold to NewPrinces, rebrand to GS by 2028 | https://www.ilpost.it/2025/12/01/new-princes-acquisizione-carrefour/ | high
- Esselunga has no store in the province of Imperia | https://www.paginebianche.it/liguria/imperia/esselunga.html (absence) | high
- Open Food Facts exposes `quantity` per EAN under ODbL via a public API | https://openfoodfacts.github.io/openfoodfacts-server/api/tutorial-off-api/ | medium-high

## Open questions
- Does coopshop.it show the Sanremo catalogue (names, sizes) without login, and does it expose the ebsn `/ebsn/api` JSON like its sibling sites?
- Does carrefour.it's own click-and-collect/delivery accept CAP 18038, and which Sanremo store's assortment does it reflect?
- Which Kioene, Zorbas, Galbusera and De Cecco items are actually on the shelf at Carrefour Market Corso Marconi, Coop Corso Matuzia and Pam Via Agosti (one in-store or Everli check)?
- Is the 600 g Orogel size an old pack or a different Orogel line, and should the diet sheet's brand/size pairs be re-confirmed with the dietitian?
- Exact current addresses for Carrefour Express/Market, Conad City and Eurospin in Sanremo (directories disagree).
- Does Basko.it or Conad "Spesa a casa" deliver to 18038?
- How complete are Open Food Facts `product_quantity` values for Italian own-brand items (Carrefour Classic, Conad, Coop)?
