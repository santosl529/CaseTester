import { describe, it, expect } from 'vitest';
import { auditEvidence } from '@/lib/scoring/evidence-audit';
import { RUBRIC_DIMENSION_KEYS } from '@/lib/scoring/rubric';
import type { RubricScores, DimensionFeedback } from '@/lib/scoring/judge';

// Live run 58cb8061: Creativity was rated "strong" on brainstorm content the
// INTERVIEWER fabricated. The audit stripped the quotes (they weren't in any
// candidate turn) but kept the points, so two strengths shipped with no
// evidence at all.
const CANDIDATE_TURNS = ['I would renegotiate bean contracts and raise prices on specialty drinks.'];

function dim(overrides: Partial<DimensionFeedback> = {}): DimensionFeedback {
  return { rating: 'meets_bar', wentWell: [], needsWork: [], missedOpportunities: [], ...overrides };
}

function rubricWithCreativity(creativity: DimensionFeedback): RubricScores {
  return {
    ...Object.fromEntries(RUBRIC_DIMENSION_KEYS.map(k => [k, dim()])),
    creativity,
    overallRating: 'meets_bar',
    topFix: 'x',
  } as RubricScores;
}

describe('auditEvidence — points left without evidence', () => {
  it('drops a wentWell point whose quotes were all fabricated', () => {
    const { rubric, droppedPoints } = auditEvidence(rubricWithCreativity(dim({
      wentWell: [
        { point: 'Grounded strength.', quotes: ['renegotiate bean contracts'] },
        { point: 'Fabricated strength.', quotes: ['use bundling or loyalty to raise average ticket'] },
      ],
    })), CANDIDATE_TURNS);
    expect(rubric.creativity.wentWell.map(w => w.point)).toEqual(['Grounded strength.']);
    expect(droppedPoints).toEqual([{ dimension: 'creativity', section: 'wentWell', point: 'Fabricated strength.' }]);
  });

  it('drops a wentWell point that never had evidence — praise needs a quote', () => {
    const { rubric, droppedPoints } = auditEvidence(rubricWithCreativity(dim({
      wentWell: [{ point: 'Sequenced ideas by impact.', quotes: [] }],
    })), CANDIDATE_TURNS);
    expect(rubric.creativity.wentWell).toEqual([]);
    expect(droppedPoints).toHaveLength(1);
  });

  it('drops a needsWork point that lost ALL its quotes (its evidence was fabricated)', () => {
    const { rubric } = auditEvidence(rubricWithCreativity(dim({
      needsWork: [{ point: 'Anchored on waste.', quotes: ['it is definitely waste'] }],
    })), CANDIDATE_TURNS);
    expect(rubric.creativity.needsWork).toEqual([]);
  });

  it('keeps a needsWork point that never had quotes — omission claims have none (the verifier handles them)', () => {
    const { rubric, droppedPoints } = auditEvidence(rubricWithCreativity(dim({
      needsWork: [{ point: 'Never mentioned dairy procurement.', quotes: [] }],
    })), CANDIDATE_TURNS);
    expect(rubric.creativity.needsWork).toHaveLength(1);
    expect(droppedPoints).toEqual([]);
  });

  it('keeps a point with at least one surviving quote', () => {
    const { rubric } = auditEvidence(rubricWithCreativity(dim({
      wentWell: [{ point: 'Mixed.', quotes: ['raise prices on specialty drinks', 'fabricated words here entirely'] }],
    })), CANDIDATE_TURNS);
    expect(rubric.creativity.wentWell[0].quotes).toEqual(['raise prices on specialty drinks']);
  });
});
