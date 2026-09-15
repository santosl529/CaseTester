import { describe, it, expect } from 'vitest';
import {
  collectReconcileItems, applyReconciliation, parseReconcileResponse, buildReconcilePrompt,
  GAP_COVERAGE_CAVEAT, type ReconcileResult,
} from '@/lib/scoring/reconcile';
import { RUBRIC_DIMENSION_KEYS, CANDIDATE_REFERENCE_RULE } from '@/lib/scoring/rubric';
import type { RubricScores, DimensionFeedback } from '@/lib/scoring/judge';

function dim(overrides: Partial<DimensionFeedback> = {}): DimensionFeedback {
  return { rating: 'meets_bar', wentWell: [], needsWork: [], missedOpportunities: [], ...overrides };
}

function baseRubric(): RubricScores {
  const r = {
    ...Object.fromEntries(RUBRIC_DIMENSION_KEYS.map(k => [k, dim()])),
    overallRating: 'meets_bar',
    topFix: 'Name the price-increase risk.',
  } as RubricScores;
  // Run 4's Business Judgment collision.
  r.judgment = dim({
    rating: 'meets_bar',
    wentWell: [{ point: 'Recognized demand elasticity implicitly by targeting select premium items.', quotes: ['only on premium drinks'] }],
    needsWork: [{ point: 'Did not surface the key risk of a price increase (elasticity / volume loss).', quotes: ['raise prices'] }],
  });
  r.synthesis = dim({
    rating: 'needs_work',
    needsWork: [{ point: 'Anchored on an unverified waste narrative.', quotes: ['probably waste'] }],
    missedOpportunities: [{ moment: 'At the recommendation, assumed prices had not moved.', betterResponse: 'Check menu prices first.' }],
  });
  return r;
}

const empty: ReconcileResult = { merges: [], gapLeaks: [], crossDimension: [] };

function idOf(items: ReturnType<typeof collectReconcileItems>, dimension: string, section: string, index = 0): number {
  return items.find(i => i.dimension === dimension && i.section === section && i.index === index)!.id;
}

describe('collectReconcileItems', () => {
  it('collects wentWell, needsWork, missedOpportunities, and topFix with unique ids', () => {
    const items = collectReconcileItems(baseRubric());
    expect(items.map(i => i.section).sort()).toEqual(
      ['missedOpportunities', 'needsWork', 'needsWork', 'topFix', 'wentWell'],
    );
    expect(new Set(items.map(i => i.id)).size).toBe(items.length);
  });
});

describe('applyReconciliation — within-dimension merges', () => {
  it('meets_bar: merged statement replaces the needsWork item, wentWell item removed, quotes combined', () => {
    const rubric = baseRubric();
    const items = collectReconcileItems(rubric);
    const merged = 'Recognized elasticity implicitly in targeting premium SKUs, but never named volume loss as the risk.';
    const out = applyReconciliation(rubric, items, {
      ...empty,
      merges: [{ wentWellId: idOf(items, 'judgment', 'wentWell'), needsWorkId: idOf(items, 'judgment', 'needsWork'), merged }],
    });
    expect(out.rubric.judgment.wentWell).toEqual([]);
    expect(out.rubric.judgment.needsWork).toEqual([{ point: merged, quotes: ['raise prices', 'only on premium drinks'] }]);
    expect(out.merges).toHaveLength(1);
    expect(out.merges[0]).toMatchObject({ dimension: 'judgment', placedIn: 'needsWork' });
  });

  it('strong: merged statement replaces the wentWell item, needsWork item removed', () => {
    const rubric = baseRubric();
    rubric.judgment.rating = 'strong';
    const items = collectReconcileItems(rubric);
    const out = applyReconciliation(rubric, items, {
      ...empty,
      merges: [{ wentWellId: idOf(items, 'judgment', 'wentWell'), needsWorkId: idOf(items, 'judgment', 'needsWork'), merged: 'M' }],
    });
    expect(out.rubric.judgment.needsWork).toEqual([]);
    expect(out.rubric.judgment.wentWell.map(w => w.point)).toEqual(['M']);
    expect(out.merges[0].placedIn).toBe('wentWell');
  });

  it('ignores merges across dimensions or with wrong sections', () => {
    const rubric = baseRubric();
    const items = collectReconcileItems(rubric);
    const out = applyReconciliation(rubric, items, {
      ...empty,
      merges: [
        { wentWellId: idOf(items, 'judgment', 'wentWell'), needsWorkId: idOf(items, 'synthesis', 'needsWork'), merged: 'cross' },
        { wentWellId: idOf(items, 'judgment', 'needsWork'), needsWorkId: idOf(items, 'judgment', 'wentWell'), merged: 'swapped' },
        { wentWellId: 999, needsWorkId: idOf(items, 'judgment', 'needsWork'), merged: 'unknown' },
      ],
    });
    expect(out.rubric).toEqual(rubric);
    expect(out.merges).toEqual([]);
  });

  it('never merges the same item twice', () => {
    const rubric = baseRubric();
    rubric.judgment.needsWork.push({ point: 'Second overlap.', quotes: [] });
    const items = collectReconcileItems(rubric);
    const ww = idOf(items, 'judgment', 'wentWell');
    const out = applyReconciliation(rubric, items, {
      ...empty,
      merges: [
        { wentWellId: ww, needsWorkId: idOf(items, 'judgment', 'needsWork', 0), merged: 'first' },
        { wentWellId: ww, needsWorkId: idOf(items, 'judgment', 'needsWork', 1), merged: 'second' },
      ],
    });
    expect(out.merges).toHaveLength(1);
    expect(out.rubric.judgment.needsWork.map(n => n.point)).toEqual(['first', 'Second overlap.']);
  });
});

