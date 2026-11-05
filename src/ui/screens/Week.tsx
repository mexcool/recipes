import { useNavigate } from '@tanstack/react-router';
import { clsx } from 'clsx';
import { Check, ChevronRight, RefreshCw, ShoppingBasket, Sparkles, Star } from 'lucide-react';
import { useState } from 'react';
import type { Day, MainMeal } from '@/core/model';
import { MAIN_MEALS } from '@/core/model';
import { addDays, isWeekend, mondayOf, WEEKDAY_LONG, weekdayIndex } from '@/core/dates';
import type { RuleResult } from '@/core/frequency';
import { useHousehold } from '@/store/store';
import { useNow } from '@/store/now';
import { actions } from '@/store/actions';
import { ctxOf, rulesFor, weekFor, type Ctx } from '@/store/selectors';
import { t } from '@/i18n/en';
import { mealView } from '../meal-view';
import { Button } from '../components/Button';
import { Card, SectionTitle } from '../components/Card';
import { Badge, Chip } from '../components/Chip';
import { EmptyState, useToast } from '../components/Feedback';
import { Sheet } from '../components/Sheet';
import { FreeMealMover, MealSheet, liberoDayOf } from '../components/MealSheet';

type Tab = 'this' | 'next';

export function WeekScreen() {
  const h = useHousehold();
  const now = useNow();
  const ctx = ctxOf(h);
  const toast = useToast();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('this');
  const [sheet, setSheet] = useState<{ date: string; which: MainMeal } | null>(null);
  const [freeOpen, setFreeOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const thisMonday = mondayOf(now.date);
  const monday = tab === 'this' ? thisMonday : addDays(thisMonday, 7);
  const week = weekFor(h, monday);

  /** The planner is synchronous: give the button one frame to render as busy before it runs. */
  const run = (fn: () => void) => {
    setBusy(true);
    setTimeout(() => {
      try {
        fn();
      } catch (e) {
        toast(e instanceof Error ? e.message : t.common.error, 'error');
      } finally {
        setBusy(false);
      }
    }, 30);
  };
  const tabLabel = tab === 'this' ? t.week.thisWeek : t.week.nextWeek;
  const planFresh = () =>
    run(() => {
      const r = actions.planWeek({ monday });
      toast(r.ok ? `${tabLabel} is ready.` : r.reason, r.ok ? 'ok' : 'error');
    });

  const header = (
    <header className="safe-top px-1 pt-2">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{rangeLabel(monday)}</p>
          <h1 className="text-3xl font-semibold">{t.week.title}</h1>
        </div>
        {week?.confirmed && (
          <Badge tone="ok" className="mb-2">
            <Check size={12} /> {t.week.confirmed}
          </Badge>
        )}
      </div>
      <Segmented
        value={tab}
        onChange={(v) => {
          setTab(v);
          setSheet(null);
        }}
      />
    </header>
  );

  if (!week) {
    return (
      <div className="space-y-4">
        {header}
        <EmptyState
          title={tab === 'this' ? t.tonight.noWeek : 'Next week is not planned yet.'}
          body={
            tab === 'this'
              ? 'Seven days from your plan, varied dishes, one shopping list. The free meal goes on Saturday dinner unless you move it.'
              : `It starts on ${longDate(monday)}. Plan it now and the shopping list follows.`
          }
          action={
            <Button
              variant="primary"
              size="lg"
              icon={<Sparkles size={18} />}
              disabled={busy}
              onClick={planFresh}
            >
              {t.week.generate}
            </Button>
          }
        />
      </div>
    );
  }

  const libero = liberoDayOf(week);
  const liberoMeal = libero ? MAIN_MEALS.find((w) => libero[w].kind === 'libero') : undefined;
  const rules = rulesFor(ctx, week);
  const regenerate = () =>
    run(() => {
      const r = actions.planWeek({ monday, keepExisting: true, attempt: week.seed + 1 });
      toast(r.ok ? 'Regenerated. Locked meals stayed put.' : r.reason, r.ok ? 'ok' : 'error');
    });
  const confirm = () => {
    actions.confirmWeek(week.id);
    void navigate({ to: '/shopping' });
  };

  return (
    <div className="space-y-4">
      {header}

      <div className="space-y-2">
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          icon={<ShoppingBasket size={18} />}
          onClick={confirm}
        >
          {week.confirmed ? 'Shopping list' : t.week.confirm}
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <Button icon={<RefreshCw size={18} />} disabled={busy} onClick={regenerate}>
            {t.week.regenerate}
          </Button>
          {libero && (
            <Chip tone="terra" onClick={() => setFreeOpen(true)}>
              <Star size={14} /> {t.week.freeMeal}: {WEEKDAY_LONG[weekdayIndex(libero.date)]}
            </Chip>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {week.days.map((day) => (
          <DayCard
            key={day.date}
            ctx={ctx}
            day={day}
            today={day.date === now.date}
            onOpen={(which) => setSheet({ date: day.date, which })}
          />
        ))}
      </div>

      <RulesCard rules={rules} />

      {sheet && (
        <MealSheet
          ctx={ctx}
          week={week}
          date={sheet.date}
          which={sheet.which}
          now={now}
          open
          onClose={() => setSheet(null)}
        />
      )}
      <Sheet open={freeOpen} onClose={() => setFreeOpen(false)} title={t.week.freeMeal}>
        {libero && liberoMeal && (
          <p className="mb-3 text-ink-2">
            This week it is {WEEKDAY_LONG[weekdayIndex(libero.date)]} {t.meals[liberoMeal].toLowerCase()}.{' '}
            {t.tonight.freeHint}
          </p>
        )}
        <FreeMealMover week={week} onMoved={() => setFreeOpen(false)} />
      </Sheet>
    </div>
  );
}

function Segmented({ value, onChange }: { value: Tab; onChange: (v: Tab) => void }) {
  const options: { value: Tab; label: string }[] = [
    { value: 'this', label: t.week.thisWeek },
    { value: 'next', label: t.week.nextWeek },
  ];
  return (
    <div
      role="group"
      aria-label="Which week"
      className="mt-3 grid grid-cols-2 rounded-full border border-line bg-surface-2 p-1"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            'tap rounded-full px-4 py-2 text-[15px] font-medium transition',
            value === o.value ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink-2',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function DayCard({
  ctx,
  day,
  today,
  onOpen,
}: {
  ctx: Ctx;
  day: Day;
  today: boolean;
  onOpen: (which: MainMeal) => void;
}) {
  const idx = weekdayIndex(day.date);
  const breakfast = ctx.rev.fixedMenus.colazione.find((o) => o.id === day.colazione);
  const merenda = ctx.rev.fixedMenus.merenda.find((o) => o.id === day.merenda);
  const hint = ctx.rev.templates.find((x) => x.n === day.template)?.hint;
  return (
    <section
      className={clsx('card p-4', today && 'border-olive/50 ring-1 ring-olive/30')}
      aria-label={`${WEEKDAY_LONG[idx]} ${shortDate(day.date)}`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 className={clsx('text-lg font-semibold', today && 'text-olive-2')}>
          {WEEKDAY_LONG[idx]} <span className="text-base font-normal text-muted">{shortDate(day.date)}</span>
        </h2>
        <div className="flex shrink-0 items-center gap-1">
          {today && <Badge tone="olive">{t.common.today}</Badge>}
          <span title={hint}>
            <Badge>
              {t.week.day} {day.template}
            </Badge>
          </span>
        </div>
      </div>
      <p className="mt-1 text-sm leading-snug text-muted">
        {t.meals.colazione}: {breakfast?.label ?? '—'}
      </p>
      <p className="text-sm leading-snug text-muted">
        {t.meals.merenda}: {merenda?.label ?? '—'}
      </p>
      {isWeekend(day.date) && !day.spuntino && (
        <p className="text-sm leading-snug text-muted">{t.tonight.noSnack}</p>
      )}
      <div className="mt-2 divide-y divide-line border-t border-line">
        {MAIN_MEALS.map((which) => (
          <MealRow key={which} ctx={ctx} day={day} which={which} onOpen={() => onOpen(which)} />
        ))}
      </div>
    </section>
  );
}

function MealRow({ ctx, day, which, onOpen }: { ctx: Ctx; day: Day; which: MainMeal; onOpen: () => void }) {
  const v = mealView(ctx, day, which);
  const free = v.kind === 'libero';
  const badges = v.badges.filter((b) => b.text !== v.title);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-label={`${t.meals[which]}: ${v.title}`}
      className="tap -mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-surface-2 active:bg-surface-2"
    >
      <span className="w-12 shrink-0 text-xs font-medium uppercase tracking-wide text-muted">
        {t.meals[which]}
      </span>
      <span className="min-w-0 flex-1">
        <span className={clsx('block font-medium leading-snug', free && 'text-terra')}>
          {free && <Star size={14} className="-mt-0.5 mr-1 inline" aria-hidden="true" />}
          {v.title}
        </span>
        {v.foodsLine && <span className="block text-sm leading-snug text-muted">{v.foodsLine}</span>}
        {(badges.length > 0 || v.consumed) && (
          <span className="mt-1 flex flex-wrap gap-1">
            {badges.map((b) => (
              <Badge key={b.text} tone={b.tone}>
                {b.text}
              </Badge>
            ))}
            {v.consumed && <Badge tone="ok">{t.tonight.eaten}</Badge>}
          </span>
        )}
      </span>
      <ChevronRight size={18} className="shrink-0 text-muted" aria-hidden="true" />
    </button>
  );
}

function RulesCard({ rules }: { rules: RuleResult[] }) {
  if (rules.length === 0) return null;
  return (
    <Card>
      <SectionTitle className="px-0">{t.week.rules}</SectionTitle>
      <ul className="divide-y divide-line">
        {rules.map((r) => (
          <RuleRow key={r.rule.id} r={r} />
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted">Counted from the planned meals; eating out is not counted.</p>
    </Card>
  );
}

function RuleRow({ r }: { r: RuleResult }) {
  const { rule, count, ok } = r;
  const over = !ok && rule.max !== undefined && count > rule.max;
  const status = ok ? 'ok' : over ? 'over' : 'under';
  const range =
    rule.min !== undefined && rule.max !== undefined
      ? `${rule.min}–${rule.max}`
      : rule.min !== undefined
        ? `≥ ${rule.min}`
        : rule.max !== undefined
          ? `≤ ${rule.max}`
          : '';
  return (
    <li className="flex items-center gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-[15px] leading-snug text-ink-2">{rule.label}</p>
        {rule.review && <Badge className="mt-1">{t.week.review}</Badge>}
      </div>
      <p className="shrink-0 text-right tabular-nums">
        <span className="text-lg font-semibold">{count}</span>
        {range && (
          <span className="text-sm text-muted">
            {' '}
            / {range}
            {rule.per === 'day' ? ' a day' : ''}
          </span>
        )}
      </p>
      {status === 'ok' ? (
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ok-soft text-ok"
          role="img"
          aria-label="Within the plan"
        >
          <Check size={15} />
        </span>
      ) : (
        <Badge tone={rule.review ? 'warn' : 'terra'} className="shrink-0">
          {status}
        </Badge>
      )}
    </li>
  );
}

function shortDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function longDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function rangeLabel(monday: string): string {
  const a = new Date(`${monday}T12:00:00`);
  const b = new Date(`${addDays(monday, 6)}T12:00:00`);
  if (a.getMonth() === b.getMonth())
    return `${a.getDate()}–${b.getDate()} ${b.toLocaleDateString('en-GB', { month: 'long' })}`;
  return `${a.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${b.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
}
