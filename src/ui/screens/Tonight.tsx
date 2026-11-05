import { Link } from '@tanstack/react-router';
import { CalendarDays, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { addDays, isWeekend, mondayOf } from '@/core/dates';
import type { Household, Week } from '@/core/model';
import type { Now } from '@/core/consumed';
import { useHousehold } from '@/store/store';
import { useNow } from '@/store/now';
import { actions } from '@/store/actions';
import { ctxOf, dayOf, nextMealOf, weekFor, type Ctx } from '@/store/selectors';
import { t } from '@/i18n/en';
import { longDate } from '../labels';
import { mealView } from '../meal-view';
import { Button, ButtonLink } from '../components/Button';
import { Card, SectionTitle } from '../components/Card';
import { EmptyState, useToast } from '../components/Feedback';
import { MealCard } from '../components/MealCard';

/** The first planned week after today, if any. */
function nextPlannedWeek(h: Household, date: string): Week | undefined {
  return h.weeks.filter((w) => w.monday > date).sort((a, b) => a.monday.localeCompare(b.monday))[0];
}

export function TonightScreen() {
  const h = useHousehold();
  const now = useNow();
  const ctx = ctxOf(h);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const thisMonday = mondayOf(now.date);
  // Only the week that contains today counts here; a future week gets its own card below.
  const week = weekFor(h, now.date);
  const today = dayOf(week, now.date);

  /** The planner is synchronous: give the button one frame to paint as busy before it runs. */
  const plan = (monday: string) => {
    setBusy(true);
    setTimeout(() => {
      try {
        const r = actions.planWeek({ monday });
        const ready = monday === thisMonday ? t.tonight.thisWeekReady : `${t.week.nextWeek} is ready.`;
        toast(r.ok ? ready : `${t.week.unsatisfiable} ${r.reason}`, r.ok ? 'ok' : 'error');
      } catch (e) {
        toast(e instanceof Error ? e.message : t.common.error, 'error');
      } finally {
        setBusy(false);
      }
    }, 30);
  };

  if (!week || !today) {
    const upcoming = nextPlannedWeek(h, now.date);
    return (
      <div className="space-y-4">
        <Header now={now} />
        {upcoming ? (
          <UpcomingWeek ctx={ctx} week={upcoming} />
        ) : (
          <EmptyState
            title={t.tonight.noWeek}
            body="Stasera drafts a whole week from your plan: seven days, varied dishes, one shopping list."
            action={
              <Button
                variant="primary"
                size="lg"
                icon={<Sparkles size={18} />}
                disabled={busy}
                onClick={() => plan(thisMonday)}
              >
                {t.tonight.planNow}
              </Button>
            }
          />
        )}
      </div>
    );
  }

  const which = nextMealOf(now);
  const other = which === 'pranzo' ? 'cena' : 'pranzo';
  // Tomorrow may belong to next week's plan (Sunday evening): look it up by its own date.
  const tomorrowDate = addDays(now.date, 1);
  const tomorrowWeek = weekFor(h, tomorrowDate);
  const tomorrow = dayOf(tomorrowWeek, tomorrowDate);
  const breakfast = ctx.rev.fixedMenus.colazione.find((o) => o.id === today.colazione);
  const merenda = ctx.rev.fixedMenus.merenda.find((o) => o.id === today.merenda);

  return (
    <div className="space-y-5">
      <Header now={now} />
      <MealCard
        ctx={ctx}
        weekId={week.id}
        day={today}
        which={which}
        hero
        label={`${t.common.today} · ${t.meals[which]}`}
      />
      {which === 'pranzo' && (
        <MealCard
          ctx={ctx}
          weekId={week.id}
          day={today}
          which={other}
          label={`${t.common.today} · ${t.meals.cena}`}
        />
      )}
      {which === 'cena' && h.prefs.lunchbox && tomorrowWeek && tomorrow && !isWeekend(tomorrow.date) && (
        <div>
          <SectionTitle>{t.tonight.tomorrowLunch}</SectionTitle>
          <MealCard
            ctx={ctx}
            weekId={tomorrowWeek.id}
            day={tomorrow}
            which="pranzo"
            label={`${t.common.tomorrow} · ${t.meals.pranzo} — ${t.tonight.lunchboxHint}`}
          />
        </div>
      )}
      <Card>
        <SectionTitle className="mb-1">{t.tonight.breakfast}</SectionTitle>
        <p className="text-ink-2">{breakfast?.label ?? '—'}</p>
        <p className="mt-2 text-sm text-muted">
          {t.meals.spuntino}: {today.spuntino ? 'a portion of fruit' : t.tonight.noSnack} · {t.meals.merenda}:{' '}
          {merenda?.label ?? '—'}
        </p>
      </Card>
      <Link to="/week" className="flex items-center justify-center gap-2 py-2 text-sm text-olive-2">
        <CalendarDays size={16} /> {t.week.title}
      </Link>
    </div>
  );
}

/** Today has no plan but a later week does: say when it starts and what it opens with. */
function UpcomingWeek({ ctx, week }: { ctx: Ctx; week: Week }) {
  const monday = week.days.find((d) => d.date === week.monday) ?? week.days[0];
  const lunch = monday ? mealView(ctx, monday, 'pranzo') : undefined;
  const dinner = monday ? mealView(ctx, monday, 'cena') : undefined;
  return (
    <Card className="flex flex-col items-start gap-3">
      <div>
        <h2 className="text-xl font-semibold">Your week starts {longDate(week.monday)}</h2>
        <p className="mt-1 text-ink-2">Nothing is planned before then, so cook as you like.</p>
        {lunch && dinner && (
          <p className="mt-2 text-sm text-muted">
            {t.meals.pranzo}: {lunch.title} · {t.meals.cena}: {dinner.title}
          </p>
        )}
      </div>
      <ButtonLink to="/week" icon={<CalendarDays size={18} />}>
        See the week
      </ButtonLink>
    </Card>
  );
}

function Header({ now }: { now: Now }) {
  return (
    <header className="safe-top px-1 pt-2">
      <p className="text-sm text-muted">{longDate(now.date)}</p>
      <h1 className="text-3xl font-semibold">{t.app.name}</h1>
    </header>
  );
}
