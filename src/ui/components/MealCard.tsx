import { clsx } from 'clsx';
import { Check, ChefHat, Clock, MoreHorizontal, Sparkles, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { isConsumed } from '@/core/consumed';
import { WEEKDAY_LONG, weekdayIndex } from '@/core/dates';
import type { Day, MainMeal } from '@/core/model';
import type { Plates } from '@/core/plates';
import { actions } from '@/store/actions';
import { useNow } from '@/store/now';
import type { Ctx } from '@/store/selectors';
import { methodLabel, t } from '@/i18n/en';
import { mealView } from '../meal-view';
import { Button, ButtonLink } from './Button';
import { Badge, Chip } from './Chip';
import { useToast } from './Feedback';
import { MealSheet, type SheetPanel } from './MealSheet';
import { PlateLines } from './PlateLines';
import { Sheet } from './Sheet';

/** "pasta 70 g · canned chickpeas 35 g": one person's plate on a line, oil and toppings left out. */
function plateSummary(plates: Plates, memberId: string, ctx: Ctx): string {
  return (
    plates.members
      .find((m) => m.memberId === memberId)
      ?.lines.filter((l) => l.role !== 'oil' && l.role !== 'topping')
      .map((l) => `${ctx.foodMap.get(l.foodId)?.nameEn ?? l.foodId} ${l.display}`)
      .join(' · ') ?? ''
  );
}

export function MealCard({
  ctx,
  weekId,
  day,
  which,
  hero = false,
  label,
}: {
  ctx: Ctx;
  weekId: string;
  day: Day;
  which: MainMeal;
  hero?: boolean;
  label?: string;
}) {
  const v = mealView(ctx, day, which);
  const toast = useToast();
  const now = useNow();
  const [open, setOpen] = useState<string | null>(null);
  const [doneOpen, setDoneOpen] = useState(false);
  const [more, setMore] = useState<{ panel?: SheetPanel; notice?: string } | null>(null);
  const week = ctx.h.weeks.find((w) => w.id === weekId);
  const constrained = ctx.h.members.find((m) => m.constrained);
  const partner = ctx.h.members.find((m) => !m.constrained);
  const dayLabel = label ?? `${WEEKDAY_LONG[weekdayIndex(day.date)]} · ${t.meals[which]}`;
  /** Eaten by the clock as well as by status: lunch after 15:00, dinner after 22:00, past days always. */
  const consumed = isConsumed(day[which], day.date, which, now);

  const notTonight = () => {
    const r = actions.notTonight(weekId, day.date, which);
    if (r.ok) toast('Swapped for another dish with the same foods.', 'ok');
    // Nothing else fits these foods: open the sheet on the ingredient panel, where the real choices are.
    else setMore({ panel: 'ingredient', notice: r.reason });
  };
  const planAgain = () => {
    const r = actions.markIn(weekId, day.date, which);
    toast(r.ok ? 'Back on the plan.' : r.reason, r.ok ? 'ok' : 'error');
  };

  const doneOrUndo = v.consumed ? (
    <Button
      size="md"
      variant="ghost"
      icon={<Undo2 size={18} />}
      onClick={() => actions.undoDone(weekId, day.date, which)}
    >
      {t.tonight.undo}
    </Button>
  ) : (
    <Button size="md" icon={<Check size={18} />} onClick={() => setDoneOpen(true)}>
      {t.tonight.done}
    </Button>
  );

  return (
    <section className={clsx('card', hero ? 'p-5' : 'p-4')} aria-label={`${dayLabel}: ${v.title}`}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">{dayLabel}</p>
        <div className="flex gap-1">
          {v.badges.map((b) => (
            <Badge key={b.text} tone={b.tone}>
              {b.text}
            </Badge>
          ))}
          {v.consumed && <Badge tone="ok">{t.tonight.eaten}</Badge>}
        </div>
      </div>
      <h2 className={clsx('font-semibold leading-tight', hero ? 'text-2xl' : 'text-lg')}>{v.title}</h2>
      {v.titleIt && v.titleIt !== v.title && <p className="text-sm text-muted">{v.titleIt}</p>}
      {v.whyToday && <p className="mt-1 text-sm text-olive-2">{v.whyToday}</p>}

      {v.kind === 'libero' && <p className="mt-2 text-ink-2">{t.tonight.freeHint}</p>}
      {v.kind === 'out' && hero && (
        <p className="mt-2 text-ink-2">
          {consumed ? 'Nothing was cooked or bought for this one.' : 'Nothing to cook or buy tonight.'}
        </p>
      )}

      {v.kind === 'planned' && (
        <>
          {v.dish && (
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted">
              <span className="inline-flex items-center gap-1">
                <Clock size={14} /> {v.dish.minutes} {t.recipes.minutes}
              </span>
              {v.dish.methods.length > 0 && <span>{v.dish.methods.map(methodLabel).join(' · ')}</span>}
            </div>
          )}
          {v.plates && constrained && (hero || open === constrained.id) && (
            <div className="mt-3 rounded-2xl bg-olive-soft/60 p-3">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-olive-2">
                {constrained.name}
              </p>
              <PlateLines plates={v.plates} ctx={ctx} memberId={constrained.id} compact />
            </div>
          )}
          {v.plates && (
            <div className="mt-3 flex flex-wrap gap-2">
              {constrained && !hero && (
                <Chip
                  selected={open === constrained.id}
                  onClick={() => setOpen(open === constrained.id ? null : constrained.id)}
                  tone="olive"
                  className="max-w-full text-left"
                >
                  <span>
                    {constrained.name} · {plateSummary(v.plates, constrained.id, ctx)}
                  </span>
                </Chip>
              )}
              {partner && v.plates.members.some((m) => m.memberId === partner.id) && (
                <Chip
                  selected={open === partner.id}
                  onClick={() => setOpen(open === partner.id ? null : partner.id)}
                >
                  {partner.name} · ×{v.plates.members.find((m) => m.memberId === partner.id)?.multiplier}
                </Chip>
              )}
            </div>
          )}
          {open === partner?.id && v.plates && (
            <div className="mt-3 rounded-2xl bg-surface-2 p-3">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">{partner.name}</p>
              <PlateLines plates={v.plates} ctx={ctx} memberId={partner.id} compact />
            </div>
          )}
          {day[which].veg.length > 0 && (
            <p className="mt-2 text-sm text-muted">
              {t.roles.veg}: {day[which].veg.map((x) => ctx.foodMap.get(x)?.nameEn ?? x).join(', ')}{' '}
              <span>— as much as you like</span>
            </p>
          )}
        </>
      )}

      {hero && (
        /* One row at 360 px: Cook, one secondary action, and the sheet behind "More options". Done lives
           in the sheet (and on the Cook screen) until the meal counts as eaten, then it takes the row. */
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {v.kind === 'planned' && (
            <ButtonLink
              to="/cook/$date/$meal"
              params={{ date: day.date, meal: which }}
              variant="primary"
              size="md"
              icon={<ChefHat size={18} />}
              className="flex-1"
            >
              {t.tonight.cook}
            </ButtonLink>
          )}
          {v.kind === 'planned' && !consumed && (
            <Button size="md" onClick={notTonight}>
              {t.tonight.notTonight}
            </Button>
          )}
          {(v.kind === 'libero' || (v.kind === 'planned' && consumed)) && doneOrUndo}
          {v.kind === 'out' && !consumed && (
            <Button size="md" icon={<Sparkles size={18} />} onClick={planAgain}>
              Plan it again
            </Button>
          )}
          <Button
            size="md"
            variant="ghost"
            icon={<MoreHorizontal size={20} />}
            onClick={() => setMore({})}
            aria-label="More options"
            aria-haspopup="dialog"
          />
        </div>
      )}

      {week && (
        <MealSheet
          ctx={ctx}
          week={week}
          date={day.date}
          which={which}
          now={now}
          open={!!more}
          initialPanel={more?.panel}
          notice={more?.notice}
          onClose={() => setMore(null)}
        />
      )}
      <Sheet open={doneOpen} onClose={() => setDoneOpen(false)} title={t.tonight.done}>
        <p className="mb-3 text-ink-2">How was it? (optional)</p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            onClick={() => {
              actions.markDone(weekId, day.date, which, 'up');
              setDoneOpen(false);
            }}
          >
            👍 {t.recipes.like}
          </Button>
          <Button
            onClick={() => {
              actions.markDone(weekId, day.date, which, 'down');
              setDoneOpen(false);
            }}
          >
            👎 {t.recipes.dislike}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              actions.markDone(weekId, day.date, which);
              setDoneOpen(false);
            }}
          >
            Skip
          </Button>
        </div>
      </Sheet>
    </section>
  );
}
