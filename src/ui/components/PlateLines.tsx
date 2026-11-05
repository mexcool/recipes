import { clsx } from 'clsx';
import type { Plates } from '@/core/plates';
import type { Ctx } from '@/store/selectors';
import { t } from '@/i18n/en';

/** Her plate, verbatim from the plan; the partner's, scaled. Oil shown as the meal allowance. */
export function PlateLines({
  plates,
  ctx,
  memberId,
  compact = false,
}: {
  plates: Plates;
  ctx: Ctx;
  memberId: string;
  compact?: boolean;
}) {
  const mp = plates.members.find((m) => m.memberId === memberId);
  if (!mp) return null;
  return (
    <ul className={clsx('space-y-1', compact && 'text-sm')}>
      {mp.lines.map((l) => {
        const f = ctx.foodMap.get(l.foodId);
        return (
          <li key={`${l.foodId}-${l.role}`} className="flex items-baseline justify-between gap-3">
            <span className="text-ink-2">
              {f?.nameEn ?? l.foodId}
              {f && f.nameIt !== f.nameEn && <span className="text-muted"> · {f.nameIt}</span>}
              {l.role === 'oil' && <span className="text-muted"> ({t.tonight.oilAllowance})</span>}
            </span>
            <span className="shrink-0 font-medium tabular-nums">
              {l.display}
              {l.cookedG && (
                <span className="text-muted">
                  {' '}
                  ≈ {l.cookedG} g {t.common.cooked}
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function PlatesTable({ plates, ctx }: { plates: Plates; ctx: Ctx }) {
  const members = plates.members;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs uppercase tracking-wide text-muted">
          <th className="py-1 pr-2 font-medium">Ingredient</th>
          {members.map((m) => (
            <th key={m.memberId} className="py-1 pr-2 text-right font-medium">
              {ctx.h.members.find((x) => x.id === m.memberId)?.name ?? m.memberId}
            </th>
          ))}
          <th className="py-1 text-right font-medium">{t.tonight.pot}</th>
        </tr>
      </thead>
      <tbody>
        {plates.pot.map((p) => (
          <tr key={`${p.foodId}-${p.role}`} className="border-t border-line">
            <td className="py-1.5 pr-2 text-ink-2">
              {ctx.foodMap.get(p.foodId)?.nameEn ?? p.foodId}
              {p.role === 'oil' && <span className="text-muted"> (oil)</span>}
            </td>
            {members.map((m) => {
              const line = m.lines.find((l) => l.foodId === p.foodId && l.role === p.role);
              return (
                <td key={m.memberId} className="py-1.5 pr-2 text-right tabular-nums">
                  {line?.display ?? '—'}
                </td>
              );
            })}
            <td className="py-1.5 text-right font-medium tabular-nums">
              {p.grams} g
              {p.cookedG ? (
                <span className="text-muted">
                  {' '}
                  ≈ {p.cookedG} g {t.common.cooked}
                </span>
              ) : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
