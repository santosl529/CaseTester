import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { parseVoiceConsent, recordVoiceConsent } from '@/lib/voice/consent';
import { jsonRoute } from '@/lib/http/route-guard';

// Records the student's voice consent (lib/voice/consent.ts): the box checked on the voice screen, for the policy
// version that screen showed. Repeating it just refreshes the record. 400 without the box; 409 stale_policy when the
// page predates a policy change (reload); 409 no_profile when signed in without a club.
async function handlePOST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = parseVoiceConsent(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.error === 'stale_policy' ? 409 : 400 });

  if (!(await recordVoiceConsent(user.id, parsed.version, new Date()))) return NextResponse.json({ error: 'no_profile' }, { status: 409 });
  return NextResponse.json({ ok: true });
}

// A throw answers JSON 500 (lib/http/route-guard.ts).
export const POST = jsonRoute(handlePOST);
