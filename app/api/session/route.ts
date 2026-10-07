import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getCaseById } from '@/lib/cases/loader';
import { startSession } from '@/lib/orchestrator/start-session';
import { db } from '@/db/client';
import { studentProfiles } from '@/db/schema';

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { caseId, clubCode } = await req.json();

  const validCodes = (process.env.CLUB_CODES ?? '').split(',').map(c => c.trim().toUpperCase());
  const orgId = (clubCode ?? '').trim().toUpperCase();
  if (!validCodes.includes(orgId)) {
    return NextResponse.json({ error: 'Invalid club code' }, { status: 403 });
  }

  // docs/prd-drills.md: org_id comes from the club code and is set once, the
  // first time the student passes the gate; drills analytics read it from here.
  await db.insert(studentProfiles).values({ userId: user.id, orgId }).onConflictDoNothing();

  try {
    getCaseById(caseId);
  } catch {
    return NextResponse.json({ error: 'Unknown case' }, { status: 400 });
  }

  const { sessionId, openingText } = await startSession(user.id, caseId);
  return NextResponse.json({ sessionId, openingText });
}
