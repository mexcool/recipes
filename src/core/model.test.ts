import { HouseholdSchema, PlanSchema, activeRevision, isLibero } from './model';
import { DEMO, PLANS, PRIVATE } from './test-helpers';
import { createHousehold } from './household';
import { SEED_DISHES } from '@/data/dishes';
import { FOOD_BY_ID } from '@/data/foods';

describe('plan model', () => {
  it.each(PLANS)('$name plan round-trips through the schema without loss', ({ plan }) => {
    const json = JSON.stringify(plan);
    const again = PlanSchema.parse(JSON.parse(json));
    expect(again).toEqual(plan);
  });

  it.each(PLANS)('$name plan has seven templates with exactly one free meal and consistent oil budget', ({ plan }) => {
    const rev = activeRevision(plan);
    expect(rev.templates.map((t) => t.n).sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(rev.templates.filter(isLibero)).toHaveLength(1);
    expect(rev.rules.oilPerMealG * 2).toBeLessThanOrEqual(rev.rules.oilPerDayG);
    expect(rev.templates.find(isLibero)!.n).toBe(rev.rules.pastoLibero.defaultTemplate);
  });

  it.each(PLANS)('$name plan references only catalogue foods', ({ plan }) => {
    const rev = activeRevision(plan);
    const ids: string[] = [];
    for (const t of rev.templates) {
      for (const mt of [t.pranzo, 'libero' in t.cena ? null : t.cena]) {
        if (!mt) continue;
        for (const s of mt.slots) for (const o of s.options) if (o.kind === 'food') ids.push(o.foodId);
      }
    }
    for (const l of rev.exchange.lists) for (const e of l.items) if (e.foodId) ids.push(e.foodId);
    for (const o of [...rev.fixedMenus.colazione, ...rev.fixedMenus.merenda]) for (const it of o.items) ids.push(it.foodId);
    for (const tier of rev.fixedMenus.spuntino.tiers) ids.push(...tier.foodIds);
    const missing = ids.filter((id) => !FOOD_BY_ID.has(id));
    expect(missing).toEqual([]);
  });

  it('the private plan, when present, is never the demo plan', () => {
    if (!PRIVATE) return;
    expect(PRIVATE.id).not.toBe(DEMO.id);
    expect(JSON.stringify(PRIVATE)).not.toContain('Invented demo');
  });

  it('a household document validates with defaults applied', () => {
    const h = createHousehold({ plan: DEMO, dishes: SEED_DISHES, now: '2026-11-05T06:00:00.000Z' });
    expect(HouseholdSchema.parse(h)).toEqual(h);
    expect(h.prefs.vegEstimateG).toBe(150);
    expect(h.members.find((m) => m.constrained)?.id).toBe('g');
  });
});
