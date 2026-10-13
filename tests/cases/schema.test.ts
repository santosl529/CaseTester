import { describe, it, expect } from 'vitest';
import { CaseSchema } from '@/lib/cases/schema';
import { getCaseById } from '@/lib/cases/loader';

function validCaseWith(ledgerValue: string) {
  const base = getCaseById('prof-001');
  return {
    ...base,
    // The real ledger stays: math-step inputs must reference it.
    dataLedger: [
      { id: 'x', label: 'Total revenue', value: ledgerValue, releaseWhen: 'CLARIFY' },
      ...base.dataLedger,
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
      // Each value checked on its own; the rest of the ledger stays so math-step
      // inputs still resolve.
      const result = CaseSchema.safeParse({ ...c, dataLedger: [item, ...c.dataLedger.filter(d => d.id !== item.id)] });
      expect(result.success, `item "${item.id}": ${JSON.stringify(item.value)}`).toBe(true);
    }
  });
});

describe('CaseSchema math-step source spans (v4.3)', () => {
  const base = () => getCaseById('prof-001');

  it('rejects a math step with no cues', () => {
    const c = base();
    const result = CaseSchema.safeParse({ ...c, mathSteps: [{ ...c.mathSteps[0], cues: [] }] });
    expect(result.success).toBe(false);
  });

  it('rejects a math step whose input is not a ledger item', () => {
    const c = base();
    const result = CaseSchema.safeParse({ ...c, mathSteps: [{ ...c.mathSteps[0], inputs: ['no_such_item'] }] });
    expect(result.success).toBe(false);
  });
});

// Rule 6 option 4 (v4.11): the misquote check's anchors must name a ledger
// item that has figures to check against.
describe('CaseSchema quoteAnchors', () => {
  const base = getCaseById('prof-001');
  it('accepts the anchors prof-001 ships', () => {
    expect(CaseSchema.safeParse(base).success).toBe(true);
    expect(base.quoteAnchors.map(q => q.item)).toContain('cogs_pct');
  });
  it('rejects an anchor for an unknown ledger item', () => {
    const r = CaseSchema.safeParse({ ...base, quoteAnchors: [{ item: 'nope', names: ['nope'] }] });
    expect(r.success).toBe(false);
  });
  it('rejects an anchor for an item with no timeframes (nothing to check against)', () => {
    const r = CaseSchema.safeParse({ ...base, quoteAnchors: [{ item: 'menu_price_change', names: ['menu prices'] }] });
    expect(r.success).toBe(false);
  });
  it('defaults the kind to level and the list to empty', () => {
    const { quoteAnchors, ...rest } = base;
    void quoteAnchors;
    const r = CaseSchema.parse({ ...rest, quoteAnchors: [{ item: 'cogs_pct', names: ['cogs'] }] });
    expect(r.quoteAnchors[0].kind).toBe('level');
    expect(CaseSchema.parse(rest).quoteAnchors).toEqual([]);
  });
});

describe('CaseSchema exhibit release order', () => {
  const base = getCaseById('prof-002');
  const exhibits = (patch: (e: typeof base.exhibits) => void) => { const e = structuredClone(base.exhibits); patch(e); return { ...base, exhibits: e }; };
  it('accepts the order Larkspur ships (1 → 2 → 3)', () => {
    expect(CaseSchema.safeParse(base).success).toBe(true);
    expect(base.exhibits.map(e => e.after ?? [])).toEqual([[], ['exhibit-1'], ['exhibit-2']]);
  });
  it('rejects an exhibit that comes after itself or a later one (no cycles)', () => {
    expect(CaseSchema.safeParse(exhibits(e => { e[1].after = ['exhibit-2']; })).success).toBe(false);
    expect(CaseSchema.safeParse(exhibits(e => { e[0].after = ['exhibit-3']; })).success).toBe(false);
  });
  it('rejects an unknown exhibit or ledger item', () => {
    expect(CaseSchema.safeParse(exhibits(e => { e[1].after = ['exhibit-9']; })).success).toBe(false);
    expect(CaseSchema.safeParse(exhibits(e => { e[1].requiresItems = ['nope']; })).success).toBe(false);
  });
});

describe('CaseSchema exhibit notes', () => {
  const base = getCaseById('prof-002');
  it("carries the PDFs' footnotes as notes, out of the spoken title", () => {
    const e1 = base.exhibits[0];
    expect(e1.notes).toMatch(/^Flights per year were the same in FY2023 and FY2025\./);
    expect(e1.title).not.toMatch(/contribution =/i);
  });
  it('rejects an empty note', () => {
    const e = structuredClone(base.exhibits); e[0].notes = '';
    expect(CaseSchema.safeParse({ ...base, exhibits: e }).success).toBe(false);
  });
});
