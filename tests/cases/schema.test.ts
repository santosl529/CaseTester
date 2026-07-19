import { describe, it, expect } from 'vitest';
import { CaseSchema } from '@/lib/cases/schema';
import { getCaseById } from '@/lib/cases/loader';

function validCaseWith(ledgerValue: string) {
  const base = getCaseById('prof-001');
  return {
    ...base,
    dataLedger: [
      { id: 'x', label: 'Total revenue', value: ledgerValue, releaseWhen: 'CLARIFY' },
    ],
  };
}

describe('CaseSchema ledger value sentence check', () => {
  it('rejects a bare fragment with no terminal punctuation or verb', () => {
    // The actual Run 1 pilot bug (docs/case-authoring.md): reads as a
    // non-sequitur when appended after "let me pull that data for you."
    const result = CaseSchema.safeParse(validCaseWith('+40% increase in raw coffee bean costs'));
    expect(result.success).toBe(false);
  });

  it('rejects a value with a verb but no terminal punctuation', () => {
    const result = CaseSchema.safeParse(validCaseWith('Revenue is $480M a year'));
    expect(result.success).toBe(false);
  });

  it('rejects a value with terminal punctuation but no verb', () => {
    const result = CaseSchema.safeParse(validCaseWith('$480M in annual revenue.'));
    expect(result.success).toBe(false);
  });

  it('accepts a complete speakable sentence', () => {
    const result = CaseSchema.safeParse(validCaseWith('Total revenue is $480M a year.'));
    expect(result.success).toBe(true);
  });

  it('accepts every ledger value already shipped in prof-001', () => {
    const c = getCaseById('prof-001');
    for (const item of c.dataLedger) {
      const result = CaseSchema.safeParse({ ...c, dataLedger: [item] });
      expect(result.success, `item "${item.id}": ${JSON.stringify(item.value)}`).toBe(true);
    }
  });
});
