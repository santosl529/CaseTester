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

  it('parses a human entry into a FaultRecord', () => {
    const md = ['### run-7-t4-human', 'category: math', 'severity: serious', 'quote: 2+2=5', 'expected: 2+2=4', 'rule: arithmetic', 'attribution: model', 'note: simple error'].join('\n');
    const { humanFaults, unrecognised } = parseReviewSheet(md);
    expect(humanFaults).toHaveLength(1);
    expect(humanFaults[0]).toMatchObject({
      id: 'run-7-t4-human',
      runId: 'run-7',
      turnIndex: 4,
      category: 'math',
      severity: 'serious',
      quote: '2+2=5',
      expected: '2+2=4',
      rule: 'arithmetic',
      attribution: 'model',
      status: 'confirmed',
      source: 'human',
      note: 'simple error',
    });
    expect(unrecognised).toHaveLength(0);
  });

  it('reports a human entry missing rule as unrecognised', () => {
    const md = ['### run-7-t4-human', 'category: math', 'severity: serious', 'expected: 2+2=4'].join('\n');
    const { humanFaults, unrecognised } = parseReviewSheet(md);
    expect(humanFaults).toHaveLength(0);
    expect(unrecognised).toContain('run-7-t4-human: missing required fields rule');
  });

  it('does not inject a heading from multi-line delivered text with ### in it', () => {
    const fault: FaultRecord = {
      id: 'x1', runId: 'r', turnIndex: 2, category: 'requests', severity: 'serious', quote: 'q', expected: 'e', rule: 'Rule 11', attribution: 'model', recovered: false,
      candidateText: 'c', context: [], rawOutput: null, codeChanges: [], delivered: 'line1\n### fake heading\nline2', source: 'prescreen', status: 'proposed', note: '',
    };
    const md = renderReviewSheet([fault], []);
    // Check that the delivered text is collapsed and appears inline
    expect(md).toContain('line1 ### fake heading line2'); // newlines collapsed
    // Check that there's no line starting with just "###" from the fake heading (besides x1)
    const faultSection = md.split('## Read in full')[0];
    const faultHeadings = faultSection.split('\n').filter(l => l.match(/^###/));
    expect(faultHeadings).toEqual(['### x1']); // only the fault id heading
  });

  it('ignores template lines in code block, producing no warnings or human faults', () => {
    const md = renderReviewSheet([f('a')], ['run-7']);
    const { humanFaults, unrecognised } = parseReviewSheet(md);
    expect(unrecognised).toHaveLength(0);
    expect(humanFaults).toHaveLength(0);
  });

  it('parses a human entry with hyphens in the run id', () => {
    const md = ['### 40-jasmine-the-early-finisher-t6-human', 'category: math', 'severity: serious', 'expected: correct answer', 'rule: arithmetic'].join('\n');
    const { humanFaults, unrecognised } = parseReviewSheet(md);
    expect(humanFaults).toHaveLength(1);
    expect(humanFaults[0]).toMatchObject({
      id: '40-jasmine-the-early-finisher-t6-human',
      runId: '40-jasmine-the-early-finisher',
      turnIndex: 6,
    });
    expect(unrecognised).toHaveLength(0);
  });

  it('parses a human heading whose run id is <wave>/<persona-folder>', () => {
    const md = ['### batch-18-oct-09-runs-1-2/40-jasmine-the-early-finisher-t6-human', 'category: math', 'severity: serious', 'expected: correct answer', 'rule: arithmetic'].join('\n');
    const { humanFaults, unrecognised } = parseReviewSheet(md);
    expect(unrecognised).toEqual([]);
    expect(humanFaults[0]).toMatchObject({ runId: 'batch-18-oct-09-runs-1-2/40-jasmine-the-early-finisher', turnIndex: 6 });
  });

  it('parses a verdict for a prescreen fault id containing the wave folder', () => {
    const { verdicts } = parseReviewSheet(['### batch-18-oct-09-runs-1-2/03-ines-the-clarifier-t4-0', 'verdict: confirmed'].join('\n'));
    expect(verdicts.get('batch-18-oct-09-runs-1-2/03-ines-the-clarifier-t4-0')?.status).toBe('confirmed');
  });
});

