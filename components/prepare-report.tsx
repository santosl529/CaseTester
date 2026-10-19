'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

// A completed case with no score yet (the student left before scoring ended,
// or it failed): one click runs the same finalize → score as the case page;
// the score route returns early when a score exists (site flow, 19 Oct).
export function PrepareReport({ sessionId }: { sessionId: string }) {
  const [state, setState] = useState<'idle' | 'preparing' | 'failed'>('idle');
  const router = useRouter();

  async function prepare() {
    setState('preparing');
    await fetch(`/api/channel/${sessionId}/finalize`, { method: 'POST' }).catch(() => null);
    const res = await fetch(`/api/channel/${sessionId}/score`, { method: 'POST' }).catch(() => null);
    if (res?.ok) router.refresh();
    else setState('failed');
  }

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <p className="text-sm">Your report for this case isn’t ready yet.</p>
      {state === 'preparing' && <p className="text-sm text-neutral-600">Preparing your report — this can take a couple of minutes. Please keep this page open.</p>}
      {state === 'failed' && <p className="text-sm text-red-600">Generating your report hit an error.</p>}
      <Button size="lg" onClick={prepare} disabled={state === 'preparing'}>
        {state === 'preparing' ? 'Preparing your report…' : state === 'failed' ? 'Try again' : 'Prepare my report'}
      </Button>
    </div>
  );
}
