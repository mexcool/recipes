import { clsx } from 'clsx';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  variant = 'secondary',
  className,
  children,
  icon,
  size = 'md',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  icon?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  return (
    <button
      type="button"
      className={clsx(
        'tap inline-flex items-center justify-center gap-2 rounded-full font-medium transition active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100',
        size === 'sm' && 'px-3 py-2 text-sm',
        size === 'md' && 'px-4 py-2.5 text-[15px]',
        size === 'lg' && 'px-5 py-3 text-base',
        variant === 'primary' && 'bg-olive text-white shadow-sm hover:bg-olive-2',
        variant === 'secondary' && 'bg-surface-2 text-ink border border-line hover:bg-cream-2',
        variant === 'ghost' && 'bg-transparent text-ink-2 hover:bg-surface-2',
        variant === 'danger' && 'bg-terra-soft text-terra border border-terra/30',
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}
