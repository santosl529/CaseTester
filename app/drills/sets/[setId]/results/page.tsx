import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { DrillError, setResults } from '@/lib/drills/sets/service';
import { studentOrRedirect } from '@/lib/drills/session';
import { SetResults } from '@/components/drills/results';
import { GradingWait } from '@/components/drills/grading-wait';

export default async function DrillResultsPage({ params }: { params: Promise<{ setId: string }> }) {
  const studentId = await studentOrRedirect();
  const { setId } = await params;
  const results = await setResults(studentId, setId).catch(e => {
    if (e instanceof DrillError && e.code === 'not_found') notFound();
    if (e instanceof DrillError && e.code === 'set_not_completed') redirect(`/drills/sets/${setId}`);
    throw e;
  });
  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <nav className="text-sm"><Link href="/drills" className="text-muted-foreground underline-offset-4 hover:underline">← All drills</Link></nav>
      {results.status === 'grading'
        ? <GradingWait drillName={results.drill.name} delayed={results.delayed} />
        : <SetResults results={results} />}
    </main>
  );
}
