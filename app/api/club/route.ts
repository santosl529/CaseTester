import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { clubOrgId, recordStudentOrg } from '@/lib/club';

// Checks the club code at the club step and records the student's org, so
// drills (which never start a case) see students who passed the gate.
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { clubCode } = await req.json().catch(() => ({}));
  const orgId = clubOrgId(clubCode);
  if (!orgId) return NextResponse.json({ error: 'Invalid club code' }, { status: 403 });

  await recordStudentOrg(user.id, orgId);
  return NextResponse.json({ ok: true });
}
