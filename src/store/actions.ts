/**
 * Every user action, as a function over the household store. Each applies a pure core function and
 * stores the result; failures are returned as { ok: false, reason } for the UI to show.
 */
import type {
  Batch,
  Dish,
  Household,
  MainMeal,
  ManualItem,
  Member,
  Plan,
  PlanRevision,
  Prefs,
  Purchase,
  Qty,
  Question,
  Week,
} from '@/core/model';
import { PlanSchema, activePlan, activeRevision } from '@/core/model';
import { addDays, mondayOf } from '@/core/dates';
import { generateWeek, seedFor } from '@/core/planner';
import * as mut from '@/core/mutations';
import type { MutationContext, MutationResult, Now } from '@/core/mutations';
import { purchaseForCheck, type ShoppingItem } from '@/core/shopping';
import { TASTE_SIGNALS, applyTaste } from '@/core/variety';
import { exportHousehold, importHousehold } from '@/core/household';
import { ctxOf, shoppingFor, weekFor } from './selectors';
import { store } from './store';
import { currentNow } from './now';
import { markDocDirty, queueCheck } from './sync';

export type ActionResult =
  { ok: true; warnings?: string[] } | { ok: false; reason: string; violations?: string[] };

export function newId(prefix: string): string {
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${rnd}`;
}

/** Operation ids travel to the service and must never collide within a household: a full UUID. */
export function newOpId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `op-${crypto.randomUUID()}`;
  return `op-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

/** Weeks older than this are dropped from the document; variety looks back 8 weeks at most. */
const KEEP_WEEKS = 26;

const SHELF_STABLE_SECTIONS = new Set(['pasta_grains', 'breakfast_snacks', 'frozen', 'oils_condiments']);

function ctxFor(h: Household, week: Week, now: Now): MutationContext {
  const c = ctxOf(h);
  return {
    rev: c.rev,
    foods: c.foods,
    dishes: h.dishes,
    members: h.members,
    prefs: h.prefs,
    taste: h.taste,
    history: h.weeks.filter((w) => w.monday < week.monday).slice(-6),
    batches: h.batches.filter((b) => b.weekId === week.id),
    now,
  };
}

function putWeek(h: Household, week: Week, batches?: readonly Batch[]): Household {
  const weeks = h.weeks.some((w) => w.id === week.id)
    ? h.weeks.map((w) => (w.id === week.id ? week : w))
    : [...h.weeks, week];
  const otherBatches = batches ? h.batches.filter((b) => b.weekId !== week.id) : h.batches;
  return pruneWeeks({ ...h, weeks, batches: batches ? [...otherBatches, ...batches] : h.batches });
}

/** Keep the document bounded: old weeks, their batches and their purchases go. */
export function pruneWeeks(h: Household, keep = KEEP_WEEKS): Household {
  if (h.weeks.length <= keep) return h;
  const sorted = [...h.weeks].sort((a, b) => a.monday.localeCompare(b.monday));
  const dropped = new Set(sorted.slice(0, sorted.length - keep).map((w) => w.id));
  const purchases = Object.fromEntries(Object.entries(h.purchases).filter(([k]) => !dropped.has(k)));
  return {
    ...h,
    weeks: h.weeks.filter((w) => !dropped.has(w.id)),
    batches: h.batches.filter((b) => !dropped.has(b.weekId)),
    purchases,
  };
}

function applyResult(weekId: string, res: MutationResult): ActionResult {
  if (!res.ok) return { ok: false, reason: res.reason, violations: res.violations?.map((v) => v.message) };
  store.update((h) => putWeek(h, res.week, res.batches));
  return { ok: true, warnings: res.warnings };
}

function weekById(h: Household, weekId: string): Week {
  const w = h.weeks.find((x) => x.id === weekId);
  if (!w) throw new Error(`Unknown week ${weekId}`);
  return w;
}

/** Subtract the pantry stock a finished week used (once). */
function applyPantryConsumption(h: Household, week: Week): Household {
  if (week.pantryApplied) return h;
  const c = ctxOf(h);
  const list = shoppingFor(c, week);
  const pantry = { ...h.pantry };
  for (const it of list.items) {
    if (it.pantryDeductedG > 0)
      pantry[it.foodId] = Math.max(0, (pantry[it.foodId] ?? 0) - it.pantryDeductedG);
  }
  return { ...h, pantry, weeks: h.weeks.map((w) => (w.id === week.id ? { ...w, pantryApplied: true } : w)) };
}

export const actions = {
  // ------------------------------------------------------------------------------------------------
  // Planning
  // ------------------------------------------------------------------------------------------------
  planWeek(
    opts: { monday?: string; liberoDate?: string; keepExisting?: boolean; attempt?: number } = {},
  ): ActionResult {
    const h = store.get();
    const now = currentNow();
    const monday = opts.monday ?? mondayOf(now.date);
    const existing = weekFor(h, monday);
    const c = ctxOf(h);
    const attempt = opts.attempt ?? (existing ? existing.seed + 1 : 0);
    const seed = typeof attempt === 'number' && attempt > 100000 ? attempt : seedFor(monday, attempt);
    const history = h.weeks
      .filter((w) => w.monday < monday)
      .sort((a, b) => a.monday.localeCompare(b.monday))
      .slice(-8);
    const res = generateWeek({
      planId: c.plan.id,
      rev: c.rev,
      foods: c.foods,
      dishes: h.dishes,
      members: h.members,
      prefs: h.prefs,
      taste: h.taste,
      history,
      monday,
      seed,
      ...(opts.liberoDate ? { liberoDate: opts.liberoDate } : {}),
      ...(existing && opts.keepExisting !== false ? { keep: existing } : {}),
      now,
      weekId: existing?.id ?? newId('week'),
      generatedAt: new Date().toISOString(),
    });
    if (!res.ok) return { ok: false, reason: res.reason, violations: res.witnesses };
    store.update((h0) => {
      let next = h0;
      const prev = weekFor(h0, addDays(monday, -7));
      if (prev) next = applyPantryConsumption(next, prev);
      return putWeek(next, res.week, res.batches);
    });
    return { ok: true, warnings: res.notes };
  },

  confirmWeek(weekId: string, confirmed = true): void {
    store.update((h) => ({ ...h, weeks: h.weeks.map((w) => (w.id === weekId ? { ...w, confirmed } : w)) }));
  },

  replaceDish(weekId: string, date: string, which: MainMeal, dishId: string | undefined): ActionResult {
    const h = store.get();
    const week = weekById(h, weekId);
    return applyResult(weekId, mut.replaceDish(week, date, which, dishId, ctxFor(h, week, currentNow())));
  },

  anotherDish(weekId: string, date: string, which: MainMeal): ActionResult {
    const h = store.get();
    const week = weekById(h, weekId);
    const seed = Math.floor(Math.random() * 1e9);
    return applyResult(weekId, mut.anotherDish(week, date, which, ctxFor(h, week, currentNow()), seed));
  },

  notTonight(weekId: string, date: string, which: MainMeal): ActionResult {
    const h = store.get();
    const week = weekById(h, weekId);
    const meal = week.days.find((d) => d.date === date)?.[which];
    const res = this.anotherDish(weekId, date, which);
    if (res.ok && meal?.kind === 'planned' && meal.dishId) {
      store.update((h0) => ({
        ...h0,
        taste: applyTaste(h0.taste, `dish:${meal.dishId}`, TASTE_SIGNALS.notTonight, date),
      }));
    }
    return res;
  },

  setAlternative(
    weekId: string,
    date: string,
    which: MainMeal,
    slotId: string,
    optionIndex: number,
    wildcardFoodId?: string,
  ): ActionResult {
    const h = store.get();
    const week = weekById(h, weekId);
    return applyResult(
      weekId,
      mut.setAlternative(
        week,
        date,
        which,
        slotId,
        optionIndex,
        ctxFor(h, week, currentNow()),
        wildcardFoodId,
      ),
    );
  },

  swapDays(weekId: string, a: string, b: string): ActionResult {
    const h = store.get();
    const week = weekById(h, weekId);
    return applyResult(weekId, mut.swapDays(week, a, b, ctxFor(h, week, currentNow())));
  },

  setLiberoDate(weekId: string, date: string): ActionResult {
    const h = store.get();
    const week = weekById(h, weekId);
    return applyResult(weekId, mut.setLiberoDate(week, date, ctxFor(h, week, currentNow())));
  },

  markOut(weekId: string, date: string, which: MainMeal): ActionResult {
    const h = store.get();
    const week = weekById(h, weekId);
    return applyResult(weekId, mut.markOut(week, date, which, ctxFor(h, week, currentNow())));
  },

  /** Back from "eating out" to a planned meal with the reference options and a fitting dish. */
  markIn(weekId: string, date: string, which: MainMeal): ActionResult {
    const h = store.get();
    const week = weekById(h, weekId);
    return applyResult(weekId, mut.markOut(week, date, which, ctxFor(h, week, currentNow()), false));
  },

  setVeg(weekId: string, date: string, which: MainMeal, veg: string[]): ActionResult {
    const h = store.get();
    const week = weekById(h, weekId);
    return applyResult(weekId, mut.setVeg(week, date, which, veg, ctxFor(h, week, currentNow())));
  },

  toggleLock(weekId: string, date: string, which: MainMeal): void {
    store.update((h) => putWeek(h, mut.toggleLock(weekById(h, weekId), date, which)));
  },

  setPartner(
    weekId: string,
    date: string,
    which: MainMeal,
    patch: { eats?: boolean; multiplier?: number },
  ): void {
    store.update((h) => putWeek(h, mut.setPartner(weekById(h, weekId), date, which, patch)));
  },

  markDone(weekId: string, date: string, which: MainMeal, feedback?: 'up' | 'down'): void {
    store.update((h) => {
      const week = weekById(h, weekId);
      const meal = week.days.find((d) => d.date === date)?.[which];
      let taste = h.taste;
      if (meal?.kind === 'planned' && meal.dishId) {
        taste = applyTaste(
          taste,
          `dish:${meal.dishId}`,
          TASTE_SIGNALS.done +
            (feedback === 'up' ? TASTE_SIGNALS.up : feedback === 'down' ? TASTE_SIGNALS.down : 0),
          date,
        );
      }
      return { ...putWeek(h, mut.setMealStatus(week, date, which, 'consumed')), taste };
    });
  },

  undoDone(weekId: string, date: string, which: MainMeal): void {
    store.update((h) => putWeek(h, mut.setMealStatus(weekById(h, weekId), date, which, 'planned')));
  },

  feedbackDish(dishId: string, signal: 'up' | 'down' | 'more' | 'never' | 'clear'): void {
    const date = currentNow().date;
    store.update((h) => {
      if (signal === 'clear') {
        const taste = { ...h.taste };
        delete taste[`dish:${dishId}`];
        return { ...h, taste };
      }
      if (signal === 'never') return { ...h, taste: applyTaste(h.taste, `dish:${dishId}`, 0, date, 'never') };
      return { ...h, taste: applyTaste(h.taste, `dish:${dishId}`, TASTE_SIGNALS[signal], date) };
    });
  },

  // ------------------------------------------------------------------------------------------------
  // Shopping
  // ------------------------------------------------------------------------------------------------
  checkItem(weekId: string, item: ShoppingItem, by = 'me'): void {
    let op: Purchase | undefined;
    store.update((h) => {
      const weekPurchases = { ...(h.purchases[weekId] ?? {}) };
      const prev = weekPurchases[item.key];
      const at = new Date().toISOString();
      op = purchaseForCheck(item, prev, by, at, newOpId());
      weekPurchases[item.key] = op;
      // Shelf-stable leftovers from pack rounding become pantry stock (editable in Settings). The
      // pantry object is only replaced when it changes: a tick must not count as a document edit.
      const leftover =
        item.buy &&
        item.buy.leftoverG > 0 &&
        SHELF_STABLE_SECTIONS.has(item.section) &&
        !(prev && prev.coveredG > 0)
          ? item.buy.leftoverG
          : 0;
      const pantry = leftover
        ? { ...h.pantry, [item.foodId]: (h.pantry[item.foodId] ?? 0) + leftover }
        : h.pantry;
      return { ...h, purchases: { ...h.purchases, [weekId]: weekPurchases }, pantry };
    });
    if (op)
      void queueCheck({
        opId: op.opId,
        weekId,
        key: item.key,
        checked: true,
        coveredG: op.coveredG,
        by: op.by,
        at: op.at,
        rev: op.rev,
      });
  },

  uncheckItem(weekId: string, item: ShoppingItem, by = 'me'): void {
    // An uncheck leaves a tombstone (coveredG 0) rather than deleting: its timestamp protects the
    // item from an older check arriving late from the other phone.
    const tomb: Purchase = {
      coveredG: 0,
      at: new Date().toISOString(),
      by,
      opId: newOpId(),
      rev: 0,
    };
    store.update((h) => {
      const weekPurchases = { ...(h.purchases[weekId] ?? {}) };
      const prev = weekPurchases[item.key];
      tomb.rev = (prev?.rev ?? 0) + 1;
      weekPurchases[item.key] = tomb;
      const wasChecked = !!prev && prev.coveredG > 0;
      const leftover =
        wasChecked && item.buy && item.buy.leftoverG > 0 && SHELF_STABLE_SECTIONS.has(item.section)
          ? item.buy.leftoverG
          : 0;
      const pantry = leftover
        ? { ...h.pantry, [item.foodId]: Math.max(0, (h.pantry[item.foodId] ?? 0) - leftover) }
        : h.pantry;
      return { ...h, purchases: { ...h.purchases, [weekId]: weekPurchases }, pantry };
    });
    void queueCheck({
      opId: tomb.opId,
      weekId,
      key: item.key,
      checked: false,
      coveredG: 0,
      by,
      at: tomb.at,
      rev: tomb.rev,
    });
  },

  setPantry(foodId: string, grams: number): void {
    store.update((h) => {
      const pantry = { ...h.pantry };
      if (grams <= 0) delete pantry[foodId];
      else pantry[foodId] = Math.round(grams);
      return { ...h, pantry };
    });
  },

  haveIt(item: ShoppingItem): void {
    this.setPantry(item.foodId, (store.get().pantry[item.foodId] ?? 0) + item.toBuyG);
  },

  undoHaveIt(item: ShoppingItem): void {
    this.setPantry(item.foodId, (store.get().pantry[item.foodId] ?? 0) - item.pantryDeductedG);
  },

  addManual(weekId: string, text: string, section: ManualItem['section'] = 'produce'): void {
    const t = text.trim();
    if (!t) return;
    store.update((h) => ({
      ...h,
      manualItems: {
        ...h.manualItems,
        [weekId]: [
          ...(h.manualItems[weekId] ?? []),
          { id: newId('manual'), text: t, section, checked: false, createdAt: new Date().toISOString() },
        ],
      },
    }));
  },

  toggleManual(weekId: string, id: string): void {
    store.update((h) => ({
      ...h,
      manualItems: {
        ...h.manualItems,
        [weekId]: (h.manualItems[weekId] ?? []).map((m) => (m.id === id ? { ...m, checked: !m.checked } : m)),
      },
    }));
  },

  removeManual(weekId: string, id: string): void {
    store.update((h) => ({
      ...h,
      manualItems: { ...h.manualItems, [weekId]: (h.manualItems[weekId] ?? []).filter((m) => m.id !== id) },
    }));
  },

  toggleRunningLow(foodId: string): void {
    store.update((h) => {
      const set = new Set(h.prefs.runningLow);
      if (set.has(foodId)) set.delete(foodId);
      else set.add(foodId);
      return { ...h, prefs: { ...h.prefs, runningLow: [...set] } };
    });
  },

  // ------------------------------------------------------------------------------------------------
  // Dishes
  // ------------------------------------------------------------------------------------------------
  saveDish(dish: Dish): void {
    store.update((h) => {
      const exists = h.dishes.some((d) => d.id === dish.id);
      return {
        ...h,
        dishes: exists ? h.dishes.map((d) => (d.id === dish.id ? dish : d)) : [...h.dishes, dish],
      };
    });
  },

  deleteDish(id: string): void {
    store.update((h) => ({ ...h, dishes: h.dishes.filter((d) => d.id !== id) }));
  },

  // ------------------------------------------------------------------------------------------------
  // Settings
  // ------------------------------------------------------------------------------------------------
  setPrefs(patch: Partial<Prefs>): void {
    store.update((h) => ({ ...h, prefs: { ...h.prefs, ...patch } }));
  },

  setMember(id: string, patch: Partial<Member>): void {
    store.update((h) => ({ ...h, members: h.members.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));
  },

  setHouseholdName(name: string): void {
    store.update((h) => ({ ...h, name }));
  },

  setRevisionStatus(status: PlanRevision['status']): void {
    store.update((h) => {
      const plan = activePlan(h);
      const rev = activeRevision(plan);
      const revisions = plan.revisions.map((r) => (r.revision === rev.revision ? { ...r, status } : r));
      return { ...h, plans: h.plans.map((p) => (p.id === plan.id ? { ...p, revisions } : p)) };
    });
  },

  setNextAppointment(date: string | undefined): void {
    store.update((h) => {
      const plan = activePlan(h);
      return {
        ...h,
        plans: h.plans.map((p) =>
          p.id === plan.id
            ? { ...p, ...(date ? { nextAppointment: date } : { nextAppointment: undefined }) }
            : p,
        ),
      };
    });
  },

  /** Change one option's amount: creates a new revision; existing weeks keep theirs. */
  editOptionAmount(
    templateN: number,
    which: MainMeal,
    slotId: string,
    optionIndex: number,
    qty: Qty,
    label: string,
  ): ActionResult {
    const h = store.get();
    const plan = activePlan(h);
    const rev = activeRevision(plan);
    const next: PlanRevision = structuredClone(rev);
    next.revision = Math.max(...plan.revisions.map((r) => r.revision)) + 1;
    next.label = label || `Edited ${new Date().toISOString().slice(0, 10)}`;
    next.validFrom = new Date().toISOString().slice(0, 10);
    next.status = 'reviewed';
    const t = next.templates.find((x) => x.n === templateN);
    const mt = t ? (which === 'pranzo' ? t.pranzo : 'libero' in t.cena ? null : t.cena) : null;
    const slot = mt?.slots.find((s) => s.id === slotId);
    const opt = slot?.options[optionIndex];
    if (!opt || opt.kind === 'free') return { ok: false, reason: 'That option cannot be edited' };
    opt.qty = qty;
    store.update((h0) => ({
      ...h0,
      plans: h0.plans.map((p) =>
        p.id === plan.id ? { ...p, revisions: [...p.revisions, next], activeRevision: next.revision } : p,
      ),
    }));
    return { ok: true };
  },

  setActiveRevision(revision: number): void {
    store.update((h) => {
      const plan = activePlan(h);
      if (!plan.revisions.some((r) => r.revision === revision)) return h;
      return { ...h, plans: h.plans.map((p) => (p.id === plan.id ? { ...p, activeRevision: revision } : p)) };
    });
  },

  importPlanJson(json: string): ActionResult {
    try {
      const plan: Plan = PlanSchema.parse(JSON.parse(json));
      const h = store.get();
      if (!h.members.some((m) => m.id === plan.memberId))
        return {
          ok: false,
          reason: `The plan is for member "${plan.memberId}", who is not in this household`,
        };
      store.update((h0) => ({
        ...h0,
        plans: [...h0.plans.filter((p) => p.id !== plan.id), plan],
        activePlanId: plan.id,
      }));
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: importProblem(e, 'Not a Stasera plan file') };
    }
  },

  addQuestion(text: string, source: Question['source'] = 'user'): void {
    const t = text.trim();
    if (!t) return;
    store.update((h) =>
      h.questions.some((q) => q.text === t)
        ? h
        : {
            ...h,
            questions: [
              ...h.questions,
              { id: newId('q'), text: t, source, createdAt: new Date().toISOString() },
            ],
          },
    );
  },

  answerQuestion(id: string, answer: string | undefined): void {
    store.update((h) => ({
      ...h,
      questions: h.questions.map((q) =>
        q.id === id ? { ...q, ...(answer ? { answered: answer } : { answered: undefined }) } : q,
      ),
    }));
  },

  removeQuestion(id: string): void {
    store.update((h) => ({ ...h, questions: h.questions.filter((q) => q.id !== id) }));
  },

  exportJson(): string {
    return exportHousehold(store.get());
  },

  /** Replace this phone's data with an exported file; a sync connection on this phone is kept. */
  importJson(json: string): ActionResult {
    try {
      const current = store.get();
      const imported = importHousehold(json);
      store.replace(current.sync ? { ...imported, sync: current.sync } : imported);
      if (current.sync) void markDocDirty();
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: importProblem(e, 'Not a Stasera backup file') };
    }
  },

  async resetDemo(): Promise<void> {
    await store.reset();
  },
};

/** A readable reason for a failed import: schema errors name the missing fields instead of dumping JSON. */
function importProblem(e: unknown, what: string): string {
  if (e instanceof SyntaxError) return `${what}: it is not valid JSON.`;
  if (e && typeof e === 'object' && 'issues' in e && Array.isArray((e as { issues: unknown[] }).issues)) {
    const paths = (e as { issues: { path: PropertyKey[] }[] }).issues
      .map((i) => i.path.map(String).join('.'))
      .filter((p, i, a) => p && a.indexOf(p) === i)
      .slice(0, 4);
    return `${what}${paths.length ? ` (problem with: ${paths.join(', ')})` : ''}.`;
  }
  return e instanceof Error ? e.message : `${what}.`;
}
