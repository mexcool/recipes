import { createLink } from '@tanstack/react-router';
import { clsx } from 'clsx';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode, Ref } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface LookProps {
  variant?: Variant;
  icon?: ReactNode;
  size?: Size;
}

/** The button's look, shared by <Button> and <ButtonLink> so a link can sit in a row of buttons. */
export function buttonClass({
  variant = 'secondary',
  size = 'md',
  className,
}: {
  variant?: Variant;
  size?: Size;
  className?: string;
}): string {
  return clsx(
    'tap inline-flex items-center justify-center gap-2 rounded-full font-medium transition active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100',
    size === 'sm' && 'px-3 py-2 text-sm',
    size === 'md' && 'px-4 py-2.5 text-[15px]',
    size === 'lg' && 'px-5 py-3 text-base',
    variant === 'primary' && 'bg-olive text-on-olive shadow-sm hover:bg-olive-2',
    variant === 'secondary' && 'bg-surface-2 text-ink border border-line hover:bg-cream-2',
    variant === 'ghost' && 'bg-transparent text-ink-2 hover:bg-surface-2',
    variant === 'danger' && 'bg-terra-soft text-terra border border-terra/30',
    className,
  );
}

export function Button({
  variant,
  className,
  children,
  icon,
  size,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & LookProps) {
  return (
    <button type="button" className={buttonClass({ variant, size, className })} {...rest}>
      {icon}
      {children}
    </button>
  );
}

/** An anchor with the button's look; the router wraps it below with typed `to` / `params`. */
function ButtonAnchor({
  variant,
  className,
  children,
  icon,
  size,
  ref,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & LookProps & { ref?: Ref<HTMLAnchorElement> }) {
  return (
    <a ref={ref} className={buttonClass({ variant, size, className })} {...rest}>
      {icon}
      {children}
    </a>
  );
}

/**
 * A link that looks like a Button: `<ButtonLink to="/recipes/$id" params={{ id }} variant="primary">`.
 * Use it instead of a <Button> inside a <Link>, which nests a button in an anchor (invalid HTML, two tab
 * stops, announced twice). Same `variant`, `size` and `icon` props as Button, plus the router's own.
 */
export const ButtonLink = createLink(ButtonAnchor);
