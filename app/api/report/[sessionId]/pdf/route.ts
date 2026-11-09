import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/client';
import { sessions } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { renderReportPdf } from './render';
import { hitRateLimit, rateLimitedResponse, rateRule } from '@/lib/rate-limit';
import { sessionRoute } from '@/lib/http/route-guard';

async function handleGET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sessionId } = await params;

  const session = await db.query.sessions.findFirst({
    where: and(eq(sessions.id, sessionId), eq(sessions.userId, user.id)),
  });
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Per student (10 an hour): rendering a PDF is the heaviest CPU work on the site.
  const limited = await hitRateLimit(rateRule('reportPdf'), `user:${user.id}`);
  if (!limited.ok) return rateLimitedResponse(limited);

  const pdf = await renderReportPdf(sessionId);
  if (!pdf) return NextResponse.json({ error: 'No report for this session' }, { status: 404 });

  return new NextResponse(new Uint8Array(pdf.buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${pdf.filename}"`,
    },
  });
}

// A throw answers JSON 500, a malformed id JSON 404 (lib/http/route-guard.ts).
export const GET = sessionRoute(handleGET);
