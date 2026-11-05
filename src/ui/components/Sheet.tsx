import { X } from 'lucide-react';
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { t } from '@/i18n/en';

// ---- Open-sheet registry: the toast stack reads it to keep out of the way of an open sheet. ---------
let openSheets = 0;
const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function bump(delta: number) {
  openSheets += delta;
  for (const notify of listeners) notify();
}
/** True while any sheet is open. */
export function useSheetOpen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => openSheets > 0,
    () => false,
  );
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Keep Tab and Shift+Tab cycling inside the panel. */
function trapTab(e: KeyboardEvent, panel: HTMLElement) {
  const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.closest('[hidden]'),
  );
  if (items.length === 0) {
    e.preventDefault();
    panel.focus();
    return;
  }
  const first = items[0]!;
  const last = items[items.length - 1]!;
  const active = document.activeElement;
  const inside = active instanceof HTMLElement && active !== panel && panel.contains(active);
  const leaving = e.shiftKey ? !inside || active === first : !inside || active === last;
  if (leaving) {
    e.preventDefault();
    (e.shiftKey ? last : first).focus();
  }
}

/**
 * Bottom sheet: the one modal pattern in the app. It renders in a portal over everything; while it is
 * open the page behind it is inert (no Tab, no taps, hidden from screen readers), Tab cycles inside,
 * body scroll is locked, and Escape, the backdrop or the close button close it. On close, focus goes
 * back to the control that opened it.
 */
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
  // Callers pass a fresh arrow every render; keep the latest without re-running the modal setup.
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const panel = ref.current;
    if (!panel) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const behind = Array.from(document.querySelectorAll<HTMLElement>('main, nav')).filter(
      (el) => !el.hasAttribute('inert'),
    );
    for (const el of behind) el.setAttribute('inert', '');
    bump(1);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeRef.current();
      } else if (e.key === 'Tab') {
        trapTab(e, panel);
      }
    };
    document.addEventListener('keydown', onKey);
    panel.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      for (const el of behind) el.removeAttribute('inert');
      bump(-1);
      trigger?.focus();
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
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
    </div>,
    document.body,
  );
}
