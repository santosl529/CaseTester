import { db } from '@/db/client';
import { sessions, sessionTurns } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { ChatWindow } from '@/components/chat-window';

export default async function CasePage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;

  const session = await db.query.sessions.findFirst({
    where: eq(sessions.id, sessionId),
  });
  if (!session) notFound();

  const turns = await db.query.sessionTurns.findMany({
    where: eq(sessionTurns.sessionId, sessionId),
    orderBy: [asc(sessionTurns.turnIndex)],
  });

  const initialMessage = turns.find(t => t.role === 'interviewer')?.text ?? 'Welcome to your case interview.';

  return (
    <main className="h-screen flex flex-col max-w-2xl mx-auto">
      <header className="border-b px-4 py-3 text-sm font-medium text-neutral-700">
        Case Interview — {session.phase} phase
      </header>
      <div className="flex-1 min-h-0">
        <ChatWindow sessionId={sessionId} initialMessage={initialMessage} />
      </div>
    </main>
  );
}
