// Voice is the default way to take a case (Lorenzo, 6 Nov); text stays one click away.
import { describe, it, expect } from 'vitest';
import { caseHref, DEFAULT_CASE_MODE } from '@/lib/site/case-href';

describe('caseHref', () => {
  it('voice is the default mode', () => {
    expect(DEFAULT_CASE_MODE).toBe('voice');
    expect(caseHref('s1')).toBe('/case/s1/voice');
  });
  it('text on request', () => {
    expect(caseHref('s1', 'text')).toBe('/case/s1');
  });
  it('the id is encoded', () => {
    expect(caseHref('a/b', 'voice')).toBe('/case/a%2Fb/voice');
  });
});
