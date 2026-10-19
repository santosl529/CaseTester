import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { isListedCase } from '@/lib/cases/listed';
import { startSession } from '@/lib/orchestrator/start-session';
import { clubOrgId, recordStudentOrg, storedClubOrg } from '@/lib/club';

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { caseId, clubCode } = await req.json().catch(() => ({}));

  // Still checked here: the club step (/api/club) is a convenience, not the gate.
  // A returning student types no code — the one on their profile counts while
  // it is still valid (site flow, 19 Oct).
  const typed = clubOrgId(clubCode);
  const orgId = typed ?? await storedClubOrg(user.id);
  if (!orgId) {
    return NextResponse.json({ error: 'Invalid club code' }, { status: 403 });
  }
  if (typed) await recordStudentOrg(user.id, typed);

  // Only the cases switched on for students (lib/cases/listed.ts).
  if (!isListedCase(caseId)) {
    return NextResponse.json({ error: 'Unknown case' }, { status: 400 });
  }

  const { sessionId, openingText } = await startSession(user.id, caseId);
  return NextResponse.json({ sessionId, openingText });
}
