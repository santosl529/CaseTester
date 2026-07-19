import { describe, it, expect } from 'vitest';
import {
  createLedger, canReveal, reveal, resolveItemId, revealedValues, unrevealedItems,
  resolveItemFromText, promisesReveal,
} from '@/lib/orchestrator/data-ledger';

const items = [
  { id: 'rev', label: 'Total revenue', value: '$480M', releaseWhen: 'CLARIFY' as const },
  { id: 'cogs', label: 'COGS %', value: '58%', releaseWhen: 'ANALYSIS' as const },
];

describe('data ledger', () => {
  it('can reveal any unrevealed item regardless of phase', () => {
    const ledger = createLedger(items);
    expect(canReveal(ledger, 'cogs')).toBe(true);
    expect(canReveal(ledger, 'rev')).toBe(true);
  });

  it('cannot re-reveal an already-revealed item', () => {
    const ledger = createLedger(items);
    reveal(ledger, 'rev');
    expect(canReveal(ledger, 'rev')).toBe(false);
  });

  it('cannot reveal an unknown item', () => {
    const ledger = createLedger(items);
    expect(canReveal(ledger, 'unknown')).toBe(false);
  });

  it('reveal returns the value', () => {
    const ledger = createLedger(items);
    expect(reveal(ledger, 'rev')).toBe('$480M');
  });

  it('revealedValues returns only revealed items', () => {
    const ledger = createLedger(items);
    reveal(ledger, 'rev');
    expect(revealedValues(ledger)).toEqual({ rev: '$480M' });
  });

  it('unrevealedItems excludes revealed items', () => {
    const ledger = createLedger(items);
    reveal(ledger, 'rev');
    expect(unrevealedItems(ledger)).toEqual([{ id: 'cogs', label: 'COGS %' }]);
  });

  it('reveal throws on unknown id', () => {
    const ledger = createLedger(items);
    expect(() => reveal(ledger, 'unknown')).toThrow('Unknown ledger item');
  });

  describe('resolveItemId', () => {
    it('resolves an exact id', () => {
      const ledger = createLedger(items);
      expect(resolveItemId(ledger, 'cogs')).toBe('cogs');
    });

    it('resolves a label to the canonical id', () => {
      const ledger = createLedger(items);
      expect(resolveItemId(ledger, 'COGS %')).toBe('cogs');
    });

    it('resolves case-insensitively with whitespace', () => {
      const ledger = createLedger(items);
      expect(resolveItemId(ledger, '  total revenue ')).toBe('rev');
    });

    it('returns null for an unknown identifier', () => {
      const ledger = createLedger(items);
      expect(resolveItemId(ledger, 'EBITDA')).toBeNull();
    });

    it('returns null (never throws) on undefined/null/empty — the live 500 crash', () => {
      const ledger = createLedger(items);
      expect(resolveItemId(ledger, undefined)).toBeNull();
      expect(resolveItemId(ledger, null)).toBeNull();
      expect(resolveItemId(ledger, '   ')).toBeNull();
    });
  });

  describe('resolveItemFromText', () => {
    it('resolves a ledger item whose label is embedded in a full spoken sentence', () => {
      const ledger = createLedger(items);
      expect(resolveItemFromText(ledger, "Let me get you that COGS % number.")).toBe('cogs');
    });

    it('resolves regardless of case/punctuation noise', () => {
      const ledger = createLedger(items);
      expect(resolveItemFromText(ledger, "here's the Total Revenue figure!")).toBe('rev');
    });

    it('returns null when no ledger label is named — the vintage-split case', () => {
      const ledger = createLedger(items);
      // The candidate asked for a mature-vs-new-store cut that isn't in the
      // ledger at all (docs/interviewer-behavior.md Rule 11's worked example).
      expect(resolveItemFromText(ledger, "Let me get you that vintage analysis.")).toBeNull();
    });

    it('returns null on empty/null-ish input', () => {
      const ledger = createLedger(items);
      expect(resolveItemFromText(ledger, '')).toBeNull();
    });
  });

  describe('promisesReveal', () => {
    it('detects a delivery verb + data-reference word in the same sentence', () => {
      expect(promisesReveal("Let me pull that data for you.")).toBe(true);
      // The actual Run 1 pilot bug (docs/interviewer-behavior.md Rule 11):
      // "analysis" is the data-reference word here.
      expect(promisesReveal("Let me get you that vintage analysis.")).toBe(true);
      expect(promisesReveal("Here's the breakdown you asked for.")).toBe(true);
    });

    it('does not fire on a delivery verb with no data-reference word', () => {
      expect(promisesReveal("Let me get you set up for the next phase.")).toBe(false);
    });

    it('does not fire on unrelated sentences', () => {
      expect(promisesReveal("That's a strong hypothesis. What would you test first?")).toBe(false);
    });

    it('ignores exhibit promises — that is exhibits.ts\'s job', () => {
      expect(promisesReveal("Here's the exhibit with the data you need.")).toBe(false);
    });

    it('only counts a match within the same sentence, not across sentences', () => {
      expect(promisesReveal("Let me pull that up. The figures are interesting.")).toBe(false);
    });
  });
});
