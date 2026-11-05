import { useNavigate, useSearch } from '@tanstack/react-router';
import { useState } from 'react';
import { joinExisting } from '@/store/sync';
import { Button } from '../components/Button';
import { Card } from '../components/Card';

/** Opened from a join link: replaces this phone's household with the one on the service. */
export function JoinScreen() {
  const search = useSearch({ strict: false }) as { s?: string; t?: string };
  const navigate = useNavigate();
  const valid = !!search.s && !!search.t;
  const [state, setState] = useState<'confirm' | 'joining' | 'done' | 'error'>(valid ? 'confirm' : 'error');
  const [error, setError] = useState<string | null>(null);
  const join = async () => {
    setState('joining');
    try {
      await joinExisting(search.s!, search.t!);
      setState('done');
      setTimeout(() => void navigate({ to: '/' }), 600);
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
              This link connects this phone to a shared plan. Anything currently on this phone will be
              replaced by the shared household.
            </p>
            <div className="mt-4 flex gap-2">
              <Button variant="primary" onClick={() => void join()}>
                Join and replace my data
              </Button>
              <Button variant="ghost" onClick={() => void navigate({ to: '/' })}>
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
            <Button className="mt-3" onClick={() => void navigate({ to: '/' })}>
              Back
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}
