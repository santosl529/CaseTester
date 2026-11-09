// The Supabase admin client (server only): creates accounts for POST /api/sign-up, which checks the club code first
// (Lorenzo, 8 Nov). Uses SUPABASE_SECRET_KEY, which must never reach the browser; nothing under components/ imports
// this (tests/security/hardening.test.ts walks the client import graph).
import 'server-only';
import { createClient } from '@supabase/supabase-js';

export function createAdminSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('Supabase admin client: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY is not set');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