describe('applyReconciliation — coverage-gap leaks (Rule 11)', () => {
  it('drops a needsWork / missedOpportunity that faults a gap assumption and adds the caveat if missing', () => {
    const rubric = baseRubric();
    const items = collectReconcileItems(rubric);
    const out = applyReconciliation(rubric, items, {
      ...empty,
      gapLeaks: [
        { id: idOf(items, 'synthesis', 'needsWork'), reason: 'rests on unprovided price data' },
        { id: idOf(items, 'synthesis', 'missedOpportunities'), reason: 'same' },
      ],
    });
    expect(out.rubric.synthesis.needsWork).toEqual([]);
    expect(out.rubric.synthesis.missedOpportunities).toEqual([]);
    expect(out.rubric.synthesis.coverageCaveat).toBe(GAP_COVERAGE_CAVEAT);
    expect(out.gapDrops).toHaveLength(2);
  });

  it('keeps an existing coverageCaveat rather than overwriting it', () => {
    const rubric = baseRubric();
    rubric.synthesis.coverageCaveat = 'Judge-written caveat.';
    const items = collectReconcileItems(rubric);
    const out = applyReconciliation(rubric, items, {
      ...empty, gapLeaks: [{ id: idOf(items, 'synthesis', 'needsWork'), reason: 'r' }],
    });
    expect(out.rubric.synthesis.coverageCaveat).toBe('Judge-written caveat.');
  });

  it('a gap-leak topFix falls back to the lowest-rated dimension\'s surviving needsWork point', () => {
    const rubric = baseRubric();
    rubric.topFix = 'Stop anchoring on the waste story.';
    const items = collectReconcileItems(rubric);
    const out = applyReconciliation(rubric, items, {
      ...empty,
      gapLeaks: [
        { id: idOf(items, 'topFix', 'topFix'), reason: 'r' },
        { id: idOf(items, 'synthesis', 'needsWork'), reason: 'r' },
      ],
    });
    // synthesis (needs_work) has nothing left, so the next surviving needsWork point wins
    expect(out.rubric.topFix).toBe('Did not surface the key risk of a price increase (elasticity / volume loss).');
  });

  it('can never drop a wentWell item', () => {
    const rubric = baseRubric();
    const items = collectReconcileItems(rubric);
    const out = applyReconciliation(rubric, items, {
      ...empty, gapLeaks: [{ id: idOf(items, 'judgment', 'wentWell'), reason: 'r' }],
    });
    expect(out.rubric.judgment.wentWell).toHaveLength(1);
    expect(out.gapDrops).toEqual([]);
  });
});

describe('applyReconciliation — cross-dimension repetition (log only)', () => {
  it('keeps entries naming 3+ valid dimensions, deduped; never changes the rubric', () => {
    const rubric = baseRubric();
    const items = collectReconcileItems(rubric);
    const out = applyReconciliation(rubric, items, {
      ...empty,
      crossDimension: [
        { concept: 'mix-vs-input-cost misdiagnosis', dimensions: ['dataExhibit', 'judgment', 'synthesis', 'judgment', 'bogus'] },
        { concept: 'only two', dimensions: ['judgment', 'synthesis'] },
      ],
    });
    expect(out.crossDimension).toEqual([
      { concept: 'mix-vs-input-cost misdiagnosis', dimensions: ['dataExhibit', 'judgment', 'synthesis'] },
    ]);
    expect(out.rubric).toEqual(rubric);
  });
});

