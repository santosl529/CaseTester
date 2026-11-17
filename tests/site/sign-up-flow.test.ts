// The sign-up flow (Matt, 17 Nov, pre-pilot audit S5): the landing page's call to action goes to sign-up, the top bar
// has a Sign up link next to Log in, sign-up links to log in, and confirm-first says what to do.
import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({ usePathname: () => '/', useRouter: () => ({ push: () => {}, refresh: () => {} }) }));
vi.mock('@/lib/supabase/client', () => ({ createBrowserSupabaseClient: () => ({ auth: { getSession: async () => ({ data: { session: null } }) } }) }));

import { START_HREF, START_LABEL } from '@/components/site/content';
import { SiteTopBar } from '@/components/site/site-session';
import { SignUpForm } from '@/components/sign-up-form';
import { CONFIRM_EMAIL_MESSAGE } from '@/lib/site/auth-messages';

describe('sign-up flow (S5)', () => {
  it('"Take the free diagnostic" goes to sign-up, then the training home', () => {
    expect(START_LABEL).toBe('Take the free diagnostic');
    expect(START_HREF).toBe('/sign-up?next=/drills');
  });
  it('the top bar has Log in and a visible Sign up', () => {
    const html = renderToStaticMarkup(createElement(SiteTopBar));
    expect(html).toContain('href="/sign-in"');
    expect(html).toMatch(/href="\/sign-up\?next=\/drills"[^>]*>Sign up</);
  });
  it('sign-up offers "Already have an account? Log in"', () => {
    const html = renderToStaticMarkup(createElement(SignUpForm, { next: '/drills' }));
    expect(html).toContain('Already have an account?');
    expect(html).toMatch(/href="\/sign-in\?next=%2Fdrills"[^>]*>Log in</);
  });
  it('confirm-first says what to do next', () => {
    expect(CONFIRM_EMAIL_MESSAGE).toBe('Check your email to confirm your account; the link logs you in.');
  });
});
