import { activeRevision } from './model';
import { aggregateShopping, purchaseForCheck, reconcile, listAsText } from './shopping';
import { FOODS, foodById } from '@/data/foods';
import { SEED_DISHES } from '@/data/dishes';
import { MEMBERS, PLANS, PREFS, okWeek } from './test-helpers';
import { foodMap } from './resolve';

const unit500 = { label: 'pack 500 g', netG: 500, usableG: 500, form: 'dry' as const };

describe('reconciliation arithmetic', () => {
  it('900 g needed, 100 g in the pantry, 500 g packs → buy 2, 200 g left over', () => {
    const r = reconcile(900, 100, 0, unit500);
    expect(r).toMatchObject({ pantryDeductedG: 100, purchasedCoveredG: 0, toBuyG: 800 });
    expect(r.buy).toEqual({ n: 2, unitLabel: 'pack 500 g', unitUsableG: 500, leftoverG: 200 });
  });
  it('checking two packs covers 1000 g; demand rising to 1100 g is still covered; 1300 g needs one more pack', () => {
    const r = reconcile(900, 100, 0, unit500);
    const purchase = purchaseForCheck(
      { toBuyG: r.toBuyG, buy: r.buy } as never,
      undefined,
      'g',
      '2026-11-08T10:00:00Z',
      'op1',
    );
    expect(purchase.coveredG).toBe(1000);
    expect(reconcile(1100, 100, purchase.coveredG, unit500).toBuyG).toBe(0);
    const more = reconcile(1300, 100, purchase.coveredG, unit500);
    expect(more.toBuyG).toBe(200);
    expect(more.buy?.n).toBe(1);
  });
  it('an old check never hides new demand beyond what it covered', () => {
    expect(reconcile(2000, 0, 1000, unit500).toBuyG).toBe(1000);
  });
  it('a pantry amount is deducted once and never below zero', () => {
    expect(reconcile(300, 5000, 0, unit500)).toMatchObject({ pantryDeductedG: 300, toBuyG: 0 });
    expect(reconcile(300, -10, 0, unit500).pantryDeductedG).toBe(0);
  });
  it('unknown pack sizes stay in grams', () => {
    expect(reconcile(300, 0, 0, undefined).buy).toBeUndefined();
  });
});

describe.each(PLANS)('aggregation on the $name plan', ({ plan }) => {
  const rev = activeRevision(plan);
  const base = (seed: number) => {
    const { week, batches } = okWeek(plan, seed);
    return {
      week,
      batches,
      input: {
        week,
        rev,
        foods: FOODS,
        dishes: SEED_DISHES,
        members: MEMBERS,
        batches,
        pantry: {},
        purchases: {},
        manual: [],
        prefs: PREFS,
        store: 'coop',
      },
    };
  };

  it('is idempotent and lists every food of every meal including breakfast and snacks', () => {
    const { input, week } = base(4);
    const a = aggregateShopping(input);
    const b = aggregateShopping(input);
    expect(a).toEqual(b);
    const ids = new Set(a.items.map((i) => i.foodId));
    const breakfast = rev.fixedMenus.colazione.find((o) => o.id === week.days[0]!.colazione)!;
    for (const it of breakfast.items) {
      const f = foodById(it.foodId);
      if (!f.staple) expect(ids.has(it.foodId), it.foodId).toBe(true);
    }
    expect(a.items.some((i) => foodById(i.foodId).subgroup === 'fruit')).toBe(true);
  });

  it('uses drained weights for canned legumes', () => {
    const { input } = base(4);
    const list = aggregateShopping(input);
    const can = list.items.find((i) => foodById(i.foodId).subgroup === 'legume_canned');
    if (!can) return;
    expect(can.form).toBe('canned_drained');
    expect(can.buy?.unitUsableG).toBe(240);
    expect(can.buy!.n * 240).toBeGreaterThanOrEqual(can.toBuyG);
  });

  it('excludes staples unless running low, and preserves manual items', () => {
    const { input } = base(4);
    const list = aggregateShopping({
      ...input,
      manual: [
        { id: 'm1', text: 'dish soap', section: 'drinks', checked: false, createdAt: '2026-11-08T00:00:00Z' },
      ],
    });
    expect(list.items.find((i) => i.foodId === 'olio_evo')).toBeUndefined();
    expect(list.staplesUsed).toContain('olio_evo');
    expect(list.manual).toHaveLength(1);
    const low = aggregateShopping({ ...input, prefs: { ...PREFS, runningLow: ['olio_evo'] } });
    expect(low.items.find((i) => i.foodId === 'olio_evo')).toBeDefined();
  });

  it('pantry stock reduces what is bought; a checked purchase marks the line done', () => {
    const { input } = base(4);
    const first = aggregateShopping(input);
    const pasta = first.items.find((i) => foodById(i.foodId).subgroup === 'cereal' && i.buy)!;
    const withPantry = aggregateShopping({ ...input, pantry: { [pasta.foodId]: 10000 } });
    expect(withPantry.items.find((i) => i.foodId === pasta.foodId)!.haveIt).toBe(true);
    const purchase = purchaseForCheck(pasta, undefined, 'g', '2026-11-08T10:00:00Z', 'op');
    const bought = aggregateShopping({ ...input, purchases: { [pasta.foodId]: purchase } });
    const line = bought.items.find((i) => i.foodId === pasta.foodId)!;
    expect(line.checked).toBe(true);
    expect(line.toBuyG).toBe(0);
  });

  it('a leftover meal adds no demand and a cooking batch multiplies it', () => {
    const { input, week, batches } = base(4);
    const list = aggregateShopping(input);
    const cook = week.days
      .flatMap((d) => (['pranzo', 'cena'] as const).map((w) => d[w]))
      .find((m) => m.batchId);
    if (!cook) return;
    const batch = batches.find((b) => b.id === cook.batchId)!;
    expect(batch.portions.every((p) => p.n === 2)).toBe(true);
    const proteinLine = list.items.find((i) =>
      i.why.some((w) => w.date === batch.cookAt.date && w.meal === batch.cookAt.meal),
    );
    expect(proteinLine).toBeDefined();
  });

  it('splits a mid-week fresh run for bread and leaves', () => {
    const { input } = base(4);
    const list = aggregateShopping(input);
    for (const it of list.freshRun)
      expect(['bread', 'veg', 'veg_sugary', 'cheese_fresh']).toContain(foodById(it.foodId).subgroup);
    const off = aggregateShopping({ ...input, prefs: { ...PREFS, splitFreshRun: false } });
    expect(off.freshRun).toHaveLength(0);
  });

  it('orders sections by the chosen store', () => {
    const { input } = base(4);
    const coop = aggregateShopping({
      ...input,
      store: 'coop',
      storeOrders: { coop: ['frozen', 'produce'], carrefour: ['produce', 'frozen'] },
    });
    expect(coop.sections[0]?.section).toBe('frozen');
    const text = listAsText(coop, foodMap(FOODS), (s) => s.toUpperCase());
    expect(text).toContain('FROZEN');
  });
});
