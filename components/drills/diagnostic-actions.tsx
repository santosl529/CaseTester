'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { drillFetch } from '@/lib/drills/client-fetch';

// "I'll take a case first" / "Stop for now": skips or stops the diagnostic.
// Parts already finished have placed the student; it can be resumed later.
export function SkipDiagnosticButton({ label }: { label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function skip() {
    setBusy(true);
    setError('');
    const res = await drillFetch('/api/drills/diagnostic/skip', { method: 'POST' });
    if (!res.ok) { setError((await res.json()).message); setBusy(false); return; }
    router.push('/drills');
    router.refresh();
  }
  return (
    <span className="inline-flex flex-col gap-1">
      <Button variant="ghost" onClick={skip} disabled={busy}>{label}</Button>
      {error && <span role="alert" className="text-sm text-destructive">{error}</span>}
    </span>
  );
}

// While written answers are graded, check again every 2 seconds; after 2 minutes every 15 seconds, saying it's
// taking longer (8 Nov audit: it polled every 2 s forever without a word, unlike GradingWait).
export function RefreshWhileGrading() {
  const router = useRouter();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const started = Date.now();
    let t: ReturnType<typeof setTimeout>;
    const tick = () => {
      router.refresh();
      const late = Date.now() - started > 120_000;
      if (late) setSlow(true);
      t = setTimeout(tick, late ? 15_000 : 2_000);
    };
    t = setTimeout(tick, 2_000);
    return () => clearTimeout(t);
  }, [router]);
  return slow ? <p role="status" className="text-sm text-muted-foreground">Grading is taking longer than usual. Your answers are saved: you can leave and come back later.</p> : null;
}
