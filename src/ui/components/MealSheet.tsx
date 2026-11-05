import { clsx } from 'clsx';
import {
  CalendarDays,
  Check,
  ChefHat,
  Lock,
  LockOpen,
  Minus,
  Plus,
  RefreshCw,
  Replace,
  Sparkles,
  Undo2,
  Utensils,
} from 'lucide-react';
import { useState } from 'react';
import type { Day, MainMeal, MealTemplate, SlotOption, Week } from '@/core/model';
import { MAIN_MEALS, mealTemplate, templateFor } from '@/core/model';
import { WEEKDAY_LONG, WEEKDAY_SHORT, weekdayIndex } from '@/core/dates';
import type { Now } from '@/core/mutations';
import { isConsumed } from '@/core/mutations';
import type { ResolvedLine } from '@/core/resolve';
import { resolveMeal } from '@/core/resolve';
import type { Ctx } from '@/store/selectors';
import type { ActionResult } from '@/store/actions';
import { actions } from '@/store/actions';
import { methodLabel, t } from '@/i18n/en';
import { mealView, type MealView } from '../meal-view';
import { Badge, Chip } from './Chip';
import { Button, ButtonLink } from './Button';
import { PlateLines } from './PlateLines';
import { Sheet } from './Sheet';
import { useToast } from './Feedback';

const MULT_MIN = 0.5;
const MULT_MAX = 2.5;

type Report = (r: ActionResult, okText: string) => boolean;

/** The expandable panels under "Something else?". */
export type SheetPanel = 'ingredient' | 'move';

/** "Thu 5": the label of a day chip. */
export function dayChipLabel(iso: string): string {
  return `${WEEKDAY_SHORT[weekdayIndex(iso)]} ${Number(iso.slice(8, 10))}`;
}

/** The day that carries the free meal this week, if any. */
export function liberoDayOf(week: Week): Day | undefined {
  return week.days.find((d) => MAIN_MEALS.some((w) => d[w].kind === 'libero'));
}

/**
 * Bottom sheet for one meal of a planned week. Time-aware: once a meal counts as eaten only Done/Undo and
 * the lock remain; a day can be moved only while nothing on it has been eaten.
 */
export function MealSheet({
  ctx,
  week,
  date,
  which,
  now,
  open,
  onClose,
  initialPanel,
  notice,
}: {
  ctx: Ctx;
  week: Week;
  date: string;
  which: MainMeal;
  now: Now;
  open: boolean;
  onClose: () => void;
  /** Open with this panel expanded (e.g. after "Not tonight" found nothing else to swap in). */
  initialPanel?: SheetPanel | undefined;
  /** A line explaining why the sheet opened, shown above the options. */
  notice?: string | undefined;
}) {
  const day = week.days.find((d) => d.date === date);
  const title = day ? `${WEEKDAY_LONG[weekdayIndex(day.date)]} · ${t.meals[which]}` : t.meals[which];
  return (
    <Sheet open={open && !!day} onClose={onClose} title={title}>
      {day && (
        <Body
          ctx={ctx}
          week={week}
          day={day}
          which={which}
          now={now}
          onClose={onClose}
          initialPanel={initialPanel}
          notice={notice}
        />
      )}
    </Sheet>
  );
}

