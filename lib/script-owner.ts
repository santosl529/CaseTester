// The account that owns the sessions test scripts create (live-run, voice-latency, voice-demo). Lorenzo, 6 Nov: his
// own id, set as SCRIPT_USER_ID — the scripts used to borrow the newest session's user, possibly a student, whose
// start limits (lib/session-limits.ts) the runs then used up. Put the same id in CASE_LIMIT_EXEMPT_USER_IDS so test
// runs don't count toward the site-wide ceiling either.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function scriptOwnerId(env: Record<string, string | undefined> = process.env): string {
  const id = env.SCRIPT_USER_ID?.trim();
  if (!id) throw new Error('SCRIPT_USER_ID is not set: the Supabase user id that owns test-run sessions (yours). Add it to .env.local.');
  if (!UUID.test(id)) throw new Error(`SCRIPT_USER_ID "${id}" is not a Supabase user id (a UUID from Authentication → Users).`);
  return id;
}
