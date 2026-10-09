import { describe, it, expect } from 'vitest';
import { alreadyScreened, screenedLine, verifyQuote, normaliseForQuote, toFaultRecords, buildPrescreenPrompt, type ProposedFault } from '@/lib/eval/prescreen';
import type { RunRecord } from '@/lib/eval/scorecard';

const run: RunRecord = {
  session: { id: 's', status: 'completed' },
  turns: [
    { turnIndex: 0, role: 'interviewer', text: 'Your client is Brew & Bean.' },
    { turnIndex: 1, role: 'candidate', text: 'Can I get the cost breakdown?' },
    { turnIndex: 2, role: 'interviewer', text: "I don't have a cost breakdown by line item. Which branch first?" },
  ],
  score: null, events: [], analytics: [],
};
const p = (over: Partial<ProposedFault> = {}): ProposedFault => ({ turnIndex: 2, category: 'requests', severity: 'serious', quote: "I don't have a cost breakdown by line item.", expected: 'Release cogs_pct, labor_pct, overhead_pct.', rule: 'Rule 11', attribution: 'model', recovered: false, ...over });

describe('pre-screen', () => {
  it('verifies quotes after normalising curly quotes and whitespace, but rejects paraphrase', () => {
    const delivered = "I don't have a cost breakdown by line item.  Which branch first?";
    expect(verifyQuote('I don’t have a cost   breakdown by line item.', delivered)).toBe(true);
    expect(verifyQuote('I do not have the cost breakdown.', delivered)).toBe(false);
    expect(normaliseForQuote('“A”  —  b')).toBe('"a" - b');
  });

  it('keeps faults whose quote is in the interviewer line of that turn; drops the rest', () => {
    const { kept, dropped } = toFaultRecords('r1', run, null, [p(), p({ quote: 'Something never said.' }), p({ turnIndex: 1, quote: 'Can I get the cost breakdown?' })]);
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ runId: 'r1', turnIndex: 2, candidateText: 'Can I get the cost breakdown?', source: 'prescreen', status: 'proposed' });
    expect(kept[0].id).toMatch(/^r1-t2-/);
    expect(dropped).toHaveLength(2);
  });

  it('the prompt carries the instructions, case facts, severity and a numbered transcript', () => {
    const prompt = buildPrescreenPrompt({ run, turns: null, interviewerInstructions: 'INSTR', caseFacts: 'FACTS', severity: 'SEV' });
    for (const s of ['INSTR', 'FACTS', 'SEV', '[t1 candidate] Can I get the cost breakdown?', '[t2 interviewer]']) expect(prompt).toContain(s);
  });

  it('requires at least 15 normalised characters in a quote', () => {
    const delivered = "I don't have a cost breakdown by line item. Which branch first?";
    expect(verifyQuote('cost breakdown', delivered)).toBe(false); // 14 chars
    expect(verifyQuote('a cost breakdown', delivered)).toBe(true);
    const t = (quote: string) => toFaultRecords('r1', run, null, [p({ quote })]).kept.length;
    expect(t('Which branch')).toBe(0);
    expect(t('cost breakdown by line item.')).toBe(1);
  });

  it('tracks screened runs from prescreened.jsonl lines', () => {
    const ids = alreadyScreened([screenedLine('a', 2, 1), '', 'not json', JSON.stringify({ x: 1 }), screenedLine('b', 0, 0)]);
    expect([...ids].sort()).toEqual(['a', 'b']);
    expect(JSON.parse(screenedLine('a', 2, 1, new Date(0)))).toEqual({ runId: 'a', proposed: 2, dropped: 1, at: '1970-01-01T00:00:00.000Z' });
  });
});
