/**
 * Weekly planner (templates mode).
 *
 * 1. Place the seven day templates on Mon–Sun: the free-meal template on its day, other weekend-style
 *    templates on the weekend, the rest by scored permutation (adjacency, last week's order).
 * 2. Choose breakfast/snack options per day under the per-day rules.
 * 3. Choose one option per slot by bounded depth-first search under the weekly frequency rules
 *    (max rules prune, min rules are checked at the leaves), scored for variety.
 * 4. Attach a dish and vegetables to every main meal (variety axes, taste, season, effort).
 * 5. Pair identical batchable meals as a cooked-once batch.
 * 6. Prove the week with the independent checker.
 */
import type { Batch, Day, Dish, Food, Meal, Member, PlanRevision, Prefs, Slot, TasteEntry, Week } from './model';
import { MAIN_MEALS, isLibero, mealTemplate, templateFor } from './model';
import { addDays, isWeekend, weekdayIndex } from './dates';
import { createRng, hashString, shuffle, weightedPick } from './rng';
import { foodMap, optionCandidates, resolveMeal, slotHasFreeOption, type ResolvedLine } from './resolve';
import { collectOccurrences, evaluateRule, ruleMatches, type Occurrence } from './frequency';
import { checkWeek } from './check';
import { dishFitsMeal } from './dishfit';
import { daysSinceFood, historyFromWeeks, seasonFactor, signatureOf, tasteFactor, varietyFactor, type HistoryEntry } from './variety';
import { inSeasonMonth } from './season';
import { pairLeftovers } from './batches';
import { qtyEquals } from './qty';

export interface PlannerInput {
  planId: string;
  rev: PlanRevision;
  foods: readonly Food[];
  dishes: readonly Dish[];
  members: readonly Member[];
  prefs: Prefs;
  taste: Record<string, TasteEntry>;
  history: readonly Week[];
  monday: string;
  seed: number;
  /** Calendar date for the free meal (defaults to Saturday). */
  liberoDate?: string;
  /** Existing week whose locked or consumed meals stay where they are. */
  keep?: Week;
  weekId?: string;
  generatedAt?: string;
}

export type PlannerResult =
  | { ok: true; week: Week; batches: Batch[]; notes: string[] }
  | { ok: false; reason: string; witnesses: string[] };

const WORK_LIMIT = 20000;

