// What the sign-up and log-in forms say when something goes wrong (8 Nov: "make everything fail clearly and
// gracefully"): every failure gets a sentence that says what happened and what to do.
import { PASSWORD_MAX, PASSWORD_MIN } from '@/lib/site/sign-up-rules';

export function retryWait(seconds: number | undefined): string {
  if (!seconds || !Number.isFinite(seconds)) return 'a few minutes';
  const minutes = Math.ceil(seconds / 60);
  return minutes <= 1 ? 'a minute' : `${minutes} minutes`;
}

// The body POST /api/sign-up answered with, or null when there was no answer (offline, server down).
export function signUpErrorMessage(body: { error?: string; retryAfterSec?: number } | null): string {
  if (!body) return "We couldn't reach the server. Check your connection and try again.";
  switch (body.error) {
    case 'invalid_club_code': return "That club code isn't valid. Check it with your club president.";
    case 'email_exists': return 'An account with this email already exists. Log in instead.';
    case 'weak_password': return `Use a password of ${PASSWORD_MIN} to ${PASSWORD_MAX} characters.`;
    case 'invalid_email': return 'Enter a valid email address.';
    case 'rate_limited': return `Too many sign-up attempts from this network. Try again in ${retryWait(body.retryAfterSec)}.`;
    default: return "We couldn't create your account just now. Please try again in a minute.";
  }
}

// Supabase's sign-in error (AuthError: code, status, name), or null when the call itself threw.
export function signInErrorMessage(err: { code?: string; status?: number; name?: string } | null): string {
  if (!err || !err.status || err.name === 'AuthRetryableFetchError') return "We couldn't reach the log-in service. Check your connection and try again.";
  if (err.code === 'invalid_credentials') return 'Wrong email or password.';
  if (err.code === 'email_not_confirmed') return 'Confirm your email first: open the link we sent you, then log in.';
  if (err.status === 429 || err.code === 'over_request_rate_limit') return 'Too many log-in attempts. Wait a few minutes and try again.';
  return "Log-in isn't working right now. Please try again in a minute.";
}

const OFFLINE = "We couldn't reach the server. Check your connection and try again.";

// /account: change club code (POST /api/account/club).
export function clubChangeErrorMessage(body: { error?: string; retryAfterSec?: number } | null): string {
  if (!body) return OFFLINE;
  if (body.error === 'invalid_club_code') return "That club code isn't valid. Check it with your club president.";
  if (body.error === 'rate_limited') return `Too many attempts. Try again in ${retryWait(body.retryAfterSec)}.`;
  if (body.error === 'Unauthorized') return 'Your session has ended. Log in again to change your club.';
  return "We couldn't change your club just now. Please try again in a minute.";
}

// /account: delete account (POST /api/account/delete).
export function deleteErrorMessage(body: { error?: string } | null): string {
  if (!body) return OFFLINE;
  if (body.error === 'email_mismatch') return "That doesn't match your account's email. Type it exactly to confirm.";
  if (body.error === 'Unauthorized') return 'Your session has ended. Log in again to delete your account.';
  return "We couldn't finish deleting your account. Nothing is lost by trying again: please try again in a minute.";
}
