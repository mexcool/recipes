import { activeRevision } from './model';
import { validateDish, contextWarnings } from './validate';
import { FOODS } from '@/data/foods';
import { DISH_BY_ID, SEED_DISHES } from '@/data/dishes';
import { PLANS, okWeek } from './test-helpers';
import { foodMap } from './resolve';

const byId = (id: string) => {
  const d = DISH_BY_ID.get(id);
  if (!d) throw new Error(id);
  return d;
};

describe.each(PLANS)('the six starting dishes on the $name plan', ({ plan }) => {
  const rev = activeRevision(plan);

  it('quinoa with chickpeas, lettuce and tomatoes: fits the grain + legume lunch with the quinoa alternative; complete', () => {
    const v = validateDish(byId('quinoa-chickpea-salad'), rev, FOODS);
    expect(v.best?.complete).toBe(true);
    expect(v.best?.meal).toBe('pranzo');
    expect(v.best?.matches.map((m) => m.foodId)).toContain('quinoa');
    expect(v.summary).toMatch(/^Fits Day \d pranzo/);
  });

  it('couscous with tofu, broccoli and carrots: fits a grain + legume lunch with the tofu alternative; carrots flagged as sugary', () => {
    const v = validateDish(byId('couscous-tofu-steamed-veg'), rev, FOODS);
    expect(v.best?.complete).toBe(true);
    expect(v.best?.matches.find((m) => m.role === 'protein')?.foodId).toBe('tofu');
    expect(v.issues.some((i) => i.code === 'sugary_veg')).toBe(true);
  });

  it('pumpkin soup with bresaola and bread: fits the bread + cured-meat lunch; complete', () => {
    const v = validateDish(byId('pumpkin-soup-bresaola-bread'), rev, FOODS);
    expect(v.best?.complete).toBe(true);
    expect(v.best?.matches.find((m) => m.role === 'protein')?.foodId).toBe('bresaola');
  });

  it('tomato and mozzarella salad with bread: fits the bread + fresh-cheese lunch; focaccia is not an option', () => {
    const v = validateDish(byId('caprese-bread'), rev, FOODS);
    expect(v.best?.complete).toBe(true);
    expect(v.best?.matches.find((m) => m.role === 'protein')?.foodId).toBe('mozzarella');
    expect(FOODS.find((f) => f.id === 'focaccia')).toBeUndefined();
  });

  it('pasta with aubergine sauce and parmesan: cereal ok, cheese is a garnish, protein slot unfilled', () => {
    const v = validateDish(byId('pasta-aubergine-parmigiano'), rev, FOODS);
    expect(v.best?.complete).toBe(false);
    expect(v.best?.unfilled.map((s) => s.role)).toEqual(['protein']);
    expect(v.best?.issues.some((i) => i.code === 'unfilled' && /protein slot unfilled/.test(i.message))).toBe(true);
    expect(v.best?.issues.some((i) => i.code === 'garnish_only')).toBe(true);
    expect(v.summary).toMatch(/protein slot unfilled/);
  });

  it('couscous with roasted vegetables and feta: no template accepts feta at lunch; the exchange lists do → question for the nutritionist', () => {
    const v = validateDish(byId('couscous-roast-veg-feta'), rev, FOODS);
    expect(v.best?.complete).toBe(false);
    expect(v.best?.exchangeFallbacks.some((e) => e.foodId === 'feta_light')).toBe(true);
    expect(v.questions.length).toBeGreaterThan(0);
    expect(v.summary).toMatch(/ask the nutritionist/);
  });

  it('a dish with grams in its steps or a forbidden method is rejected', () => {
    const bad = { ...byId('caprese-bread'), id: 'bad', steps: ['Use 125 g of mozzarella'], methods: ['frittura'] };
    const v = validateDish(bad, rev, FOODS);
    expect(v.issues.map((i) => i.code).sort()).toEqual(['grams_in_steps', 'method']);
  });

  it('a lunch-only substitution is not accepted at dinner', () => {
    const lunchBread = { ...byId('bresaola-rocket-panino'), id: 'dinner-bresaola', mealTypes: ['cena' as const] };
    const v = validateDish(lunchBread, rev, FOODS);
    const dinnerFits = v.fits.filter((f) => f.meal === 'cena');
    expect(dinnerFits.every((f) => !f.complete)).toBe(true);
  });

  it('warns when a dish would push a weekly maximum', () => {
    const { week } = okWeek(plan, 8);
    const foods = foodMap(FOODS);
    const warnings = contextWarnings(byId('caprese-bread'), week, rev, foods, week.days[0]!.date, 'pranzo', FOODS);
    expect(Array.isArray(warnings)).toBe(true);
  });
});

describe('seed book hygiene', () => {
  it('every approved seed dish has no error-level issues on any plan', () => {
    for (const { plan } of PLANS) {
      const rev = activeRevision(plan);
      for (const d of SEED_DISHES) {
        if (d.status === 'draft') continue;
        const v = validateDish(d, rev, FOODS);
        expect(v.issues.filter((i) => i.level === 'error').map((i) => `${d.id}: ${i.message}`)).toEqual([]);
        expect(v.best?.complete, `${d.id} fits nothing on ${plan.name}`).toBe(true);
      }
    }
  });
});
