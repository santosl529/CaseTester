// /sign-in?next= (site launch, 31 Oct): relative paths only, no open redirect.
import { describe, it, expect } from 'vitest';
import { safeNext } from '@/lib/site/safe-next';

describe('safeNext', () => {
  it('keeps a relative path, with its query and hash', () => {
    expect(safeNext('/home')).toBe('/home');
    expect(safeNext('/drills/diagnostic')).toBe('/drills/diagnostic');
    expect(safeNext('/case/abc/report?x=1#top')).toBe('/case/abc/report?x=1#top');
  });

  it('refuses anything that could leave the site', () => {
    for (const bad of [
      'https://evil.example', 'http://evil.example/home', '//evil.example', '//evil.example/home',
      '/\\evil.example', '\\\\evil.example', '/%2F%2Fevil.example', '/%5Cevil.example', 'javascript:alert(1)',
      'home', ' /home', '/home\n', '/\t/evil.example', 'mailto:a@b.c', '/sign-in', '/sign-in?next=/home',
    ]) expect(safeNext(bad), bad).toBe('/home');
  });

  it('falls back to /home when missing or not a single string', () => {
    expect(safeNext(undefined)).toBe('/home');
    expect(safeNext('')).toBe('/home');
    expect(safeNext(['/drills', '/home'])).toBe('/home');
  });
});
