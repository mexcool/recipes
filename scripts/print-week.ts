/** Prints a generated week and its compliance check. Usage: pnpm week [demo|private] [seed] */
import { existsSync, readFileSync } from 'node:fs';
import { PlanSchema, activeRevision, type Plan } from '../src/core/model';
import { generateWeek } from '../src/core/planner';
import { FOODS } from '../src/data/foods';
import { SEED_DISHES } from '../src/data/dishes';
import { evaluateRules } from '../src/core/frequency';
import { foodMap } from '../src/core/resolve';
import { platesForDay } from '../src/core/plates';
import { aggregateShopping } from '../src/core/shopping';
import { PrefsSchema } from '../src/core/model';

const which = process.argv[2] ?? 'demo';
const seed = Number(process.argv[3] ?? 7);
const path = which === 'private' ? 'plans/private/giulia.json' : 'plans/demo.json';
if (!existsSync(path)) throw new Error(`${path} not found`);
const plan: Plan = PlanSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
const rev = activeRevision(plan);
const members = [
  { id: 'g', name: 'G.', constrained: true, multiplier: 1 },
  { id: 'p', name: 'Partner', constrained: false, multiplier: 1.4 },
];
const prefs = PrefsSchema.parse({});
const res = generateWeek({ planId: plan.id, rev, foods: FOODS, dishes: SEED_DISHES, members, prefs, taste: {}, history: [], monday: '2026-11-09', seed });
if (!res.ok) {
  console.log('UNSATISFIABLE:', res.reason, res.witnesses);
  process.exit(1);
}
const foods = foodMap(FOODS);
const dishes = new Map(SEED_DISHES.map((d) => [d.id, d]));
for (const d of res.week.days) {
  console.log(`\n${d.date}  template ${d.template}  breakfast=${d.colazione} snack=${d.spuntino ? 'fruit' : '-'} merenda=${d.merenda}`);
  for (const which of ['pranzo', 'cena'] as const) {
    const m = d[which];
    if (m.kind !== 'planned') {
      console.log(`  ${which}: ${m.kind.toUpperCase()}`);
      continue;
    }
    const plates = platesForDay(rev, d.template, which, m, foods, members)!;
    const her = plates.members[0]!.lines.map((l) => `${foods.get(l.foodId)!.nameIt} ${l.display}`).join(' · ');
    const dish = m.dishId ? dishes.get(m.dishId)?.titleEn : '(no dish)';
    console.log(`  ${which}: ${dish}${m.leftoverOf ? ' [leftover]' : ''}${m.batchId ? ' [cooks batch]' : ''}\n     ${her} · veg: ${m.veg.join(', ')}`);
  }
}
console.log('\nRules:');
for (const r of evaluateRules(res.week, rev, foods)) console.log(`  ${r.ok ? 'ok ' : 'BAD'} ${r.rule.label}: ${r.count}${r.rule.review ? ' (review)' : ''}`);
console.log('\nNotes:', res.notes.length ? res.notes : 'none');
const list = aggregateShopping({ week: res.week, rev, foods: FOODS, dishes: SEED_DISHES, members, batches: res.batches, pantry: {}, purchases: {}, manual: [], prefs, store: 'coop' });
console.log('\nShopping list:');
for (const section of list.sections) {
  console.log(`  [${section.section}]`);
  for (const it of section.items) console.log(`    ${foods.get(it.foodId)!.nameIt}: ${it.buy ? `${it.buy.n} × ${it.buy.unitLabel}` : `${Math.round(it.toBuyG)} g`}${it.estimate ? ' (estimate)' : ''}${it.run === 'fresh' ? ' [fresh run]' : ''}`);
}
