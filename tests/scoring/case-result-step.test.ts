import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const tagPoints = vi.fn();
// A failure is thrown here rather than by the vi.fn: vitest 4 reports a rejection that passes through a mock as the
// test's error even when the code under test catches it.
let failWith: string | null = null;
vi.mock('@/lib/scoring/skill-tags', async importOriginal => ({ ...(await importOriginal<object>()), tagPoints: async (...a: unknown[]) => {
  if (failWith) throw new Error(failWith);
  return tagPoints(...a);
} }));

import { runCaseResultStep, askedForData, prepareCaseResult } from '@/lib/scoring/case-result-step';
import { INITIAL_STAGES } from '@/lib/orchestrator/stage-evidence';
import { RUBRIC_DIMENSION_KEYS } from '@/lib/scoring/rubric';
import type { RubricScores } from '@/lib/scoring/judge';

const dim = (needsWork: { point: string; quotes: string[] }[] = []) => ({ rating: 'needs_work' as const, wentWell: [], needsWork, missedOpportunities: [] });
const rubric = {
  ...Object.fromEntries(RUBRIC_DIMENSION_KEYS.map(k => [k, dim()])),
  structure: dim([{ point: 'Overlapping buckets.', quotes: ['revenue, costs and pricing'] }]),
  dataExhibit: dim([{ point: 'Misread the chart.', quotes: ['volume was flat'] }]),
  overallRating: 'needs_work', topFix: 'Fix the overlap.',
} as unknown as RubricScores;
const input = (caseId = 'prof-002') => ({
  sessionId: '00000000-0000-4000-8000-000000000001', studentId: '00000000-0000-4000-8000-000000000002', completedAt: new Date('2026-11-15T12:00:00Z'),
  caseData: { id: caseId, caseType: 'profitability' as const, difficulty: 'easy' as const, mathSteps: [] },
  partial: false, rubric, checker: [], stageRecord: structuredClone(INITIAL_STAGES), mathResults: [], dataRequests: [],
  transcript: [{ role: 'candidate', text: "I'd look at revenue, costs and pricing.", turnIndex: 1 }, { role: 'candidate', text: 'So volume was flat.', turnIndex: 3 }],
});

describe('the case → drills step in a scoring pass', () => {
  beforeEach(() => { tagPoints.mockReset(); failWith = null; });
  afterEach(() => vi.unstubAllEnvs());

  it('does nothing when off, and nothing for the 7-minute demo', async () => {
    vi.stubEnv('CASE_TO_DRILLS', 'off');
    expect(await runCaseResultStep(input())).toBeNull();
    vi.stubEnv('CASE_TO_DRILLS', 'shadow');
    expect(await runCaseResultStep(input('prof-001-demo'))).toBeNull();
    expect(tagPoints).not.toHaveBeenCalled();
  });

  it('tags every group, but only switched-on groups give findings', async () => {
    vi.stubEnv('CASE_TO_DRILLS', 'shadow');
    tagPoints.mockResolvedValue([
      { id: 'structure:0', tag: 'M.overlapping_buckets', reason: 'S4' },
      { id: 'dataExhibit:0', tag: 'M.misread_trend', reason: 'X1' },
      { id: 'topFix', tag: 'M.overlapping_buckets', reason: 'S4' },
    ]);
    const step = (await runCaseResultStep(input()))!;
    expect(step.status).toBe('built');
    expect(step.mode).toBe('shadow');
    expect(step.taggerConfig).toBe('sonnet55-thinking');
    expect(step.payload!.findings).toEqual([{ tag: 'M.overlapping_buckets', severity: 'major', turn_ids: [1], evidence: 'revenue, costs and pricing' }]);
    expect(step.points.find(p => p.id === 'dataExhibit:0')).toMatchObject({ tag: 'M.misread_trend', drill: false, finding: null });
  });

  it('records a failed tagging call without throwing, so the report stands', async () => {
    vi.stubEnv('CASE_TO_DRILLS', 'on');
    failWith = 'overloaded';
    const step = (await runCaseResultStep(input()))!;
    expect(step).toMatchObject({ status: 'failed', mode: 'on', payload: null, error: 'tagging: overloaded' });
  });

  it('builds no input when off or for the demo, and never lets building it throw', () => {
    vi.stubEnv('CASE_TO_DRILLS', 'off');
    const build = vi.fn(() => input());
    expect(prepareCaseResult('prof-002', build)).toBeNull();
    expect(build).not.toHaveBeenCalled();
    vi.stubEnv('CASE_TO_DRILLS', 'shadow');
    expect(prepareCaseResult('prof-001-demo', build)).toBeNull();
    expect(prepareCaseResult('prof-002', build)).toMatchObject({ caseData: { id: 'prof-002' } });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(prepareCaseResult('prof-002', () => { throw new Error('checker record unreadable'); })).toBeNull();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it('skips the tagging call when the scoring deadline is under 45 s away', async () => {
    vi.stubEnv('CASE_TO_DRILLS', 'shadow');
    const step = (await runCaseResultStep(input(), { deadlineMs: 1_000_000 + 30_000, now: () => 1_000_000 }))!;
    expect(step).toMatchObject({ status: 'failed', error: '30 s left before the scoring deadline' });
    expect(tagPoints).not.toHaveBeenCalled();
  });

  it('counts an explicit ask for data, not the marker row or a passing mention', () => {
    expect(askedForData([{ subtype: 'classified', payloadJsonb: {} }])).toBe(false);
    expect(askedForData([{ subtype: 'released', payloadJsonb: { what: 'COGS split', explicit: false } }])).toBe(false);
    expect(askedForData([{ subtype: 'released', payloadJsonb: { what: 'COGS split' } }])).toBe(true);
  });
});
