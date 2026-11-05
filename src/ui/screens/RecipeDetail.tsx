import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ArrowLeft, Ban, Clock, Pencil, Sparkles, ThumbsDown, ThumbsUp, Trash2 } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import type { DishBinding } from '@/core/model';
import { validateDish } from '@/core/validate';
import { dishTitles } from '@/core/title';
import { useHousehold } from '@/store/store';
import { actions } from '@/store/actions';
import { ctxOf, type Ctx } from '@/store/selectors';
import { methodLabel, t } from '@/i18n/en';
import { Button } from '../components/Button';
import { Card, SectionTitle } from '../components/Card';
import { Badge, Chip } from '../components/Chip';
import { EmptyState, useToast } from '../components/Feedback';
import { Sheet } from '../components/Sheet';
import { TasteMark, VerdictCard } from '../components/Verdict';
import { POT_HINT } from '../meal-view';

export function RecipeDetailScreen() {
  const { id } = useParams({ strict: false }) as { id?: string };
  const h = useHousehold();
  const navigate = useNavigate();
  const toast = useToast();
  const ctx = useMemo(() => ctxOf(h), [h]);
  const dish = id ? ctx.dishes.get(id) : undefined;
  const verdict = useMemo(() => (dish ? validateDish(dish, ctx.rev, ctx.foods) : undefined), [dish, ctx]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const titles = useMemo(() => (dish ? dishTitles(dish, ctx.foodMap) : { en: '' }), [dish, ctx]);

  if (!dish || !verdict) {
    return (
      <div className="space-y-4">
        <TopBar />
        <EmptyState
          title="Dish not found"
          body="It may have been deleted, or the link is out of date."
          action={
            <Button variant="primary" onClick={() => navigate({ to: '/recipes' })}>
              Back to recipes
            </Button>
          }
        />
      </div>
    );
  }

  const taste = h.taste[`dish:${dish.id}`];
  const feedback = (signal: 'up' | 'more' | 'down' | 'never' | 'clear', text: string) => {
    actions.feedbackDish(dish.id, signal);
    toast(text, 'ok');
  };

  return (
    <div className="space-y-5">
      <TopBar
        right={
          <>
            <Button
              size="sm"
              icon={<Pencil size={16} />}
              onClick={() => navigate({ to: '/recipes/$id/edit', params: { id: dish.id } })}
            >
              {t.recipes.edit}
            </Button>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              aria-label={t.recipes.delete}
              className="tap flex items-center justify-center rounded-full text-terra hover:bg-terra-soft"
            >
              <Trash2 size={20} />
            </button>
          </>
        }
      />

      <div className="px-1">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {dish.status === 'draft' && <Badge>{t.recipes.draft}</Badge>}
          {dish.status === 'proposed' && <Badge tone="warn">{t.recipes.proposed}</Badge>}
          {dish.tags.includes('favourite') && <Badge tone="olive">{t.recipes.favourites}</Badge>}
          {dish.origin !== 'seed' && <Badge>{t.recipes.origin[dish.origin]}</Badge>}
          <TasteMark taste={taste} />
        </div>
        <h1 className="text-3xl leading-tight font-semibold">{titles.en}</h1>
        {titles.it && <p className="mt-1 text-ink-2">{titles.it}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <Chip tone="olive">
            <Clock size={14} aria-hidden="true" /> {dish.minutes} {t.recipes.minutes}
          </Chip>
          <Chip>{dish.mealTypes.map((m) => t.meals[m]).join(' · ')}</Chip>
          {dish.lunchboxOk && <Chip>{t.recipes.lunchbox}</Chip>}
          <Chip>{dish.signature.format}</Chip>
          <Chip>{dish.signature.temperature}</Chip>
          <Chip>{dish.signature.flavour}</Chip>
        </div>
      </div>

      <VerdictCard
        verdict={verdict}
        ctx={ctx}
        dish={{ titleEn: titles.en }}
        onAsk={(q) => {
          actions.addQuestion(q, 'validator');
          toast(t.recipes.questionAdded, 'ok');
        }}
      />

      <div>
        <SectionTitle>{t.recipes.uses}</SectionTitle>
        <Card className="space-y-4">
          {dish.bindings.length === 0 && (
            <p className="text-ink-2">No ingredient is bound to a plan role yet.</p>
          )}
          {dish.bindings.map((b) => (
            <div key={b.role}>
              <p className="text-xs font-medium tracking-wide text-olive-2 uppercase">{t.roles[b.role]}</p>
              <p className="mt-0.5 text-[15px] text-ink">{bindingFoods(b, ctx)}</p>
              {(b.prep || b.role !== 'veg') && (
                <p className="mt-0.5 text-sm text-muted">
                  {b.prep}
                  {b.prep && ' · '}
                  {POT_HINT[b.pot]}
                </p>
              )}
            </div>
          ))}
          {dish.freeVeg.length > 0 && (
            <div className="border-t border-line pt-3">
              <p className="text-xs font-medium tracking-wide text-muted uppercase">{t.recipes.freeVeg}</p>
              <p className="mt-0.5 text-[15px] text-ink">{foodNames(dish.freeVeg, ctx)}</p>
              <p className="text-sm text-muted">As much as you like.</p>
            </div>
          )}
          {dish.condiments.length > 0 && (
            <div className="border-t border-line pt-3">
              <p className="text-xs font-medium tracking-wide text-muted uppercase">{t.recipes.condiments}</p>
              <p className="mt-0.5 text-[15px] text-ink">{foodNames(dish.condiments, ctx)}</p>
            </div>
          )}
          {dish.methods.length > 0 && (
            <div className="border-t border-line pt-3">
              <p className="text-xs font-medium tracking-wide text-muted uppercase">{t.recipes.methods}</p>
              <p className="mt-0.5 text-[15px] text-ink">{dish.methods.map(methodLabel).join(' · ')}</p>
            </div>
          )}
        </Card>
      </div>

      <div>
        <SectionTitle>{t.recipes.steps}</SectionTitle>
        <Card>
          {dish.steps.length === 0 ? (
            <p className="text-ink-2">No steps written yet.</p>
          ) : (
            <ol className="space-y-3">
              {dish.steps.map((s, i) => (
                <li key={i} className="flex gap-3 text-[16px] leading-snug">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-olive-soft text-sm font-semibold text-olive-2 tabular-nums">
                    {i + 1}
                  </span>
                  <span>{renderPlaceholders(s)}</span>
                </li>
              ))}
            </ol>
          )}
          <p className="mt-3 text-xs text-muted">
            Amounts appear when the dish is cooked from a planned meal; here the roles are shown in olive.
          </p>
        </Card>
      </div>

      <div>
        <SectionTitle>Your taste</SectionTitle>
        <Card>
          <p className="mb-3 text-sm text-ink-2">
            {taste?.hard === 'never'
              ? 'Marked never again: the planner skips it.'
              : taste && taste.score > 0
                ? 'You like this one; it comes round more often.'
                : taste && taste.score < 0
                  ? 'Not for you; it comes round less.'
                  : 'Tell the planner what you think and the weeks follow.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" icon={<ThumbsUp size={16} />} onClick={() => feedback('up', 'Noted — liked.')}>
              {t.recipes.like}
            </Button>
            <Button
              size="sm"
              icon={<Sparkles size={16} />}
              onClick={() => feedback('more', 'Noted — more often.')}
            >
              {t.recipes.more}
            </Button>
            <Button
              size="sm"
              icon={<ThumbsDown size={16} />}
              onClick={() => feedback('down', 'Noted — less often.')}
            >
              {t.recipes.dislike}
            </Button>
            <Button
              size="sm"
              variant="danger"
              icon={<Ban size={16} />}
              onClick={() => feedback('never', 'Never again — the planner will skip it.')}
            >
              {t.recipes.never}
            </Button>
            {taste && (
              <Button size="sm" variant="ghost" onClick={() => feedback('clear', 'Taste cleared.')}>
                Clear
              </Button>
            )}
          </div>
        </Card>
      </div>

      <Sheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`${t.recipes.delete} "${titles.en}"?`}
      >
        <p className="mb-4 text-ink-2">
          The dish leaves your book. Meals already planned with it keep their foods; only the recipe text
          goes.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="danger"
            icon={<Trash2 size={18} />}
            onClick={() => {
              actions.deleteDish(dish.id);
              setConfirmDelete(false);
              toast(`Deleted "${titles.en}".`, 'ok');
              navigate({ to: '/recipes' });
            }}
          >
            {t.recipes.delete}
          </Button>
          <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
            {t.common.cancel}
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

function TopBar({ right }: { right?: ReactNode }) {
  return (
    <div className="safe-top flex items-center justify-between gap-2 pt-2">
      <Link
        to="/recipes"
        className="tap -ml-2 flex items-center justify-center rounded-full text-ink-2 hover:bg-surface-2"
        aria-label={t.common.back}
      >
        <ArrowLeft size={22} />
      </Link>
      <div className="flex items-center gap-1">{right}</div>
    </div>
  );
}

function bindingFoods(b: DishBinding, ctx: Ctx): string {
  if (b.foods === 'any_cereal') return 'Any cereal on the plan';
  if (b.foods === 'any_bread') return 'Any bread, crackers or potatoes on the plan';
  if (b.foods === 'any') return 'Anything the plan allows';
  return foodNames(b.foods, ctx) || '—';
}

function foodNames(ids: readonly string[], ctx: Ctx): string {
  return ids
    .map((id) => {
      const f = ctx.foodMap.get(id);
      if (!f) return id;
      return f.nameIt && f.nameIt.toLowerCase() !== f.nameEn.toLowerCase()
        ? `${f.nameEn} (${f.nameIt})`
        : f.nameEn;
    })
    .join(', ');
}

/** {{role}} placeholders become the role name in olive: there is no meal here to read amounts from. */
function renderPlaceholders(step: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\{\{(\w+)\}\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(step)) !== null) {
    if (m.index > last) out.push(step.slice(last, m.index));
    const role = m[1] ?? '';
    const label = (t.roles as Record<string, string>)[role] ?? role;
    out.push(
      <span key={`${m.index}-${role}`} className="font-medium text-olive-2">
        {label.toLowerCase()}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < step.length) out.push(step.slice(last));
  return out;
}