describe('parseReconcileResponse', () => {
  it('parses a valid response and defaults missing arrays', () => {
    expect(parseReconcileResponse('{"merges":[{"wentWellId":1,"needsWorkId":2,"merged":"m"}]}')).toEqual({
      merges: [{ wentWellId: 1, needsWorkId: 2, merged: 'm' }], gapLeaks: [], crossDimension: [],
    });
  });

  it('extracts the JSON when the model reasons in prose first (live runs 58cb8061, db41a01e)', () => {
    // Abridged from the replayed raw output: prose analysis, then a fenced block.
    const raw = [
      'Looking for same-concept pairs within each dimension.',
      '',
      '**Structure:** Item 4 (missedOpp) is about competitive context/pricing power. Items 1-3 are about disaggregation. No same-concept match.',
      '',
      '**Cross-dimension repetition:** quantitative(8,9) + judgment(16) = 2 distinct dimensions. Need 3+.',
      '',
      'No pair is genuinely the same concept within a dimension.',
      '',
      '```json',
      '{"merges":[],"gapLeaks":[],"crossDimension":[]}',
      '```',
    ].join('\n');
    expect(parseReconcileResponse(raw)).toEqual(empty);
  });

  it('extracts a bare JSON object that follows prose, and accepts numeric-string ids', () => {
    const raw = 'One pair found.\n{"merges":[{"wentWellId":"3","needsWorkId":"4","merged":"m"}],"gapLeaks":[{"id":"7","reason":"r"}]}';
    expect(parseReconcileResponse(raw)).toEqual({
      merges: [{ wentWellId: 3, needsWorkId: 4, merged: 'm' }],
      gapLeaks: [{ id: 7, reason: 'r' }],
      crossDimension: [],
    });
  });

  it('strips code fences and returns null on garbage (fail open)', () => {
    expect(parseReconcileResponse('```json\n{}\n```')).toEqual(empty);
    expect(parseReconcileResponse('nope')).toBeNull();
    expect(parseReconcileResponse('{"merges":"bad"}')).toBeNull();
  });
});

describe('candidate reference rule (student-facing reports)', () => {
  it('forbids gendered pronouns for the candidate (live run eca39ec7: "his inability to weight beans")', () => {
    expect(CANDIDATE_REFERENCE_RULE).toMatch(/never/i);
    expect(CANDIDATE_REFERENCE_RULE).toMatch(/he\/him\/his/);
  });

  it('is included in the reconciliation prompt, whose merged statements are shown to students', () => {
    expect(buildReconcilePrompt(collectReconcileItems(baseRubric()), [])).toContain(CANDIDATE_REFERENCE_RULE);
  });
});

describe('buildReconcilePrompt', () => {
  const gap = { ledgerItemId: 'avg_ticket', label: 'Average transaction value', what: 'menu price history', turnIndex: 12 };

  it('lists properly refused not-in-case requests as NOT gaps, so fair critiques are not dropped', () => {
    const items = collectReconcileItems(baseRubric());
    const prompt = buildReconcilePrompt(items, [gap], [
      { what: 'itemized COGS breakdown', response: 'refuse', turnIndex: 5 },
    ]);
    const counter = prompt.split('NOT GAPS')[1];
    expect(counter).toBeDefined();
    expect(counter).toContain('itemized COGS breakdown');
    // The test for a leak is whether the critique would stand WITH the data.
    expect(prompt).toContain('would still stand');
  });

  it('never adds the gap task for not-in-case requests alone', () => {
    const items = collectReconcileItems(baseRubric());
    const prompt = buildReconcilePrompt(items, [], [{ what: 'store-level data', response: 'refuse', turnIndex: 1 }]);
    expect(prompt).not.toContain('REQUESTED BUT NEVER PROVIDED');
    expect(prompt).not.toContain('NOT GAPS');
  });

  it('includes the coverage-gap task only when gaps exist', () => {
    const items = collectReconcileItems(baseRubric());
    expect(buildReconcilePrompt(items, [])).not.toContain('REQUESTED BUT NEVER PROVIDED');
    const withGap = buildReconcilePrompt(items, [
      { ledgerItemId: 'avg_ticket', label: 'Average transaction value', what: 'menu price history', turnIndex: 12 },
    ]);
    expect(withGap).toContain('REQUESTED BUT NEVER PROVIDED');
    expect(withGap).toContain('Average transaction value');
    expect(withGap).toContain('menu price history');
  });
});
