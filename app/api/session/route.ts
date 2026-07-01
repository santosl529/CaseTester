import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { db } from '@/db/client';
import { sessions, sessionTurns } from '@/db/schema';
import { getCaseById } from '@/lib/cases/loader';
import { HaikuInterviewerModel } from '@/lib/agent/models/haiku';
import { runInterviewerTurn } from '@/lib/agent/interviewer';
import { createLedger, unrevealedLabels } from '@/lib/orchestrator/data-ledger';
import { PHASE_BUDGETS_MS } from '@/lib/orchestrator/state-machine';

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { caseId } = await req.json();
  const caseData = getCaseById(caseId);

  // Create session
  const [session] = await db.insert(sessions).values({
    userId: user.id,
    caseId,
    phase: 'INTRO',
  }).returning();

  // Run the opening interviewer turn (no candidate message yet)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ledger = createLedger(caseData.dataLedger as any);
  const model = new HaikuInterviewerModel();
  const openingActions = await runInterviewerTurn({
    model,
    candidateText: '[SESSION_START]',
    history: [],
    phase: 'INTRO',
    promptCtx: {
      casePrompt: caseData.prompt,
      currentPhase: 'INTRO',
      revealedValues: {},
      unrevealedLabels: unrevealedLabels(ledger),
      pushbackDone: false,
      phaseElapsedMs: 0,
      phaseBudgetMs: PHASE_BUDGETS_MS['INTRO'],
    },
  });

  const openingText = openingActions
    .filter(a => a.type === 'speak')
    .map(a => (a as { type: 'speak'; text: string }).text)
    .join(' ');

  await db.insert(sessionTurns).values({
    sessionId: session.id,
    turnIndex: 0,
    role: 'interviewer',
    text: openingText,
    timestampMs: Date.now(),
  });

  return NextResponse.json({ sessionId: session.id, openingText });
}
