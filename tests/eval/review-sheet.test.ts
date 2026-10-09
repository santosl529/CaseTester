import { describe, it, expect } from 'vitest';
import { renderReviewSheet, parseReviewSheet, applyVerdicts, proposedForReview } from '@/lib/eval/review-sheet';
import { ProposedFaultSchema, type FaultRecord } from '@/lib/eval/prescreen';
import { headline } from '@/lib/eval/headline';
import type { ScorecardRow } from '@/lib/eval/scorecard';

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

  it('lists proposed moderate faults in their own section after the serious ones; minor stays off (follow-up 9 Oct)', () => {
    const md = renderReviewSheet([f('a'), f('m1', 'moderate'), f('b', 'minor'), { ...f('m2', 'moderate'), status: 'confirmed' }], []);
    const serious = md.indexOf('## Proposed serious faults (1)');
    const moderate = md.indexOf('## Proposed moderate faults (1)');
    expect(serious).toBeGreaterThan(-1);
    expect(moderate).toBeGreaterThan(serious);
    expect(md.indexOf('### a')).toBeGreaterThan(serious);
    expect(md.indexOf('### a')).toBeLessThan(moderate);
    const modSection = md.slice(moderate, md.indexOf('## Read in full'));
    expect(modSection).toContain('### m1');
    expect(modSection).toContain('verdict: ');
    expect(md).not.toContain('### m2');          // already reviewed
    expect(md).not.toContain('### b');           // minor stays off the sheet
    expect(proposedForReview([f('a'), f('m1', 'moderate'), f('b', 'minor')])).toMatchObject({ serious: [{ id: 'a' }], moderate: [{ id: 'm1' }] });
  });

  it('a verdict on a moderate proposal applies and is counted in the headline', () => {
    const faults = [f('a'), f('m1', 'moderate'), f('m2', 'moderate')];
    const md = renderReviewSheet(faults, []).split('\n');
    const at = md.indexOf('### m1');
    const v = md.indexOf('verdict: ', at);
    md[v] = 'verdict: confirmed';
    const { verdicts, unrecognised } = parseReviewSheet(md.join('\n'));
    expect(unrecognised).toEqual([]);
    const applied = applyVerdicts(faults, verdicts);
    expect(applied.find(x => x.id === 'm1')?.status).toBe('confirmed');
    const h = headline([{ runId: 'r', modelTurns: 50 } as unknown as ScorecardRow], applied);
    expect(h.confirmedModerate).toBe(1);
    expect(h.confirmedPer100Turns).toBeCloseTo(2);
    expect(h.proposedModerateUnconfirmed).toBe(1);   // m2 still unreviewed
  });

  it('lists every code flag as a review candidate, without disturbing verdict parsing (follow-up 9 Oct)', () => {
    const flagged = [
      { runId: 'w/01-a', codeFlags: [{ turnIndex: null, kind: 'loop' as const, detail: 'same question asked 3 times' }, { turnIndex: 8, kind: 'repeated_short_probe' as const, detail: 'short question asked 3 times: "What does that tell you?"' }] },
      { runId: 'w/02-b', codeFlags: [{ turnIndex: 4, kind: 'model_unusable' as const, detail: '{"unparsed":true,\n"emptyTurn":false}' }] },
      { runId: 'w/03-c', codeFlags: [] },
    ];
    const md = renderReviewSheet([f('m1', 'moderate')], ['run-7'], flagged);
    const at = md.indexOf('## Code-flagged runs to check (3 flags in 2 runs');
    expect(at).toBeGreaterThan(md.indexOf('## Proposed moderate faults'));
    expect(at).toBeLessThan(md.indexOf('## Read in full'));
    const section = md.slice(at, md.indexOf('## Read in full'));
    expect(section).toContain('- loop · run w/01-a · turn — · same question asked 3 times');
    expect(section).toContain('turn N (interviewer reply) = the interviewer\'s line in the transcript, the number fault ids use');
    expect(section).toContain('- repeated_short_probe · run w/01-a · turn 9 (interviewer reply) · short question asked 3 times: "What does that tell you?"');
    expect(section).toContain('- model_unusable · run w/02-b · turn 5 (interviewer reply) · {"unparsed":true, "emptyTurn":false}');
    expect(section).not.toContain('w/03-c');
    const parsed = parseReviewSheet(md.replace('verdict: \n', 'verdict: confirmed\n'));
    expect(parsed.unrecognised).toEqual([]);
    expect(parsed.verdicts.get('m1')?.status).toBe('confirmed');
    expect(renderReviewSheet([], [])).toContain('## Code-flagged runs to check (0 flags in 0 runs');
  });

  it('fault blocks number the interviewer reply the same way the code-flag lines do (fix round 1)', () => {
    const md = renderReviewSheet([{ ...f('a'), turnIndex: 9 }], [], [{ runId: 'r', codeFlags: [{ turnIndex: 8, kind: 'loop', detail: 'x' }] }]);
    expect(md).toContain('run r · turn 9 (interviewer reply) · requests');
    expect(md).toContain('- loop · run r · turn 9 (interviewer reply) · x');
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

  it('human-entry categories are the pre-screen categories', () => {
    const entry = (category: string) => ['### run-7-t4-human', `category: ${category}`, 'severity: serious', 'expected: e', 'rule: r'].join('\n');
    const ok = parseReviewSheet(entry('grounding'));
    expect(ok.unrecognised).toEqual([]);
    expect(ok.humanFaults[0].category).toBe('grounding');
    const bad = parseReviewSheet(entry('insights'));
    expect(bad.humanFaults).toEqual([]);
    expect(bad.unrecognised).toEqual(['run-7-t4-human: invalid category "insights"']);
    expect(renderReviewSheet([], [])).toContain(`category: <${ProposedFaultSchema.shape.category.options.join('|')}>`);
    expect(ProposedFaultSchema.shape.category.options).toEqual(['requests', 'math', 'grounding', 'acknowledgment', 'conversation', 'administration']);
  });

  it('reports an unclosed code fence instead of silently ignoring the rest of the sheet', () => {
    const md = ['### a', 'verdict: confirmed', '```', '### b', 'verdict: rejected'].join('\n');
    const { verdicts, unrecognised } = parseReviewSheet(md);
    expect(verdicts.has('b')).toBe(false);
    expect(unrecognised).toEqual(['unclosed code fence — everything after line 3 was ignored']);
  });

  it('reports a second human entry with the same id instead of skipping it silently', () => {
    const entry = (rule: string) => ['### run-7-t4-human', 'category: math', 'severity: serious', 'expected: e', `rule: ${rule}`];
    const { humanFaults, unrecognised } = parseReviewSheet([...entry('first'), ...entry('second')].join('\n'));
    expect(humanFaults.map(f => f.rule)).toEqual(['first']);
    expect(unrecognised).toHaveLength(1);
    expect(unrecognised[0]).toMatch(/^duplicate human id run-7-t4-human/);
  });
});

