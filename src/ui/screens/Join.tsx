import { useNavigate, useSearch } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { joinExisting, serviceUrlProblem } from '@/store/sync';
import { Button } from '../components/Button';
import { Card } from '../components/Card';

/**
 * Opened from a join link: replaces this phone's household with the one on the service. The link's
 * secret is read once and removed from the address bar and history, so Back never re-offers it.
 */
export function JoinScreen() {
  const search = useSearch({ strict: false }) as { s?: string; t?: string };
  const navigate = useNavigate();
  const [link] = useState(() => ({ s: search.s, t: search.t }));
  const problem = link.s ? serviceUrlProblem(link.s) : null;
  const valid = !!link.s && !!link.t && !problem;
  const [state, setState] = useState<'confirm' | 'joining' | 'done' | 'error'>(valid ? 'confirm' : 'error');
  const [error, setError] = useState<string | null>(problem);
  useEffect(() => {
    if (window.location.hash.includes('t=')) window.history.replaceState(null, '', '#/join');
  }, []);
  const host = (() => {
    try {
      return link.s ? new URL(link.s).host : '';
    } catch {
      return '';
    }
  })();
  const join = async () => {
    setState('joining');
    try {
      await joinExisting(link.s!, link.t!);
      setState('done');
      setTimeout(() => void navigate({ to: '/', replace: true }), 600);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState('error');
    }
  };
  return (
    <div className="safe-top space-y-4 pt-2">
      <h1 className="text-3xl font-semibold">Join a household</h1>
      <Card>
        {state === 'confirm' && valid && (
          <>
            <p className="text-ink-2">
              This link connects this phone to a shared plan on <strong className="text-ink">{host}</strong>.
              Anything currently on this phone will be replaced by the shared household.
            </p>
            <div className="mt-4 flex gap-2">
              <Button variant="primary" onClick={() => void join()}>
                Join and replace my data
              </Button>
              <Button variant="ghost" onClick={() => void navigate({ to: '/', replace: true })}>
                Cancel
              </Button>
            </div>
          </>
        )}
        {state === 'joining' && <p className="text-muted">Joining…</p>}
        {state === 'done' && <p className="text-ok">Joined. Opening tonight's meal…</p>}
        {state === 'error' && (
          <>
            <p className="text-terra">{error ?? 'This link is incomplete.'}</p>
            <Button className="mt-3" onClick={() => void navigate({ to: '/', replace: true })}>
              Back
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}