export function generateWeek(input: PlannerInput): PlannerResult {
  const { rev, prefs } = input;
  const foods = foodMap(input.foods);
  const dishes = new Map(input.dishes.map((d) => [d.id, d]));
  const rnd = createRng(input.seed);
  const notes: string[] = [];
  const dates = Array.from({ length: 7 }, (_, i) => addDays(input.monday, i));
  const excluded = new Set([...prefs.dislikes, ...prefs.allergies]);

  // --- 1. Template placement ---------------------------------------------------------------------
  const placement = placeTemplates(input, dates, rnd);
  if (!placement.ok) return placement;
  const templateAt = placement.templates;

  // --- 2. Fixed menus ----------------------------------------------------------------------------
  const days: Day[] = dates.map((date, i) => {
    const kept = keptDay(input.keep, date);
    const t = templateFor(rev, templateAt[i]!);
    const spuntino = rev.rules.morningSnack === 'daily' || !isWeekend(date);
    return {
      date,
      template: t.n,
      spuntino,
      pranzo: kept?.pranzo && isKept(kept.pranzo) ? kept.pranzo : emptyMeal(),
      cena: isLibero(t) ? liberoMeal() : kept?.cena && isKept(kept.cena) ? kept.cena : emptyMeal(),
    };
  });
  assignFixedMenus(days, input, rnd);

  // --- 3. Slot choices under frequency rules -----------------------------------------------------
  const history = historyFromWeeks(input.history, rev, foods, dishes);
  const choice = chooseOptions(days, input, foods, excluded, history, rnd);
  if (!choice.ok) return choice;

  // --- 4. Dishes and vegetables ------------------------------------------------------------------
  const weekHistory: HistoryEntry[] = [...history];
  for (const day of days) {
    const t = templateFor(rev, day.template);
    for (const which of MAIN_MEALS) {
      const meal = day[which];
      if (meal.kind !== 'planned') continue;
      const mt = mealTemplate(t, which);
      if (!mt) continue;
      const lines = resolveMeal(meal, mt, foods);
      if (isKept(meal) && meal.dishId) {
        weekHistory.push({ date: day.date, which, sig: signatureOf(meal, lines, dishes.get(meal.dishId), foods) });
        continue;
      }
      let picked = pickDish({ day, which, mt, lines, input, foods, excluded, history: weekHistory, rnd });
      if (!picked.dish) {
        // Dish-aware repair: a wildcard slot (e.g. "any cereal") may have landed on a food no dish uses.
        // Try sibling foods of the same subgroup; frequency rules by subgroup are unaffected.
        for (const line of lines) {
          if (!line.fromSubgroup || picked.dish) continue;
          const siblings = input.foods.filter((f) => f.subgroup === line.fromSubgroup && f.id !== line.foodId && !excluded.has(f.id));
          siblings.sort((x, y) => daysSinceFood(y.id, weekHistory, day.date) - daysSinceFood(x.id, weekHistory, day.date));
          for (const f of siblings) {
            meal.wildcard[line.slotId] = f.id;
            const lines2 = resolveMeal(meal, mt, foods);
            const again = pickDish({ day, which, mt, lines: lines2, input, foods, excluded, history: weekHistory, rnd });
            if (again.dish) {
              picked = again;
              break;
            }
          }
          if (!picked.dish) meal.wildcard[line.slotId] = line.foodId;
        }
      }
      meal.dishId = picked.dish?.id;
      meal.veg = picked.veg;
      if (!picked.dish) notes.push(`${day.date} ${which}: no dish in the book fits; shown as its foods.`);
      weekHistory.push({ date: day.date, which, sig: signatureOf(meal, resolveMeal(meal, mt, foods), picked.dish, foods) });
    }
  }

  const week: Week = {
    id: input.weekId ?? `week-${input.monday}-${input.seed.toString(16)}`,
    planId: input.planId,
    revision: rev.revision,
    monday: input.monday,
    seed: input.seed,
    days,
    generatedAt: input.generatedAt ?? `${input.monday}T00:00:00.000Z`,
    confirmed: false,
    pantryApplied: false,
  };

  // --- 5. Batches --------------------------------------------------------------------------------
  const batches = pairLeftovers(week, rev, foods, dishes, input.members);

  // --- 6. Prove it -------------------------------------------------------------------------------
  const check = checkWeek(week, rev, foods, dishes);
  if (!check.ok) {
    return { ok: false, reason: 'The generated week failed the compliance check (planner bug).', witnesses: check.violations.map((v) => v.message) };
  }
  return { ok: true, week, batches, notes };
}

// ------------------------------------------------------------------------------------------------
// 1. Template placement
// ------------------------------------------------------------------------------------------------

