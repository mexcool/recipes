import { RouterProvider } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { store } from '@/store/store';
import { t } from '@/i18n/en';
import { router } from './router';
import { ToastProvider } from './components/Feedback';

export function App() {
  const [ready, setReady] = useState(store.isReady());
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    store
      .init()
      .then(() => setReady(true))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  if (error) {
    return (
      <main className="mx-auto max-w-lg p-6">
        <h1 className="text-xl font-semibold">{t.common.error}</h1>
        <p className="mt-2 text-ink-2">{error}</p>
      </main>
    );
  }
  if (!ready) {
    return (
      <main className="flex min-h-dvh items-center justify-center text-muted" aria-busy="true">
        {t.common.loading}
      </main>
    );
  }
  return (
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>
  );
}
