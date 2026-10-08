import Link from 'next/link';
import { and, eq } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/db/client';
import { sessions } from '@/db/schema';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getCaseById } from '@/lib/cases/loader';
import { VoiceRoom } from '@/components/voice-room';

// The voice interview (spec 2026-10-08-voice-phase-b §6) — same access rules
// as the text case page.
export default async function VoiceCasePage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const session = await db.query.sessions.findFirst({
    where: and(eq(sessions.id, sessionId), eq(sessions.userId, user.id)),
  });
  if (!session) notFound();

  let casePrompt: string | null = null;
  try { casePrompt = getCaseById(session.caseId).prompt; } catch { casePrompt = null; }

  return (
    <main className="h-screen flex flex-col max-w-2xl mx-auto">
      <header className="border-b px-4 py-3 text-sm font-medium text-neutral-700">Case Interview — voice</header>
      <div className="flex-1 min-h-0">
        {session.status === 'active'
          ? <VoiceRoom sessionId={sessionId} casePrompt={casePrompt} />
          : (
            <div className="p-4 text-sm text-neutral-600">
              This case is no longer active.{' '}
              {session.status === 'completed' && <Link className="underline" href={`/case/${sessionId}/report`}>See the report</Link>}
            </div>
          )}
      </div>
    </main>
  );
}
