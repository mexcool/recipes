import { clsx } from 'clsx';
import type { HTMLAttributes } from 'react';

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx('card p-4', className)} {...rest} />;
}

export function SectionTitle({ children, className, action }: { children: React.ReactNode; className?: string; action?: React.ReactNode }) {
  return (
    <div className={clsx('mb-2 flex items-end justify-between gap-3 px-1', className)}>
      <h2 className="text-lg font-semibold text-ink">{children}</h2>
      {action}
    </div>
  );
}
