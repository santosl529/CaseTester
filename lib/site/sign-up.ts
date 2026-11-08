// Sign-up needs a valid club code (Lorenzo, 8 Nov: "only people with a club code can sign up; then they're sent to
// log in; later log-ins don't need the code"). POST /api/sign-up checks the form, creates the account through the
// Supabase admin API (public sign-ups are switched off in Supabase, so the code can't be skipped) and records the
// club on the student's profile, so /sign-in never asks for it again.
//
// No confirmation email: admin-created accounts are confirmed at once. Email confirmation can come back once the
// site has its own email sender (Lorenzo's to-do).
import { clubOrgId, recordStudentOrg } from '@/lib/club';
import { PASSWORD_MAX, PASSWORD_MIN } from '@/lib/site/sign-up-rules';

export { PASSWORD_MAX, PASSWORD_MIN };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type SignUpError = 'invalid_email' | 'weak_password' | 'invalid_club_code' | 'email_exists';
export type SignUpForm = { ok: true; email: string; password: string; orgId: string } | { ok: false; error: Exclude<SignUpError, 'email_exists'> };

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
  createUser: (email: string, password: string) => Promise<{ ok: true; userId: string } | { ok: false; error: 'email_exists' | 'weak_password' }>;
  recordOrg: (userId: string, orgId: string) => Promise<void>;
};

export async function signUpStudent(form: Extract<SignUpForm, { ok: true }>, deps: SignUpDeps = adminDeps()): Promise<{ ok: true } | { ok: false; error: 'email_exists' | 'weak_password' }> {
  const created = await deps.createUser(form.email, form.password);
  if (!created.ok) return created;
  try {
    await deps.recordOrg(created.userId, form.orgId);
  } catch (err) {
    // The account exists; without the club on file, log-in asks for the code once (the club step) instead.
    console.error('[sign-up] account created but the club was not recorded', err);
  }
  return { ok: true };
}

function adminDeps(): SignUpDeps {
  return {
    createUser: async (email, password) => {
      const { createAdminSupabaseClient } = await import('@/lib/supabase/admin');
      const { data, error } = await createAdminSupabaseClient().auth.admin.createUser({ email, password, email_confirm: true });
      if (error) {
        if (error.code === 'email_exists' || /already (been )?registered/i.test(error.message)) return { ok: false, error: 'email_exists' };
        if (error.code === 'weak_password') return { ok: false, error: 'weak_password' };
        throw error;
      }
      return { ok: true, userId: data.user.id };
    },
    recordOrg: recordStudentOrg,
  };
}
