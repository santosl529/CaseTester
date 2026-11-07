import { NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'node:crypto';
import { retryStaleGrading } from '@/lib/drills/grading/jobs';

// Compared in constant time (security audit, 6 Nov): hashing both sides first gives equal-length buffers, so neither
// the content nor the length of the secret leaks through the comparison's timing.
function authorized(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header) return false;
  const digest = (v: string) => createHash('sha256').update(v).digest();
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}

// Finishes delayed AI grading (docs/prd-drills.md "Failure states": complete
// grading in the background within 10 minutes). Meant for a scheduled job
// (Vercel Cron sends `Authorization: Bearer $CRON_SECRET`); without the
// secret configured, it refuses every request. The results page also retries
// grading whenever it polls, so this is the backstop for students who left.
export async function GET(req: Request) {
  if (!authorized(req.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const sets = await retryStaleGrading();
  return NextResponse.json({ sets_checked: sets });
}
