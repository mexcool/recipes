import { clsx } from 'clsx';
import { Link } from '@tanstack/react-router';
import { ChefHat, Check, Clock, MoreHorizontal, RefreshCw, Undo2 } from 'lucide-react';
import { useState } from 'react';
import type { Day, MainMeal } from '@/core/model';
import { WEEKDAY_LONG, weekdayIndex } from '@/core/dates';
import type { Ctx } from '@/store/selectors';
import { actions } from '@/store/actions';
import { t } from '@/i18n/en';
import { mealView } from '../meal-view';
import { Badge, Chip } from './Chip';
import { Button } from './Button';
import { PlateLines } from './PlateLines';
import { Sheet } from './Sheet';
import { useToast } from './Feedback';
import { MealSheet } from './MealSheet';
import { useNow } from '@/store/now';

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
  const [open, setOpen] = useState<string | null>(null);
  const [doneOpen, setDoneOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const now = useNow();
  const week = ctx.h.weeks.find((w) => w.id === weekId);
  const constrained = ctx.h.members.find((m) => m.constrained);
  const partner = ctx.h.members.find((m) => !m.constrained);
  const dayLabel = label ?? `${WEEKDAY_LONG[weekdayIndex(day.date)]} · ${t.meals[which]}`;

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

      {v.kind === 'planned' && (
        <>
          {v.dish && (
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted">
              <span className="inline-flex items-center gap-1">
                <Clock size={14} /> {v.dish.minutes} {t.recipes.minutes}
              </span>
              {v.dish.methods.length > 0 && <span>{v.dish.methods.join(' · ')}</span>}
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
                >
                  {constrained.name} ·{' '}
                  {v.plates.members
                    .find((m) => m.memberId === constrained.id)
                    ?.lines.filter((l) => l.role !== 'oil')
                    .map((l) => l.display)
                    .join(' · ')}
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

          {hero && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Link to="/cook/$date/$meal" params={{ date: day.date, meal: which }} className="contents">
                <Button variant="primary" size="lg" icon={<ChefHat size={18} />}>
                  {t.tonight.cook}
                </Button>
              </Link>
              {!v.consumed && (
                <Button
                  size="lg"
                  icon={<RefreshCw size={18} />}
                  onClick={() => {
                    const r = actions.notTonight(weekId, day.date, which);
                    toast(
                      r.ok ? 'Swapped for another dish with the same foods.' : r.reason,
                      r.ok ? 'ok' : 'error',
                    );
                  }}
                >
                  {t.tonight.notTonight}
                </Button>
              )}
              {v.consumed ? (
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
                  variant="ghost"
                  icon={<Check size={18} />}
                  onClick={() => setDoneOpen(true)}
                >
                  {t.tonight.done}
                </Button>
              )}
              <Button
                size="lg"
                variant="ghost"
                icon={<MoreHorizontal size={18} />}
                onClick={() => setMoreOpen(true)}
                aria-label="More options"
              >
                More
              </Button>
            </div>
          )}
        </>
      )}
      {week && (
        <MealSheet
          ctx={ctx}
          week={week}
          date={day.date}
          which={which}
          now={now}
          open={moreOpen}
          onClose={() => setMoreOpen(false)}
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
