import { describe, it, expect } from 'vitest';
import { applyConclusionMandate } from '@/lib/scoring/conclusion-mandate';
import { applyStageCaps } from '@/lib/scoring/stage-caps';
import { auditEvidence } from '@/lib/scoring/evidence-audit';
import type { MandatedClaim } from '@/lib/scoring/checker-record';
import type { RubricScores, DimensionFeedback } from '@/lib/scoring/judge';
import { INITIAL_STAGES } from '@/lib/orchestrator/stage-evidence';

const dim = (over: Partial<DimensionFeedback> = {}): DimensionFeedback => ({
  rating: 'meets_bar', wentWell: [], needsWork: [], missedOpportunities: [], ...over,
});
const rubric = (over: Partial<RubricScores> = {}): RubricScores => ({
  structure: dim(), quantitative: dim(), dataExhibit: dim(), judgment: dim(), creativity: dim(),
  synthesis: dim(), communication: dim(), pushback: dim(), overallRating: 'meets_bar', topFix: 'x', ...over,
});

// larkspur p57 `69441a66` t30, the case item 4 was raised about.
const SPAN = 'What closes the gap is the $1.8M we stop losing on the exited routes, plus the $5.4M fare uplift on the four healthy routes — call it $7.0M of operating profit';
const REC = `Recommendation: exit Lakeport and Port Avery. ${SPAN}.`;
const claim = (over: Partial<MandatedClaim> = {}): MandatedClaim => ({
  id: '29:2', turn: 29, span: SPAN, candidateValue: '$7.0M', figure: '5.2', byCode: true, ...over,
});

describe('the conclusion mandate (Lorenzo, 27 Oct): every open claim that changes the conclusion is named', () => {
  it('names a code-escalated claim in synthesis, quoting the span, when the judge named nothing', () => {
    const out = applyConclusionMandate(rubric(), [claim()], [REC]);
    expect(out.added).toEqual([{ dimension: 'synthesis', claim: '29:2' }]);
    const item = out.rubric.synthesis.needsWork.at(-1)!;
    expect(item.point).toContain('$7.0M');
    expect(item.point).toContain('5.2');
    expect(item.quotes).toEqual([SPAN]);
  });

  it('a claim the model marked (not the recommendation turn) is named on the quantitative dimension', () => {
    const out = applyConclusionMandate(rubric(), [claim({ byCode: false })], [REC]);
    expect(out.added).toEqual([{ dimension: 'quantitative', claim: '29:2' }]);
  });

  it('adds nothing when a needsWork item already names the right figure', () => {
    const r = rubric({ quantitative: dim({ needsWork: [{ point: 'The $7.0M bottom line is about $5.2M once the $1.8M is not double-counted.', quotes: [] }] }) });
    const out = applyConclusionMandate(r, [claim()], [REC]);
    expect(out.added).toEqual([]);
    expect(out.rubric).toEqual(r);
  });

  it('adds nothing when a needsWork item already quotes the claim', () => {
    const r = rubric({ judgment: dim({ needsWork: [{ point: 'The closing arithmetic does not hold.', quotes: [SPAN] }] }) });
    expect(applyConclusionMandate(r, [claim()], [REC]).added).toEqual([]);
  });

  // A strength naming the same figure is not the report naming the error.
  it('a wentWell item naming the figure does not satisfy the mandate', () => {
    const r = rubric({ synthesis: dim({ wentWell: [{ point: 'Closed on a quantified $7.0M bottom line.', quotes: [SPAN] }] }) });
    expect(applyConclusionMandate(r, [claim()], [REC]).added).toEqual([{ dimension: 'synthesis', claim: '29:2' }]);
  });

  it('a span the candidate turns do not hold is named without a quote, never with a fabricated one', () => {
    const out = applyConclusionMandate(rubric(), [claim()], ['Nothing like it was ever said.']);
    expect(out.rubric.synthesis.needsWork.at(-1)!.quotes).toEqual([]);
    expect(out.added).toHaveLength(1);
  });

  it('a claim with no right figure is still named, without inventing one', () => {
    const out = applyConclusionMandate(rubric(), [claim({ figure: null })], [REC]);
    const item = out.rubric.synthesis.needsWork.at(-1)!;
    expect(item.point).toContain('$7.0M');
    expect(item.point).not.toMatch(/about (null|undefined)/);
  });

  it('at most three items, in the order the claims come', () => {
    const claims: MandatedClaim[] = [claim(), claim({ id: '27:1', turn: 27, span: 'a', candidateValue: '$1', figure: '2' }), claim({ id: '25:0', turn: 25, span: 'b', candidateValue: '$3', figure: '4', byCode: false })];
    const out = applyConclusionMandate(rubric(), claims, [REC]);
    expect(out.added.map(a => a.claim)).toEqual(['29:2', '27:1', '25:0']);
  });

  // §12's third conflict: a dimension the judge itself left unassessed has nowhere to put the item.
  it('a notAssessed target dimension sends the item to the first dimension that was assessed', () => {
    const r = rubric({ synthesis: dim({ notAssessed: true, coverageCaveat: 'never reached' }) });
    const out = applyConclusionMandate(r, [claim()], [REC]);
    expect(out.added).toEqual([{ dimension: 'quantitative', claim: '29:2' }]);
    expect(out.rubric.synthesis.notAssessed).toBe(true);
  });

  it('with every candidate dimension unassessed, the item lands on the target and the flag goes', () => {
    const r = rubric({
      synthesis: dim({ notAssessed: true, coverageCaveat: 'never reached' }),
      quantitative: dim({ notAssessed: true }), judgment: dim({ notAssessed: true }),
    });
    const out = applyConclusionMandate(r, [claim()], [REC]);
    expect(out.added).toEqual([{ dimension: 'synthesis', claim: '29:2' }]);
    expect(out.rubric.synthesis.notAssessed).toBeUndefined();
    expect(out.rubric.synthesis.coverageCaveat).toBe('never reached');
  });
});

describe('the mandate against the three passes that fight it (§12)', () => {
  // 1. The evidence-quote audit: the mandate runs after it, and its quote is the span, verified in code first.
  it('the audit would have kept the item it writes', () => {
    const out = applyConclusionMandate(rubric(), [claim()], [REC]);
    const audited = auditEvidence(out.rubric, [REC]);
    expect(audited.violations).toEqual([]);
    expect(audited.droppedPoints).toEqual([]);
    expect(audited.rubric.synthesis.needsWork).toHaveLength(1);
  });

  // 3. The stage caps: the quoted item is real evidence, so the dimension is caveated, not notAssessed.
  it('the stage cap caveats the dimension instead of marking it not assessed', () => {
    const claims = [claim()];
    const bare = applyStageCaps(rubric(), INITIAL_STAGES, { partial: false });
    expect(bare.notAssessed).toContain('synthesis');
    const withMandate = applyStageCaps(applyConclusionMandate(rubric(), claims, [REC]).rubric, INITIAL_STAGES, { partial: false });
    expect(withMandate.notAssessed).not.toContain('synthesis');
    expect(withMandate.caveated).toContain('synthesis');
    expect(withMandate.rubric.synthesis.needsWork).toHaveLength(1);
  });
});
