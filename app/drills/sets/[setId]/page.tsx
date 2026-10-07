import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { DrillError, setView } from '@/lib/drills/sets/service';
import { studentOrRedirect } from '@/lib/drills/session';
import { DrillRunner } from '@/components/drills/runner';

export default async function DrillSetPage({ params }: { params: Promise<{ setId: string }> }) {
  const studentId = await studentOrRedirect();
  const { setId } = await params;
  const view = await setView(studentId, setId).catch(e => {
    if (e instanceof DrillError && e.code === 'not_found') notFound();
    throw e;
  });
  if (view.status === 'completed') redirect(`/drills/sets/${setId}/results`);

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <nav className="text-sm"><Link href="/drills" className="text-muted-foreground underline-offset-4 hover:underline">← All drills</Link></nav>
      {view.status === 'expired' ? (
        <p className="text-sm">This set expired after 24 hours. Your answers were saved. <Link href="/drills" className="underline underline-offset-4">Start a new one</Link>.</p>
      ) : (
        <DrillRunner view={view} />
      )}
    </main>
  );
}
