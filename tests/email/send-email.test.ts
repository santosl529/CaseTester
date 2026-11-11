// The site's own email sender (Lorenzo, 11 Nov: confirm-first sign-up): Resend's HTTP API, no SDK.
import { describe, it, expect } from 'vitest';
import { emailConfig, sendEmail } from '@/lib/email/send';

describe('emailConfig', () => {
  it('needs RESEND_API_KEY; the sender defaults to CasePace <noreply@casepace.io>', () => {
    expect(emailConfig({})).toBeNull();
    expect(emailConfig({ RESEND_API_KEY: ' ' })).toBeNull();
    expect(emailConfig({ RESEND_API_KEY: 'k' })).toEqual({ apiKey: 'k', from: 'CasePace <noreply@casepace.io>' });
    expect(emailConfig({ RESEND_API_KEY: 'k', EMAIL_FROM: 'X <a@b.io>' })).toEqual({ apiKey: 'k', from: 'X <a@b.io>' });
  });
});

describe('sendEmail', () => {
  const msg = { to: 'ann@example.com', subject: 'Hi', text: 'plain', html: '<p>plain</p>' };
  it('posts one email to Resend with the key as a bearer token', async () => {
    const calls: [string, RequestInit][] = [];
    const fake = (async (url: string, init: RequestInit) => { calls.push([url, init]); return new Response('{"id":"e1"}', { status: 200 }); }) as unknown as typeof fetch;
    await sendEmail({ apiKey: 'k', from: 'CasePace <noreply@casepace.io>' }, msg, fake);
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe('https://api.resend.com/emails');
    expect((calls[0][1].headers as Record<string, string>).Authorization).toBe('Bearer k');
    expect(JSON.parse(calls[0][1].body as string)).toEqual({ from: 'CasePace <noreply@casepace.io>', to: ['ann@example.com'], subject: 'Hi', text: 'plain', html: '<p>plain</p>' });
  });
  it('a refusal throws with the status, never the key', async () => {
    const fake = (async () => new Response('{"message":"domain not verified"}', { status: 403 })) as unknown as typeof fetch;
    const err = (await sendEmail({ apiKey: 'secret-key', from: 'a@b.io' }, msg, fake).then(() => null, (e: Error) => e))!;
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(/403/);
    expect(err.message).not.toContain('secret-key');
  });
});
