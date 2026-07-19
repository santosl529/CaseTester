import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { db } from '@/db/client';
import { sessions, sessionTurns } from '@/db/schema';
import { getCaseById } from '@/lib/cases/loader';
import { buildOpeningMessage } from '@/lib/agent/prompts/scripts';
import { logEvent } from '@/lib/analytics';

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { caseId, clubCode } = await req.json();

  const validCodes = (process.env.CLUB_CODES ?? '').split(',').map(c => c.trim().toUpperCase());
  if (!validCodes.includes((clubCode ?? '').toUpperCase())) {
    return NextResponse.json({ error: 'Invalid club code' }, { status: 403 });
  }

  let caseData;
  try {
    caseData = getCaseById(caseId);
  } catch {
    return NextResponse.json({ error: 'Unknown case' }, { status: 400 });
  }

  // Create session
  const [session] = await db.insert(sessions).values({
    userId: user.id,
    caseId,
    phase: 'INTRO',
  }).returning();

  // Opening message is deterministic: the candidate must see the EXACT case
  // prompt (numbers and all). Relying on a model turn to state it was
  // unreliable — a live run opened with "walk me through your thinking" and
  // never presented the scenario, so the candidate structured blind.
  const openingText = buildOpeningMessage(caseData.prompt, session.id);

  await db.insert(sessionTurns).values({
    sessionId: session.id,
    turnIndex: 0,
    role: 'interviewer',
    text: openingText,
    timestampMs: Date.now(),
  });

  await logEvent('case_start', { caseId }, { sessionId: session.id, userId: user.id });

  return NextResponse.json({ sessionId: session.id, openingText });
}
