import { describe, it, expect } from 'vitest';
import { parseOnly, selectedByOnly, gradability, NEVER_SCORED_EXCEPTIONS } from '@/lib/eval/regrade-select';

const run = (over: Record<string, unknown> = {}) => ({ session: { status: 'completed' }, score: { rubricJsonb: {} }, ...over });

describe('regrade --only=: grading named runs out of a batch folder', () => {
  it('no filter takes everything', () => {
    expect(parseOnly(['scripts/regrade.ts', 'batch-39-larkspur'])).toEqual([]);
    expect(selectedByOnly([], '57-marisol', 'live-run-2026-10-26-69441a66.json')).toBe(true);
  });

  it('matches on the run id in the file name, or on the persona folder', () => {
    const only = parseOnly(['--only=69441a66,57-marisol']);
    expect(only).toEqual(['69441a66', '57-marisol']);
    expect(selectedByOnly(only, '57-marisol-the-context-confuser', 'live-run-2026-10-26-69441a66.json')).toBe(true);
    expect(selectedByOnly(only, '57-marisol-the-context-confuser', 'live-run-2026-10-26-aaaaaaaa.json')).toBe(true);
    expect(selectedByOnly(only, '07-raj-the-slow-burner', 'live-run-2026-10-26-69441a66.json')).toBe(true);
    expect(selectedByOnly(only, '07-raj-the-slow-burner', 'live-run-2026-10-26-aaaaaaaa.json')).toBe(false);
  });

  it('an empty value is no filter, and whitespace is trimmed', () => {
    expect(parseOnly(['--only='])).toEqual([]);
    expect(parseOnly(['--only= 69441a66 , '])).toEqual(['69441a66']);
  });
});

describe('what regrade will grade', () => {
  it('a completed, scored run is graded', () => {
    expect(gradability(run(), 'live-run-x-aaaaaaaa.json')).toEqual({ grade: true, note: null });
  });

  it('an unfinished run is skipped whatever its id', () => {
    expect(gradability(run({ session: { status: 'abandoned' }, score: undefined }), 'live-run-x-69441a66.json'))
      .toEqual({ grade: false, note: 'abandoned' });
    expect(gradability(run({ session: { status: 'active' } }), 'live-run-x-69441a66.json').grade).toBe(false);
  });

  // Lorenzo, 27 Oct: relaxed for ONE run, not as a general change.
  it('a completed run that was never scored is skipped — except the one run named', () => {
    expect(gradability(run({ score: undefined }), 'live-run-2026-10-26-aaaaaaaa.json'))
      .toEqual({ grade: false, note: 'completed, never scored' });
    expect(gradability(run({ score: undefined }), 'live-run-2026-10-26-69441a66.json'))
      .toEqual({ grade: true, note: 'never scored — no stored report to diff against' });
  });

  it('the exception list holds exactly the one run', () => {
    expect(NEVER_SCORED_EXCEPTIONS).toEqual(['69441a66']);
  });
});
