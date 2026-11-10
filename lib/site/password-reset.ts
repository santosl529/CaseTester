// Forgot password (Lorenzo, 10 Nov: "we need a forget password flow right now"). Two ways to the same link:
//  - the student asks at /forgot-password; POST /api/password/forgot has Supabase email them a reset link. Until the
//    site has its own email sender (SMTP, Lorenzo's to-do), Supabase's built-in sender only reaches its team members,
//    so students won't get it yet;
//  - meanwhile Lorenzo runs scripts/password-reset-link.ts <email> and sends the link himself.
// Either link opens /auth/confirm, which signs the student in for the reset and sends them to /reset-password, where
// POST /api/password/update sets the new password. No server imports here: the forms use it too.
import { PASSWORD_MAX, PASSWORD_MIN } from '@/lib/site/sign-up-rules';
import { originOf, siteOrigin } from '@/lib/site/url';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const CONFIRM_PATH = '/auth/confirm';
export const RESET_PATH = '/reset-password';
export const EXPIRED_PATH = '/forgot-password?expired=1';

export function parseResetEmail(body: unknown): { ok: true; email: string } | { ok: false; error: 'invalid_email' } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  if (!EMAIL.test(email) || email.length > 254) return { ok: false, error: 'invalid_email' };
  return { ok: true, email };
}

export function parseNewPassword(body: unknown): { ok: true; password: string } | { ok: false; error: 'weak_password' } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const password = typeof b.password === 'string' ? b.password : '';
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) return { ok: false, error: 'weak_password' };
  return { ok: true, password };
}

// Where Supabase's reset email sends the student (redirectTo). Must be in Supabase's Redirect URLs.
export function confirmUrl(configured: string | undefined, requestOrigin: string | undefined): string | undefined {
  const origin = siteOrigin(configured, requestOrigin);
  return origin && `${origin}${CONFIRM_PATH}`;
}

// The link the manual script prints, from the admin API's hashed token (the same shape the email template uses).
export function resetLink(origin: string, tokenHash: string): string {
  const base = originOf(origin);
  if (!base) throw new Error(`not a site origin: ${origin}`);
  return `${base}${CONFIRM_PATH}?${new URLSearchParams({ token_hash: tokenHash, type: 'recovery' })}`;
}
