import { db } from '@/db/client';
import { sessions, sessionTurns } from '@/db/schema';
import { eq, asc, and } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import { isUuid } from '@/lib/http/route-guard';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getCaseById } from '@/lib/cases/loader';
import { TextCaseScreen } from '@/components/views/case';

export default async function CasePage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  // A malformed id is a 404, not a database error (lib/http/route-guard.ts).
  if (!isUuid(sessionId)) notFound();

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/case/${sessionId}`)}`);

  const session = await db.query.sessions.findFirst({
    where: and(eq(sessions.id, sessionId), eq(sessions.userId, user.id)),
  });
  if (!session) notFound();

  const turns = await db.query.sessionTurns.findMany({
    where: eq(sessionTurns.sessionId, sessionId),
    orderBy: [asc(sessionTurns.turnIndex)],
  });

  const initialMessage = turns.find(t => t.role === 'interviewer')?.text ?? 'Welcome to your case interview.';

  // The public case scenario — safe to show (answer keys/ledger values are not here).
  // Kept persistently available so the candidate can re-read the brief mid-case.
  let casePrompt: string | null = null;
  try {
    casePrompt = getCaseById(session.caseId).prompt;
  } catch {
    casePrompt = null;
  }

  return (
    <TextCaseScreen sessionId={sessionId} active={session.status === 'active'} completed={session.status === 'completed'}
      casePrompt={casePrompt} initialMessage={initialMessage} />
  );
}
