import { and, eq } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import { isUuid } from '@/lib/http/route-guard';
import { db } from '@/db/client';
import { sessions } from '@/db/schema';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getCaseById } from '@/lib/cases/loader';
import { VoiceCaseScreen } from '@/components/views/case';

// The voice interview (spec 2026-10-08-voice-phase-b §6) — same access rules
// as the text case page.
export default async function VoiceCasePage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  // A malformed id is a 404, not a database error (lib/http/route-guard.ts).
  if (!isUuid(sessionId)) notFound();
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/case/${sessionId}/voice`)}`);

  const session = await db.query.sessions.findFirst({
    where: and(eq(sessions.id, sessionId), eq(sessions.userId, user.id)),
  });
  if (!session) notFound();

  let casePrompt: string | null = null;
  try { casePrompt = getCaseById(session.caseId).prompt; } catch { casePrompt = null; }

  return <VoiceCaseScreen sessionId={sessionId} active={session.status === 'active'} completed={session.status === 'completed'} casePrompt={casePrompt} />;
}
