// Shared by the drills route handlers: the student behind a request (signed
// in and past the club-code gate), and error → JSON response mapping.
import 'server-only';
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/client';
import { studentProfiles } from '@/db/schema';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { DrillError } from './sets/service';

// getClaims verifies the session token's signature locally (with the
// project's cached signing keys), so most requests skip a round trip to the
// Supabase Auth server. Routes on an existing set skip the club-code profile
// check: the set's student_id already ties it to this student, and starting a
// set required the profile.
export async function requireStudent(opts: { profile?: boolean } = {}): Promise<string> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || !userId) throw new DrillError('unauthorized', 401, 'Sign in first');
  if (opts.profile !== false) {
    const [profile] = await db.select({ userId: studentProfiles.userId }).from(studentProfiles).where(eq(studentProfiles.userId, userId));
    if (!profile) throw new DrillError('club_code_required', 403, 'Enter your club code first');
  }
  return userId;
}

export async function handle(fn: () => Promise<unknown>): Promise<NextResponse> {
  try {
    return NextResponse.json(await fn());
  } catch (e) {
    if (e instanceof DrillError) return NextResponse.json({ error: e.code, message: e.message, ...e.data }, { status: e.status });
    if (e instanceof z.ZodError) return NextResponse.json({ error: 'bad_request', message: z.prettifyError(e) }, { status: 400 });
    console.error('drills route failed', e);
    return NextResponse.json({ error: 'server_error', message: 'Something went wrong' }, { status: 500 });
  }
}

export async function jsonBody(req: Request): Promise<unknown> {
  return req.json().catch(() => {
    throw new DrillError('bad_request', 400, 'Expected a JSON body');
  });
}
