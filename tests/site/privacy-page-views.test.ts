// The Privacy Policy says how page visits are counted (Matt, 22 Nov 2026: the pilot dashboard's page views).
import { describe, it, expect } from 'vitest';
import fs from 'fs';

describe('Privacy Policy: page visits', () => {
  it('has the approved line', () => {
    const src = fs.readFileSync('app/(site)/privacy/page.tsx', 'utf8');
    expect(src).toContain('We count page visits to improve CasePace. For visitors who aren’t logged in we use an anonymous code made from your IP address and browser that changes every day; we don’t store your IP address or use cookies for this. For logged-in students, page visits are linked to your account.');
  });
});
