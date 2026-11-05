/**
 * Weekly planner (templates mode).
 *
 * 1. Place the seven day templates on Mon–Sun: the free-meal template on its day, other weekend-style
 *    templates on the weekend, kept (locked / eaten / eating-out) days fixed, the rest by scored permutation.
 * 2. Choose breakfast/snack options per day under the per-day rules and the weekly unit rules (eggs).
 * 3. Choose one option per slot by bounded depth-first search under the weekly frequency rules
 *    (max rules prune, min rules are checked at the leaves), scored for variety.
 * 4. Attach a dish, a grain (for "any cereal" slots, chosen together with the dish) and vegetables.
 * 5. Plan one cooked-once batch where a batchable dish can feed a later meal with identical lines.
 * 6. Prove the week with the independent checker.
 */
import type {
  Batch,
  Day,
  Dish,
  Food,
  FrequencyRule,
  Meal,
  Member,
  PlanRevision,
  Prefs,
  Slot,
  TasteEntry,
  Week,
} from './model';
import { MAIN_MEALS, isLibero, mealTemplate, templateFor } from './model';
import { addDays, isWeekend, weekdayIndex } from './dates';
import { createRng, hashString, shuffle, weightedPick } from './rng';
import { foodMap, optionCandidates, resolveMeal, slotHasFreeOption, type ResolvedLine } from './resolve';
import { collectOccurrences, evaluateRule, ruleMatches, type Occurrence } from './frequency';
import { checkWeek } from './check';
import { dishFitsMeal } from './dishfit';
import {
  daysSinceFood,
  historyFromWeeks,
  seasonFactor,
  signatureOf,
  tasteFactor,
  varietyFactor,
  type HistoryEntry,
} from './variety';
import { inSeasonMonth } from './season';
import { planLeftovers } from './batches';
import { isConsumed, type Now } from './consumed';

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
  /** Calendar date for the free meal (defaults to the kept week's, else Saturday). */
  liberoDate?: string;
  /** Existing week whose locked, eaten or eating-out meals stay where they are. */
  keep?: Week;
  /** Current date/hour: meals already eaten by the clock are kept too. */
  now?: Now;
  weekId?: string;
  generatedAt?: string;
}

export type PlannerResult =
  | { ok: true; week: Week; batches: Batch[]; notes: string[] }
  | { ok: false; reason: string; witnesses: string[] };

const WORK_LIMIT = 20000;

export function excludedFoods(prefs: Prefs, taste: Record<string, TasteEntry>): Set<string> {
  const out = new Set([...prefs.dislikes, ...prefs.allergies]);
  for (const [k, e] of Object.entries(taste))
    if (k.startsWith('food:') && e.hard === 'never') out.add(k.slice(5));
  return out;
}

