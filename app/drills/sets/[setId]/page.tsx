import { notFound, redirect } from 'next/navigation';
import { DrillError, setView } from '@/lib/drills/sets/service';
import { studentOrRedirect } from '@/lib/drills/session';
import { SetScreen } from '@/components/drills/views/set';

export default async function DrillSetPage({ params }: { params: Promise<{ setId: string }> }) {
  const studentId = await studentOrRedirect();
  const { setId } = await params;
  const view = await setView(studentId, setId).catch(e => {
    if (e instanceof DrillError && e.code === 'not_found') notFound();
    throw e;
  });
  if (view.status === 'completed') redirect(`/drills/sets/${setId}/results`);

  return <SetScreen view={view} expired={view.status === 'expired'} />;
}
