// What a student reads when a start is refused (start limits 6 Nov; the 5-at-once cap 7 Nov).
import { describe, it, expect } from 'vitest';
import { limitMessage } from '@/lib/site/limit-message';

describe('limitMessage', () => {
  it('busy: all slots in use, try again in a few minutes', () => {
    expect(limitMessage({ reason: 'busy', limit: 5, retryAt: '2026-11-07T18:05:00Z' })).toBe('All interview slots are in use right now. Please try again in a few minutes.');
  });
  it('daily: says when they can start again', () => {
    expect(limitMessage({ reason: 'daily', limit: 2, retryAt: '2026-11-07T18:05:00Z' })).toMatch(/^You've started 2 interviews in the last 24 hours, the most allowed\. You can start another from .+\.$/);
  });
  it('monthly: says when it resets', () => {
    expect(limitMessage({ reason: 'monthly', limit: 8, retryAt: '2026-12-01T00:00:00Z' })).toMatch(/^You've used your 8 interviews for this month\. Your limit resets on .+\.$/);
  });
  it('site: the whole site is out for the month', () => {
    expect(limitMessage({ reason: 'site', limit: 150 })).toBe("We've reached this month's interview limit for the whole site. Please try again next month.");
  });
});