function placeTemplates(input: PlannerInput, dates: string[], rnd: () => number): { ok: true; templates: number[] } | { ok: false; reason: string; witnesses: string[] } {
  const { rev } = input;
  const fixed = new Map<number, number>(); // day index → template
  if (input.keep) {
    input.keep.days.forEach((d) => {
      const i = dates.indexOf(d.date);
      if (i >= 0 && (isKept(d.pranzo) || isKept(d.cena))) fixed.set(i, d.template);
    });
  }
  const liberoT = rev.templates.find(isLibero);
  if (liberoT && ![...fixed.values()].includes(liberoT.n)) {
    const wanted = input.liberoDate ? dates.indexOf(input.liberoDate) : 5;
    const idx = wanted >= 0 ? wanted : 5;
    if (fixed.has(idx) && fixed.get(idx) !== liberoT.n) {
      return { ok: false, reason: `The free meal cannot go on ${dates[idx]}: that day is locked.`, witnesses: [dates[idx]!] };
    }
    fixed.set(idx, liberoT.n);
  }
  // Other weekend-style templates prefer free weekend days.
  const weekendDays = [5, 6].filter((i) => !fixed.has(i));
  for (const t of rev.templates) {
    if (!t.weekendStyle || [...fixed.values()].includes(t.n)) continue;
    const slot = weekendDays.shift();
    if (slot !== undefined) fixed.set(slot, t.n);
  }
  const freeDays = dates.map((_, i) => i).filter((i) => !fixed.has(i));
  const freeTemplates = rev.templates.map((t) => t.n).filter((n) => ![...fixed.values()].includes(n));
  if (freeDays.length !== freeTemplates.length) {
    return { ok: false, reason: 'Locked days and templates do not line up.', witnesses: [] };
  }
  const lastWeek = input.history.length ? input.history[input.history.length - 1] : undefined;
  let best: { perm: number[]; score: number }[] = [];
  for (const perm of permutations(freeTemplates)) {
    const arrangement = dates.map((_, i) => fixed.get(i) ?? -1);
    freeDays.forEach((dayIdx, k) => (arrangement[dayIdx] = perm[k]!));
    const score = scoreArrangement(arrangement, rev, lastWeek, dates);
    best.push({ perm: arrangement, score });
  }
  best.sort((a, b) => a.score - b.score);
  best = best.slice(0, 3);
  const pick = weightedPick(best, best.map((b, i) => (3 - i) ** 2), rnd) ?? best[0]!;
  return { ok: true, templates: pick.perm };
}

function scoreArrangement(arr: number[], rev: PlanRevision, lastWeek: Week | undefined, dates: string[]): number {
  let score = 0;
  const ref = (n: number, which: 'pranzo' | 'cena', role: string): string | undefined => {
    const t = templateFor(rev, n);
    const mt = mealTemplate(t, which);
    const s = mt?.slots.find((x) => x.role === role);
    const o = s?.options[0];
    if (!o || o.kind === 'free') return undefined;
    return o.kind === 'food' ? o.foodId : `sub:${o.subgroup}`;
  };
  for (let i = 1; i < arr.length; i++) {
    const a = arr[i - 1]!;
    const b = arr[i]!;
    for (const which of MAIN_MEALS) {
      const pa = ref(a, which, 'protein');
      const pb = ref(b, which, 'protein');
      if (pa && pa === pb) score += 3;
      const sa = ref(a, which, 'soup');
      const sb = ref(b, which, 'soup');
      if (sa && sb) score += 4;
    }
  }
  if (lastWeek) {
    arr.forEach((n, i) => {
      const prev = lastWeek.days.find((d) => weekdayIndex(d.date) === weekdayIndex(dates[i]!));
      if (prev?.template === n) score += 2;
    });
  }
  return score;
}

function* permutations<T>(items: T[]): Generator<T[]> {
  if (items.length <= 1) {
    yield items.slice();
    return;
  }
  for (let i = 0; i < items.length; i++) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const p of permutations(rest)) yield [items[i]!, ...p];
  }
}

// ------------------------------------------------------------------------------------------------
// 2. Fixed menus
// ------------------------------------------------------------------------------------------------

function assignFixedMenus(days: Day[], input: PlannerInput, rnd: () => number): void {
  const { rev } = input;
  const breakfasts = rev.fixedMenus.colazione.filter((o) => o.when === 'always');
  const merende = rev.fixedMenus.merenda;
  const lastUse = new Map<string, number>();
  for (const w of input.history) for (const d of w.days) {
    if (d.colazione) lastUse.set(`b:${d.colazione}`, Math.max(lastUse.get(`b:${d.colazione}`) ?? -1, 0));
  }
  const used = { b: new Map<string, number>(), m: new Map<string, number>() };
  const dailyRules = rev.exchange.frequency.filter((r) => r.per === 'day');
  const foods = foodMap(input.foods);
  for (const day of days) {
    const kept = keptDay(input.keep, day.date);
    if (kept?.colazione && (isKept(kept.pranzo) || isKept(kept.cena))) {
      day.colazione = kept.colazione;
      day.merenda = kept.merenda;
      continue;
    }
    const orderB = shuffle(breakfasts, rnd).sort((a, b) => (used.b.get(a.id) ?? -9) - (used.b.get(b.id) ?? -9));
    const b = orderB[0];
    if (b) {
      day.colazione = b.id;
      used.b.set(b.id, days.indexOf(day));
    }
    const orderM = shuffle(merende, rnd).sort((a, c) => (used.m.get(a.id) ?? -9) - (used.m.get(c.id) ?? -9));
    let chosen = orderM[0];
    for (const m of orderM) {
      day.merenda = m.id;
      const partial: Day = { ...day, pranzo: isKept(day.pranzo) ? day.pranzo : skipMeal(day.pranzo), cena: isKept(day.cena) ? day.cena : skipMeal(day.cena) };
      const occ = collectOccurrences({ ...emptyWeek(input), days: [partial] } as Week, rev, foods);
      // Breakfast and snacks are the only dairy sources, so both bounds can be judged here.
      const ok = dailyRules.every((r) => evaluateRule(r, occ, [day.date]).ok);
      if (ok) {
        chosen = m;
        break;
      }
    }
    if (chosen) {
      day.merenda = chosen.id;
      used.m.set(chosen.id, days.indexOf(day));
    }
  }
}

