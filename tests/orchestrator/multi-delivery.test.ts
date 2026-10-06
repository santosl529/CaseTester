import { describe, it, expect } from 'vitest';
import { createLedger, reveal, resolveItemsFromText, handoffSentences } from '@/lib/orchestrator/data-ledger';
import { getCaseById } from '@/lib/cases/loader';

const prof = getCaseById('prof-001');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const freshLedger = () => createLedger(prof.dataLedger as any);

describe('multi-fact delivery (round-3 fix 2)', () => {
  // Batch 3, Tobias 7fb4372f turn 14: two facts announced, one delivered.
  const TOBIAS = "To settle beans versus the rest, here's the bean price change and the other-input change.";

  it('finds the handoff sentence', () => {
    expect(handoffSentences(`Okay. ${TOBIAS} What do you make of it?`)).toEqual([TOBIAS]);
  });

  it('resolves every fact a handoff names — and nothing it does not', () => {
    expect(resolveItemsFromText(freshLedger(), TOBIAS).sort()).toEqual(['bean_price_change', 'non_bean_input_change']);
  });

  it('skips a named fact already delivered', () => {
    const ledger = freshLedger();
    reveal(ledger, 'bean_price_change');
    expect(resolveItemsFromText(ledger, TOBIAS)).toEqual(['non_bean_input_change']);
  });

  it('still resolves a single-fact handoff', () => {
    expect(resolveItemsFromText(freshLedger(), "Here's the menu price history.")).toEqual(['menu_price_change']);
  });

  it('resolves nothing for data the case does not have', () => {
    expect(resolveItemsFromText(freshLedger(), "Here's the regional breakdown and the vintage split.")).toEqual([]);
  });
});

describe('refusals are not handoffs (batch 4)', () => {
  it("does not read the interviewer's own refusal as a promise", () => {
    expect(handoffSentences("That's not a cut I have. What I do have is the company-wide cost structure over the two years.")).toEqual([]);
    expect(handoffSentences("The split of the other inputs bucket isn't in the information I have.")).toEqual([]);
  });

  it('still reads a real handoff', () => {
    expect(handoffSentences("Here's the bean price change.")).toHaveLength(1);
  });
});
