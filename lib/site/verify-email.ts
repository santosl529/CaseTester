// Confirm-first sign-up (Lorenzo, 11 Nov: "students should confirm their email before their first log in").
// Sign-up creates the account unconfirmed and emails a one-time link (Supabase admin generateLink 'magiclink' →
// our own email, lib/email/send.ts). The link opens /auth/confirm, whose verifyOtp(type 'email') confirms the
// account and signs the student in (probe on production, 11 Nov: confirms, works once, log-in refused before it).
// Resending looks the account up first: a link for an unknown email would create that account with no club code,
// and one for a confirmed account would be a password-free log-in link.
import { CONFIRM_PATH } from '@/lib/site/password-reset';
import { originOf } from '@/lib/site/url';
import type { AuthUser } from '@/lib/account/auth-user';

export type VerifyDeps = {
  origin: string;
  lookup: (email: string) => Promise<AuthUser | null>;
  generateLink: (email: string) => Promise<string>;   // the hashed token
  send: (to: string, msg: { subject: string; text: string; html: string }) => Promise<void>;
};

export function verifyLink(origin: string, tokenHash: string): string {
  const base = originOf(origin);
  if (!base) throw new Error(`not a site origin: ${origin}`);
  return `${base}${CONFIRM_PATH}?${new URLSearchParams({ token_hash: tokenHash, type: 'email' })}`;
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function verificationEmail(link: string) {
  const subject = 'Confirm your CasePace account';
  const text = `Open this link to confirm your email and finish creating your CasePace account:\n\n${link}\n\nThe link works once and expires in an hour. If you didn't sign up for CasePace, ignore this email.`;
  const html = `<p>Open this link to confirm your email and finish creating your CasePace account:</p>
<p><a href="${escapeHtml(link)}">Confirm my email</a></p>
<p>The link works once and expires in an hour. If you didn't sign up for CasePace, ignore this email.</p>`;
  return { subject, text, html };
}

// Right after sign-up: the account was just created unconfirmed.
export async function sendVerification(email: string, deps: Omit<VerifyDeps, 'lookup'>): Promise<void> {
  const token = await deps.generateLink(email);
  await deps.send(email, verificationEmail(verifyLink(deps.origin, token)));
}

export async function resendVerification(email: string, deps: VerifyDeps): Promise<'sent' | 'no_account' | 'already_confirmed'> {
  const account = await deps.lookup(email);
  if (!account) return 'no_account';
  if (account.confirmed) return 'already_confirmed';
  await sendVerification(email, deps);
  return 'sent';
}

// The real dependencies (server only; imported lazily so the forms can share this file's types).
export async function verifyDeps(origin: string): Promise<VerifyDeps | null> {
  const { emailConfig, sendEmail } = await import('@/lib/email/send');
  const cfg = emailConfig();
  if (!cfg) return null;
  const { findAuthUserByEmail } = await import('@/lib/account/auth-user');
  const { createAdminSupabaseClient } = await import('@/lib/supabase/admin');
  return {
    origin,
    lookup: findAuthUserByEmail,
    generateLink: async (email) => {
      const { data, error } = await createAdminSupabaseClient().auth.admin.generateLink({ type: 'magiclink', email });
      if (error || !data?.properties?.hashed_token) throw error ?? new Error('no confirmation token returned');
      return data.properties.hashed_token;
    },
    send: (to, msg) => sendEmail(cfg, { to, ...msg }),
  };
}
