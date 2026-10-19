import { and, eq } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/db/client';
import { sessions } from '@/db/schema';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getCaseById } from '@/lib/cases/loader';
import { VoiceRoom } from '@/components/voice-room';
import { CaseEndPanel } from '@/components/case-end-panel';
import { SiteHeader } from '@/components/site-header';

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
    <div className="h-dvh flex flex-col">
    <SiteHeader inCase={session.status === 'active'} />
    <main className="flex-1 min-h-0 w-full flex flex-col max-w-2xl mx-auto">
      <header className="border-b px-4 py-3 text-sm font-medium text-neutral-700">Case Interview — voice</header>
      <div className="flex-1 min-h-0">
        {session.status === 'active'
          // The room's own "Score this interview" is the report button; the end screen adds the links (site flow, 19 Oct).
          ? <VoiceRoom sessionId={sessionId} casePrompt={casePrompt} endActions={<CaseEndPanel sessionId={sessionId} />} />
          : <div className="p-4"><CaseEndPanel sessionId={sessionId} report={session.status === 'completed' ? 'ready' : undefined} /></div>}
      </div>
    </main>
    </div>
  );
}
