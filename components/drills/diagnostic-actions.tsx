'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

// "I'll take a case first" / "Stop for now": skips or stops the diagnostic.
// Parts already finished have placed the student; it can be resumed later.
export function SkipDiagnosticButton({ label }: { label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function skip() {
    setBusy(true);
    await fetch('/api/drills/diagnostic/skip', { method: 'POST' });
    router.push('/drills');
    router.refresh();
  }
  return <Button variant="ghost" onClick={skip} disabled={busy}>{label}</Button>;
}

// While written answers are graded, check again every 2 seconds.
export function RefreshWhileGrading() {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 2000);
    return () => clearInterval(t);
  }, [router]);
  return null;
}
