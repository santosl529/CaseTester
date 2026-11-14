import { NextResponse } from 'next/server';
import { requireStudent } from '@/lib/drills/http';
import { logDrillEvent } from '@/lib/drills/events';

// The Next case card's link: logs next_case_card_clicked, then opens the
// cases list on /home (drills can't start a case itself yet).
export async function GET(req: Request) {
  const caseId = new URL(req.url).searchParams.get('case');
  try {
    const studentId = await requireStudent({ profile: false });
    await logDrillEvent(studentId, 'next_case_card_clicked', { recommended_case_id: caseId });
  } catch {
    // Not signed in: just go to the cases list (sign-in comes first).
  }
  return NextResponse.redirect(new URL('/home#cases', req.url));
}
