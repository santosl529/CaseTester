import { describe, expect, it } from 'vitest';
import { caseReason, diagnosticReason, drillReason, quoted } from '@/lib/drills/reason';

describe('prescription reasons (Matt, 15–16 Nov)', () => {
  it('puts the closing point inside the quotation marks, once', () => {
    expect(quoted('margin dropped 6 percent')).toBe('“margin dropped 6 percent.”');
    expect(quoted('margin dropped 6 percent.')).toBe('“margin dropped 6 percent.”');
    expect(quoted('is that the whole story?')).toBe('“is that the whole story?”');
    expect(quoted('revenue, costs, and pricing,')).toBe('“revenue, costs, and pricing.”');
  });

  it('puts the plain line first, then the quote; drill sets and the diagnostic in one sentence', () => {
    expect(caseReason({ tag: 'M.arithmetic_error', evidence: '1.2 million times 15% is 1.8 million' }))
      .toBe('You made an arithmetic slip. In your last case you said, “1.2 million times 15% is 1.8 million.”');
    expect(drillReason('Mental math', 'M.overlapping_buckets')).toBe('In your last Mental math set, two of your buckets overlapped.');
    expect(diagnosticReason('M.wrong_base')).toBe('In the diagnostic, you calculated a percentage from the wrong starting number.');
  });
});
