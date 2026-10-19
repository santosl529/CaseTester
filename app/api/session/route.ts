import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getCaseById } from '@/lib/cases/loader';
import { startSession } from '@/lib/orchestrator/start-session';
import { clubOrgId, recordStudentOrg } from '@/lib/club';

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { caseId, clubCode } = await req.json();

  // Still checked here: the club step (/api/club) is a convenience, not the gate.
  const orgId = clubOrgId(clubCode);
  if (!orgId) {
    return NextResponse.json({ error: 'Invalid club code' }, { status: 403 });
  }
  await recordStudentOrg(user.id, orgId);

  try {
    getCaseById(caseId);
  } catch {
    return NextResponse.json({ error: 'Unknown case' }, { status: 400 });
  }

  const { sessionId, openingText } = await startSession(user.id, caseId);
  return NextResponse.json({ sessionId, openingText });
}
