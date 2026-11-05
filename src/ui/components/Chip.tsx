import { clsx } from 'clsx';
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

type Tone = 'neutral' | 'olive' | 'terra' | 'ok' | 'warn';

/** What a static chip keeps of the props it was given; button-only attributes (type, disabled, form…) are dropped. */
const STATIC_ATTRS = new Set(['id', 'title', 'style', 'lang', 'dir', 'role', 'tabIndex', 'hidden']);

function staticAttrs(rest: Record<string, unknown>): HTMLAttributes<HTMLSpanElement> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rest))
    if (STATIC_ATTRS.has(k) || k.startsWith('aria-') || k.startsWith('data-')) out[k] = v;
  return out as HTMLAttributes<HTMLSpanElement>;
}

/**
 * A pill. With `onClick` it is a button whose pressed state follows `selected`; without one it is plain
 * text in a <span>, so nothing announces a button that does nothing.
 */
export function Chip({
  selected,
  className,
  children,
  tone = 'neutral',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  selected?: boolean;
  tone?: Tone;
  children: ReactNode;
}) {
  const interactive = !!rest.onClick;
  const cls = clsx(
    'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition',
    interactive ? 'tap active:scale-[0.98]' : 'cursor-default',
    selected
      ? 'border-olive bg-olive text-on-olive'
      : tone === 'neutral' && 'border-line bg-surface text-ink-2',
    !selected && tone === 'olive' && 'border-olive/30 bg-olive-soft text-olive-2',
    !selected && tone === 'terra' && 'border-terra/30 bg-terra-soft text-terra',
    !selected && tone === 'ok' && 'border-ok/30 bg-ok-soft text-ok',
    !selected && tone === 'warn' && 'border-warn/30 bg-warn-soft text-warn',
    className,
  );
  if (!interactive) {
    return (
      <span className={cls} {...staticAttrs(rest as Record<string, unknown>)}>
        {children}
      </span>
    );
  }
  return (
    <button type="button" className={cls} aria-pressed={selected} {...rest}>
      {children}
    </button>
  );
}

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
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
