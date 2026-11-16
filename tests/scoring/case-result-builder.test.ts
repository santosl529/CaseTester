import { describe, expect, it } from 'vitest';
import { buildCaseResult, casePoints, checkerTag, skillsObserved, type BuildInput } from '@/lib/scoring/case-result-builder';
import { CaseResultPayloadSchema } from '@/lib/drills/case-result';
import { DEFAULT_DRILL_GROUPS } from '@/lib/drills/case-to-drills';
import { INITIAL_STAGES, type StageKey, type StageRecord } from '@/lib/orchestrator/stage-evidence';
import { RUBRIC_DIMENSION_KEYS } from '@/lib/scoring/rubric';
import type { RubricScores } from '@/lib/scoring/judge';

type Dim = RubricScores['structure'];
const dim = (rating: Dim['rating'], needsWork: Dim['needsWork'] = [], extra: Partial<Dim> = {}): Dim => ({ rating, wentWell: [], needsWork, missedOpportunities: [], ...extra });
function rubric(over: Partial<Record<(typeof RUBRIC_DIMENSION_KEYS)[number], Dim>> = {}, topFix = 'Open with a tailored structure.'): RubricScores {
  return { ...Object.fromEntries(RUBRIC_DIMENSION_KEYS.map(k => [k, over[k] ?? dim('meets_bar')])), overallRating: 'meets_bar', topFix } as RubricScores;
}
const answered = (...keys: StageKey[]): StageRecord => {
  const rec = structuredClone(INITIAL_STAGES);
  for (const k of keys) rec[k] = { delivered: true, deliveredAt: 2, outcome: 'answered' };
  return rec;
};
const turns = [
  { turnIndex: 1, text: "I'd look at revenue, costs, and then also pricing." },
  { turnIndex: 3, text: 'Margin went from 18% to 12%, so it dropped 6 percent.' },
  { turnIndex: 5, text: 'So 4,000 times 30 is 1,200,000 a year.' },
];

function input(over: Partial<BuildInput> = {}): BuildInput {
  const r = over.rubric ?? rubric({
    structure: dim('needs_work', [{ point: 'Pricing overlaps revenue.', quotes: ["revenue, costs, and then also pricing"] }]),
    quantitative: dim('meets_bar', [{ point: 'Percent vs points.', quotes: ['it dropped 6 percent'] }]),
    dataExhibit: dim('needs_work', [{ point: 'Misread the exhibit.', quotes: ['Margin went from 18% to 12%'] }]),
  });
  return {
    sessionId: '00000000-0000-4000-8000-000000000001', studentId: '00000000-0000-4000-8000-000000000002', caseId: 'prof-002',
    caseType: 'profitability', difficulty: 'easy', completedAt: new Date('2026-11-15T12:00:00Z'), partial: false,
    rubric: r, points: casePoints(r),
    tags: [
      { id: 'structure:0', tag: 'M.overlapping_buckets', reason: 'S4' },
      { id: 'quantitative:0', tag: 'M.percent_vs_points', reason: 'Q1' },
      { id: 'dataExhibit:0', tag: 'M.misread_trend', reason: 'X1' },
      { id: 'topFix', tag: 'M.generic_framework', reason: 'S3' },
    ],
    checker: [], stageRecord: answered('structure'), mathSteps: [], dataRequested: false, candidateTurns: turns,
    drillGroups: new Set(DEFAULT_DRILL_GROUPS), ...over,
  };
}

describe('case points', () => {
  it('takes "needs work" points with a quote, skips unrated dimensions, and adds the top improvement', () => {
    const r = rubric({
      structure: dim('needs_work', [{ point: 'A', quotes: ['q'] }, { point: 'no quote', quotes: [' '] }]),
      creativity: dim('meets_bar', [{ point: 'B', quotes: ['q'] }], { notAssessed: true, coverageCaveat: 'never ran a brainstorm' }),
      judgment: dim('meets_bar', [{ point: 'C', quotes: ['q'] }], { coverageCaveat: 'data never given' }),
    });
    expect(casePoints(r).map(p => p.id)).toEqual(['structure:0', 'topFix']);
  });
});

describe('checker tags', () => {
  it('maps error types, and an arithmetic slip off by a power of ten to zeros', () => {
    expect(checkerTag({ errorType: 'arithmetic', candidateValue: '1,200,000', rightValue: 120000 })).toBe('M.zeros_error');
    expect(checkerTag({ errorType: 'arithmetic', candidateValue: '130', rightValue: 120 })).toBe('M.arithmetic_error');
    expect(checkerTag({ errorType: 'wrong_base', candidateValue: '', rightValue: null })).toBe('M.wrong_base');
    expect(checkerTag({ errorType: 'unit', candidateValue: '', rightValue: null })).toBe('M.unit_error');
    expect(checkerTag({ errorType: 'wrong_period', candidateValue: '', rightValue: null })).toBe('M.period_mismatch');
    expect(checkerTag({ errorType: 'misquote', candidateValue: '', rightValue: null })).toBe('M.wrong_data_point');
    expect(checkerTag({ errorType: 'conceptual', candidateValue: '', rightValue: null })).toBeNull();
  });
});

