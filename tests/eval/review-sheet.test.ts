import { describe, it, expect } from 'vitest';
import { renderReviewSheet, parseReviewSheet, applyVerdicts } from '@/lib/eval/review-sheet';
import type { FaultRecord } from '@/lib/eval/prescreen';

const f = (id: string, severity: FaultRecord['severity'] = 'serious'): FaultRecord => ({
  id, runId: 'r', turnIndex: 2, category: 'requests', severity, quote: 'q', expected: 'e', rule: 'Rule 11', attribution: 'model', recovered: false,
  candidateText: 'c', context: [], rawOutput: null, codeChanges: [], delivered: 'd', source: 'prescreen', status: 'proposed', note: '',
});

describe('review sheet', () => {
  it('lists serious proposals and the runs to read in full, each with a verdict line', () => {
    const md = renderReviewSheet([f('a'), f('b', 'minor')], ['run-7']);
    expect(md).toContain('### a');
    expect(md).not.toContain('### b');          // only serious proposals are listed
    expect(md).toContain('verdict: ');
    expect(md).toContain('run-7');
  });

  it('parses verdicts case-insensitively, with optional severity/attribution changes and a note', () => {
    const md = ['### a', 'verdict: Confirmed', 'severity: moderate', 'note: real but recovered next turn', '### b', 'verdict: REJECT', '### c', 'verdict: maybe'].join('\n');
    const { verdicts, unrecognised } = parseReviewSheet(md);
    expect(verdicts.get('a')).toEqual({ status: 'confirmed', severity: 'moderate', note: 'real but recovered next turn' });
    expect(verdicts.get('b')?.status).toBe('rejected');
    expect(unrecognised).toEqual(['c: verdict "maybe"']);
  });

  it('applies verdicts; unreviewed faults stay proposed', () => {
    const out = applyVerdicts([f('a'), f('b')], new Map([['a', { status: 'confirmed' as const, severity: 'moderate' as const, note: 'n' }]]));
    expect(out.map(x => [x.id, x.status, x.severity])).toEqual([['a', 'confirmed', 'moderate'], ['b', 'proposed', 'serious']]);
  });
});
