import { describe, expect, it } from 'vitest';
import { caseReason, diagnosticReason, drillReason, quoted } from '@/lib/drills/reason';

describe('prescription reasons (Matt, 15 Nov)', () => {
  it('puts the closing point inside the quotation marks, once', () => {
    expect(quoted('margin dropped 6 percent')).toBe('“margin dropped 6 percent.”');
    expect(quoted('margin dropped 6 percent.')).toBe('“margin dropped 6 percent.”');
    expect(quoted('is that the whole story?')).toBe('“is that the whole story?”');
    expect(quoted('revenue, costs, and pricing,')).toBe('“revenue, costs, and pricing.”');
  });

  it('reads as two plain sentences for a case, and in plain English for a drill set or the diagnostic', () => {
    expect(caseReason({ tag: 'M.arithmetic_error', evidence: '1.2 million times 15% is 1.8 million' }))
      .toBe('In your last case you said, “1.2 million times 15% is 1.8 million.” You made an arithmetic slip.');
    expect(drillReason('Mental math', 'M.overlapping_buckets')).toBe('In your last Mental math set, two of your buckets overlapped.');
    expect(diagnosticReason(['M.wrong_base', 'M.arithmetic_error'])).toBe('In the diagnostic: You divided by the wrong base. You made an arithmetic slip.');
  });
});
