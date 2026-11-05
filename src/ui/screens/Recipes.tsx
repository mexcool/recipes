import { Link, useNavigate } from '@tanstack/react-router';
import { Clock, Plus, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Dish, TasteEntry } from '@/core/model';
import { validateDish } from '@/core/validate';
import { useHousehold } from '@/store/store';
import { ctxOf, type Ctx } from '@/store/selectors';
import { t } from '@/i18n/en';
import { Button } from '../components/Button';
import { Badge, Chip } from '../components/Chip';
import { EmptyState } from '../components/Feedback';
import { fitBadgeOf, TasteMark } from '../components/Verdict';

type Filter = 'all' | 'favourites' | 'lunchbox' | 'lunch' | 'dinner' | 'drafts';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'favourites', label: t.recipes.favourites },
  { id: 'lunchbox', label: t.recipes.lunchbox },
  { id: 'lunch', label: t.meals.pranzo },
  { id: 'dinner', label: t.meals.cena },
  { id: 'drafts', label: 'Drafts' },
];

export function RecipesScreen() {
  const h = useHousehold();
  const navigate = useNavigate();
  const ctx = useMemo(() => ctxOf(h), [h]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  // One verdict per dish per render of the catalogue: the list badges read "Fits Day N lunch" from it.
  const verdicts = useMemo(
    () => new Map(h.dishes.map((d) => [d.id, validateDish(d, ctx.rev, ctx.foods)])),
    [h.dishes, ctx],
  );
  const haystacks = useMemo(() => new Map(h.dishes.map((d) => [d.id, haystackOf(d, ctx)])), [h.dishes, ctx]);

  const needle = query.trim().toLowerCase();
  const shown = h.dishes.filter(
    (d) =>
      matchesFilter(d, filter, h.taste[`dish:${d.id}`]) &&
      (!needle || (haystacks.get(d.id) ?? '').includes(needle)),
  );
  const filtered = needle !== '' || filter !== 'all';

  return (
    <div className="space-y-4">
      <header className="safe-top flex items-end justify-between gap-3 px-1 pt-2">
        <div className="min-w-0">
          <p className="text-sm text-muted">
            {h.dishes.length} {h.dishes.length === 1 ? 'dish' : 'dishes'}
          </p>
          <h1 className="text-3xl font-semibold">{t.recipes.title}</h1>
        </div>
        <Button variant="primary" icon={<Plus size={18} />} onClick={() => navigate({ to: '/recipes/new' })}>
          {t.recipes.newDish}
        </Button>
      </header>

      <div className="relative">
        <label htmlFor="recipe-search" className="sr-only">
          {t.recipes.search}
        </label>
        <Search
          size={18}
          className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted"
          aria-hidden="true"
        />
        <input
          id="recipe-search"
          type="text"
          enterKeyHint="search"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.recipes.search}
          className="tap w-full rounded-full border border-line bg-surface py-3 pr-12 pl-11 text-[15px] text-ink placeholder:text-muted"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Clear search"
            className="tap absolute top-1/2 right-1 flex -translate-y-1/2 items-center justify-center rounded-full text-muted hover:bg-surface-2"
          >
            <X size={18} />
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter dishes">
        {FILTERS.map((f) => (
          <Chip key={f.id} selected={filter === f.id} onClick={() => setFilter(f.id)}>
            {f.label}
          </Chip>
        ))}
      </div>

      {h.dishes.length === 0 ? (
        <EmptyState
          title="No dishes yet"
          body="Add the dishes you actually cook; Stasera checks each one against your plan."
          action={
            <Button
              variant="primary"
              icon={<Plus size={18} />}
              onClick={() => navigate({ to: '/recipes/new' })}
            >
              {t.recipes.newDish}
            </Button>
          }
        />
      ) : shown.length === 0 ? (
        <EmptyState
          title="Nothing matches"
          body={needle ? `No dish mentions "${query.trim()}" in this filter.` : 'No dish in this filter yet.'}
          action={
            <Button
              onClick={() => {
                setQuery('');
                setFilter('all');
              }}
            >
              Show all dishes
            </Button>
          }
        />
      ) : (
        <>
          {filtered && (
            <p className="px-1 text-sm text-muted" aria-live="polite">
              {shown.length} of {h.dishes.length}
            </p>
          )}
          <ul className="space-y-3">
            {shown.map((d) => {
              const verdict = verdicts.get(d.id);
              const fit = verdict ? fitBadgeOf(verdict) : undefined;
              return (
                <li key={d.id}>
                  <Link
                    to="/recipes/$id"
                    params={{ id: d.id }}
                    className="card tap block p-4 transition hover:bg-surface-2 active:scale-[0.99]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[17px] leading-tight font-semibold text-ink">{d.titleEn}</p>
                        {d.titleIt && d.titleIt !== d.titleEn && (
                          <p className="mt-0.5 text-sm text-muted">{d.titleIt}</p>
                        )}
                      </div>
                      <TasteMark taste={h.taste[`dish:${d.id}`]} className="shrink-0" />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="mr-1 inline-flex items-center gap-1 text-sm text-muted tabular-nums">
                        <Clock size={14} aria-hidden="true" /> {d.minutes} {t.recipes.minutes}
                      </span>
                      {d.status === 'draft' && <Badge>{t.recipes.draft}</Badge>}
                      {d.status === 'proposed' && <Badge tone="warn">{t.recipes.proposed}</Badge>}
                      {fit && <Badge tone={fit.tone}>{fit.text}</Badge>}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

function matchesFilter(d: Dish, filter: Filter, taste: TasteEntry | undefined): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'favourites':
      return (
        d.tags.includes('favourite') || (taste !== undefined && taste.score > 0 && taste.hard !== 'never')
      );
    case 'lunchbox':
      return d.lunchboxOk;
    case 'lunch':
      return d.mealTypes.includes('pranzo');
    case 'dinner':
      return d.mealTypes.includes('cena');
    case 'drafts':
      return d.status === 'draft';
  }
}

/** Everything the search box can hit: both titles plus the names of the foods the dish uses. */
function haystackOf(d: Dish, ctx: Ctx): string {
  const parts: string[] = [d.titleEn, d.titleIt];
  for (const b of d.bindings) {
    if (b.foods === 'any_cereal') parts.push('any cereal');
    else if (b.foods === 'any_bread') parts.push('any bread');
    else if (b.foods === 'any') parts.push('any');
    else for (const id of b.foods) parts.push(nameOf(ctx, id));
  }
  for (const id of d.freeVeg) parts.push(nameOf(ctx, id));
  return parts.join(' | ').toLowerCase();
}

function nameOf(ctx: Ctx, id: string): string {
  const f = ctx.foodMap.get(id);
  return f ? `${f.nameEn} ${f.nameIt}` : id;
}
