// Look up a login by email (11 Nov), read-only over DATABASE_URL. Supabase's admin API has no lookup by email, and
// asking it for a link for an unknown email CREATES that account (probe on production, 11 Nov) — so resending a
// confirmation link, the forgot-password route and the manual reset script look the account up first.
import { sql } from 'drizzle-orm';
import { db } from '@/db/client';

export type AuthUser = { id: string; confirmed: boolean };

export async function findAuthUserByEmail(email: string, exec: Pick<typeof db, 'execute'> = db): Promise<AuthUser | null> {
  const rows = await exec.execute<{ id: string; email_confirmed_at: string | null }>(
    sql`select id, email_confirmed_at from auth.users where lower(email) = ${email.trim().toLowerCase()} limit 1`,
  );
  const row = rows[0];
  return row ? { id: row.id, confirmed: row.email_confirmed_at != null } : null;
}