function emptyWeek(input: PlannerInput): Omit<Week, 'days'> {
  return { id: 'tmp', planId: input.planId, revision: input.rev.revision, monday: input.monday, seed: input.seed, generatedAt: '', confirmed: false, pantryApplied: false };
}

// ------------------------------------------------------------------------------------------------
// 3. Slot choices
// ------------------------------------------------------------------------------------------------

interface Decision {
  dayIdx: number;
  which: 'pranzo' | 'cena';
  slot: Slot;
  picks: { optionIndex: number; foodId: string | null; score: number }[];
}

function chooseOptions(
  days: Day[],
  input: PlannerInput,
  foods: Map<string, Food>,
  excluded: Set<string>,
  history: HistoryEntry[],
  rnd: () => number,
): { ok: true } | { ok: false; reason: string; witnesses: string[] } {
  const { rev } = input;
  const weeklyRules = rev.exchange.frequency.filter((r) => !r.review);
  const decisions: Decision[] = [];
  for (let i = 0; i < days.length; i++) {
    const day = days[i]!;
    const t = templateFor(rev, day.template);
    for (const which of MAIN_MEALS) {
      const meal = day[which];
      if (meal.kind !== 'planned' || isKept(meal)) continue;
      const mt = mealTemplate(t, which);
      if (!mt) continue;
      for (const slot of mt.slots) {
        if (slotHasFreeOption(slot) && slot.options.length === 1) continue;
        const picks: Decision['picks'] = [];
        slot.options.forEach((opt, optionIndex) => {
          if (opt.kind === 'free') return;
          const cands = optionCandidates(opt, input.foods).filter((f) => !excluded.has(f.id));
          const scored = cands.map((f) => ({ optionIndex, foodId: opt.kind === 'subgroup' ? f.id : null, score: scoreFood(f.id, slot.role, day.date, history, input, optionIndex) }));
          scored.sort((a, b) => b.score - a.score);
          // Wildcards expand to many foods: keep the best few so the search stays bounded.
          picks.push(...(opt.kind === 'subgroup' ? scored.slice(0, 4) : scored));
        });
        if (picks.length === 0) return { ok: false, reason: `No allowed option for ${slot.id}: everything is excluded by dislikes or allergies.`, witnesses: [slot.id] };
        // Seeded jitter so equal scores vary week to week.
        picks.forEach((p) => (p.score *= 0.85 + rnd() * 0.3));
        picks.sort((a, b) => b.score - a.score);
        decisions.push({ dayIdx: i, which, slot, picks });
      }
    }
  }

  // Occurrences that are already fixed: breakfasts, snacks, kept meals.
  const baseOcc = collectOccurrences({ ...emptyWeek(input), days: days.map((d) => ({ ...d, pranzo: isKept(d.pranzo) ? d.pranzo : skipMeal(d.pranzo), cena: isKept(d.cena) ? d.cena : skipMeal(d.cena) })) } as Week, rev, foods);
  const dates = days.map((d) => d.date);
  let work = 0;
  let worstRule: { label: string; witnesses: string[] } | null = null;

  const assign = (k: number, occ: Occurrence[]): boolean => {
    if (++work > WORK_LIMIT) return false;
    if (k === decisions.length) {
      for (const r of weeklyRules) {
        const res = evaluateRule(r, occ, dates);
        if (!res.ok) {
          worstRule = { label: res.message ?? r.label, witnesses: res.witnesses.map((w) => `${w.date} ${w.meal}: ${w.foodId}`) };
          return false;
        }
      }
      return true;
    }
    const d = decisions[k]!;
    // Strongly disprefer a food already chosen for a main meal this week (variety); still possible when a rule needs it.
    const foodOf = (p: Decision['picks'][number]) => p.foodId ?? (d.slot.options[p.optionIndex] as { foodId: string }).foodId;
    const usedThisWeek = new Set(occ.filter((o) => o.meal === 'pranzo' || o.meal === 'cena').map((o) => o.foodId));
    const picks = [...d.picks].sort((a, b) => b.score * (usedThisWeek.has(foodOf(b)) ? 0.2 : 1) - a.score * (usedThisWeek.has(foodOf(a)) ? 0.2 : 1));
    for (const p of picks) {
      const foodId = foodOf(p);
      const f = foods.get(foodId);
      const units = (() => {
        const o = d.slot.options[p.optionIndex]!;
        return o.kind !== 'free' && o.qty.kind === 'count' ? o.qty.count : 1;
      })();
      const next: Occurrence = { date: days[d.dayIdx]!.date, meal: d.which, foodId, subgroup: f?.subgroup ?? 'condiment', units, garnish: d.slot.role === 'topping' };
      const occ2 = [...occ, next];
      let prune = false;
      for (const r of weeklyRules) {
        if (r.max === undefined || !ruleMatches(r, next)) continue;
        const res = evaluateRule(r, occ2, dates);
        if (!res.ok && (r.per === 'week' ? res.count > r.max : true)) {
          prune = true;
          worstRule = { label: res.message ?? r.label, witnesses: res.witnesses.map((w) => `${w.date} ${w.meal}: ${w.foodId}`) };
          break;
        }
      }
      if (prune) continue;
      const meal = days[d.dayIdx]![d.which];
      meal.choices[d.slot.id] = p.optionIndex;
      if (p.foodId) meal.wildcard[d.slot.id] = p.foodId;
      else delete meal.wildcard[d.slot.id];
      if (assign(k + 1, occ2)) return true;
      delete meal.choices[d.slot.id];
      delete meal.wildcard[d.slot.id];
    }
    return false;
  };

  if (!assign(0, baseOcc)) {
    const w = worstRule as { label: string; witnesses: string[] } | null;
    return {
      ok: false,
      reason: work > WORK_LIMIT ? `Could not find a week within the work limit; last blocking rule: ${w?.label ?? 'unknown'}` : `No week satisfies every rule. Blocking rule: ${w?.label ?? 'unknown'}`,
      witnesses: w?.witnesses ?? [],
    };
  }
  return { ok: true };
}

