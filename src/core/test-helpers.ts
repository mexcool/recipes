import { existsSync, readFileSync } from 'node:fs';
import { PlanSchema, PrefsSchema, activeRevision, type Member, type Plan, type PlanRevision, type Prefs } from './model';
import demoJson from '../../plans/demo.json';
import { FOODS } from '@/data/foods';
import { SEED_DISHES } from '@/data/dishes';
import { generateWeek, type PlannerInput, type PlannerResult } from './planner';

export const DEMO: Plan = PlanSchema.parse(demoJson);
export const DEMO_REV: PlanRevision = activeRevision(DEMO);

const privatePath = 'plans/private/giulia.json';
export const PRIVATE: Plan | undefined = existsSync(privatePath) ? PlanSchema.parse(JSON.parse(readFileSync(privatePath, 'utf8'))) : undefined;

export const MEMBERS: Member[] = [
  { id: 'g', name: 'G.', constrained: true, multiplier: 1 },
  { id: 'p', name: 'Partner', constrained: false, multiplier: 1.4 },
];
export const PREFS: Prefs = PrefsSchema.parse({});
export const MONDAY = '2026-11-09';

export function plannerInput(plan: Plan, seed: number, extra: Partial<PlannerInput> = {}): PlannerInput {
  return {
    planId: plan.id,
    rev: activeRevision(plan),
    foods: FOODS,
    dishes: SEED_DISHES,
    members: MEMBERS,
    prefs: PREFS,
    taste: {},
    history: [],
    monday: MONDAY,
    seed,
    ...extra,
  };
}

export function okWeek(plan: Plan, seed: number, extra: Partial<PlannerInput> = {}): Extract<PlannerResult, { ok: true }> {
  const res = generateWeek(plannerInput(plan, seed, extra));
  if (!res.ok) throw new Error(`seed ${seed}: ${res.reason} ${res.witnesses.join(', ')}`);
  return res;
}

/** Plans to run the suite against: the demo always, the private plan when present locally. */
export const PLANS: { name: string; plan: Plan }[] = [{ name: 'demo', plan: DEMO }, ...(PRIVATE ? [{ name: 'private', plan: PRIVATE }] : [])];
