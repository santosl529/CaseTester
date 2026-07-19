import { db } from '@/db/client';
import { sessions, sessionTurns } from '@/db/schema';
import { eq, asc, and } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import { ChatWindow } from '@/components/chat-window';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getCaseById } from '@/lib/cases/loader';

export default async function CasePage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/');

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
    <main className="h-screen flex flex-col max-w-2xl mx-auto">
      <header className="border-b px-4 py-3">
        <div className="text-sm font-medium text-neutral-700">Case Interview — {session.phase} phase</div>
        {casePrompt && (
          <details className="mt-1">
            <summary className="text-xs text-neutral-500 cursor-pointer select-none">Case prompt</summary>
            <p className="mt-2 text-sm text-neutral-700 whitespace-pre-wrap">{casePrompt}</p>
          </details>
        )}
      </header>
      <div className="flex-1 min-h-0">
        <ChatWindow sessionId={sessionId} initialMessage={initialMessage} />
      </div>
    </main>
  );
}
