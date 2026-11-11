// Forgot password (Lorenzo, 10 Nov: "we need a forget password flow right now"): the form parsing, the reset link
// the email and the manual script both use, and what each failure tells the student.
import { describe, it, expect } from 'vitest';
import { parseResetEmail, parseNewPassword, resetLink, confirmUrl } from '@/lib/site/password-reset';
import { forgotErrorMessage, resetErrorMessage, resendMessage, signUpErrorMessage } from '@/lib/site/auth-messages';

describe('parseResetEmail', () => {
  it('trims and lowercases a valid email', () => {
    expect(parseResetEmail({ email: '  Ann@Example.COM ' })).toEqual({ ok: true, email: 'ann@example.com' });
  });
  it('anything else is invalid_email', () => {
    for (const body of [null, 'x', {}, { email: 'nope' }, { email: 3 }, { email: `${'a'.repeat(250)}@b.co` }]) {
      expect(parseResetEmail(body), JSON.stringify(body)).toEqual({ ok: false, error: 'invalid_email' });
    }
  });
});

describe('parseNewPassword', () => {
  it('8 to 72 characters pass, untrimmed', () => {
    expect(parseNewPassword({ password: ' 12345678' })).toEqual({ ok: true, password: ' 12345678' });
    expect(parseNewPassword({ password: 'x'.repeat(72) }).ok).toBe(true);
  });
  it('shorter, longer or missing is weak_password', () => {
    for (const body of [null, {}, { password: '1234567' }, { password: 'x'.repeat(73) }, { password: 12345678 }]) {
      expect(parseNewPassword(body), JSON.stringify(body)).toEqual({ ok: false, error: 'weak_password' });
    }
  });
});

describe('resetLink', () => {
  it('points at /auth/confirm with the token hash and type=recovery', () => {
    expect(resetLink('https://case-tester.vercel.app', 'abc 123')).toBe('https://case-tester.vercel.app/auth/confirm?token_hash=abc+123&type=recovery');
  });
  it('drops any path or trailing slash on the origin', () => {
    expect(resetLink('https://casepace.example/some/path/', 'h')).toBe('https://casepace.example/auth/confirm?token_hash=h&type=recovery');
  });
});

describe('confirmUrl', () => {
  it('the configured origin wins, else the request origin', () => {
    expect(confirmUrl('https://casepace.example', 'http://localhost:3000')).toBe('https://casepace.example/auth/confirm');
    expect(confirmUrl(undefined, 'http://localhost:3000')).toBe('http://localhost:3000/auth/confirm');
    expect(confirmUrl('not a url', 'http://localhost:3000')).toBe('http://localhost:3000/auth/confirm');
  });
});

describe('forgotErrorMessage', () => {
  it('says what happened and what to do', () => {
    expect(forgotErrorMessage(null)).toMatch(/couldn't reach the server/);
    expect(forgotErrorMessage({ error: 'invalid_email' })).toBe('Enter a valid email address.');
    expect(forgotErrorMessage({ error: 'rate_limited', retryAfterSec: 1200 })).toBe('Too many reset requests. Try again in 20 minutes.');
    expect(forgotErrorMessage({ error: 'reset_unavailable' })).toMatch(/couldn't send the reset email/);
    expect(forgotErrorMessage({ error: 'no_account' })).toBe('No account uses this email. Check the address, or sign up with your club code.');
  });
});

describe('resetErrorMessage', () => {
  it('says what happened and what to do', () => {
    expect(resetErrorMessage(null)).toMatch(/couldn't reach the server/);
    expect(resetErrorMessage({ error: 'weak_password' })).toBe('Use a password of 8 to 72 characters.');
    expect(resetErrorMessage({ error: 'same_password' })).toBe('Choose a password different from your old one.');
    expect(resetErrorMessage({ error: 'Unauthorized' })).toMatch(/link has expired.*new one/);
    expect(resetErrorMessage({ error: 'update_failed' })).toMatch(/couldn't change your password/);
  });
});

describe('confirmation email messages (11 Nov)', () => {
  it('sign-up: the email could not be sent, so no account was made', () => {
    expect(signUpErrorMessage({ error: 'email_unavailable' })).toBe("We couldn't send your confirmation email, so your account wasn't created. Please try again in a few minutes.");
  });
  it('resend: each outcome said plainly', () => {
    expect(resendMessage(200, { ok: true }, 'ann@example.com')).toEqual({ ok: true, text: 'We sent a new confirmation link to ann@example.com.' });
    expect(resendMessage(404, { error: 'no_account' }, 'x')).toEqual({ ok: false, text: 'No account uses this email. Sign up with your club code.' });
    expect(resendMessage(409, { error: 'already_confirmed' }, 'x')).toEqual({ ok: false, text: 'This account is already confirmed. Log in.' });
    expect(resendMessage(429, { error: 'rate_limited', retryAfterSec: 300 }, 'x').text).toBe('Too many emails requested. Try again in 5 minutes.');
    expect(resendMessage(0, null, 'x').text).toMatch(/couldn't reach the server/);
    expect(resendMessage(503, { error: 'email_unavailable' }, 'x').text).toMatch(/couldn't send the email/);
  });
});
