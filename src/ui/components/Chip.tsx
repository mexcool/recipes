import { clsx } from 'clsx';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function Chip({ selected, className, children, tone = 'neutral', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean; tone?: 'neutral' | 'olive' | 'terra' | 'ok' | 'warn'; children: ReactNode }) {
  const interactive = !!rest.onClick;
  return (
    <button
      type="button"
      className={clsx(
        'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition',
        interactive ? 'tap active:scale-[0.98]' : 'cursor-default',
        selected ? 'border-olive bg-olive text-white' : tone === 'neutral' && 'border-line bg-surface text-ink-2',
        !selected && tone === 'olive' && 'border-olive/30 bg-olive-soft text-olive-2',
        !selected && tone === 'terra' && 'border-terra/30 bg-terra-soft text-terra',
        !selected && tone === 'ok' && 'border-ok/30 bg-ok-soft text-ok',
        !selected && tone === 'warn' && 'border-warn/30 bg-warn-soft text-warn',
        className,
      )}
      aria-pressed={interactive ? selected : undefined}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'olive' | 'terra' | 'ok' | 'warn'; className?: string }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide',
        tone === 'neutral' && 'bg-surface-2 text-muted',
        tone === 'olive' && 'bg-olive-soft text-olive-2',
        tone === 'terra' && 'bg-terra-soft text-terra',
        tone === 'ok' && 'bg-ok-soft text-ok',
        tone === 'warn' && 'bg-warn-soft text-warn',
        className,
      )}
    >
      {children}
    </span>
  );
}
