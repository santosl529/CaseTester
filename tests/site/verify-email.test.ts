// Confirm-first sign-up (Lorenzo, 11 Nov: "students should confirm their email before their first log in").
// Probe on production (11 Nov): a magic-link token for an unconfirmed account confirms it on verifyOtp(type 'email'),
// once; but asking Supabase for a link for an UNKNOWN email creates that account, with no club code. So resending
// looks the account up first and asks for a link only for an existing, unconfirmed one.
import { describe, it, expect } from 'vitest';
import { verifyLink, verificationEmail, resendVerification, sendVerification } from '@/lib/site/verify-email';

describe('verifyLink', () => {
  it('points at /auth/confirm with type=email', () => {
    expect(verifyLink('https://casepace.io/', 'h 1')).toBe('https://casepace.io/auth/confirm?token_hash=h+1&type=email');
  });
});

describe('verificationEmail', () => {
  it('carries the link in both parts and says it works once', () => {
    const m = verificationEmail('https://casepace.io/auth/confirm?token_hash=h&type=email');
    expect(m.subject).toBe('Confirm your CasePace account');
    expect(m.text).toContain('https://casepace.io/auth/confirm?token_hash=h&type=email');
    expect(m.html).toContain('href="https://casepace.io/auth/confirm?token_hash=h&amp;type=email"');
    expect(m.text).toMatch(/works once/);
  });
});

function fakes(account: { id: string; confirmed: boolean } | null) {
  const calls: string[] = [];
  return {
    calls,
    deps: {
      origin: 'https://casepace.io',
      lookup: async (email: string) => { calls.push(`lookup:${email}`); return account; },
      generateLink: async (email: string) => { calls.push(`link:${email}`); return 'tok'; },
      send: async (to: string, m: { subject: string; text: string }) => { calls.push(`send:${to}:${m.text.includes('token_hash=tok') ? 'link' : 'NO LINK'}`); },
    },
  };
}

describe('sendVerification (right after sign-up)', () => {
  it('makes the link and emails it', async () => {
    const f = fakes(null);
    await sendVerification('ann@example.com', f.deps);
    expect(f.calls).toEqual(['link:ann@example.com', 'send:ann@example.com:link']);
  });
});

describe('resendVerification', () => {
  it('an unconfirmed account: a new link is sent', async () => {
    const f = fakes({ id: 'u1', confirmed: false });
    expect(await resendVerification('ann@example.com', f.deps)).toBe('sent');
    expect(f.calls).toEqual(['lookup:ann@example.com', 'link:ann@example.com', 'send:ann@example.com:link']);
  });
  it('no account: says so, and never asks Supabase for a link (that would create the account)', async () => {
    const f = fakes(null);
    expect(await resendVerification('ghost@example.com', f.deps)).toBe('no_account');
    expect(f.calls).toEqual(['lookup:ghost@example.com']);
  });
  it('already confirmed: says so; no link (it would be a log-in link)', async () => {
    const f = fakes({ id: 'u1', confirmed: true });
    expect(await resendVerification('ann@example.com', f.deps)).toBe('already_confirmed');
    expect(f.calls).toEqual(['lookup:ann@example.com']);
  });
});
