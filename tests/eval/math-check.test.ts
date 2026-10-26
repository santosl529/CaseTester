import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { checkMathTurn } from '@/lib/eval/math-check';
import type { CorpusTurn } from '@/lib/eval/run-corpus';
import { getCaseById } from '@/lib/cases/loader';

const c = getCaseById('prof-001') as never;
const turn = (candidateText: string, reply: string): CorpusTurn => ({
  t: 10, candidateText, phase: 'analysis', kind: 'model', move: null, heard: '',
  segments: [{ kind: 'question', author: 'model', text: reply }],
  revealedBefore: ['cogs_pct', 'labor_pct', 'overhead_pct', 'revenue_total'],
  releasedNow: [], shownBefore: [], exhibitNow: null, seeded: false,
});
const WRONG = 'A 10% price increase at current volumes recovers roughly six to seven points of margin.';

describe('D6 — a math error the answering turn lets pass', () => {
  it('a pricing error with no probe is unhandled', () => {
    expect(checkMathTurn(turn(WRONG, 'Good. What else would you look at?'), c)).toMatchObject([{ error: { kind: 'pricing' }, handled: false }]);
  });
  it('a probe about the pricing math handles it', () => {
    expect(checkMathTurn(turn(WRONG, 'Walk me through how a 10% price rise gets you there.'), c)).toMatchObject([{ handled: true }]);
  });
  it('a probe whose subject is the sentence before handles it (the code-written recommendation probe)', () => {
    expect(checkMathTurn(turn(WRONG, 'Before we wrap up — you said a 10% price rise recovers 6 points of margin. Walk me through how you sized that.'), c)).toMatchObject([{ handled: true }]);
  });

  it('a probe about something else does not', () => {
    expect(checkMathTurn(turn(WRONG, 'Walk me through your thinking on store count.'), c)).toMatchObject([{ handled: false }]);
  });
  it('a correct claim is no error', () => {
    expect(checkMathTurn(turn('A 10% price increase recovers about 8.5 points of margin.', 'Good.'), c)).toEqual([]);
  });
});

// Lorenzo's pre-wave ruling 8 (26 Oct): "Leave the ~300 unread detector flags out of the bank." The committed
// label set is the 13 Oct set plus hand-read entries, merged additively — NOT the output of a bare run of
// scripts/build-math-labels.ts, whose D6-detector scan sweeps the whole corpus and, measured 26 Oct against the
// main checkout, writes 680 labels (304 of them with no hand-read claim key) against the 372 committed. This
// test is the confirmation: every label from batch 22 on names a hand source, so a rebuild that swept the unread
// flags in would fail here rather than move the checker's own baseline silently.
describe('the committed math-checker label set (ruling 8)', () => {
  const labels = JSON.parse(readFileSync('evals/math-checker-labels.json', 'utf8')) as { id: string; run: string; sources: string[] }[];
  it('holds the hand-read set only: no batch-22-or-later label without a hand source', () => {
    expect(labels.length).toBe(372);
    const late = labels.filter(l => /batch-(?:2[2-9]|3\d)/.test(l.run));
    expect(late.length).toBeGreaterThan(0);
    for (const l of late) expect(l.sources.join(' | '), l.id).toMatch(/fault bank|hand/);
  });
});
