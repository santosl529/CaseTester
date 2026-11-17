import { NextResponse } from 'next/server';
import { requireStudent } from '@/lib/drills/http';
import { logDrillEvent } from '@/lib/drills/events';
import { nextCaseHref } from '@/lib/cases/listed';

// The Next case card's link: logs next_case_card_clicked, then opens the Cases page with the recommended case marked
// (nextCaseHref; 17 Nov, M1), or the cases on /home (8 Nov audit: it went to the marketing page).
export async function GET(req: Request) {
  const caseId = new URL(req.url).searchParams.get('case');
  try {
    const studentId = await requireStudent({ profile: false });
    await logDrillEvent(studentId, 'next_case_card_clicked', { recommended_case_id: caseId });
  } catch {
    // Not signed in: just go to the cases list (sign-in comes first).
  }
  const to = nextCaseHref(caseId);
  return NextResponse.redirect(new URL(to, req.url));
}
