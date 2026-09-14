import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getCaseById } from '@/lib/cases/loader';
import { startSession } from '@/lib/orchestrator/start-session';

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { caseId, clubCode } = await req.json();

  const validCodes = (process.env.CLUB_CODES ?? '').split(',').map(c => c.trim().toUpperCase());
  if (!validCodes.includes((clubCode ?? '').toUpperCase())) {
    return NextResponse.json({ error: 'Invalid club code' }, { status: 403 });
  }

  try {
    getCaseById(caseId);
  } catch {
    return NextResponse.json({ error: 'Unknown case' }, { status: 400 });
  }

  const { sessionId, openingText } = await startSession(user.id, caseId);
  return NextResponse.json({ sessionId, openingText });
}
