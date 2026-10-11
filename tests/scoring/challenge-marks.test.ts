// Delivered doubts on the candidate's math, marked for scoring (round-3 fix
// 9). Batch 18 transcripts, saved: tests/scoring/fixtures/batch18-challenges.json.
import { describe, it, expect } from 'vitest';
import { buildChallengeMarks, verifyCandidateTurns, genuineErrorSpans } from '@/lib/scoring/challenge-marks';
import { dropClaimsOnMarkedTurns, formatInterviewerMarksSection, type InterviewerMark } from '@/lib/scoring/interviewer-errors';
import { getCaseById } from '@/lib/cases/loader';
import fx from './fixtures/batch18-challenges.json';

const prof = getCaseById('prof-001');
type Fx = { turns: { role: string; text: string; turnIndex: number }[]; revealedByTurn: Record<string, string[]> };
const runs = fx as Record<string, Fx>;
const marksFor = (k: string) => buildChallengeMarks(runs[k].turns, prof, i => runs[k].revealedByTurn[String(i)] ?? []);

describe('confirmed interviewer errors: doubt on math a check verified', () => {
  it('Owen t8: "Points of what… reconcile the 38%" after his verified 58/42 = 1.38 — his reply (t9) is protected', () => {
    expect(marksFor('owen')).toEqual([expect.objectContaining({ kind: 'confirmed_interviewer_error', interviewerTurn: 8, candidateTurns: [9] })]);
  });

  it('Brandon t12: "Points of what?" after his verified "ten points of COGS growth" (he lost points for it in batch 18)', () => {
    expect(marksFor('brandon')).toEqual([expect.objectContaining({ kind: 'confirmed_interviewer_error', interviewerTurn: 12, candidateTurns: [13] })]);
  });

  it('Camila t8: "Does that change your 53.8…" on her verified 10.5 + 43.3 = 53.8', () => {
    expect(marksFor('camila').map(m => [m.kind, m.interviewerTurn])).toEqual([['confirmed_interviewer_error', 8], ['unsupported_challenge', 8]]);
  });
});

describe('unsupported challenges are logged apart, and protect nothing', () => {
  it('Jasmine t16: a doubt on a figure no check verified or flagged', () => {
    expect(marksFor('jasmine')).toEqual([expect.objectContaining({ kind: 'unsupported_challenge', interviewerTurn: 16, candidateTurns: [] })]);
  });

  it('the judge sees them in their own section, with no protected turns', () => {
    const text = formatInterviewerMarksSection(marksFor('camila'));
    expect(text).toMatch(/INTERVIEWER ERRORS AND EXCLUSIONS[\s\S]*confirmed_interviewer_error/);
    expect(text).toMatch(/UNSUPPORTED CHALLENGES[\s\S]*not evidence that the candidate erred/);
  });
});

describe('a supported challenge is not marked', () => {
  it('Sofia t12: "Points of what?" on her flagged 25% × 40% = 10 points of revenue', () => {
    expect(marksFor('sofia').filter(m => m.interviewerTurn === 12)).toEqual([]);
  });
});

describe('a genuine error in a protected reply is still the candidate\'s', () => {
  const t = [
    { role: 'candidate', text: 'Beans are 25% of COGS, up 40%, so 0.25 × 40 = 10 points of COGS growth.', turnIndex: 1 },
    { role: 'interviewer', text: 'Points of what?', turnIndex: 2 },
    { role: 'candidate', text: "Sorry, I was sloppy. Also 16 divided by 18 is 1.6% of the problem.", turnIndex: 3 },
  ];
  const marks: InterviewerMark[] = [{ kind: 'confirmed_interviewer_error', interviewerTurn: 2, candidateTurns: [3], note: '' }];
  const rubric = { quantitative: { rating: 'needs_work', wentWell: [], missedOpportunities: [], needsWork: [
    { point: 'Conceded correct math', quotes: ['Sorry, I was sloppy.'] },
    { point: 'Division slip', quotes: ['16 divided by 18 is 1.6% of the problem'] },
  ] } };

  it('the concession is dropped; the independent 1.6% slip stays', () => {
    const genuine = genuineErrorSpans(verifyCandidateTurns(t, prof, () => ['cogs_pct', 'bean_share_of_cogs', 'bean_price_change']));
    expect([...genuine.keys()]).toEqual([3]);
    const { rubric: out, dropped } = dropClaimsOnMarkedTurns(rubric, ['quantitative'], t, marks, genuine);
    expect(dropped.map(d => d.point)).toEqual(['Conceded correct math']);
    expect(out.quantitative.needsWork.map(n => n.point)).toEqual(['Division slip']);
  });
});

describe('the judge is told which claims code settled', () => {
  it('Sofia: her flagged conversion is VERIFIED WRONG with the base; unchecked claims are not called correct', async () => {
    const { formatClaimChecksSection } = await import('@/lib/scoring/challenge-marks');
    const s = runs.sofia;
    const text = formatClaimChecksSection(verifyCandidateTurns(s.turns, prof, i => s.revealedByTurn[String(i)] ?? []));
    expect(text).toMatch(/VERIFIED WRONG: 10 points of revenue; the 25% share of COGS, up 40% at COGS at 42% of revenue \(two years ago\) is about 4\.2/);
    expect(text).toMatch(/not being flagged is not evidence of correctness/);
  });
});