function scoreFood(foodId: string, role: string, date: string, history: readonly HistoryEntry[], input: PlannerInput, optionIndex: number): number {
  const window = role === 'protein' ? 4 : role === 'cereal' ? 6 : 2;
  const since = daysSinceFood(foodId, history, date);
  const cooldown = since < window ? 0.3 + 0.7 * (since / window) : 1;
  const recency = Number.isFinite(since) ? Math.min(1.5, 0.8 + since / 30) : 1.3; // never eaten → slightly preferred
  const taste = tasteFactor(input.taste, [`food:${foodId}`]);
  const pref = input.prefs.preferMore.includes(foodId) ? 1.5 : input.prefs.preferLess.includes(foodId) ? 0.5 : 1;
  const reference = optionIndex === 0 ? 1.05 : 1;
  return cooldown * recency * taste * pref * reference;
}

function skipMeal(m: Meal): Meal {
  return { ...m, kind: m.kind === 'libero' ? 'libero' : 'out' };
}

// ------------------------------------------------------------------------------------------------
// 4. Dishes and vegetables
// ------------------------------------------------------------------------------------------------

interface PickDishArgs {
  day: Day;
  which: 'pranzo' | 'cena';
  mt: NonNullable<ReturnType<typeof mealTemplate>>;
  lines: ResolvedLine[];
  input: PlannerInput;
  foods: Map<string, Food>;
  excluded: Set<string>;
  history: HistoryEntry[];
  rnd: () => number;
}

