import { describe, it, expect } from 'vitest';
import { auditTurn } from '@/lib/orchestrator/audit';

describe('auditTurn', () => {
  it('passes when no numbers present', () => {
    const r = auditTurn('Thank you for that question.', {});
    expect(r.passed).toBe(true);
  });

  it('passes when number matches revealed value', () => {
    const r = auditTurn('Our revenue is $480M.', { rev: '$480M' });
    expect(r.passed).toBe(true);
  });

  it('fails on unexplained number', () => {
    const r = auditTurn('Revenue is $480M and EBITDA is $57M.', { rev: '$480M' });
    expect(r.passed).toBe(false);
    expect(r.unexplainedNumbers).toContain('57');
  });

  it('ignores numbers in revealed values even with different formatting', () => {
    // 480 appears in "$480M" in revealed; "480" in spoken text should be allowed
    const r = auditTurn('The revenue figure is 480 million.', { rev: '$480M' });
    expect(r.passed).toBe(true);
  });

  it('does not flag ordinal list numbers like "1." or "2."', () => {
    const r = auditTurn('Here are my thoughts: 1. Revenue 2. Costs 3. Margin', {});
    expect(r.passed).toBe(true);
  });

  it('allows numbers from alwaysAllowedText', () => {
    const r = auditTurn(
      'The margin declined from 12% to 6%.',
      {},
      'profit margin has declined from 12% to 6%'
    );
    expect(r.passed).toBe(true);
  });
});
