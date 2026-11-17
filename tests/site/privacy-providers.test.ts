// The Privacy Policy names every provider that handles students' data, Sentry and Resend included (Matt, 17 Nov).
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({ usePathname: () => '/privacy', useRouter: () => ({ push: () => {}, refresh: () => {} }) }));

const { default: PrivacyPage } = await import('@/app/(site)/privacy/page');

describe('Privacy Policy: who processes your data', () => {
  const html = renderToStaticMarkup(PrivacyPage());
  it('lists Sentry, with what it receives and what it never does', () => {
    expect(html).toContain('Records errors the site runs into, with your account ID and the page you were on (no names, emails or answers)');
  });
  it('lists Resend, with the emails it sends', () => {
    expect(html).toContain('Sends CasePace’s emails (account confirmation, and problem reports you send to our team)');
  });
  it('keeps the providers it had', () => {
    for (const name of ['Vercel', 'Supabase', 'Anthropic', 'Deepgram', 'LiveKit', 'Cartesia', 'Sentry', 'Resend']) expect(html).toContain(`>${name}<`);
  });
});
