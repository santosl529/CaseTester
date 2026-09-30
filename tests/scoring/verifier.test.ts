import { describe, it, expect } from 'vitest';
import { collectClaims, applyVerdicts, buildVerifierFacts, VERIFIER_OUTPUT_FORMAT, type Verdict } from '@/lib/scoring/verifier';
import { RUBRIC_DIMENSION_KEYS } from '@/lib/scoring/rubric';
import type { RubricScores, DimensionFeedback } from '@/lib/scoring/judge';

function dim(overrides: Partial<DimensionFeedback> = {}): DimensionFeedback {
  return {
    rating: 'meets_bar',
    wentWell: [{ point: 'Solid framing.', quotes: ['my structure'] }],
    needsWork: [],
    missedOpportunities: [],
    ...overrides,
  };
}

function baseRubric(): RubricScores {
  const r = {
    ...Object.fromEntries(RUBRIC_DIMENSION_KEYS.map(k => [k, dim()])),
    overallRating: 'meets_bar',
    topFix: 'Derive numbers out loud.',
  } as RubricScores;
  r.synthesis = dim({
    rating: 'needs_work',
    needsWork: [
      { point: 'Omitted hedging contracts.', quotes: [] },
      { point: 'Recommendation was buried.', quotes: ['so overall I think'] },
    ],
    missedOpportunities: [
      { moment: 'Never proposed supply-side levers.', betterResponse: 'I would hedge bean prices.' },
    ],
  });
  return r;
}

describe('collectClaims', () => {
  it('collects needsWork, missedOpportunities, and topFix with unique ids', () => {
    const claims = collectClaims(baseRubric());
    expect(claims).toHaveLength(4); // 2 needsWork + 1 missed + topFix
    expect(new Set(claims.map(c => c.id)).size).toBe(4);
    expect(claims.at(-1)!.section).toBe('topFix');
  });

  it('does not collect wentWell', () => {
    const claims = collectClaims(baseRubric());
    expect(claims.every(c => c.section !== ('wentWell' as never))).toBe(true);
  });
});

describe('applyVerdicts', () => {
  it('drops unsupported claims and keeps supported ones', () => {
    const rubric = baseRubric();
    const claims = collectClaims(rubric);
    const verdicts: Verdict[] = claims.map(c => ({
      id: c.id,
      supported: !c.text.includes('hedging') && !c.text.includes('supply-side'),
      reason: 'transcript check',
    }));
    const { rubric: cleaned, dropped } = applyVerdicts(rubric, claims, verdicts);
    expect(cleaned.synthesis.needsWork).toHaveLength(1);
    expect(cleaned.synthesis.needsWork[0].point).toBe('Recommendation was buried.');
    expect(cleaned.synthesis.missedOpportunities).toHaveLength(0);
    expect(dropped).toHaveLength(2);
  });

  it('replaces an unsupported topFix with a surviving needsWork point from the lowest-rated dimension', () => {
    const rubric = baseRubric();
    const claims = collectClaims(rubric);
    const verdicts: Verdict[] = claims.map(c => ({
      id: c.id,
      supported: c.section !== 'topFix',
      reason: 'x',
    }));
    const { rubric: cleaned } = applyVerdicts(rubric, claims, verdicts);
    expect(cleaned.topFix).toBe('Omitted hedging contracts.'); // synthesis is needs_work-rated
  });

  it('keeps the original topFix when nothing survives to replace it', () => {
    const rubric = baseRubric();
    rubric.synthesis = dim(); // no needsWork anywhere
    const claims = collectClaims(rubric);
    const verdicts: Verdict[] = claims.map(c => ({ id: c.id, supported: false, reason: 'x' }));
    const { rubric: cleaned } = applyVerdicts(rubric, claims, verdicts);
    expect(cleaned.topFix).toBe('Derive numbers out loud.');
  });

  it('treats missing verdicts as supported (fail open, never fabricate drops)', () => {
    const rubric = baseRubric();
    const claims = collectClaims(rubric);
    const { rubric: cleaned, dropped } = applyVerdicts(rubric, claims, []);
    expect(cleaned.synthesis.needsWork).toHaveLength(2);
    expect(dropped).toHaveLength(0);
  });

  it('does not mutate the input rubric', () => {
    const rubric = baseRubric();
    const claims = collectClaims(rubric);
    applyVerdicts(rubric, claims, claims.map(c => ({ id: c.id, supported: false, reason: 'x' })));
    expect(rubric.synthesis.needsWork).toHaveLength(2);
  });
});

describe('buildVerifierFacts (error-claim verifier, v4.3)', () => {
  it('lists span-checked correct figures only, plus the interviewer-error marks', () => {
    const facts = buildVerifierFacts([
      { id: 'rps', description: '$480M / 200 stores = $2.4M per store', expected: 2.4, tolerance: 0.05, mentioned: true,
        candidateValue: 2.4, withinTolerance: true, errorClass: 'non_issue', span: 'That implies about $2.4 million per store' },
      { id: 'x', description: 'wrong one', expected: 1, tolerance: 0, mentioned: true,
        candidateValue: 5, withinTolerance: false, errorClass: 'case_breaking', span: 'five' },
    ], 'INTERVIEWER ERRORS AND EXCLUSIONS: ...');
    expect(facts).toContain('That implies about $2.4 million per store');
    expect(facts).toContain('CORRECT');
    expect(facts).not.toContain('five');
    expect(facts).toContain('INTERVIEWER ERRORS');
  });
});

describe('verifier structured output', () => {
  it('round-trips verdicts through the output format', () => {
    const verdicts = { verdicts: [{ id: 1, supported: false, reason: 'Transcript contradicts it.' }] };
    expect(VERIFIER_OUTPUT_FORMAT.parse(JSON.stringify(verdicts))).toEqual(verdicts);
  });
});
