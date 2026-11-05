import { Copy, Link2, QrCode, RefreshCw, Unplug } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Household } from '@/core/model';
import {
  connectNew,
  disconnect,
  dismissNotice,
  getSyncStatus,
  joinLink,
  rotateToken,
  serviceUrlProblem,
  subscribeSync,
  syncNow,
} from '@/store/sync';

const subscribeSyncStatus = (fn: () => void) => subscribeSync(() => fn());
import { Badge } from './Chip';
import { Button } from './Button';
import { Sheet } from './Sheet';
import { useToast } from './Feedback';

const DEFAULT_SERVICE = (import.meta.env.VITE_SYNC_URL as string | undefined) ?? '';

/** Real sync controls: connect this phone to the companion service, share a join link/QR, sync now, rotate, disconnect. */
export function SyncCard({ h }: { h: Household }) {
  const toast = useToast();
  const status = useSyncExternalStore(subscribeSyncStatus, getSyncStatus, getSyncStatus);
  const [serviceUrl, setServiceUrl] = useState(h.sync?.serviceUrl ?? DEFAULT_SERVICE);
  const [createKey, setCreateKey] = useState('');
  const urlProblem = serviceUrl ? serviceUrlProblem(serviceUrl) : null;
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const link = joinLink(h, typeof window !== 'undefined' ? window.location.href.split('#')[0]! : 'https://');
  useEffect(() => {
    let cancelled = false;
    if (!link) return;
    QRCode.toDataURL(link, { margin: 1, width: 280 })
      .then((url) => !cancelled && setQr(url))
      .catch(() => !cancelled && setQr(null));
    return () => {
      cancelled = true;
    };
  }, [link]);

  const run = async (fn: () => Promise<unknown>, okText: string) => {
    setBusy(true);
    try {
      await fn();
      toast(okText, 'ok');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const tone =
    status.state === 'error'
      ? 'terra'
      : status.state === 'conflict'
        ? 'warn'
        : status.state === 'syncing'
          ? 'olive'
          : h.sync
            ? 'ok'
            : 'neutral';
  const label = !h.sync
    ? 'Not connected'
    : status.state === 'syncing'
      ? 'Syncing…'
      : status.state === 'error'
        ? 'Error'
        : status.state === 'conflict'
          ? 'Changed elsewhere'
          : status.updateRequired
            ? 'Update needed'
            : 'Connected';

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={tone}>{label}</Badge>
        {h.sync && status.pending > 0 && (
          <Badge tone="warn">
            {status.pending} tick{status.pending > 1 ? 's' : ''} to send
          </Badge>
        )}
        {status.lastSync && (
          <span className="text-xs text-muted">
            last sync{' '}
            {new Date(status.lastSync).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>
      {status.message && <p className="mt-2 text-sm text-ink-2">{status.message}</p>}
      {status.notice && (
        <div
          role="status"
          className="mt-2 flex items-start justify-between gap-3 rounded-xl bg-warn-soft px-3 py-2 text-sm text-ink"
        >
          <span>{status.notice}</span>
          {!status.updateRequired && (
            <Button variant="ghost" size="sm" onClick={() => dismissNotice()}>
              Got it
            </Button>
          )}
        </div>
      )}

      {!h.sync ? (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-ink-2">
            Everything lives on this phone. To share the plan and the shopping list with a second phone,
            connect to your companion service (one Cloudflare Worker; see{' '}
            <code className="rounded bg-surface-2 px-1 font-mono text-xs">docs/DEPLOY.md</code>).
          </p>
          <label className="block text-sm">
            <span className="text-muted">Service URL</span>
            <input
              type="url"
              inputMode="url"
              value={serviceUrl}
              onChange={(e) => setServiceUrl(e.target.value)}
              placeholder="https://stasera-sync.<you>.workers.dev"
              aria-describedby="sync-url-hint"
              className="mt-1 w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-ink"
            />
            <span
              id="sync-url-hint"
              className={`mt-1 block text-xs ${urlProblem ? 'text-terra' : 'text-muted'}`}
            >
              {urlProblem ?? 'Your own service: the whole plan goes there, so only use one you deployed.'}
            </span>
          </label>
          <label className="block text-sm">
            <span className="text-muted">Setup key (only if your service asks for one)</span>
            <input
              type="password"
              autoComplete="off"
              value={createKey}
              onChange={(e) => setCreateKey(e.target.value)}
              className="mt-1 w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-ink"
            />
          </label>
          <Button
            variant="primary"
            icon={<Link2 size={16} />}
            disabled={busy || !serviceUrl || !!urlProblem}
            onClick={() =>
              void run(
                () => connectNew(serviceUrl, createKey),
                'Connected. Show the QR code on the other phone to join.',
              )
            }
          >
            Connect this phone
          </Button>
          <p className="text-xs text-muted">
            Without a service, use Export / Import to move the plan to a second phone.
          </p>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-muted">
            Service <code className="rounded bg-surface-2 px-1 font-mono text-xs">{h.sync.serviceUrl}</code>
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              icon={<QrCode size={16} />}
              onClick={() => setQrOpen(true)}
              disabled={!link}
            >
              Join on another phone
            </Button>
            <Button
              icon={<RefreshCw size={16} />}
              disabled={busy}
              onClick={() => void run(() => syncNow(), 'Synced')}
            >
              Sync now
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() =>
                void run(
                  () => rotateToken(),
                  'Link rotated: old links no longer work. Re-join on the other phone.',
                )
              }
            >
              Rotate link
            </Button>
            <Button
              variant="danger"
              icon={<Unplug size={16} />}
              disabled={busy}
              onClick={() => void run(() => disconnect(), 'Disconnected. Data stays on this phone.')}
            >
              Disconnect
            </Button>
          </div>
          <p className="text-xs text-muted">
            The link is a secret: anyone who has it can read and change the plan. Rotate it if it leaks.
          </p>
        </div>
      )}

      <Sheet open={qrOpen} onClose={() => setQrOpen(false)} title="Join on another phone">
        <p className="text-sm text-ink-2">
          Scan this with the other phone's camera, or copy the link and send it privately. The other phone
          will replace its own plan with this one.
        </p>
        {qr && (
          <img
            src={qr}
            alt="QR code with the join link"
            className="mx-auto my-4 h-64 w-64 rounded-xl bg-white p-2"
          />
        )}
        <div className="flex gap-2">
          <Button
            icon={<Copy size={16} />}
            onClick={() => {
              if (!link) return;
              void navigator.clipboard?.writeText(link).then(
                () => toast('Link copied', 'ok'),
                () => toast('Could not copy', 'error'),
              );
            }}
          >
            Copy link
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
