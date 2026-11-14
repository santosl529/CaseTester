'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LoaderCircle } from 'lucide-react';

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
    <section role="status" aria-live="polite" className="space-y-3 rounded-panel border border-ink/12 bg-white p-6 shadow-quiet sm:p-8">
      <h1 className="t-title">{drillName}</h1>
      {delayed ? (
        <>
          <p className="t-body font-semibold">Grading delayed</p>
          <p className="t-small text-ink/70">Your answers are saved. Grading is taking longer than usual and will finish in the background within a few minutes. You can leave this page and come back.</p>
        </>
      ) : (
        <>
          <p className="t-body flex items-center gap-2 font-semibold"><LoaderCircle aria-hidden="true" className="size-4 text-cobalt motion-safe:animate-spin" />Grading your answers…</p>
          <p className="t-small text-ink/70">This usually takes a few seconds.</p>
        </>
      )}
    </section>
  );
}
