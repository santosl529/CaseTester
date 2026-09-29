import { describe, it, expect } from 'vitest';
import { auditNumericProvenance, enforceNumericProvenance } from '@/lib/orchestrator/numeric-provenance';

describe('auditNumericProvenance', () => {
  describe('digit numbers', () => {
    it('passes a digit number matching a revealed ledger value', () => {
      const r = auditNumericProvenance('Our revenue is $480M.', ['Total revenue is $480M a year.']);
      expect(r.passed).toBe(true);
    });

    it('blocks an unattributed percentage not in any allowed source', () => {
      const r = auditNumericProvenance('Margin is 12%.', []);
      expect(r.passed).toBe(false);
      expect(r.findings.some(f => f.action === 'block' && f.normalizedValue === 12)).toBe(true);
    });

    it('never blocks a bare unmatched integer with no unit context', () => {
      const r = auditNumericProvenance("We're down to about 30 seconds.", []);
      expect(r.passed).toBe(true);
      const finding = r.findings.find(f => f.normalizedValue === 30);
      expect(finding?.action).toBe('log');
      expect(finding?.hasUnit).toBe(false);
    });

    it('never blocks a bare count even with a nearby non-adjacent unit word', () => {
      const r = auditNumericProvenance("I'll give you 2 data points.", []);
      expect(r.passed).toBe(true);
    });
  });

  describe('number words (Rule 6: audit covers spoken quantities, not just digits)', () => {
    it('blocks an unattributed spoken percentage ("forty percent")', () => {
      const r = auditNumericProvenance('Margin dropped forty percent.', []);
      expect(r.passed).toBe(false);
      const finding = r.findings.find(f => f.normalizedValue === 40);
      expect(finding?.action).toBe('block');
      expect(finding?.hasUnit).toBe(true);
    });

    it('passes a spoken percentage that matches a ledger value stated in digits', () => {
      const r = auditNumericProvenance(
        'Revenue is forty percent higher.',
        ['Revenue grew 40% year over year.'],
      );
      expect(r.passed).toBe(true);
    });

    it('parses compound numbers ("twenty five percent")', () => {
      const r = auditNumericProvenance('Costs rose twenty five percent.', ['Costs rose 25% this year.']);
      expect(r.passed).toBe(true);
    });

    it('parses scale words ("two hundred stores")', () => {
      const r = auditNumericProvenance('They operate two hundred stores.', ['200 stores nationwide.']);
      expect(r.passed).toBe(true);
    });

    it('parses decimals ("four point five percent")', () => {
      const r = auditNumericProvenance('That is four point five percent.', ['A 4.5% shift was observed.']);
      expect(r.passed).toBe(true);
    });
  });

  describe('fuzzy magnitude language — always log, never block', () => {
    it('logs but never blocks a multiplier word ("roughly half")', () => {
      const r = auditNumericProvenance('Beans are roughly half of the total.', []);
      expect(r.passed).toBe(true);
      expect(r.findings.some(f => f.fuzzy && f.action === 'log')).toBe(true);
    });

    it('logs but never blocks a vague magnitude phrase ("mid-teens")', () => {
      const r = auditNumericProvenance('Growth was in the mid-teens this year.', []);
      expect(r.passed).toBe(true);
      expect(r.findings.some(f => f.fuzzy)).toBe(true);
    });

    it('logs but never blocks standalone "doubled"', () => {
      const r = auditNumericProvenance('Costs basically doubled.', []);
      expect(r.passed).toBe(true);
    });
  });

  describe('exempt turn types (whitelist fast-path)', () => {
    it('passes an otherwise-blockable finding when exempt', () => {
      const r = auditNumericProvenance('Margin is 12%.', [], { exempt: true });
      expect(r.passed).toBe(true);
    });
  });

  describe('three valid provenances (Rule 6)', () => {
    it('passes a figure attributed to the candidate (their own turn text as an allowed source)', () => {
      const r = auditNumericProvenance(
        'You suggested 15% — walk me through that.',
        ['I think we saw 15% growth.'],
      );
      expect(r.passed).toBe(true);
    });

    it('passes an orchestrator-derived correction figure', () => {
      const r = auditNumericProvenance("It's closer to 2 points, not 6.", ['2']);
      expect(r.passed).toBe(true);
    });
  });
});

describe('enforceNumericProvenance (v4.3: block withholds, not just logs)', () => {
  it('strips only the sentence carrying the blocked figure (Priya 6caca9a1)', () => {
    const text = 'Quick correction on units — revenue per store is 480 million over 200, closer to 2.4 million, not 0.377. Set that aside.';
    const r = enforceNumericProvenance(text, ['0.377']);
    expect(r.blocked).toBe(true);
    expect(r.text).toBe('Set that aside.');
    expect(r.text).not.toMatch(/480/);
  });

  it('leaves a clean turn untouched', () => {
    const text = 'COGS is 58% of revenue, up from 42%. What does that tell you?';
    const r = enforceNumericProvenance(text, ['COGS is 58% of revenue, up from 42% two years ago.']);
    expect(r.blocked).toBe(false);
    expect(r.text).toBe(text);
  });

  it('falls back to a neutral acknowledgment when every sentence is blocked', () => {
    const r = enforceNumericProvenance('Margin is 12%.', []);
    expect(r.blocked).toBe(true);
    expect(r.text).toBe('Go on.');
  });

  it('respects the exempt option', () => {
    const r = enforceNumericProvenance('Margin is 12%.', [], { exempt: true });
    expect(r.blocked).toBe(false);
    expect(r.text).toBe('Margin is 12%.');
  });
});
