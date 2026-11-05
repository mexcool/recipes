/**
 * DEMO plan: the same SHAPE as a real nutritionist's "schema a grammature" (seven day templates with
 * approved alternatives, exchange lists, fixed menus, weekly frequency rules) with INVENTED amounts.
 * It exists so the app, the tests and the screenshots never contain a real prescription.
 */
import type { Plan } from '@/core/model';
import {
  count,
  day,
  ex,
  exSub,
  fixedMenus,
  food,
  freeVeg,
  g,
  item,
  list,
  meal,
  menu,
  ml,
  revision,
  rule,
  rules,
  slot,
  sub,
} from './plan-builder';

const CEREAL = g(70);
const LUNCH_BREAD = g(70);
const DINNER_BREAD = g(45);
const SOUP_BREAD = g(35);
const LEG_CAN = g(110);
const LEG_DRY = g(35);
const TOFU = g(130);
const MEAT = g(130);
const CURED = g(80);
const SOUP = g(300);
const TOPPING = g(5);
const VEG = freeVeg();

const cerealSlot = (id: string, first: string[], extra: string[] = []) =>
  slot(id, 'cereal', [
    ...first.map((f) => food(f, CEREAL)),
    ...extra.map((f) => food(f, CEREAL)),
    sub('cereal', CEREAL, 'any cereal'),
  ]);
const legumeSlot = (id: string, withTofu = false) =>
  slot(id, 'protein', [
    sub('legume_canned', LEG_CAN, 'canned legumes'),
    sub('legume_dry', LEG_DRY, 'dried legumes'),
    ...(withTofu ? [food('tofu', TOFU)] : []),
  ]);
const dinnerBread = (id: string, potatoes = false) =>
  slot(id, 'bread', [
    food('pane_integrale', DINNER_BREAD),
    food('cracker_magretti', g(35)),
    ...(potatoes ? [food('patate', g(150))] : []),
  ]);
const lunchBread = (id: string, corn = true) =>
  slot(id, 'bread', [
    food('pane_integrale', LUNCH_BREAD),
    ...(corn ? [food('mais_scatola', g(140))] : [food('cracker_magretti', g(35))]),
  ]);
const soupNight = (n: number, protein: ReturnType<typeof slot>) =>
  meal(
    [
      slot(`d${n}-cena-soup`, 'soup', [food('minestrone_orogel', SOUP), food('verduri_orogel', SOUP)]),
      slot(`d${n}-cena-topping`, 'topping', [food('parmigiano', TOPPING)]),
      protein,
      slot(`d${n}-cena-bread`, 'bread', [food('pane_comune', SOUP_BREAD), food('orzo_perlato', g(25))]),
    ],
    'Vegetable soup night: soup, a teaspoon of grated cheese, the protein, a little bread or barley.',
  );

