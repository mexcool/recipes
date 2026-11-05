import { clsx } from 'clsx';
import { Check, CircleAlert, HelpCircle, TriangleAlert } from 'lucide-react';
import type { Dish, Slot, TasteEntry } from '@/core/model';
import { formatQty } from '@/core/qty';
import type { FitIssue, FitMatch, Verdict } from '@/core/validate';
import type { Ctx } from '@/store/selectors';
import { t } from '@/i18n/en';
import { Button } from './Button';

/** Readable words for subgroup ids that core messages print verbatim ("legume_canned 110 g"). */
const SUBGROUP_WORDS: Record<string, string> = {
  breakfast_cereal: 'breakfast cereal',
  bread_sub: 'bread substitute',
  fresh_pasta: 'fresh pasta',
  legume_dry: 'dried legumes',
  legume_canned: 'canned legumes',
  veg_burger: 'veggie burger',
  cheese_fresh: 'fresh cheese',
  cheese_aged: 'aged cheese',
  meat_white: 'white meat',
  meat_red: 'red meat',
  veg_sugary: 'sugary vegetables',
  frozen_soup: 'frozen soup',
  tuber: 'potatoes',
  cured: 'cured meat',
};

/** Display-only: core wording keeps raw ids and Italian meal names; the card reads them out in English. */
export function prettyVerdictText(text: string): string {
  return (
    text
      .replace(
        /\b([a-z]+_[a-z_]+)\b/g,
        (_, id: string) => `any ${SUBGROUP_WORDS[id] ?? id.replace(/_/g, ' ')}`,
      )
      .replace(/\bpranzo\b/g, 'lunch')
      .replace(/\bcena\b/g, 'dinner')
      // Role ids become their labels ("protein slot" → "Protein slot"); every sentence starts upper-case.
      .replace(
        /\b(cereal|bread|protein|veg|soup|topping) slot\b/g,
        (_, r: string) => `${t.roles[r as keyof typeof t.roles] ?? r} slot`,
      )
      .replace(/(^|[.!?]\s+)([a-z])/g, (_, p: string, c: string) => p + c.toUpperCase())
  );
}
const pretty = prettyVerdictText;

/**
 * The validator's verdict: one sentence she can screenshot, then the evidence — which plan slots the dish
 * fills, which it leaves empty, and what only the exchange lists would accept.
 */
