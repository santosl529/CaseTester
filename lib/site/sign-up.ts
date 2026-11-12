// Sign-up needs a valid club code (Lorenzo, 8 Nov: "only people with a club code can sign up; then they're sent to
// log in; later log-ins don't need the code"). POST /api/sign-up checks the form, creates the account through the
// Supabase admin API (public sign-ups are switched off in Supabase, so the code can't be skipped) and records the
// club on the student's profile, so /sign-in never asks for it again.
//
// Confirm first (Lorenzo, 11 Nov): with an email sender configured (RESEND_API_KEY), the account is created
// unconfirmed and a one-time link emailed (lib/site/verify-email.ts); Supabase refuses log-in until it is opened. If the
// email can't be sent, the new account is removed so a retry starts clean. Without a sender, accounts are confirmed at
// once (as from 8 Nov), with a warning in the log.
import { assignClub, clubOrgId } from '@/lib/club';
import { PASSWORD_MAX, PASSWORD_MIN } from '@/lib/site/sign-up-rules';

export { PASSWORD_MAX, PASSWORD_MIN };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type SignUpError = 'invalid_email' | 'weak_password' | 'invalid_club_code' | 'email_exists' | 'email_unavailable';
export type SignUpForm = { ok: true; email: string; password: string; orgId: string } | { ok: false; error: Exclude<SignUpError, 'email_exists' | 'email_unavailable'> };

export function parseSignUp(body: unknown): SignUpForm {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  if (!EMAIL.test(email) || email.length > 254) return { ok: false, error: 'invalid_email' };
  const password = typeof b.password === 'string' ? b.password : '';
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) return { ok: false, error: 'weak_password' };
  const orgId = clubOrgId(b.clubCode);
  if (!orgId) return { ok: false, error: 'invalid_club_code' };
  return { ok: true, email, password, orgId };
}

export type SignUpDeps = {
  createUser: (email: string, password: string, confirmed: boolean) => Promise<{ ok: true; userId: string } | { ok: false; error: 'email_exists' | 'weak_password' }>;
  recordOrg: (userId: string, orgId: string) => Promise<void>;
  deleteUser: (userId: string) => Promise<void>;
  sendVerification: ((email: string) => Promise<void>) | null;   // null: no email sender configured
};
export type SignUpResult = { ok: true; verify: boolean } | { ok: false; error: 'email_exists' | 'weak_password' | 'email_unavailable' };

export async function signUpStudent(form: Extract<SignUpForm, { ok: true }>, deps: SignUpDeps): Promise<SignUpResult> {
  const verify = deps.sendVerification != null;
  if (!verify) console.warn('[sign-up] no email sender (RESEND_API_KEY unset): the account is confirmed without an email');
  const created = await deps.createUser(form.email, form.password, !verify);
  if (!created.ok) return created;
  if (deps.sendVerification) {
    try {
      await deps.sendVerification(form.email);
    } catch (err) {
      console.error('[sign-up] the confirmation email was not sent; removing the new account', err instanceof Error ? err.message : err);
      await deps.deleteUser(created.userId).catch(e => console.error('[sign-up] could not remove the unconfirmed account', e instanceof Error ? e.message : e));
      return { ok: false, error: 'email_unavailable' };
    }
  }
  try {
    await deps.recordOrg(created.userId, form.orgId);
  } catch (err) {
    // The account exists; without the club on file, log-in asks for the code once (the club step) instead.
    console.error('[sign-up] account created but the club was not recorded', err);
  }
  return { ok: true, verify };
}

export async function signUpDeps(origin: string): Promise<SignUpDeps> {
  const { createAdminSupabaseClient } = await import('@/lib/supabase/admin');
  const { verifyDeps, sendVerification } = await import('@/lib/site/verify-email');
  const verify = await verifyDeps(origin);
  return {
    createUser: async (email, password, confirmed) => {
      const { data, error } = await createAdminSupabaseClient().auth.admin.createUser({ email, password, email_confirm: confirmed });
      if (error) {
        if (error.code === 'email_exists' || /already (been )?registered/i.test(error.message)) return { ok: false, error: 'email_exists' };
        if (error.code === 'weak_password') return { ok: false, error: 'weak_password' };
        throw error;
      }
      return { ok: true, userId: data.user.id };
    },
    recordOrg: async (userId, orgId) => { await assignClub(userId, orgId); },
    deleteUser: async (userId) => {
      const { error } = await createAdminSupabaseClient().auth.admin.deleteUser(userId);
      if (error) throw error;
    },
    sendVerification: verify ? (email) => sendVerification(email, verify) : null,
  };
}
