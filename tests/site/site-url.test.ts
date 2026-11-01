// Where the sign-up confirmation email sends a student (site launch, 1 Nov).
import { describe, it, expect } from 'vitest';
import { signInRedirectUrl } from '@/lib/site/url';

describe('signInRedirectUrl', () => {
  it('the configured site origin, then /sign-in', () => {
    expect(signInRedirectUrl('https://casepace.example', 'http://localhost:3000')).toBe('https://casepace.example/sign-in');
  });

  it('ignores a trailing slash or a path on the configured value', () => {
    expect(signInRedirectUrl('https://casepace.example/', undefined)).toBe('https://casepace.example/sign-in');
    expect(signInRedirectUrl('https://casepace.example/some/path', undefined)).toBe('https://casepace.example/sign-in');
  });

  it('falls back to the page origin when unset, blank or not an http(s) URL', () => {
    for (const bad of [undefined, '', '   ', 'casepace.example', 'javascript:alert(1)', 'ftp://casepace.example']) {
      expect(signInRedirectUrl(bad, 'http://localhost:3000'), String(bad)).toBe('http://localhost:3000/sign-in');
    }
  });

  it('no origin at all: undefined, so Supabase uses its Site URL', () => {
    expect(signInRedirectUrl(undefined, undefined)).toBeUndefined();
  });
});
