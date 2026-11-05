import { useRegisterSW } from 'virtual:pwa-register/react';
import { t } from '@/i18n/en';
import { Button } from './Button';

export function UpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({ immediate: true });
  if (!needRefresh) return null;
  return (
    <div
      className="safe-top sticky top-0 z-40 flex items-center justify-between gap-3 bg-ink px-4 py-2 text-sm text-cream"
      role="status"
    >
      <span>{t.common.newVersion}</span>
      <div className="flex gap-2">
        <Button size="sm" variant="ghost" className="text-cream" onClick={() => setNeedRefresh(false)}>
          {t.common.close}
        </Button>
        <Button size="sm" variant="primary" onClick={() => void updateServiceWorker(true)}>
          {t.common.reload}
        </Button>
      </div>
    </div>
  );
}
