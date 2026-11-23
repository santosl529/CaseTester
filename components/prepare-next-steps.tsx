'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

// The report's next steps before they're ready (Matt, 15 Nov). Preparing: the
// tagging step runs after the report is stored, so the page refreshes every
// 5 seconds for up to 3 minutes. Failed: one Try again, guarded against a
// second click (the server claims the run too).
const POLL_MS = 5_000;
const POLL_FOR_MS = 180_000;

export function PrepareNextSteps({ sessionId, state }: { sessionId: string; state: 'preparing' | 'failed' }) {
  const router = useRouter();
  const [stale, setStale] = useState(false);
  const [retry, setRetry] = useState<'idle' | 'running' | 'failed'>('idle');
  const running = useRef(false);

  useEffect(() => {
    if (state !== 'preparing') return;
    const started = Date.now();
    const id = setInterval(() => {
      if (Date.now() - started > POLL_FOR_MS) { clearInterval(id); setStale(true); return; }
      router.refresh();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [state, router]);

  async function tryAgain() {
    if (running.current) return;
    running.current = true;
    setRetry('running');
    const res = await fetch(`/api/case/${sessionId}/next-steps`, { method: 'POST' }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    running.current = false;
    if (data.status === 'done' || data.status === 'busy') {
      // Leave the button disabled while the page reloads.
      router.refresh();
    } else setRetry('failed');
  }

  if (state === 'preparing') {
    return <p role="status" className="t-small text-ink/70">{stale ? 'Still preparing. Refresh this page in a minute.' : 'Preparing your next steps…'}</p>;
  }
  return (
    <div className="space-y-2">
      <p className="t-body">Your next steps couldn’t be prepared.</p>
      {retry === 'failed' && <p role="alert" className="t-small text-alert">That didn’t work either. Try again in a minute.</p>}
      <Button variant="outline" onClick={tryAgain} disabled={retry === 'running'}>{retry === 'running' ? 'Trying again…' : 'Try again'}</Button>
    </div>
  );
}
