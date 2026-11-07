import { describe, expect, it } from 'vitest';
import { safeNext } from '@/lib/site/safe-next';

describe('safeNext', () => {
  it('keeps a path on this site', () => {
    expect(safeNext('/drills/diagnostic')).toBe('/drills/diagnostic');
    expect(safeNext('/home#cases')).toBe('/home#cases');
    expect(safeNext('/drills?x=1')).toBe('/drills?x=1');
  });
  it('refuses anything that could leave the site', () => {
    for (const raw of ['https://evil.example', '//evil.example', '/\\evil.example', 'drills', '', null, undefined, 'javascript:alert(1)']) {
      expect(safeNext(raw)).toBeNull();
    }
  });
});
