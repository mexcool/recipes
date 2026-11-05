import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { t } from '@/i18n/en';

/** Bottom sheet: the one modal pattern in the app. Closes on backdrop tap, Escape, or the close button. */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="sheet-enter safe-bottom max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-surface p-4 shadow-2xl outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="tap -mr-2 flex items-center justify-center rounded-full text-muted hover:bg-surface-2"
            aria-label={t.common.close}
          >
            <X size={22} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
