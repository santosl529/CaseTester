import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { DrillError, setResults, setView } from '@/lib/drills/sets/service';
import { studentOrRedirect } from '@/lib/drills/session';
import { SetResults } from '@/components/drills/results';
import { GradingWait } from '@/components/drills/grading-wait';
import { setCheckin } from '@/lib/drills/feedback';

export default async function DrillResultsPage({ params }: { params: Promise<{ setId: string }> }) {
  const studentId = await studentOrRedirect();
  const { setId } = await params;
  // Diagnostic parts have no results screen of their own.
  const set = await setView(studentId, setId).catch(() => null);
  if (set?.diagnostic) redirect('/drills/diagnostic');
  const results = await setResults(studentId, setId).catch(e => {
    if (e instanceof DrillError && e.code === 'not_found') notFound();
    if (e instanceof DrillError && e.code === 'set_not_completed') redirect(`/drills/sets/${setId}`);
    throw e;
  });
  // "How useful was today's practice?", at most once a week.
  const checkin = results.status === 'completed' ? await setCheckin(studentId, setId) : null;
  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <nav className="text-sm"><Link href="/drills" className="text-muted-foreground underline-offset-4 hover:underline">← Training home</Link></nav>
      {results.status === 'grading'
        ? <GradingWait drillName={results.drill.name} delayed={results.delayed} />
        : <SetResults results={results} checkin={checkin} />}
    </main>
  );
}
