import { Link, useParams } from '@tanstack/react-router';
import { ArrowLeft, Check } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { MainMeal } from '@/core/model';
import { mealTemplate, templateFor } from '@/core/model';
import { dishTitles } from '@/core/title';
import { useHousehold } from '@/store/store';
import { useNow } from '@/store/now';
import { actions } from '@/store/actions';
import { ctxOf, dayOf, linesFor, platesFor, renderStep, weekFor } from '@/store/selectors';
import { t } from '@/i18n/en';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { EmptyState } from '../components/Feedback';
import { PlatesTable } from '../components/PlateLines';
import { POT_HINT } from '../meal-view';
import { Badge } from '../components/Chip';

export function CookScreen() {
  const { date, meal } = useParams({ strict: false }) as { date: string; meal: MainMeal };
  const h = useHousehold();
  const now = useNow();
  const ctx = ctxOf(h);
  const week = weekFor(h, date);
  const day = dayOf(week, date);
  const [done, setDone] = useState(false);
  useWakeLock();

  if (!week || !day || day[meal].kind !== 'planned') {
    return <EmptyState title="Nothing to cook here" action={<BackLink />} />;
  }
  const m = day[meal];
  const dish = m.dishId ? ctx.dishes.get(m.dishId) : undefined;
  const lines = linesFor(ctx, day, meal);
  const plates = platesFor(ctx, day, meal);
  const mt = mealTemplate(templateFor(ctx.rev, day.template), meal);
  const vegNames = m.veg.map((v) => ctx.foodMap.get(v)?.nameEn ?? v);
  const potHints = (dish?.bindings ?? [])
    .filter((b) => b.role !== 'veg')
    .map((b) => {
      const line = lines.find((l) => l.role === b.role);
      if (!line) return null;
      return {
        role: b.role,
        food: ctx.foodMap.get(line.foodId)?.nameEn ?? line.foodId,
        hint: POT_HINT[b.pot] ?? '',
        prep: b.prep,
      };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
  const isToday = date === now.date;
  const titles = dish ? dishTitles(dish, ctx.foodMap, lines) : undefined;

  return (
    <div className="space-y-4">
      <div className="safe-top flex items-center gap-2 pt-2">
        <BackLink />
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">
            {t.meals[meal]} · {date}
          </p>
          <h1 className="text-2xl font-semibold leading-tight">{titles ? titles.en : t.tonight.noDish}</h1>
          {titles?.it && <p className="text-sm text-muted">{titles.it}</p>}
        </div>
      </div>

      {plates && (
        <Card>
          <h2 className="mb-2 text-base font-semibold">{t.tonight.plates}</h2>
          <PlatesTable plates={plates} ctx={ctx} />
          {vegNames.length > 0 && (
            <p className="mt-3 text-sm text-ink-2">
              {t.roles.veg}: {vegNames.join(', ')}{' '}
              <span className="text-muted">— as much as you like, not weighed</span>
            </p>
          )}
        </Card>
      )}

      {potHints.length > 0 && (
        <Card>
          <h2 className="mb-2 text-base font-semibold">How to portion</h2>
          <ul className="space-y-2">
            {potHints.map((p) => (
              <li key={p.role} className="flex items-start gap-2 text-sm">
                <Badge tone="olive">{t.roles[p.role as keyof typeof t.roles] ?? p.role}</Badge>
                <span>
                  <span className="font-medium">{p.food}</span>
                  {p.prep && <span className="text-ink-2"> — {p.prep}</span>}
                  <span className="block text-muted">{p.hint}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <h2 className="mb-2 text-base font-semibold">{t.recipes.steps}</h2>
        {dish ? (
          <ol className="space-y-3">
            {dish.steps.map((s, i) => (
              <li key={i} className="flex gap-3 text-[17px] leading-snug">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-olive-soft text-sm font-semibold text-olive-2">
                  {i + 1}
                </span>
                <span>{renderStep(s, lines, ctx, plates)}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-ink-2">
            No recipe attached. Cook{' '}
            {lines.map((l) => ctx.foodMap.get(l.foodId)?.nameEn ?? l.foodId).join(', ')} with the vegetables,
            using the allowed methods ({ctx.rev.rules.methods.join(', ')}).
          </p>
        )}
        {mt?.note && <p className="mt-3 rounded-xl bg-surface-2 p-3 text-sm text-ink-2">{mt.note}</p>}
      </Card>

      {dish && (
        <Card className="text-sm text-muted">
          {t.recipes.condiments}:{' '}
          {dish.condiments.map((c) => ctx.foodMap.get(c)?.nameEn ?? c).join(', ') || '—'} ·{' '}
          {t.recipes.methods}: {dish.methods.join(', ') || '—'}
        </Card>
      )}

      {!m.status.includes('consumed') && !done && (
        <div className="flex gap-2">
          <Button
            variant="primary"
            size="lg"
            icon={<Check size={18} />}
            onClick={() => {
              actions.markDone(week.id, date, meal, 'up');
              setDone(true);
            }}
          >
            {t.tonight.done} 👍
          </Button>
          <Button
            size="lg"
            onClick={() => {
              actions.markDone(week.id, date, meal, 'down');
              setDone(true);
            }}
          >
            👎
          </Button>
          {!isToday && <span className="self-center text-sm text-muted">Not today's meal</span>}
        </div>
      )}
      {(done || m.status === 'consumed') && <p className="text-center text-ok">Marked as eaten. Enjoy!</p>}
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/"
      className="tap flex items-center justify-center rounded-full text-ink-2 hover:bg-surface-2"
      aria-label={t.common.back}
    >
      <ArrowLeft size={22} />
    </Link>
  );
}

function useWakeLock() {
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> };
    };
    nav.wakeLock
      ?.request('screen')
      .then((l) => (lock = l))
      .catch(() => undefined);
    return () => {
      lock?.release().catch(() => undefined);
    };
  }, []);
}
