'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { runScoring } from '@/lib/site/run-scoring';

// A completed case with no score yet (the student left before scoring ended,
// or it failed): one click runs the same finalize → score as the case page;
// the score route returns early when a score exists (site flow, 19 Oct).
export function PrepareReport({ sessionId }: { sessionId: string }) {
  const [state, setState] = useState<'idle' | 'preparing' | 'failed'>('idle');
  const router = useRouter();
  // A double click lands before the disabled button renders; the server also
  // runs one pass per session (lib/scoring/scoring-claim.ts).
  const running = useRef(false);

  async function prepare() {
    if (running.current) return;
    running.current = true;
    setState('preparing');
    // A pass already running (another tab) is waited out, not shown as a failure (lib/site/run-scoring.ts).
    const result = await runScoring(sessionId);
    running.current = false;
    if (result === 'ready') router.refresh();
    else setState('failed');
  }

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <p className="text-sm">Your report for this case isn’t ready yet.</p>
      {state === 'preparing' && <p className="text-sm text-neutral-600">Preparing your report — this can take a couple of minutes. Please keep this page open.</p>}
      {state === 'failed' && <p className="text-sm text-red-600">Your report couldn’t be prepared just now. Your interview is saved: press Try again in a minute.</p>}
      <Button size="lg" onClick={prepare} disabled={state === 'preparing'}>
        {state === 'preparing' ? 'Preparing your report…' : state === 'failed' ? 'Try again' : 'Prepare my report'}
      </Button>
    </div>
  );
}