function Body({
  ctx,
  week,
  day,
  which,
  now,
  onClose,
  initialPanel,
  notice,
}: {
  ctx: Ctx;
  week: Week;
  day: Day;
  which: MainMeal;
  now: Now;
  onClose: () => void;
  initialPanel?: SheetPanel | undefined;
  notice?: string | undefined;
}) {
  const toast = useToast();
  const [panel, setPanel] = useState<SheetPanel | null>(initialPanel ?? null);
  const meal = day[which];
  const v = mealView(ctx, day, which);
  const weekId = week.id;
  const consumed = isConsumed(meal, day.date, which, now);
  const badges: MealView['badges'] = [
    ...v.badges.filter((b) => b.text !== v.title),
    ...(v.consumed ? [{ text: t.tonight.eaten, tone: 'ok' as const }] : []),
  ];

  const report: Report = (r, okText) => {
    if (!r.ok) toast(r.reason, 'error');
    else if (r.warnings?.length) toast(r.warnings.join(' '), 'info');
    else toast(okText, 'ok');
    return r.ok;
  };

  const lockButton = (
    <Button
      variant="ghost"
      icon={meal.locked ? <LockOpen size={18} /> : <Lock size={18} />}
      onClick={() => actions.toggleLock(weekId, day.date, which)}
      aria-pressed={meal.locked}
    >
      {meal.locked ? t.week.unlock : t.week.lock}
    </Button>
  );

  const doneButton = v.consumed ? (
    <Button
      size="lg"
      variant="ghost"
      icon={<Undo2 size={18} />}
      onClick={() => actions.undoDone(weekId, day.date, which)}
    >
      {t.tonight.undo}
    </Button>
  ) : (
    <Button
      size="lg"
      icon={<Check size={18} />}
      onClick={() => {
        actions.markDone(weekId, day.date, which);
        onClose();
      }}
    >
      {t.tonight.done}
    </Button>
  );

  if (v.kind === 'libero') {
    return (
      <div className="space-y-4">
        <Head v={v} badges={badges} />
        <p className="text-ink-2">{t.tonight.freeHint}</p>
        <FreeMealMover week={week} onMoved={onClose} />
        <div className="flex flex-wrap gap-2">
          {doneButton}
          {lockButton}
        </div>
      </div>
    );
  }

  if (v.kind === 'out') {
    // Eating out is reversible until the meal has passed: back to the plan's own options and a dish.
    return (
      <div className="space-y-4">
        <Head v={v} badges={badges} />
        <p className="text-ink-2">
          {consumed
            ? 'Nothing was cooked or bought for this meal.'
            : 'Nothing to cook or buy for this meal. Changed your mind? Plan it again and Stasera picks a dish that fits the day.'}
        </p>
        <div className="flex flex-wrap gap-2">
          {!consumed && (
            <Button
              variant="primary"
              size="lg"
              icon={<Sparkles size={18} />}
              onClick={() => report(actions.markIn(weekId, day.date, which), 'Back on the plan.')}
            >
              Plan it again
            </Button>
          )}
          {lockButton}
        </div>
      </div>
    );
  }

  const constrained = ctx.h.members.find((m) => m.constrained);
  const partner = ctx.h.members.find((m) => !m.constrained);
  const mult = meal.partnerMultiplier ?? partner?.multiplier ?? 1;
  const canMoveDay = MAIN_MEALS.every((w) => !isConsumed(day[w], day.date, w, now));
  const mt = mealTemplate(templateFor(ctx.rev, day.template), which);
  const setMult = (delta: number) => {
    const next = Math.round(Math.min(MULT_MAX, Math.max(MULT_MIN, mult + delta)) * 10) / 10;
    actions.setPartner(weekId, day.date, which, { multiplier: next });
  };

  return (
    <div className="space-y-4">
      <Head v={v} badges={badges} />

      {v.plates && constrained && (
        <div className="rounded-2xl bg-olive-soft/60 p-3">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-olive-2">{constrained.name}</p>
          <PlateLines plates={v.plates} ctx={ctx} memberId={constrained.id} compact />
          {partner && (
            <p className="mt-2 text-sm text-muted">
              {meal.partnerEats
                ? `${partner.name} · ×${mult.toFixed(1)} of every line`
                : `${partner.name} is not eating this one`}
            </p>
          )}
        </div>
      )}
      {meal.veg.length > 0 && (
        <p className="text-sm text-muted">
          {t.roles.veg}: {meal.veg.map((x) => ctx.foodMap.get(x)?.nameEn ?? x).join(', ')} — as much as you
          like
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {!consumed && (
          <ButtonLink
            to="/cook/$date/$meal"
            params={{ date: day.date, meal: which }}
            variant="primary"
            size="lg"
            icon={<ChefHat size={18} />}
          >
            {t.tonight.cook}
          </ButtonLink>
        )}
        {doneButton}
        {lockButton}
      </div>

      {consumed ? (
        !v.consumed && (
          <p className="text-sm text-muted">
            This meal has passed. Mark it done to log it, or lock it to keep it as it was.
          </p>
        )
      ) : (
        <section aria-label="Change this meal">
          {notice && <p className="mb-3 rounded-xl bg-surface-2 p-3 text-sm text-ink-2">{notice}</p>}
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Something else?</p>
          <div className="flex flex-wrap gap-2">
            <Button
              icon={<RefreshCw size={18} />}
              onClick={() =>
                report(
                  actions.anotherDish(weekId, day.date, which),
                  'Swapped for another dish with the same foods.',
                )
              }
            >
              {t.week.anotherDish}
            </Button>
            {mt && (
              <Button
                icon={<Replace size={18} />}
                aria-expanded={panel === 'ingredient'}
                className={clsx(panel === 'ingredient' && 'bg-cream-2')}
                onClick={() => setPanel(panel === 'ingredient' ? null : 'ingredient')}
              >
                {t.week.ingredient}
              </Button>
            )}
            {canMoveDay && (
              <Button
                icon={<CalendarDays size={18} />}
                aria-expanded={panel === 'move'}
                className={clsx(panel === 'move' && 'bg-cream-2')}
                onClick={() => setPanel(panel === 'move' ? null : 'move')}
              >
                {t.week.moveDay}
              </Button>
            )}
            <Button
              icon={<Utensils size={18} />}
              onClick={() => {
                if (report(actions.markOut(weekId, day.date, which), 'Marked as eating out.')) onClose();
              }}
            >
              {t.week.eatOut}
            </Button>
          </div>
          {!canMoveDay && <p className="mt-2 text-sm text-muted">{t.week.morningOnly}</p>}
          {panel === 'ingredient' && mt && (
            <IngredientPanel ctx={ctx} weekId={weekId} day={day} which={which} mt={mt} report={report} />
          )}
          {panel === 'move' && canMoveDay && (
            <MovePanel week={week} day={day} report={report} onClose={onClose} />
          )}
        </section>
      )}

      {partner && !consumed && (
        <section className="rounded-2xl border border-line p-3" aria-label={`${partner.name}'s portion`}>
          <button
            type="button"
            role="switch"
            aria-checked={meal.partnerEats}
            onClick={() => actions.setPartner(weekId, day.date, which, { eats: !meal.partnerEats })}
            className="tap flex w-full items-center justify-between gap-3 text-left"
          >
            <span className="text-[15px]">{partner.name} eats this</span>
            <span
              className={clsx(
                'relative inline-block h-7 w-12 shrink-0 rounded-full transition',
                meal.partnerEats ? 'bg-olive' : 'bg-line',
              )}
              aria-hidden="true"
            >
              <span
                className={clsx(
                  'absolute top-1 h-5 w-5 rounded-full bg-white shadow transition',
                  meal.partnerEats ? 'left-6' : 'left-1',
                )}
              />
            </span>
          </button>
          {meal.partnerEats && (
            <div className="mt-2 flex items-center justify-between gap-3 border-t border-line pt-2">
              <span className="text-sm text-muted">
                Portion, as a multiple of {constrained?.name ?? 'the plan'}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Smaller portion"
                  disabled={mult <= MULT_MIN}
                  onClick={() => setMult(-0.1)}
                  className="tap flex items-center justify-center rounded-full border border-line bg-surface-2 disabled:opacity-40"
                >
                  <Minus size={16} />
                </button>
                <span className="w-12 text-center text-[15px] font-medium tabular-nums" aria-live="polite">
                  ×{mult.toFixed(1)}
                </span>
                <button
                  type="button"
                  aria-label="Larger portion"
                  disabled={mult >= MULT_MAX}
                  onClick={() => setMult(0.1)}
                  className="tap flex items-center justify-center rounded-full border border-line bg-surface-2 disabled:opacity-40"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function Head({ v, badges }: { v: MealView; badges: MealView['badges'] }) {
  return (
    <div>
      {badges.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1">
          {badges.map((b) => (
            <Badge key={b.text} tone={b.tone}>
              {b.text}
            </Badge>
          ))}
        </div>
      )}
      <h3 className="text-xl font-semibold leading-tight">{v.title}</h3>
      {v.titleIt && v.titleIt !== v.title && <p className="text-sm text-muted">{v.titleIt}</p>}
      {v.whyToday && <p className="mt-1 text-sm text-olive-2">{v.whyToday}</p>}
      {v.dish && (
        <p className="mt-1 text-sm text-muted">
          {v.dish.minutes} {t.recipes.minutes}
          {v.dish.methods.length > 0 && ` · ${v.dish.methods.map(methodLabel).join(' · ')}`}
        </p>
      )}
    </div>
  );
}

/** Every slot of the meal template with its approved options at their own amounts. */
function IngredientPanel({
  ctx,
  weekId,
  day,
  which,
  mt,
  report,
}: {
  ctx: Ctx;
  weekId: string;
  day: Day;
  which: MainMeal;
  mt: MealTemplate;
  report: Report;
}) {
  const meal = day[which];
  const [subOpen, setSubOpen] = useState<{ slotId: string; index: number } | null>(null);
  let lines: ResolvedLine[] = [];
  try {
    lines = resolveMeal(meal, mt, ctx.foodMap);
  } catch {
    lines = [];
  }
  const excluded = new Set([...ctx.h.prefs.dislikes, ...ctx.h.prefs.allergies]);
  const slots = mt.slots.filter((s) => s.options.some((o) => o.kind !== 'free'));
  if (slots.length === 0)
    return <p className="mt-3 text-sm text-muted">Nothing to swap here: the vegetables are free.</p>;

  return (
    <div className="mt-3 space-y-3 rounded-2xl bg-surface-2 p-3">
      {slots.map((slot) => {
        const current = meal.choices[slot.id] ?? 0;
        const line = lines.find((l) => l.slotId === slot.id);
        const selectable = slot.options.filter((o) => o.kind !== 'free').length > 1;
        const currentOpt = slot.options[current];
        const subIndex =
          subOpen?.slotId === slot.id ? subOpen.index : currentOpt?.kind === 'subgroup' ? current : null;
        const subOpt = subIndex === null ? undefined : slot.options[subIndex];
        return (
          <div key={slot.id}>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">
              {t.roles[slot.role]}
            </p>
            <div className="flex flex-wrap gap-2">
              {slot.options.map((opt, i) => {
                if (opt.kind === 'free') return null;
                const selected = current === i;
                const onClick = !selectable
                  ? undefined
                  : opt.kind === 'subgroup'
                    ? () =>
                        setSubOpen(
                          subOpen?.slotId === slot.id && subOpen.index === i
                            ? null
                            : { slotId: slot.id, index: i },
                        )
                    : () =>
                        report(
                          actions.setAlternative(weekId, day.date, which, slot.id, i),
                          `${optionName(ctx, opt)} it is.`,
                        );
                return (
                  <Chip
                    key={i}
                    selected={selected}
                    onClick={onClick}
                    aria-expanded={opt.kind === 'subgroup' && selectable ? subIndex === i : undefined}
                  >
                    {optionName(ctx, opt)}
                    <span className={clsx('tabular-nums', selected ? 'text-on-olive/80' : 'text-muted')}>
                      · {amountOf(opt)}
                    </span>
                  </Chip>
                );
              })}
            </div>
            {subOpt?.kind === 'subgroup' && subIndex !== null && (
              <div className="mt-2 flex flex-wrap gap-2 border-l-2 border-line pl-2">
                {ctx.foods
                  .filter((f) => f.subgroup === subOpt.subgroup && !excluded.has(f.id))
                  .sort((a, b) => a.nameEn.localeCompare(b.nameEn))
                  .map((f) => (
                    <Chip
                      key={f.id}
                      tone="olive"
                      selected={current === subIndex && line?.foodId === f.id}
                      onClick={() =>
                        report(
                          actions.setAlternative(weekId, day.date, which, slot.id, subIndex, f.id),
                          `${f.nameEn} it is.`,
                        )
                      }
                    >
                      {f.nameEn}
                    </Chip>
                  ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MovePanel({
  week,
  day,
  report,
  onClose,
}: {
  week: Week;
  day: Day;
  report: Report;
  onClose: () => void;
}) {
  const others = week.days.filter((d) => d.date !== day.date);
  return (
    <div className="mt-3 rounded-2xl bg-surface-2 p-3">
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">{t.week.swapWith}</p>
      <div className="flex flex-wrap gap-2">
        {others.map((d) => (
          <Chip
            key={d.date}
            onClick={() => {
              if (
                report(
                  actions.swapDays(week.id, day.date, d.date),
                  `Moved to ${WEEKDAY_LONG[weekdayIndex(d.date)]}.`,
                )
              )
                onClose();
            }}
          >
            {dayChipLabel(d.date)}
          </Chip>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">Lunch and dinner travel together.</p>
    </div>
  );
}

/** Chips for the other six days: tapping one moves the free meal (and its day) there. */
export function FreeMealMover({ week, onMoved }: { week: Week; onMoved?: () => void }) {
  const toast = useToast();
  const libero = liberoDayOf(week);
  const others = week.days.filter((d) => d.date !== libero?.date);
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-ink-2">Move the free meal to…</p>
      <div className="flex flex-wrap gap-2">
        {others.map((d) => (
          <Chip
            key={d.date}
            onClick={() => {
              const r = actions.setLiberoDate(week.id, d.date);
              if (r.ok) {
                toast(`Free meal moved to ${WEEKDAY_LONG[weekdayIndex(d.date)]}.`, 'ok');
                onMoved?.();
              } else toast(r.reason, 'error');
            }}
          >
            {dayChipLabel(d.date)}
          </Chip>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">
        The whole day moves with it, so lunch stays paired with dinner.
      </p>
    </div>
  );
}

function optionName(ctx: Ctx, opt: SlotOption): string {
  if (opt.kind === 'free') return '';
  if (opt.kind === 'food') return ctx.foodMap.get(opt.foodId)?.nameEn ?? opt.label ?? opt.foodId;
  return opt.label ?? opt.subgroup.replace(/_/g, ' ');
}

/** The option's own amount, compact: "70 g", "150 ml", "2 × 60 g". */
function amountOf(opt: SlotOption): string {
  if (opt.kind === 'free') return '';
  const q = opt.qty;
  switch (q.kind) {
    case 'g':
      return `${q.g} g`;
    case 'ml':
      return `${q.ml} ml`;
    case 'count': {
      const n = Number.isInteger(q.count) ? String(q.count) : q.count.toFixed(1);
      return q.unitG ? `${n} × ${q.unitG} g` : n;
    }
    case 'free':
      return 'free';
  }
}
