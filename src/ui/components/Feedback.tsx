import { clsx } from 'clsx';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSheetOpen } from './Sheet';

type Tone = 'info' | 'ok' | 'error';
interface Toast {
  id: number;
  text: string;
  tone: Tone;
}

/** Repeated taps never pile up: the same text again replaces the one showing, and two stay visible at most. */
const MAX_VISIBLE = 2;

const ToastCtx = createContext<(text: string, tone?: Tone) => void>(() => {});

export function useToast() {
  return useContext(ToastCtx);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  // A sheet sits at the bottom of the screen; while one is open the stack moves to the top instead of
  // covering the sheet's content.
  const sheetOpen = useSheetOpen();
  const push = useCallback((text: string, tone: Tone = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((ts) =>
      [...ts.filter((x) => !(x.text === text && x.tone === tone)), { id, text, tone }].slice(-MAX_VISIBLE),
    );
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), tone === 'error' ? 6000 : 3000);
  }, []);
  const value = useMemo(() => push, [push]);
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div
        className={clsx(
          'pointer-events-none fixed inset-x-0 z-[60] flex flex-col items-center gap-2 px-4',
          sheetOpen ? 'safe-top top-2' : 'bottom-20',
        )}
        aria-live="polite"
      >
        {toasts.map((x) => (
          <div
            key={x.id}
            className={clsx(
              'flex max-w-md items-start gap-2 rounded-2xl px-4 py-3 text-sm shadow-lg',
              // Over a sheet the stack sits on its title row: let taps reach the close button beneath.
              !sheetOpen && 'pointer-events-auto',
              x.tone === 'info' && 'bg-ink text-cream',
              x.tone === 'ok' && 'bg-ok text-on-ok',
              x.tone === 'error' && 'bg-terra text-on-terra',
            )}
          >
            {x.tone === 'ok' ? (
              <CheckCircle2 size={18} />
            ) : x.tone === 'error' ? (
              <AlertTriangle size={18} />
            ) : (
              <Info size={18} />
            )}
            <span>{x.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-10 text-center">
      <h2 className="text-xl font-semibold">{title}</h2>
      {body && <p className="max-w-xs text-ink-2">{body}</p>}
      {action}
    </div>
  );
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}
