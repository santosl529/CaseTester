import { NextResponse } from 'next/server';
import { retryStaleGrading } from '@/lib/drills/grading/jobs';

// Finishes delayed AI grading (docs/prd-drills.md "Failure states": complete
// grading in the background within 10 minutes). Meant for a scheduled job
// (Vercel Cron sends `Authorization: Bearer $CRON_SECRET`); without the
// secret configured, it refuses every request. The results page also retries
// grading whenever it polls, so this is the backstop for students who left.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const sets = await retryStaleGrading();
  return NextResponse.json({ sets_checked: sets });
}