export function generateWeek(input: PlannerInput): PlannerResult {
  const { rev, prefs } = input;
  const foods = foodMap(input.foods);
  const dishes = new Map(input.dishes.map((d) => [d.id, d]));
  const rnd = createRng(input.seed);
  const notes: string[] = [];
  const dates = Array.from({ length: 7 }, (_, i) => addDays(input.monday, i));
  const excluded = excludedFoods(prefs, input.taste);
  // Kept-ness comes from the week being regenerated (locked, eaten by tap or clock, eating out) — never
  // from the fresh skeleton, so a week planned mid-week still gets its past days filled in.
  const keptAt = new Set<string>();
  for (const d of input.keep?.days ?? [])
    for (const which of MAIN_MEALS)
      if (isKept(d[which], d.date, which, input.now)) keptAt.add(`${d.date}|${which}`);
  const isKeptAt = (date: string, which: 'pranzo' | 'cena') => keptAt.has(`${date}|${which}`);
  const keptMeal = (date: string, which: 'pranzo' | 'cena'): Meal | undefined => {
    if (!isKeptAt(date, which)) return undefined;
    return input.keep?.days.find((x) => x.date === date)?.[which];
  };

  // --- 1. Template placement ---------------------------------------------------------------------
  const placement = placeTemplates(input, dates, rnd);
  if (!placement.ok) return placement;
  const templateAt = placement.templates;

  // --- 2. Day skeletons and fixed menus ---------------------------------------------------------
  const days: Day[] = dates.map((date, i) => {
    const t = templateFor(rev, templateAt[i]!);
    const spuntino = rev.rules.morningSnack === 'daily' || !isWeekend(date);
    const kp = keptMeal(date, 'pranzo');
    const kc = keptMeal(date, 'cena');
    return {
      date,
      template: t.n,
      spuntino,
      pranzo: kp ? cloneKept(kp) : emptyMeal(),
      cena: isLibero(t)
        ? kc?.kind === 'libero'
          ? cloneKept(kc)
          : liberoMeal()
        : kc
          ? cloneKept(kc)
          : emptyMeal(),
    };
  });
  const menus = assignFixedMenus(days, input, foods, excluded, rnd, isKeptAt);
  if (!menus.ok) return menus;

  // --- 3. Slot choices under frequency rules -----------------------------------------------------
  const history = historyFromWeeks(input.history, rev, foods, dishes);
  const choice = chooseOptions(days, input, foods, excluded, history, rnd, isKeptAt);
  if (!choice.ok) return choice;

  // --- 4. Dishes, grains and vegetables ---------------------------------------------------------
  const weekHistory: HistoryEntry[] = [...history];
  const usedDishes = new Set<string>();
  for (const day of days) {
    const t = templateFor(rev, day.template);
    for (const which of MAIN_MEALS) {
      const meal = day[which];
      if (meal.kind !== 'planned') continue;
      const mt = mealTemplate(t, which);
      if (!mt) continue;
      if (isKeptAt(day.date, which)) {
        weekHistory.push({
          date: day.date,
          which,
          sig: signatureOf(
            meal,
            resolveMeal(meal, mt, foods),
            meal.dishId ? dishes.get(meal.dishId) : undefined,
            foods,
          ),
        });
        if (meal.dishId) usedDishes.add(meal.dishId);
        continue;
      }
      const picked = pickDishAndGrain({
        day,
        which,
        mt,
        meal,
        input,
        foods,
        excluded,
        history: weekHistory,
        usedDishes,
        rnd,
      });
      meal.dishId = picked.dish?.id;
      meal.veg = picked.veg;
      if (picked.dish) usedDishes.add(picked.dish.id);
      else notes.push(`${day.date} ${which}: no dish in the book fits; shown as its foods.`);
      weekHistory.push({
        date: day.date,
        which,
        sig: signatureOf(meal, resolveMeal(meal, mt, foods), picked.dish, foods),
      });
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
  const batches = prefs.cookDouble
    ? planLeftovers(week, rev, foods, dishes, input.members, {
        excluded,
        isKept: isKeptAt,
        taste: input.taste,
      })
    : [];

  // --- 6. Prove it -------------------------------------------------------------------------------
  const check = checkWeek(week, rev, foods, dishes, { batches, excluded });
  if (!check.ok) {
    return {
      ok: false,
      reason: 'The generated week failed the compliance check (planner bug).',
      witnesses: check.violations.map((v) => v.message),
    };
  }
  return { ok: true, week, batches, notes };
}

// ------------------------------------------------------------------------------------------------
// 1. Template placement
// ------------------------------------------------------------------------------------------------

function placeTemplates(
  input: PlannerInput,
  dates: string[],
  rnd: () => number,
): { ok: true; templates: number[] } | { ok: false; reason: string; witnesses: string[] } {
  const { rev } = input;
  const fixed = new Map<number, number>(); // day index → template
  if (input.keep) {
    input.keep.days.forEach((d) => {
      const i = dates.indexOf(d.date);
      if (
        i >= 0 &&
        (isKept(d.pranzo, d.date, 'pranzo', input.now) || isKept(d.cena, d.date, 'cena', input.now))
      )
        fixed.set(i, d.template);
    });
  }
  const liberoT = rev.templates.find(isLibero);
  if (liberoT && ![...fixed.values()].includes(liberoT.n)) {
    let idx: number;
    if (input.liberoDate !== undefined) {
      idx = dates.indexOf(input.liberoDate);
      if (idx < 0)
        return {
          ok: false,
          reason: `${input.liberoDate} is not in the week of ${input.monday}.`,
          witnesses: [input.liberoDate],
        };
    } else {
      const keptLibero = input.keep?.days.find((d) => d.template === liberoT.n);
      const keptIdx = keptLibero ? dates.indexOf(keptLibero.date) : -1;
      idx = keptIdx >= 0 && !fixed.has(keptIdx) ? keptIdx : [5, 6, 4, 3, 2, 1, 0].find((i) => !fixed.has(i))!;
    }
    if (fixed.has(idx) && fixed.get(idx) !== liberoT.n) {
      return {
        ok: false,
        reason: `The free meal cannot go on ${dates[idx]}: that day is locked or already eaten.`,
        witnesses: [dates[idx]!],
      };
    }
    fixed.set(idx, liberoT.n);
  }
  const weekendDays = [5, 6].filter((i) => !fixed.has(i));
  for (const t of rev.templates) {
    if (!t.weekendStyle || [...fixed.values()].includes(t.n)) continue;
    const slot = weekendDays.shift();
    if (slot !== undefined) fixed.set(slot, t.n);
  }
  const freeDays = dates.map((_, i) => i).filter((i) => !fixed.has(i));
  const freeTemplates = rev.templates.map((t) => t.n).filter((n) => ![...fixed.values()].includes(n));
  if (freeDays.length !== freeTemplates.length)
    return { ok: false, reason: 'Locked days and templates do not line up.', witnesses: [] };
  const lastWeek = input.history.length ? input.history[input.history.length - 1] : undefined;
  const foods = foodMap(input.foods);
  let best: { perm: number[]; score: number }[] = [];
  for (const perm of permutations(freeTemplates)) {
    const arrangement = dates.map((_, i) => fixed.get(i) ?? -1);
    freeDays.forEach((dayIdx, k) => (arrangement[dayIdx] = perm[k]!));
    best.push({ perm: arrangement, score: scoreArrangement(arrangement, rev, lastWeek, dates, foods) });
  }
  best.sort((a, b) => a.score - b.score);
  best = best.slice(0, 3);
  const pick =
    weightedPick(
      best,
      best.map((b, i) => (3 - i) ** 2),
      rnd,
    ) ?? best[0]!;
  return { ok: true, templates: pick.perm };
}

function scoreArrangement(
  arr: number[],
  rev: PlanRevision,
  lastWeek: Week | undefined,
  dates: string[],
  foods: Map<string, Food>,
): number {
  let score = 0;
  const ref = (n: number, which: 'pranzo' | 'cena', role: string): string | undefined => {
    const mt = mealTemplate(templateFor(rev, n), which);
    const o = mt?.slots.find((x) => x.role === role)?.options[0];
    if (!o || o.kind === 'free') return undefined;
    return o.kind === 'food' ? (foods.get(o.foodId)?.subgroup ?? o.foodId) : o.subgroup;
  };
  for (let i = 1; i < arr.length; i++) {
    for (const which of MAIN_MEALS) {
      const pa = ref(arr[i - 1]!, which, 'protein');
      const pb = ref(arr[i]!, which, 'protein');
      if (pa && pa === pb) score += 3;
      if (ref(arr[i - 1]!, which, 'soup') && ref(arr[i]!, which, 'soup')) score += 4;
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

/** Occurrences a non-kept meal will certainly produce: slots where every option matches the rule. */
type KeptAt = (date: string, which: 'pranzo' | 'cena') => boolean;

function unavoidableOccurrences(
  days: Day[],
  input: PlannerInput,
  foods: Map<string, Food>,
  rule: FrequencyRule,
  isKeptAt: KeptAt,
): Occurrence[] {
  const out: Occurrence[] = [];
  for (const day of days) {
    const t = templateFor(input.rev, day.template);
    for (const which of MAIN_MEALS) {
      const meal = day[which];
      if (meal.kind !== 'planned' || isKeptAt(day.date, which)) continue;
      const mt = mealTemplate(t, which);
      if (!mt) continue;
      for (const slot of mt.slots) {
        const opts = slot.options.filter((o) => o.kind !== 'free');
        if (opts.length === 0) continue;
        let minUnits = Infinity;
        for (const o of opts) {
          const cands = optionCandidates(o, input.foods);
          const units = o.qty.kind === 'count' ? o.qty.count : 1;
          const matches =
            cands.length > 0 &&
            cands.every((f) =>
              ruleMatches(rule, {
                date: day.date,
                meal: which,
                foodId: f.id,
                subgroup: f.subgroup,
                units,
                garnish: slot.role === 'topping',
              }),
            );
          minUnits = Math.min(minUnits, matches ? units : 0);
        }
        if (minUnits > 0 && Number.isFinite(minUnits)) {
          const f = optionCandidates(opts[0]!, input.foods)[0]!;
          out.push({
            date: day.date,
            meal: which,
            foodId: f.id,
            subgroup: f.subgroup,
            units: minUnits,
            garnish: false,
          });
        }
      }
    }
  }
  return out;
}

function assignFixedMenus(
  days: Day[],
  input: PlannerInput,
  foods: Map<string, Food>,
  excluded: Set<string>,
  rnd: () => number,
  isKeptAt: KeptAt,
): { ok: true } | { ok: false; reason: string; witnesses: string[] } {
  const { rev } = input;
  const usable = (items: { foodId: string }[]) => items.every((it) => !excluded.has(it.foodId));
  const breakfasts = rev.fixedMenus.colazione.filter((o) => o.when === 'always' && usable(o.items));
  const merende = rev.fixedMenus.merenda.filter((o) => usable(o.items));
  if (breakfasts.length === 0)
    return {
      ok: false,
      reason: 'Every breakfast option uses a food you excluded.',
      witnesses: rev.fixedMenus.colazione.map((o) => o.label),
    };
  if (merende.length === 0)
    return {
      ok: false,
      reason: 'Every afternoon-snack option uses a food you excluded.',
      witnesses: rev.fixedMenus.merenda.map((o) => o.label),
    };
  const used = { b: new Map<string, number>(), m: new Map<string, number>() };
  for (const day of days) {
    const kept = isKeptAt(day.date, 'pranzo') || isKeptAt(day.date, 'cena');
    const keptDay = input.keep?.days.find((d) => d.date === day.date);
    if (kept && keptDay?.colazione) {
      day.colazione = keptDay.colazione;
      day.merenda = keptDay.merenda;
      used.b.set(keptDay.colazione, days.indexOf(day));
      if (keptDay.merenda) used.m.set(keptDay.merenda, days.indexOf(day));
    }
  }
  const dailyRules = rev.exchange.frequency.filter((r) => r.per === 'day' && r.enforce);
  const weeklyUnitRules = rev.exchange.frequency.filter(
    (r) => r.per === 'week' && r.enforce && r.max !== undefined && r.scope === 'all_meals',
  );
  const weekTmp = (ds: Day[]): Week => ({ ...emptyWeek(input), days: ds });
  const skeleton = (d: Day): Day => ({
    ...d,
    pranzo: isKeptAt(d.date, 'pranzo') ? d.pranzo : skipMeal(d.pranzo),
    cena: isKeptAt(d.date, 'cena') ? d.cena : skipMeal(d.cena),
  });
  const unavoidable = new Map(
    weeklyUnitRules.map((r) => [r.id, unavoidableOccurrences(days, input, foods, r, isKeptAt)]),
  );

  for (const day of days) {
    if (day.colazione) continue;
    const orderB = shuffle(breakfasts, rnd).sort(
      (a, b) => (used.b.get(a.id) ?? -9) - (used.b.get(b.id) ?? -9),
    );
    const dates = days.map((d) => d.date);
    let chosenB = orderB[0]!;
    for (const b of orderB) {
      day.colazione = b.id;
      const occ = collectOccurrences(weekTmp(days.map(skeleton)), rev, foods);
      const ok = weeklyUnitRules.every(
        (r) => evaluateRule(r, [...occ, ...(unavoidable.get(r.id) ?? [])], dates).count <= r.max!,
      );
      if (ok) {
        chosenB = b;
        break;
      }
    }
    day.colazione = chosenB.id;
    used.b.set(chosenB.id, days.indexOf(day));
    const orderM = shuffle(merende, rnd).sort((a, c) => (used.m.get(a.id) ?? -9) - (used.m.get(c.id) ?? -9));
    let chosenM = orderM[0]!;
    for (const m of orderM) {
      day.merenda = m.id;
      const occ = collectOccurrences(weekTmp([skeleton(day)]), rev, foods);
      if (dailyRules.every((r) => evaluateRule(r, occ, [day.date]).ok)) {
        chosenM = m;
        break;
      }
    }
    day.merenda = chosenM.id;
    used.m.set(chosenM.id, days.indexOf(day));
  }
  return { ok: true };
}

function emptyWeek(input: PlannerInput): Omit<Week, 'days'> {
  return {
    id: 'tmp',
    planId: input.planId,
    revision: input.rev.revision,
    monday: input.monday,
    seed: input.seed,
    generatedAt: '',
    confirmed: false,
    pantryApplied: false,
  };
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
  isKeptAt: KeptAt,
): { ok: true } | { ok: false; reason: string; witnesses: string[] } {
  const { rev } = input;
  const weeklyRules = rev.exchange.frequency.filter((r) => r.enforce);
  const decisions: Decision[] = [];
  for (let i = 0; i < days.length; i++) {
    const day = days[i]!;
    const t = templateFor(rev, day.template);
    for (const which of MAIN_MEALS) {
      const meal = day[which];
      if (meal.kind !== 'planned' || isKeptAt(day.date, which)) continue;
      const mt = mealTemplate(t, which);
      if (!mt) continue;
      for (const slot of mt.slots) {
        if (slotHasFreeOption(slot) && slot.options.length === 1) continue;
        const picks: Decision['picks'] = [];
        slot.options.forEach((opt, optionIndex) => {
          if (opt.kind === 'free') return;
          const cands = optionCandidates(opt, input.foods).filter((f) => !excluded.has(f.id));
          const scored = cands.map((f) => ({
            optionIndex,
            foodId: opt.kind === 'subgroup' ? f.id : null,
            score: scoreFood(f.id, slot.role, day.date, history, input, optionIndex) * (0.85 + rnd() * 0.3),
          }));
          scored.sort((a, b) => b.score - a.score);
          // Wildcards expand to many foods: keep the best few (after jitter) so the search stays bounded.
          picks.push(...(opt.kind === 'subgroup' ? scored.slice(0, 4) : scored));
        });
        if (picks.length === 0)
          return {
            ok: false,
            reason: `No allowed option for ${slot.id}: everything is excluded by your "never use" list.`,
            witnesses: [slot.id],
          };
        picks.sort((a, b) => b.score - a.score);
        decisions.push({ dayIdx: i, which, slot, picks });
      }
    }
  }

  const baseOcc = collectOccurrences(
    {
      ...emptyWeek(input),
      days: days.map((d) => ({
        ...d,
        pranzo: isKeptAt(d.date, 'pranzo') ? d.pranzo : skipMeal(d.pranzo),
        cena: isKeptAt(d.date, 'cena') ? d.cena : skipMeal(d.cena),
      })),
    } as Week,
    rev,
    foods,
  );
  const dates = days.map((d) => d.date);
  let work = 0;
  let worstRule: { label: string; witnesses: string[] } | null = null;

  const assign = (k: number, occ: Occurrence[]): boolean => {
    if (++work > WORK_LIMIT) return false;
    if (k === decisions.length) {
      for (const r of weeklyRules) {
        const res = evaluateRule(r, occ, dates);
        if (!res.ok) {
          worstRule = {
            label: res.message ?? r.label,
            witnesses: res.witnesses.map((w) => `${w.date} ${w.meal}: ${w.foodId}`),
          };
          return false;
        }
      }
      return true;
    }
    const d = decisions[k]!;
    const foodOf = (p: Decision['picks'][number]) =>
      p.foodId ?? (d.slot.options[p.optionIndex] as { foodId: string }).foodId;
    const usedThisWeek = new Set(
      occ.filter((o) => o.meal === 'pranzo' || o.meal === 'cena').map((o) => o.foodId),
    );
    const picks = [...d.picks].sort(
      (a, b) =>
        b.score * (usedThisWeek.has(foodOf(b)) ? 0.2 : 1) - a.score * (usedThisWeek.has(foodOf(a)) ? 0.2 : 1),
    );
    for (const p of picks) {
      const foodId = foodOf(p);
      const f = foods.get(foodId);
      const o = d.slot.options[p.optionIndex]!;
      const units = o.kind !== 'free' && o.qty.kind === 'count' ? o.qty.count : 1;
      const next: Occurrence = {
        date: days[d.dayIdx]!.date,
        meal: d.which,
        foodId,
        subgroup: f?.subgroup ?? 'condiment',
        units,
        garnish: d.slot.role === 'topping',
      };
      const occ2 = [...occ, next];
      let prune = false;
      for (const r of weeklyRules) {
        if (r.max === undefined || !ruleMatches(r, next)) continue;
        const res = evaluateRule(r, occ2, dates);
        const over =
          r.per === 'week'
            ? res.count > r.max
            : (res.perDay?.find((x) => x.date === next.date)?.count ?? 0) > r.max;
        if (over) {
          prune = true;
          worstRule = {
            label: res.message ?? r.label,
            witnesses: res.witnesses.map((w) => `${w.date} ${w.meal}: ${w.foodId}`),
          };
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
      reason:
        work > WORK_LIMIT
          ? `Could not find a week within the work limit; last blocking rule: ${w?.label ?? 'unknown'}`
          : `No week satisfies every rule. Blocking rule: ${w?.label ?? 'unknown'}`,
      witnesses: w?.witnesses ?? [],
    };
  }
  return { ok: true };
}

function scoreFood(
  foodId: string,
  role: string,
  date: string,
  history: readonly HistoryEntry[],
  input: PlannerInput,
  optionIndex: number,
): number {
  const window = role === 'protein' ? 4 : role === 'cereal' ? 6 : 2;
  const since = daysSinceFood(foodId, history, date);
  const cooldown = since < window ? 0.3 + 0.7 * (since / window) : 1;
  const recency = Number.isFinite(since) ? Math.min(1.5, 0.8 + since / 30) : 1.3;
  const taste = tasteFactor(input.taste, [`food:${foodId}`]);
  const pref = input.prefs.preferMore.includes(foodId)
    ? 1.5
    : input.prefs.preferLess.includes(foodId)
      ? 0.5
      : 1;
  const reference = optionIndex === 0 ? 1.05 : 1;
  return cooldown * recency * taste * pref * reference;
}

function skipMeal(m: Meal): Meal {
  return { ...m, kind: m.kind === 'libero' ? 'libero' : 'out' };
}

// ------------------------------------------------------------------------------------------------
// 4. Dishes, grains and vegetables
// ------------------------------------------------------------------------------------------------

interface PickArgs {
  day: Day;
  which: 'pranzo' | 'cena';
  mt: NonNullable<ReturnType<typeof mealTemplate>>;
  meal: Meal;
  input: PlannerInput;
  foods: Map<string, Food>;
  excluded: Set<string>;
  history: HistoryEntry[];
  usedDishes: Set<string>;
  rnd: () => number;
}

/** Choose the dish and, for "any cereal"-style slots, the grain, jointly: the pair that scores best. */
function pickDishAndGrain(a: PickArgs): { dish: Dish | undefined; veg: string[] } {
  const { meal, mt, foods, input, excluded, history, day } = a;
  const wildcardSlots = mt.slots.filter((s) => {
    const o = s.options[meal.choices[s.id] ?? 0];
    return o?.kind === 'subgroup';
  });
  const alternatives: Record<string, string>[] = [{}];
  for (const s of wildcardSlots) {
    const o = s.options[meal.choices[s.id] ?? 0] as { kind: 'subgroup'; subgroup: Food['subgroup'] };
    const current = meal.wildcard[s.id];
    const siblings = input.foods
      .filter((f) => f.subgroup === o.subgroup && !excluded.has(f.id))
      .sort((x, y) => daysSinceFood(y.id, history, day.date) - daysSinceFood(x.id, history, day.date))
      .slice(0, 6)
      .map((f) => f.id);
    const options = [...new Set([current, ...siblings].filter((x): x is string => !!x))];
    const next: Record<string, string>[] = [];
    for (const base of alternatives) for (const foodId of options) next.push({ ...base, [s.id]: foodId });
    alternatives.splice(0, alternatives.length, ...next);
  }
  let best: { dish: Dish; veg: string[]; wildcard: Record<string, string>; score: number } | null = null;
  const original = { ...meal.wildcard };
  for (const wc of alternatives) {
    meal.wildcard = { ...original, ...wc };
    const lines = resolveMeal(meal, mt, foods);
    const cand = pickDish({ ...a, lines });
    if (cand && (!best || cand.score > best.score)) best = { ...cand, wildcard: { ...meal.wildcard } };
  }
  if (best) {
    meal.wildcard = best.wildcard;
    return { dish: best.dish, veg: best.veg };
  }
  meal.wildcard = original;
  return { dish: undefined, veg: chooseVeg(undefined, day.date, foods, excluded, history, mt) };
}

export function pickDish(
  a: PickArgs & { lines: ResolvedLine[] },
): { dish: Dish; veg: string[]; score: number } | undefined {
  const { day, which, mt, lines, input, foods, excluded, history, usedDishes, rnd } = a;
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
    const repeat = usedDishes.has(d.id) ? 0.05 : 1; // near-hard: the same dish twice in a week only when nothing else fits
    const sugary = veg.some((v) => foods.get(v)?.subgroup === 'veg_sugary') ? 0.7 : 1;
    return { d, veg, score: variety * taste * season * effort * proposed * repeat * sugary };
  });
  scored.sort((x, y) => y.score - x.score);
  const top = scored.slice(0, 3);
  const pick = weightedPick(
    top,
    top.map((t) => t.score),
    rnd,
  );
  return pick ? { dish: pick.d, veg: pick.veg, score: pick.score } : undefined;
}

function chooseVeg(
  dish: Dish | undefined,
  date: string,
  foods: Map<string, Food>,
  excluded: Set<string>,
  history: readonly HistoryEntry[],
  mt: { slots: Slot[] },
): string[] {
  const hasVegSlot = mt.slots.some((s) => s.role === 'veg' && slotHasFreeOption(s));
  const hasSoup = mt.slots.some((s) => s.role === 'soup');
  if (!hasVegSlot && !hasSoup) return [];
  const month = Number(date.slice(5, 7));
  const rotate = (ids: string[]) =>
    [...ids].sort((x, y) => daysSinceFood(y, history, date) - daysSinceFood(x, history, date));
  const fromDish = (dish?.freeVeg ?? []).filter((v) => !excluded.has(v) && foods.get(v)?.isFreeVeg);
  if (fromDish.length > 0) {
    const seasonal = fromDish.filter((v) => inSeasonMonth(foods.get(v)!, month));
    const pool = seasonal.length > 0 ? seasonal : fromDish;
    // Keep the dish's defining vegetable first, rotate the rest by how recently they were eaten.
    const [first, ...rest] = pool;
    return [first!, ...rotate(rest)].slice(0, 3);
  }
  if (hasSoup && !hasVegSlot) return [];
  const pool = [...foods.values()]
    .filter((f) => f.isFreeVeg && f.subgroup === 'veg' && !excluded.has(f.id) && inSeasonMonth(f, month))
    .map((f) => f.id);
  return rotate(pool).slice(0, 2);
}

// ------------------------------------------------------------------------------------------------
// helpers
// ------------------------------------------------------------------------------------------------

export function emptyMeal(): Meal {
  return {
    kind: 'planned',
    choices: {},
    wildcard: {},
    veg: [],
    status: 'planned',
    locked: false,
    partnerEats: true,
  };
}

export function liberoMeal(): Meal {
  return { ...emptyMeal(), kind: 'libero' };
}

/** A kept meal is copied (never aliased) and loses batch links; batches are rebuilt. */
function cloneKept(m: Meal): Meal {
  const c = structuredClone(m);
  delete c.batchId;
  delete c.leftoverOf;
  return c;
}

/** Locked, eaten (by tap or by the clock), or eating out: the planner leaves it alone. */
export function isKept(meal: Meal, date: string, which: 'pranzo' | 'cena', now?: Now): boolean {
  if (meal.locked || meal.status === 'consumed' || meal.kind === 'out') return true;
  return !!now && meal.kind === 'planned' && isConsumed(meal, date, which, now);
}

export function seedFor(monday: string, attempt: number): number {
  return hashString(`${monday}#${attempt}`);
}