export function VerdictCard({
  verdict,
  ctx,
  dish,
  label = t.recipes.verdict,
  onAsk,
}: {
  verdict: Verdict;
  ctx: Ctx;
  dish: Pick<Dish, 'titleEn'>;
  label?: string;
  onAsk?: (question: string) => void;
}) {
  const best = verdict.best;
  const hasErrors = !!best && best.issues.some((i) => i.level === 'error');
  const tone: 'ok' | 'warn' | 'terra' = !best ? 'terra' : best.complete ? 'ok' : hasErrors ? 'terra' : 'warn';
  const otherIssues = best
    ? dedupe(best.issues.filter((i) => i.code !== 'unfilled'))
    : dedupe(verdict.issues);
  const alsoFits = verdict.fits.filter((f) => f.complete && f !== best);

  return (
    <section className="card overflow-hidden" aria-label={label}>
      <div
        className={clsx(
          'px-4 py-4',
          tone === 'ok' && 'bg-olive-soft',
          tone === 'warn' && 'bg-warn-soft',
          tone === 'terra' && 'bg-terra-soft',
        )}
      >
        <p
          className={clsx(
            'flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide',
            tone === 'ok' && 'text-olive-2',
            tone === 'warn' && 'text-warn',
            tone === 'terra' && 'text-terra',
          )}
        >
          {tone === 'ok' ? (
            <Check size={14} />
          ) : tone === 'warn' ? (
            <TriangleAlert size={14} />
          ) : (
            <CircleAlert size={14} />
          )}
          {label} · against your plan
        </p>
        <p className="mt-1.5 font-display text-xl font-semibold leading-snug text-ink">
          {pretty(verdict.summary)}
        </p>
      </div>

      {best ? (
        <div className="space-y-3 p-4">
          <p className="text-sm text-muted">
            {t.week.day} {best.template} · {t.meals[best.meal]}
            {best.hint ? <span> — {best.hint}</span> : null}
          </p>

          {best.matches.length > 0 && (
            <ul className="space-y-1.5" aria-label="Matched slots">
              {best.matches.map((m) => (
                <li key={`${m.slotId}-${m.foodId}`} className="flex items-start gap-2 text-[15px]">
                  <Check size={18} className="mt-0.5 shrink-0 text-ok" aria-hidden="true" />
                  <span>
                    <span className="font-medium">{t.roles[m.role]}:</span> {m.label}{' '}
                    <span className="text-muted">({qualifier(m)})</span>
                  </span>
                </li>
              ))}
            </ul>
          )}

          {best.unfilled.length > 0 && (
            <ul className="space-y-1.5" aria-label="Unfilled slots">
              {best.unfilled.map((s) => (
                <li key={s.id} className="flex items-start gap-2 text-[15px] text-terra">
                  <CircleAlert size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
                  <span>
                    <span className="font-medium">{t.roles[s.role]} slot unfilled</span> — add{' '}
                    {refLabel(s, ctx)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {best.exchangeFallbacks.map((e) => (
            <div key={`${e.role}-${e.foodId}`} className="rounded-2xl bg-warn-soft p-3 text-sm text-warn">
              <p className="flex items-start gap-2">
                <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span>{pretty(e.message)}</span>
              </p>
              {onAsk && (
                <Button
                  size="sm"
                  className="mt-2"
                  icon={<HelpCircle size={16} />}
                  onClick={() => onAsk(`${dish.titleEn}: ${pretty(e.message)}`)}
                >
                  {t.recipes.askNutritionist}
                </Button>
              )}
            </div>
          ))}

          {otherIssues.length > 0 && (
            <ul className="space-y-1.5 text-sm" aria-label="Issues">
              {otherIssues.map((i) => (
                <li
                  key={`${i.code}-${i.message}`}
                  className={clsx('flex items-start gap-2', i.level === 'error' ? 'text-terra' : 'text-warn')}
                >
                  {i.level === 'error' ? (
                    <CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                  ) : (
                    <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                  )}
                  <span>{pretty(i.message)}</span>
                </li>
              ))}
            </ul>
          )}

          {alsoFits.length > 0 && (
            <p className="text-sm text-muted">
              Also fits:{' '}
              {alsoFits.map((f) => `${t.week.day} ${f.template} ${t.meals[f.meal].toLowerCase()}`).join(', ')}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3 p-4">
          <p className="text-ink-2">{t.recipes.noFit}</p>
          {otherIssues.length > 0 && (
            <ul className="space-y-1.5 text-sm">
              {otherIssues.map((i) => (
                <li
                  key={`${i.code}-${i.message}`}
                  className={i.level === 'error' ? 'text-terra' : 'text-warn'}
                >
                  {pretty(i.message)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

/** The badge a list row shows for a verdict: where the dish fits, or that it needs the nutritionist. */
export function fitBadgeOf(verdict: Verdict): { text: string; tone: 'olive' | 'terra' } {
  const best = verdict.best;
  if (best?.complete)
    return {
      text: `${t.recipes.fits} ${t.week.day} ${best.template} ${t.meals[best.meal].toLowerCase()}`,
      tone: 'olive',
    };
  return { text: t.recipes.askNutritionist, tone: 'terra' };
}

/** 👍 / 👎 / never — what she has already told the app about a dish. */
export function TasteMark({ taste, className }: { taste: TasteEntry | undefined; className?: string }) {
  if (!taste) return null;
  if (taste.hard === 'never') {
    return (
      <span
        className={clsx(
          'rounded-full bg-terra-soft px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-terra',
          className,
        )}
        aria-label={t.recipes.never}
      >
        never
      </span>
    );
  }
  if (taste.score > 0) {
    return (
      <span className={clsx('text-base', className)} role="img" aria-label={t.recipes.like}>
        👍
      </span>
    );
  }
  if (taste.score < 0) {
    return (
      <span className={clsx('text-base', className)} role="img" aria-label={t.recipes.dislike}>
        👎
      </span>
    );
  }
  return null;
}

function qualifier(m: FitMatch): string {
  if (m.viaWildcard) return m.isReference ? 'any of this group, reference' : 'any of this group';
  return m.isReference ? 'reference' : 'alternative';
}

function refLabel(s: Slot, ctx: Ctx): string {
  const o = s.options[0];
  if (!o || o.kind === 'free') return 'as much as you like';
  if (o.kind === 'food') {
    const f = ctx.foodMap.get(o.foodId);
    return `${f?.nameEn ?? o.foodId} ${formatQty(o.qty, f)}`;
  }
  return `any ${SUBGROUP_WORDS[o.subgroup] ?? o.subgroup.replace(/_/g, ' ')} ${formatQty(o.qty)}`;
}

function dedupe(issues: FitIssue[]): FitIssue[] {
  const seen = new Set<string>();
  return issues.filter((i) => {
    const k = `${i.code}:${i.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
