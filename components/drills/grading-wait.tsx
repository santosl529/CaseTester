'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// While a set is being AI-graded, re-check every 2 seconds (PRD: "Clients
// poll every 2 s while status is grading"); every 15 once grading is delayed.
// Each check also lets the server re-run grading that failed.
export function GradingWait({ drillName, delayed }: { drillName: string; delayed: boolean }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), delayed ? 15_000 : 2_000);
    return () => clearInterval(id);
  }, [router, delayed]);
  return (
    <section role="status" aria-live="polite" className="space-y-2 rounded-lg border p-6">
      <h1 className="text-xl font-semibold">{drillName}</h1>
      {delayed ? (
        <>
          <p className="font-medium">Grading delayed</p>
          <p className="text-sm text-muted-foreground">Your answers are saved. Grading is taking longer than usual and will finish in the background within a few minutes. You can leave this page and come back.</p>
        </>
      ) : (
        <>
          <p className="font-medium">Grading your answers…</p>
          <p className="text-sm text-muted-foreground">This usually takes a few seconds.</p>
        </>
      )}
    </section>
  );
}
