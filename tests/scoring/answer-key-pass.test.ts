import { describe, it, expect } from 'vitest';
import { applyAnswerKeyPass } from '@/lib/scoring/answer-key-pass';
import type { RubricScores, DimensionFeedback } from '@/lib/scoring/judge';

const dim = (over: Partial<DimensionFeedback> = {}): DimensionFeedback => ({
  rating: 'strong', wentWell: [], needsWork: [], missedOpportunities: [], ...over,
});

function rubric(over: Partial<RubricScores> = {}): RubricScores {
  return {
    structure: dim(), quantitative: dim(), dataExhibit: dim(), judgment: dim(), creativity: dim(),
    synthesis: dim(), communication: dim(), pushback: dim(), overallRating: 'strong', topFix: 'x', ...over,
  };
}

const IDEAS = [
  { idea: 'Lower-cost commodity blend for budget locations', phrases: ['commodity blend', 'lower-cost blend', 'cheaper blend'] },
  { idea: 'Price increase of 8–12%', phrases: ['8–12%', '8-12%', '8 to 12'] },
];

describe('answer-key pass (Rule 3 v4.5: the answer key holds examples, not requirements)', () => {
  it("removes Micah's missing-idea weakness and re-rates the dimension it alone supported", () => {
    const r = rubric({
      creativity: dim({
        rating: 'meets_bar',
        wentWell: [{ point: 'Bucketed ideas into price and cost levers.', quotes: ['price and cost'] }],
        needsWork: [{ point: 'Lacking a genuinely differentiated option like a lower-cost commodity blend for budget locations.', quotes: [] }],
      }),
    });
    const out = applyAnswerKeyPass(r, { ideas: IDEAS, candidateTexts: ['I would raise price and cut cost.'] });
    expect(out.rubric.creativity.needsWork).toEqual([]);
    expect(out.rubric.creativity.rating).toBe('strong');
    expect(out.removed).toEqual([{ dimension: 'creativity', point: expect.stringMatching(/commodity blend/), idea: IDEAS[0].idea }]);
    expect(out.reRated).toEqual([{ dimension: 'creativity', from: 'meets_bar', to: 'strong' }]);
  });

  it('keeps a weakness about an answer-key idea the candidate raised themselves', () => {
    const r = rubric({
      creativity: dim({ rating: 'meets_bar', needsWork: [{ point: 'The commodity blend idea was never sized.', quotes: ['a cheaper commodity blend'] }] }),
    });
    const out = applyAnswerKeyPass(r, { ideas: IDEAS, candidateTexts: ['Maybe a cheaper commodity blend in budget stores.'] });
    expect(out.rubric.creativity.needsWork).toHaveLength(1);
    expect(out.removed).toEqual([]);
  });

  it('does not re-rate while other needs-work items remain', () => {
    const r = rubric({
      creativity: dim({
        rating: 'meets_bar',
        needsWork: [
          { point: 'Missed the commodity blend.', quotes: [] },
          { point: 'Ideas were not prioritized.', quotes: ['and also'] },
        ],
      }),
    });
    const out = applyAnswerKeyPass(r, { ideas: IDEAS, candidateTexts: [''] });
    expect(out.rubric.creativity.needsWork.map(n => n.point)).toEqual(['Ideas were not prioritized.']);
    expect(out.rubric.creativity.rating).toBe('meets_bar');
  });

  it('raises needs_work to meets_bar, never straight to strong', () => {
    const r = rubric({ judgment: dim({ rating: 'needs_work', wentWell: [{ point: 'p', quotes: [] }], needsWork: [{ point: 'Should have sized an 8–12% price increase.', quotes: [] }] }) });
    const out = applyAnswerKeyPass(r, { ideas: IDEAS, candidateTexts: ['raise prices'] });
    expect(out.rubric.judgment.rating).toBe('meets_bar');
  });

  it('does not raise to strong with nothing in wentWell', () => {
    const r = rubric({ creativity: dim({ rating: 'meets_bar', needsWork: [{ point: 'No commodity blend.', quotes: [] }] }) });
    expect(applyAnswerKeyPass(r, { ideas: IDEAS, candidateTexts: [''] }).rubric.creativity.rating).toBe('meets_bar');
  });

  it("caveat text: removes a weakness citing the stage the interviewer never ran (Tobias)", () => {
    const r = rubric({
      creativity: dim({
        rating: 'meets_bar',
        coverageCaveat: 'The interviewer never ran a brainstorm — not a candidate failing.',
        needsWork: [{ point: 'Solution set stayed narrow.', quotes: ['raise prices'] }],
      }),
    });
    const out = applyAnswerKeyPass(r, { ideas: [], candidateTexts: ['raise prices'] });
    expect(out.rubric.creativity.needsWork).toEqual([]);
    expect(out.caveatRemoved).toEqual([{ dimension: 'creativity', point: 'Solution set stayed narrow.' }]);
  });

  it('caveat text leaves uncaveated dimensions alone', () => {
    const r = rubric({ creativity: dim({ rating: 'meets_bar', needsWork: [{ point: 'Solution set stayed narrow.', quotes: [] }] }) });
    expect(applyAnswerKeyPass(r, { ideas: [], candidateTexts: [''] }).rubric.creativity.needsWork).toHaveLength(1);
  });

  it('caveat text ignores data-gap caveats (reconciliation handles those)', () => {
    const r = rubric({
      synthesis: dim({
        rating: 'meets_bar',
        coverageCaveat: 'The recommendation rests on menu-price data the candidate requested and never received.',
        needsWork: [{ point: 'The recommendation did not address volume risk.', quotes: [] }],
      }),
    });
    expect(applyAnswerKeyPass(r, { ideas: [], candidateTexts: [''] }).rubric.synthesis.needsWork).toHaveLength(1);
  });

  it('matches phrases case- and dash-insensitively', () => {
    const r = rubric({ judgment: dim({ rating: 'meets_bar', needsWork: [{ point: 'No 8-12% sizing of the Lower-Cost Blend.', quotes: [] }] }) });
    expect(applyAnswerKeyPass(r, { ideas: IDEAS, candidateTexts: [''] }).removed).toHaveLength(1);
  });
});
