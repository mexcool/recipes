import { useEffect, useState } from 'react';
import { todayIso } from '@/core/dates';
import type { Now } from '@/core/mutations';

export function nowOf(d: Date = new Date()): Now {
  return { date: todayIso(d), hour: d.getHours() + d.getMinutes() / 60 };
}

/** Current date and fractional hour, refreshed every minute and on focus. Overridable for tests via a global. */
export function useNow(): Now {
  const [now, setNow] = useState<Now>(() => currentNow());
  useEffect(() => {
    const tick = () => setNow(currentNow());
    const id = setInterval(tick, 60_000);
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', tick);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);
  return now;
}

export function currentNow(): Now {
  const override = (globalThis as { __STASERA_NOW__?: string }).__STASERA_NOW__;
  if (override) return nowOf(new Date(override));
  return nowOf();
}
