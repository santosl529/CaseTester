import { NextRequest, NextResponse, after } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { runTurn } from '@/lib/orchestrator/session-runner';
import { assessCoverage } from '@/lib/scoring/coverage';
import { classifyDataRequests, toDataRequestEvents } from '@/lib/orchestrator/data-requests';
import { getCaseById } from '@/lib/cases/loader';
import { db } from '@/db/client';
import { sessions, sessionTurns, sessionEvents, revealedData } from '@/db/schema';
import { and, eq, asc } from 'drizzle-orm';
import { logEvent } from '@/lib/analytics';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sessionId } = await params;
  const { text } = await req.json();
  if (!text?.trim()) return NextResponse.json({ error: 'Empty turn' }, { status: 400 });

  // Verify the session belongs to this user
  const session = await db.query.sessions.findFirst({
    where: and(eq(sessions.id, sessionId), eq(sessions.userId, user.id)),
  });
  if (!session) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const result = await runTurn(sessionId, text.trim());
  console.log('[turn route] result:', JSON.stringify({ exhibit: result.exhibit?.id ?? null, ended: result.ended }));

  // Background coverage pass (runs AFTER the response is sent, so it adds no
  // latency; the next turn reads the result). Lagging ~a turn is acceptable.
  if (!result.ended) {
    after(async () => {
      try {
        const turns = await db.query.sessionTurns.findMany({
          where: eq(sessionTurns.sessionId, sessionId),
          orderBy: [asc(sessionTurns.turnIndex)],
        });
        const coverage = await assessCoverage(
          turns.map(t => ({ role: t.role, text: t.text })),
          u => { void logEvent('llm_usage', { ...u }, { sessionId, userId: user.id }); },
        );
        if (coverage) {
          await db.update(sessions).set({ coverageJsonb: coverage }).where(eq(sessions.id, sessionId));
        }
      } catch (e) {
        console.error('[coverage] background pass failed:', e);
      }
    });
  }

  // Background Rule 11 data-request audit (docs/interviewer-behavior.md v4.1):
  // classify this exchange's candidate data requests and how the interviewer
  // handled them, logged as `data_request` session events for the scoring-side
  // data-coverage caveat. Separate after() so a failure here can't take the
  // coverage pass down with it. Skipped on the ending turn: the client calls
  // /score immediately, which would race this pass, so the score route
  // classifies the final exchange itself (a request ignored by the close still
  // counts). Terminated/abandoned sessions also end here and are never scored.
  if (!result.ended) {
    after(async () => {
      try {
        const turns = await db.query.sessionTurns.findMany({
          where: eq(sessionTurns.sessionId, sessionId),
          orderBy: [asc(sessionTurns.turnIndex)],
        });
        const interviewerTurn = turns.at(-1);
        const candidateTurn = turns.at(-2);
        if (interviewerTurn?.role !== 'interviewer' || candidateTurn?.role !== 'candidate') return;

        const catalog = getCaseById(session.caseId).dataLedger.map(d => ({ id: d.id, label: d.label }));
        const requests = await classifyDataRequests({
          candidateText: candidateTurn.text,
          interviewerText: interviewerTurn.text,
          catalog,
          onUsage: u => { void logEvent('llm_usage', { ...u }, { sessionId, userId: user.id }); },
        });
        if (!requests || requests.length === 0) return;

        const revealedRows = await db.query.revealedData.findMany({ where: eq(revealedData.sessionId, sessionId) });
        const events = toDataRequestEvents(requests, {
          candidateTurnIndex: candidateTurn.turnIndex,
          interviewerTurnIndex: interviewerTurn.turnIndex,
          revealedIds: new Set(revealedRows.map(r => r.ledgerItemId)),
        });
        await db.insert(sessionEvents).values(events.map(e => ({
          sessionId,
          category: e.category,
          subtype: e.subtype,
          turnIndex: e.turnIndex,
          phase: session.phase,
          payloadJsonb: e.payload,
        })));
        for (const e of events) {
          if (e.subtype === 'none' && e.payload.ledgerItemId && !e.payload.revealedByNow) {
            console.warn('[data-requests] non-response to available ledger data:', JSON.stringify(e.payload));
          }
        }
      } catch (e) {
        console.error('[data-requests] background pass failed:', e);
      }
    });
  }

  // Scoring runs in a separate request (POST …/score) so this response returns
  // as soon as the final turn completes and the client can show an
  // "evaluating" state.
  return NextResponse.json(result);
}
