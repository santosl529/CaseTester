// Rule 9 v4.10 (round-3 fix 10): scoring reads what actually happened.
import { describe, it, expect } from 'vitest';
import { applyStageCaps, formatStageRecordSection, reconstructStages } from '@/lib/scoring/stage-caps';
import { INITIAL_STAGES, type StageRecord } from '@/lib/orchestrator/stage-evidence';
import { RUBRIC_DIMENSION_KEYS } from '@/lib/scoring/rubric';
import type { RubricScores } from '@/lib/scoring/judge';

const q = (point: string) => [{ point, quotes: ['a real quote'] }];
const dim = (rating: 'needs_work' | 'meets_bar' | 'strong', extra = {}) => ({ rating, wentWell: [], needsWork: [], missedOpportunities: [], ...extra });
const rubric = (over: Record<string, unknown> = {}): RubricScores =>
  ({ ...Object.fromEntries(RUBRIC_DIMENSION_KEYS.map(k => [k, dim('meets_bar', { wentWell: q('x') })])), ...over, overallRating: 'meets_bar', topFix: 't' }) as RubricScores;
const rec = (over: Partial<StageRecord> = {}): StageRecord => ({
  ...structuredClone(INITIAL_STAGES),
  structure: { delivered: true, outcome: 'answered' }, pressure_test: { delivered: true, outcome: 'answered' },
  analysis: { delivered: true, outcome: 'answered' }, exhibit: { delivered: true, outcome: 'answered' },
  brainstorm: { delivered: true, outcome: 'answered' }, recommendation: { delivered: true, outcome: 'answered' }, risk: { delivered: true, outcome: 'answered' },
  ...over,
});

describe('a stage that never happened is rated only on evidence', () => {
  it('Spencer (batch 18): brainstorm never asked, Creativity rated with no quoted evidence → not assessed', () => {
    const r = rubric({ creativity: dim('strong') });
    const out = applyStageCaps(r, rec({ brainstorm: { delivered: false } }), { partial: false });
    expect(out.rubric.creativity.notAssessed).toBe(true);
    expect(out.rubric.creativity.coverageCaveat).toMatch(/brainstorm stage never happened/);
    expect(out.notAssessed).toEqual(['creativity']);
  });

  it('a candidate who brainstormed unprompted keeps the rating, with the caveat (spontaneous evidence)', () => {
    const r = rubric({ creativity: dim('strong', { wentWell: q('Grouped levers by cost, price and mix') }) });
    const out = applyStageCaps(r, rec({ brainstorm: { delivered: false } }), { partial: false });
    expect(out.rubric.creativity.rating).toBe('strong');
    expect(out.rubric.creativity.notAssessed).toBeUndefined();
    expect(out.rubric.creativity.coverageCaveat).toMatch(/rests on what you did elsewhere/);
  });

  it('an administered stage the candidate declined is performance — left as judged', () => {
    const r = rubric({ creativity: dim('needs_work') });
    const out = applyStageCaps(r, rec({ brainstorm: { delivered: true, outcome: 'declined' } }), { partial: false });
    expect(out.rubric.creativity).toEqual(r.creativity);
  });

  it('a partial interview has no overall rating', () => {
    expect(applyStageCaps(rubric(), rec(), { partial: true }).rubric.overallRating).toBeNull();
    expect(applyStageCaps(rubric(), rec(), { partial: false }).rubric.overallRating).toBe('meets_bar');
  });
});

describe('the judge is told the stage record', () => {
  it('an exhibit shown is not an exhibit interpreted; a waived probe is not an answered one', () => {
    const text = formatStageRecordSection(rec({ exhibit: { delivered: false }, pressure_test: { delivered: true, deliveredAt: 4, outcome: 'waived' } }), null);
    expect(text).toMatch(/Exhibit: never administered/);
    expect(text).toMatch(/waived — not answered, not a weakness by itself/);
    expect(text).toMatch(/an exhibit shown is not an exhibit interpreted/);
    expect(text).toMatch(/Dimensions whose stage never happened: Data & Exhibit Interpretation/);
  });

  it('a partial interview says so, and that stopping is never graded', () => {
    expect(formatStageRecordSection(rec(), { exitTurn: 9 })).toMatch(/PARTIAL INTERVIEW: the candidate chose to end the interview at turn 9[\s\S]*Never mention, rate or penalize the decision to stop/);
  });
});

describe('a record rebuilt from a transcript (sessions before the record existed)', () => {
  it('the exhibit never shown and the brainstorm never asked (Raj/Spencer shape)', () => {
    const t = (role: string, text: string, turnIndex: number) => ({ role, text, turnIndex, timestampMs: 1000 * turnIndex });
    const r = reconstructStages({
      turns: [t('interviewer', 'Prompt. How would you approach this?', 0), t('candidate', 'Revenue and costs; costs first.', 1),
        t('interviewer', 'COGS is 58% of revenue. What does that tell you?', 2), t('candidate', 'COGS went from 42 to 58, so 16 of the 18 points.', 3),
        t('interviewer', "What's your recommendation to the CEO?", 4), t('candidate', 'Raise prices 8% in a pilot.', 5),
        t('interviewer', "What's the biggest risk to that recommendation, and how would you test for it?", 6)],
      exhibitShownAtMs: [], revealedAtMs: [1500], pressureTest: { state: 'satisfied', askedAt: 2, structureGiven: true },
      caseTexts: ['COGS is 58% of revenue today, up from 42% two years ago.'], phaseAt: i => (i >= 5 ? 'RECOMMENDATION' : 'ANALYSIS'),
    });
    expect(r.exhibit.delivered).toBe(false);
    expect(r.brainstorm.delivered).toBe(false);
    expect(r.analysis).toMatchObject({ delivered: true, outcome: 'answered' });
    expect(r.recommendation).toMatchObject({ delivered: true, outcome: 'answered' });
    expect(r.risk.delivered).toBe(true);
  });
});
