import { describe, it, expect } from 'vitest';
import { createLedger, reveal, resolveItemsFromText, handoffSentences } from '@/lib/orchestrator/data-ledger';
import { planStaleReleases } from '@/lib/orchestrator/data-requests';
import { getCaseById } from '@/lib/cases/loader';
import type { Phase } from '@/lib/orchestrator/state-machine';

const prof = getCaseById('prof-001');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const freshLedger = () => createLedger(prof.dataLedger as any);
const releaseWhenById = new Map(prof.dataLedger.map(d => [d.id, d.releaseWhen as Phase]));

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

describe('deterministic reminder release (layer 3)', () => {
  const open = (id: string, turnIndex: number) => ({ ledgerItemId: id, label: id, what: id, turnIndex });

  it("releases Ben's avg_ticket the turn after it was missed, once the stage allows", () => {
    expect(planStaleReleases({ open: [open('avg_ticket', 9)], revealedIds: new Set(), phase: 'EXHIBIT', releaseWhenById, currentTurnIndex: 11 }))
      .toEqual(['avg_ticket']);
  });

  it('waits for the stage', () => {
    expect(planStaleReleases({ open: [open('bean_price_change', 1)], revealedIds: new Set(), phase: 'CLARIFY', releaseWhenById, currentTurnIndex: 3 }))
      .toEqual([]);
  });

  it('skips items already released, and caps at two, most recent first', () => {
    const plan = planStaleReleases({
      open: [open('labor_pct', 1), open('overhead_pct', 3), open('avg_ticket', 5), open('cogs_pct', 5)],
      revealedIds: new Set(['cogs_pct']), phase: 'ANALYSIS', releaseWhenById, currentTurnIndex: 7,
    });
    expect(plan).toEqual(['avg_ticket', 'overhead_pct']);
  });

  it('never releases a request from this very turn (same-turn resolution owns it)', () => {
    expect(planStaleReleases({ open: [open('avg_ticket', 7)], revealedIds: new Set(), phase: 'ANALYSIS', releaseWhenById, currentTurnIndex: 7 }))
      .toEqual([]);
  });
});
