/** Emits plans/demo.json (committed) and plans/private/giulia.json (ignored) from their TypeScript sources. */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { PlanSchema } from '../src/core/model';
import { DEMO_PLAN } from '../src/data/demo-plan';

mkdirSync('plans/private', { recursive: true });
writeFileSync('plans/demo.json', JSON.stringify(PlanSchema.parse(DEMO_PLAN), null, 2) + '\n');
console.log('wrote plans/demo.json');

if (existsSync('plans/private/giulia.ts')) {
  const mod = await import('../plans/private/giulia');
  writeFileSync(
    'plans/private/giulia.json',
    JSON.stringify(PlanSchema.parse(mod.GIULIA_PLAN), null, 2) + '\n',
  );
  console.log('wrote plans/private/giulia.json');
}
