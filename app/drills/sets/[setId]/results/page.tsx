import { notFound, redirect } from 'next/navigation';
import { DrillError, setResults, setView } from '@/lib/drills/sets/service';
import { studentOrRedirect } from '@/lib/drills/session';
import { setCheckin } from '@/lib/drills/feedback';
import { workoutHasBlocksLeft } from '@/lib/drills/program/store';
import { ResultsScreen } from '@/components/drills/views/set';

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
  // The one main button: Continue workout while today's has sets left, else Back to Today.
  const blocksLeft = await workoutHasBlocksLeft(studentId);
  return <ResultsScreen results={results} checkin={checkin} blocksLeft={blocksLeft} />;
}