export const DEMO_REVISION = revision({
  revision: 1,
  label: 'Demo plan',
  validFrom: '2026-01-01',
  status: 'reviewed',
  sourceNote: 'Invented demo values. Not a real prescription.',
  templates: [
    day(
      1,
      meal([
        cerealSlot('d1-pranzo-cereal', ['riso_basmati', 'riso_rosso']),
        legumeSlot('d1-pranzo-protein', true),
        slot('d1-pranzo-veg', 'veg', [VEG]),
      ]),
      meal([
        slot('d1-cena-protein', 'protein', [food('uova', count(2, 60))]),
        slot('d1-cena-veg', 'veg', [VEG]),
        dinnerBread('d1-cena-bread'),
      ]),
      { hint: 'Rice with chickpeas and courgettes' },
    ),
    day(
      2,
      meal([
        lunchBread('d2-pranzo-bread'),
        slot('d2-pranzo-protein', 'protein', [
          food('mozzarella', g(125)),
          food('ricotta', g(110)),
          food('primosale', g(110)),
        ]),
        slot('d2-pranzo-veg', 'veg', [VEG]),
      ]),
      meal([
        slot('d2-cena-protein', 'protein', [
          food('vitello_filetto', MEAT),
          food('vitellone_magro', MEAT),
          food('burger_vegetale', g(100)),
        ]),
        slot('d2-cena-veg', 'veg', [VEG]),
        dinnerBread('d2-cena-bread', true),
      ]),
    ),
    day(
      3,
      meal([
        cerealSlot('d3-pranzo-cereal', ['pasta_kamut', 'orzo_perlato', 'farro']),
        legumeSlot('d3-pranzo-protein'),
        slot('d3-pranzo-veg', 'veg', [VEG]),
      ]),
      meal([
        slot('d3-cena-protein', 'protein', [food('petto_pollo', MEAT), food('tacchino_petto', MEAT)]),
        slot('d3-cena-veg', 'veg', [VEG]),
        dinnerBread('d3-cena-bread'),
      ]),
      { hint: 'Pasta with lentil sauce' },
    ),
    day(
      4,
      meal([
        lunchBread('d4-pranzo-bread'),
        slot('d4-pranzo-protein', 'protein', [
          food('bresaola', CURED),
          food('arrosto_pollo_affettato', g(110)),
        ]),
        slot('d4-pranzo-veg', 'veg', [VEG]),
      ]),
      soupNight(
        4,
        slot('d4-cena-protein', 'protein', [
          sub('legume_canned', LEG_CAN, 'canned legumes'),
          sub('legume_dry', LEG_DRY, 'dried legumes'),
        ]),
      ),
    ),
    day(
      5,
      meal([
        cerealSlot('d5-pranzo-cereal', ['cous_cous', 'quinoa']),
        legumeSlot('d5-pranzo-protein'),
        slot('d5-pranzo-veg', 'veg', [VEG]),
      ]),
      meal([
        slot('d5-cena-protein', 'protein', [food('pollo_coscia', MEAT), food('coniglio', MEAT)]),
        slot('d5-cena-veg', 'veg', [VEG]),
        dinnerBread('d5-cena-bread', true),
      ]),
      { hint: 'Couscous with chickpeas and cherry tomatoes' },
    ),
    day(
      6,
      meal([
        lunchBread('d6-pranzo-bread', false),
        slot('d6-pranzo-protein', 'protein', [
          food('prosciutto_cotto', CURED),
          food('prosciutto_crudo', CURED),
        ]),
        slot('d6-pranzo-veg', 'veg', [VEG]),
      ]),
      'libero',
      { weekendStyle: true },
    ),
    day(
      7,
      meal([
        slot('d7-pranzo-cereal', 'cereal', [
          food('pasta_kamut', CEREAL),
          food('gnocchi_patate', g(160)),
          food('pasta_uovo_fresca', g(80)),
          sub('cereal', CEREAL, 'any cereal'),
        ]),
        slot('d7-pranzo-protein', 'protein', [food('vitellone_magro', MEAT), food('roast_beef', MEAT)]),
        slot('d7-pranzo-veg', 'veg', [VEG]),
      ]),
      soupNight(
        7,
        slot('d7-cena-protein', 'protein', [food('fiocchi_di_latte', g(180)), food('feta_light', g(90))]),
      ),
      { hint: 'Pasta or gnocchi with sauce plus a meat course with vegetables', weekendStyle: true },
    ),
  ],
  fixedMenus: fixedMenus({
    colazione: [
      menu('b1', 'Greek yogurt, granola, nuts, honey', [
        item('yogurt_greco', g(150)),
        item('granola', g(30)),
        item('noci', g(10)),
        item('miele', count(1, 7)),
      ]),
      menu('b2', 'Greek yogurt, biscuits, dark chocolate, honey', [
        item('yogurt_greco', g(150)),
        item('biscotti_oro_saiwa', count(4, 7)),
        item('cioccolato_fondente', g(10)),
        item('miele', count(1, 7)),
      ]),
      menu('b3', 'Greek yogurt, oats, peanut butter, honey', [
        item('yogurt_greco', g(150)),
        item('fiocchi_avena', g(25)),
        item('burro_arachidi', count(1, 8)),
        item('miele', count(1, 7)),
      ]),
      menu('b4', 'Toast with avocado and a scrambled egg', [
        item('pan_bauletto', count(1, 28)),
        item('avocado', g(30)),
        item('uova', count(1, 60)),
      ]),
      menu('b5', 'Toast with ricotta, cinnamon, honey and walnuts', [
        item('pan_bauletto', count(1, 28)),
        item('ricotta', g(40)),
        item('miele', count(1, 7)),
        item('noci', g(10)),
      ]),
      menu(
        'b6',
        'Post-workout: Greek yogurt, honey, banana, dark chocolate',
        [
          item('yogurt_greco', g(150)),
          item('miele', count(1, 7)),
          item('banana', count(1, 120)),
          item('cioccolato_fondente', g(20)),
        ],
        'post_workout',
      ),
    ],
    spuntino: {
      weekdaysOnly: true,
      optional: false,
      tiers: [
        {
          qty: g(150),
          foodIds: [
            'mela',
            'pera',
            'arancia',
            'clementine',
            'kiwi',
            'ananas',
            'melograno',
            'prugne',
            'ciliegie',
          ],
        },
        { qty: g(200), foodIds: ['fragole', 'mirtilli', 'pesca', 'albicocche', 'melone', 'pompelmo'] },
        { qty: g(300), foodIds: ['anguria'] },
      ],
    },
    merenda: [
      menu('m1', 'Low-fat yogurt', [item('yogurt_magro', g(125))]),
      menu('m2', 'Parmesan snack', [item('parmareggio_snack', g(20))]),
      menu('m3', 'Plain kefir', [item('kefir', ml(150))]),
    ],
    spuntinoSerale: {
      weekdaysOnly: false,
      optional: true,
      tiers: [
        { qty: g(150), foodIds: ['mela', 'pera', 'arancia', 'kiwi'] },
        { qty: g(200), foodIds: ['fragole', 'mirtilli', 'pesca'] },
      ],
    },
  }),
  rules: rules({ oilPerDayG: 24, oilPerMealG: 12, morningSnack: 'weekdays_only', liberoTemplate: 6 }),
  exchange: {
    lists: [
      list('pranzo', 'A', [
        exSub('cereal', CEREAL, 'any cereal'),
        ex('pane_integrale', LUNCH_BREAD),
        ex('pasta_uovo_fresca', g(80)),
        ex('mais_scatola', g(140)),
        ex('gnocchi_patate', g(160)),
        ex('patate', g(200)),
        ex('gallette_farro', count(4, 10)),
      ]),
      list('pranzo', 'B', [
        exSub('legume_dry', LEG_DRY),
        exSub('legume_canned', LEG_CAN),
        ex('tofu', TOFU),
        ex('burger_vegetale', g(100)),
        exSub('cheese_aged', g(40)),
        ex('mozzarella', g(125)),
        ex('feta_light', g(100)),
        ex('ricotta', g(100)),
        ex('fiocchi_di_latte', g(150)),
        ex('primosale', g(100)),
        ex('philadelphia_light', g(100)),
        exSub('meat_white', g(140)),
        exSub('meat_red', g(140)),
        exSub('cured', g(70)),
        ex('arrosto_pollo_affettato', g(100)),
        ex('uova', count(2, 60)),
      ]),
      list('pranzo', 'C', [exSub('veg', { kind: 'free' })]),
      list('pranzo', 'D', [ex('olio_evo', g(12))]),
      list('cena', 'A', [
        ex('pastina', g(30)),
        ex('orzo_perlato', g(30)),
        ex('gallette_farro', count(4, 10)),
        ex('pane_integrale', DINNER_BREAD),
        ex('mais_scatola', g(140)),
        ex('patate', g(170)),
      ]),
      list('cena', 'B', [
        exSub('legume_dry', LEG_DRY),
        exSub('legume_canned', LEG_CAN),
        ex('burger_vegetale', g(100)),
        exSub('cheese_aged', g(40)),
        ex('mozzarella', g(125)),
        ex('feta_light', g(100)),
        ex('ricotta', g(100)),
        ex('fiocchi_di_latte', g(150)),
        ex('primosale', g(100)),
        exSub('meat_white', g(150)),
        exSub('meat_red', g(150)),
        exSub('cured', g(80)),
        ex('uova', count(2, 60)),
      ]),
      list('cena', 'C', [exSub('veg', { kind: 'free' }), exSub('frozen_soup', g(300))]),
      list('cena', 'D', [ex('olio_evo', g(12))]),
    ],
    oilEquivalents: [
      { foodId: 'avocado', qtyPer10gOil: g(50) },
      { foodId: 'olive', qtyPer10gOil: g(40) },
    ],
    cookedFactors: { pasta_long: 2.4, pasta_short: 2.0, rice_grains: 2.5, gnocchi: 1.1 },
    frequency: [
      rule(
        'legumes',
        'Legumes at least 3 times a week',
        { subgroups: ['legume_canned', 'legume_dry', 'tofu'] },
        { min: 3 },
        { scope: 'main_meals' },
      ),
      rule(
        'cheese',
        'Cheese at most 2 times a week',
        { subgroups: ['cheese_fresh', 'cheese_aged'] },
        { max: 2 },
        { scope: 'main_meals', review: true },
      ),
      rule(
        'eggs',
        'Whole eggs: 2 to 4 a week',
        { foodIds: ['uova'] },
        { min: 2, max: 4 },
        { countBy: 'units', scope: 'all_meals' },
      ),
      rule(
        'red_meat',
        'Red meat at most twice a week',
        { subgroups: ['meat_red'] },
        { max: 2 },
        { scope: 'main_meals' },
      ),
      rule(
        'white_meat',
        'White meat at most 3 times a week',
        { subgroups: ['meat_white'] },
        { max: 3 },
        { scope: 'main_meals' },
      ),
      rule(
        'tubers',
        'Potatoes or gnocchi 1 to 2 times a week',
        { subgroups: ['tuber', 'fresh_pasta'] },
        { max: 2 },
        { scope: 'main_meals' },
      ),
      rule(
        'cured',
        'Cured meats occasionally',
        { subgroups: ['cured'] },
        { max: 3 },
        { scope: 'main_meals', review: true, enforce: false },
      ),
    ],
  },
});

export const DEMO_PLAN: Plan = {
  id: 'plan-demo',
  name: 'Demo plan',
  memberId: 'g',
  revisions: [DEMO_REVISION],
  activeRevision: 1,
};
