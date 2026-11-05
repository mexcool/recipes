import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import { BookOpen, CalendarDays, Moon, Settings, ShoppingBasket } from 'lucide-react';
import { clsx } from 'clsx';
import { t } from '@/i18n/en';
import { UpdateBanner } from './components/UpdateBanner';

const TABS = [
  { to: '/', label: t.tabs.tonight, icon: Moon },
  { to: '/week', label: t.tabs.week, icon: CalendarDays },
  { to: '/shopping', label: t.tabs.shopping, icon: ShoppingBasket },
  { to: '/recipes', label: t.tabs.recipes, icon: BookOpen },
  { to: '/settings', label: t.tabs.settings, icon: Settings },
] as const;

export function Shell() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const hideTabs = path.startsWith('/cook/');
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col">
      <UpdateBanner />
      <main className={clsx('flex-1 px-4 pt-2', hideTabs ? 'pb-8' : 'pb-28')}>
        <Outlet />
      </main>
      {!hideTabs && (
        <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur" aria-label="Main">
          <ul className="mx-auto flex max-w-lg justify-around px-2 pt-1">
            {TABS.map(({ to, label, icon: Icon }) => {
              const active = to === '/' ? path === '/' : path.startsWith(to);
              return (
                <li key={to} className="flex-1">
                  <Link
                    to={to}
                    className={clsx('tap flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] font-medium', active ? 'text-olive-2' : 'text-muted hover:text-ink-2')}
                    aria-current={active ? 'page' : undefined}
                  >
                    <Icon size={22} strokeWidth={active ? 2.4 : 1.8} />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </div>
  );
}