describe('building the case result', () => {
  it('builds a payload drills accepts', () => {
    const { payload } = buildCaseResult(input());
    expect(() => CaseResultPayloadSchema.parse(payload)).not.toThrow();
    expect(payload.difficulty_tier).toBe(1);
    expect(payload.case_type).toBe('profitability');
  });

  it('gives a finding only for groups switched on; the rest are recorded with no drill', () => {
    const { payload, points } = buildCaseResult(input());
    expect(payload.findings.map(f => f.tag)).toEqual(['M.overlapping_buckets', 'M.percent_vs_points']);
    const ex = points.find(p => p.id === 'dataExhibit:0')!;
    expect(ex.tag).toBe('M.misread_trend');
    expect(ex.drill).toBe(false);
    expect(ex.finding).toBeNull();
    // Switched on later (CASE_TAG_DRILL_GROUPS): the same point gives a finding.
    const on = buildCaseResult(input({ drillGroups: new Set([...DEFAULT_DRILL_GROUPS, 'dataExhibit']) }));
    expect(on.payload.findings.map(f => f.tag)).toContain('M.misread_trend');
  });

  it('sets severity: minor when the dimension was still Adequate, major when it is the top improvement', () => {
    const { payload } = buildCaseResult(input());
    expect(payload.findings.find(f => f.tag === 'M.percent_vs_points')!.severity).toBe('minor');
    const top = buildCaseResult(input({ tags: [{ id: 'structure:0', tag: 'M.overlapping_buckets', reason: '' }, { id: 'topFix', tag: 'M.overlapping_buckets', reason: '' }] }));
    expect(top.payload.findings[0].severity).toBe('major');
    // The top improvement itself is never a finding (it has no quote).
    expect(top.points.find(p => p.id === 'topFix')!.finding).toBeNull();
  });

  it('takes the evidence and turn ids from the quote; no quote found, no finding', () => {
    const { payload } = buildCaseResult(input());
    expect(payload.findings[0]).toMatchObject({ evidence: 'revenue, costs, and then also pricing', turn_ids: [1] });
    const r = rubric({ structure: dim('needs_work', [{ point: 'A', quotes: ['words the candidate never said'] }]) });
    const missing = buildCaseResult(input({ rubric: r, points: casePoints(r), tags: [{ id: 'structure:0', tag: 'M.missing_bucket', reason: '' }] }));
    expect(missing.payload.findings).toEqual([]);
    expect(missing.points[0].note).toBe('no quote found in a candidate turn');
  });

  it("adds the checker's wrong figures, minor when put right in the interview", () => {
    const { payload, checker } = buildCaseResult(input({ checker: [
      { turn: 5, span: '4,000 times 30 is 1,200,000', errorType: 'arithmetic', candidateValue: '1,200,000', rightValue: 120000, resolved: false },
      { turn: 3, span: 'it dropped 6 percent', errorType: 'wrong_base', candidateValue: '6', rightValue: 33, resolved: true },
      { turn: 3, span: 'from 18% to 12%', errorType: 'conceptual', candidateValue: '', rightValue: null, resolved: false },
    ] }));
    expect(payload.findings.slice(0, 2)).toEqual([
      { tag: 'M.zeros_error', severity: 'major', turn_ids: [5], evidence: '4,000 times 30 is 1,200,000' },
      { tag: 'M.wrong_base', severity: 'minor', turn_ids: [3], evidence: 'it dropped 6 percent' },
    ]);
    expect(checker[2].note).toBe('conceptual: left to the tagging step');
  });

  it('logs "risk asked, none named" from the stage record, quoting the answer', () => {
    const rec = answered('structure', 'recommendation');
    rec.risk = { delivered: true, deliveredAt: 4, outcome: 'answered', withRecommendation: true, noneNamed: true };
    const { payload } = buildCaseResult(input({ stageRecord: rec }));
    expect(payload.findings.at(-1)).toMatchObject({ tag: 'M.missing_risk_or_next_step', turn_ids: [5] });
  });

  it('carries the partial flag', () => {
    expect(buildCaseResult(input({ partial: true })).payload.partial).toBe(true);
  });
});

describe('skills observed', () => {
  const base = { rubric: rubric(), candidateTurns: turns, mathSteps: [], dataRequested: false };
  it('lists a stage’s skills only when it was answered', () => {
    expect(skillsObserved({ ...base, stageRecord: answered() })).toEqual(['CM.concise']);
    const rec = answered('structure', 'exhibit', 'brainstorm', 'recommendation', 'risk', 'pressure_test');
    rec.brainstorm = { delivered: true, outcome: 'time_up' };
    const got = skillsObserved({ ...base, stageRecord: rec, mathSteps: [{ mentioned: true, unit: 'percent' }, { mentioned: false, unit: 'usd' }], dataRequested: true });
    expect(got).toEqual(expect.arrayContaining(['PS.mece', 'PS.case_specific', 'PS.depth', 'QN.setup', 'QN.arithmetic', 'QN.percentages', 'CL.data_requests',
      'EX.takeaway', 'EX.extraction', 'SY.answer_first', 'SY.evidence', 'BJ.so_what', 'SY.complete', 'BJ.risks', 'CL.pushback', 'CM.concise']));
    expect(got).not.toContain('CR.volume');
  });
  it('leaves out a dimension that was not assessed', () => {
    const r = rubric({ structure: dim('meets_bar', [], { notAssessed: true, coverageCaveat: 'x' }) });
    expect(skillsObserved({ ...base, rubric: r, stageRecord: answered('structure') })).not.toContain('PS.mece');
  });
});
