import { Link } from '@tanstack/react-router';
import { CalendarDays, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { addDays, mondayOf, isWeekend } from '@/core/dates';
import { useHousehold } from '@/store/store';
import { useNow } from '@/store/now';
import { actions } from '@/store/actions';
import { ctxOf, currentWeek, dayOf, nextMealOf, nextMondayFrom } from '@/store/selectors';
import { t } from '@/i18n/en';
import { Button } from '../components/Button';
import { Card, SectionTitle } from '../components/Card';
import { EmptyState, useToast } from '../components/Feedback';
import { MealCard } from '../components/MealCard';

export function TonightScreen() {
  const h = useHousehold();
  const now = useNow();
  const ctx = ctxOf(h);
  const week = currentWeek(h, now);
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const plan = (monday: string) => {
    setBusy(true);
    const r = actions.planWeek({ monday });
    setBusy(false);
    toast(r.ok ? t.tonight.thisWeekReady : `${t.week.unsatisfiable} ${r.reason}`, r.ok ? 'ok' : 'error');
  };

  const today = dayOf(week, now.date);
  if (!week || !today) {
    const thisMonday = mondayOf(now.date);
    const nextMonday = nextMondayFrom(now);
    return (
      <div className="space-y-4">
        <Header now={now} />
        <EmptyState
          title={t.tonight.noWeek}
          body="Stasera drafts a whole week from your plan: seven days, varied dishes, one shopping list."
          action={
            <div className="flex flex-col gap-2">
              <Button
                variant="primary"
                size="lg"
                icon={<Sparkles size={18} />}
                disabled={busy}
                onClick={() => plan(isWeekend(now.date) && now.hour >= 12 ? nextMonday : thisMonday)}
              >
                {t.tonight.planNow}
              </Button>
              {week && (
                <Link to="/week" className="text-center text-sm text-olive-2 underline">
                  Your plan starts on {week.monday}
                </Link>
              )}
            </div>
          }
        />
      </div>
    );
  }

  const which = nextMealOf(now);
  const other = which === 'pranzo' ? 'cena' : 'pranzo';
  const tomorrow = dayOf(week, addDays(now.date, 1));
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
      {which === 'cena' && h.prefs.lunchbox && tomorrow && !isWeekend(tomorrow.date) && (
        <div>
          <SectionTitle>{t.tonight.tomorrowLunch}</SectionTitle>
          <MealCard
            ctx={ctx}
            weekId={week.id}
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

function Header({ now }: { now: { date: string; hour: number } }) {
  const d = new Date(`${now.date}T12:00:00`);
  const pretty = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    <header className="safe-top px-1 pt-2">
      <p className="text-sm text-muted">{pretty}</p>
      <h1 className="text-3xl font-semibold">{t.app.name}</h1>
    </header>
  );
}