export function pickDish(a: PickDishArgs): { dish: Dish | undefined; veg: string[] } {
  const { day, which, mt, lines, input, foods, excluded, history, rnd } = a;
  const weekday = !isWeekend(day.date);
  const lunchbox = input.prefs.lunchbox && weekday && which === 'pranzo';
  const candidates = input.dishes.filter((d) => {
    if (d.status === 'draft') return false;
    if (!d.mealTypes.includes(which)) return false;
    if (lunchbox && !d.lunchboxOk) return false;
    if (input.taste[`dish:${d.id}`]?.hard === 'never') return false;
    if (d.freeVeg.some((v) => excluded.has(v)) || d.condiments.some((c) => excluded.has(c))) return false;
    return dishFitsMeal(d, mt, lines, foods, which).ok;
  });
  const scored = candidates.map((d) => {
    const veg = chooseVeg(d, day.date, foods, excluded, history, mt);
    const sig = signatureOf({ ...emptyMeal(), veg }, lines, d, foods);
    const variety = varietyFactor(sig, history, day.date);
    const taste = tasteFactor(input.taste, [`dish:${d.id}`]);
    const season = seasonFactor(veg, day.date, foods);
    const effort = weekday && which === 'cena' && d.minutes > input.prefs.maxMinutesWeekdayDinner ? 0.6 : 1;
    const proposed = d.status === 'proposed' ? 0.8 : 1;
    return { d, veg, score: variety * taste * season * effort * proposed };
  });
  scored.sort((x, y) => y.score - x.score);
  const top = scored.slice(0, 3);
  const pick = weightedPick(top, top.map((t) => t.score), rnd);
  if (pick) return { dish: pick.d, veg: pick.veg };
  return { dish: undefined, veg: chooseVeg(undefined, day.date, foods, excluded, history, mt) };
}

function chooseVeg(dish: Dish | undefined, date: string, foods: Map<string, Food>, excluded: Set<string>, history: readonly HistoryEntry[], mt: { slots: Slot[] }): string[] {
  const hasVegSlot = mt.slots.some((s) => s.role === 'veg' && slotHasFreeOption(s));
  const hasSoup = mt.slots.some((s) => s.role === 'soup');
  if (!hasVegSlot && !hasSoup) return [];
  const month = Number(date.slice(5, 7));
  const fromDish = (dish?.freeVeg ?? []).filter((v) => !excluded.has(v) && foods.get(v)?.isFreeVeg);
  if (fromDish.length > 0) {
    const seasonal = fromDish.filter((v) => inSeasonMonth(foods.get(v)!, month));
    return (seasonal.length > 0 ? seasonal : fromDish).slice(0, 3);
  }
  if (hasSoup && !hasVegSlot) return [];
  const pool = [...foods.values()].filter((f) => f.isFreeVeg && f.subgroup === 'veg' && !excluded.has(f.id) && inSeasonMonth(f, month));
  const scoredVeg = pool.map((f) => ({ id: f.id, since: daysSinceFood(f.id, history, date) })).sort((x, y) => y.since - x.since);
  return scoredVeg.slice(0, 2).map((x) => x.id);
}

// ------------------------------------------------------------------------------------------------
// helpers
// ------------------------------------------------------------------------------------------------

export function emptyMeal(): Meal {
  return { kind: 'planned', choices: {}, wildcard: {}, veg: [], status: 'planned', locked: false, partnerEats: true };
}

export function liberoMeal(): Meal {
  return { ...emptyMeal(), kind: 'libero' };
}

function keptDay(week: Week | undefined, date: string): Day | undefined {
  return week?.days.find((d) => d.date === date);
}

export function isKept(meal: Meal): boolean {
  return meal.locked || meal.status === 'consumed';
}

export function seedFor(monday: string, attempt: number): number {
  return hashString(`${monday}#${attempt}`);
}

export { qtyEquals };
