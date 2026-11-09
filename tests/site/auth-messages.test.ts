// What the sign-up and log-in forms say when something goes wrong (8 Nov: "make everything fail clearly").
import { describe, it, expect } from 'vitest';
import { signUpErrorMessage, signInErrorMessage, retryWait } from '@/lib/site/auth-messages';

describe('retryWait', () => {
  it('seconds to words', () => {
    expect(retryWait(30)).toBe('a minute');
    expect(retryWait(61)).toBe('2 minutes');
    expect(retryWait(3600)).toBe('60 minutes');
    expect(retryWait(undefined)).toBe('a few minutes');
  });
});

describe('signUpErrorMessage', () => {
  it('each server answer', () => {
    expect(signUpErrorMessage({ error: 'invalid_club_code' })).toBe("That club code isn't valid. Check it with your club president.");
    expect(signUpErrorMessage({ error: 'email_exists' })).toBe('An account with this email already exists. Log in instead.');
    expect(signUpErrorMessage({ error: 'weak_password' })).toBe('Use a password of 8 to 72 characters.');
    expect(signUpErrorMessage({ error: 'invalid_email' })).toBe('Enter a valid email address.');
    expect(signUpErrorMessage({ error: 'rate_limited', retryAfterSec: 600 })).toBe('Too many sign-up attempts from this network. Try again in 10 minutes.');
  });
  it('anything else, or no answer at all: try again shortly', () => {
    expect(signUpErrorMessage({ error: 'sign_up_unavailable' })).toBe("We couldn't create your account just now. Please try again in a minute.");
    expect(signUpErrorMessage(null)).toBe("We couldn't reach the server. Check your connection and try again.");
  });
});

describe('signInErrorMessage', () => {
  it("Supabase's answers", () => {
    expect(signInErrorMessage({ code: 'invalid_credentials', status: 400 })).toBe('Wrong email or password.');
    expect(signInErrorMessage({ code: 'email_not_confirmed', status: 400 })).toBe('Confirm your email first: open the link we sent you, then log in.');
    expect(signInErrorMessage({ code: 'over_request_rate_limit', status: 429 })).toBe('Too many log-in attempts. Wait a few minutes and try again.');
    expect(signInErrorMessage({ status: 429 })).toBe('Too many log-in attempts. Wait a few minutes and try again.');
  });
  it('no response (offline, Supabase down): a connection message, not a blank', () => {
    expect(signInErrorMessage({ status: 0, name: 'AuthRetryableFetchError' })).toBe("We couldn't reach the log-in service. Check your connection and try again.");
    expect(signInErrorMessage(null)).toBe("We couldn't reach the log-in service. Check your connection and try again.");
  });
  it('anything else: generic but actionable', () => {
    expect(signInErrorMessage({ code: 'unexpected_failure', status: 500 })).toBe("Log-in isn't working right now. Please try again in a minute.");
  });
});

describe('account page messages (9 Nov)', async () => {
  const { clubChangeErrorMessage, deleteErrorMessage } = await import('@/lib/site/auth-messages');
  it('club change', () => {
    expect(clubChangeErrorMessage({ error: 'invalid_club_code' })).toBe("That club code isn't valid. Check it with your club president.");
    expect(clubChangeErrorMessage({ error: 'rate_limited', retryAfterSec: 120 })).toBe('Too many attempts. Try again in 2 minutes.');
    expect(clubChangeErrorMessage({ error: 'Unauthorized' })).toBe('Your session has ended. Log in again to change your club.');
    expect(clubChangeErrorMessage(null)).toBe("We couldn't reach the server. Check your connection and try again.");
    expect(clubChangeErrorMessage({})).toBe("We couldn't change your club just now. Please try again in a minute.");
  });
  it('delete', () => {
    expect(deleteErrorMessage({ error: 'email_mismatch' })).toBe("That doesn't match your account's email. Type it exactly to confirm.");
    expect(deleteErrorMessage({ error: 'delete_failed' })).toBe("We couldn't finish deleting your account. Nothing is lost by trying again: please try again in a minute.");
    expect(deleteErrorMessage({ error: 'Unauthorized' })).toBe('Your session has ended. Log in again to delete your account.');
    expect(deleteErrorMessage(null)).toBe("We couldn't reach the server. Check your connection and try again.");
  });
});
