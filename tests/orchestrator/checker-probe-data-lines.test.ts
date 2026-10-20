// Round 5 Task 45 fix round 2 (controller, 20 Oct; replay r5-45b vs r5-44c, b35
// Hollis Bay Marisol a14ca044): Task 45 made t24 restate the sampling line ("As the
// exhibit shows: … costing $1.5 million … 500,000 extra buying households … each
// buying 3 bags …") beside the turn's question. The checker counted that as a
// probe of her t23 "three times the spend returned" claim (figures 3 / 1.5), so
// at t25 23:1 was on attempt 2 — "unresolved … left for the report" — instead of
// the probe B2 heard. A probe is the interviewer's own words: code's data lines
// (releases, restates, refusals, deferrals, the exhibit handover) never count.
import { describe, it, expect } from 'vitest';
import { planCheckerFlags, interviewerOwnWords } from '@/lib/orchestrator/math-checker-live';
import { getCaseById } from '@/lib/cases/loader';
import VERDICT_T23 from './fixtures/b35h-marisol-t23-verdict.json';

const caseData = getCaseById('launch-001');
const values = caseData.dataLedger.map(i => i.value);
// Marisol t23 and t25 verbatim (live run); t24 as the r5-45b replay said it.
const T23 = "Sampling pays for itself. 500,000 extra households at 3 bags each is 1.5 million incremental bags. At $3.00 a bag that's $4.5 million of revenue against a $1.5 million program cost — three times the spend returned.\n\nCost per incremental household is $1.5 million over 500,000, or $3.00 a household, which is exactly one bag's worth of price to acquire a three-bag buyer. That's a clean payback.\n\nIt also hits the right objection. Taste was 45%, the largest hesitation, and tasting tables are the only lever that directly answers it, so I'd believe these numbers more than I'd believe a coupon's.\n\nStacking it on the base case: 9.0 million bags plus 1.5 million is 10.5 million bags, revenue $31.5 million. Fixed costs go from $9.0 million to $10.5 million with the program, so break-even volume rises to $10.5 million over $1.50 = 7.0 million bags. We'd be at 10.5 million against 7.0 million — the cushion widens to 3.5 million bags.\n\nDo we know whether sampling households repeat at a different rate than general trial?";
const T24 = "Understood. As the exhibit shows: The sampling proposal is staffed tasting tables in 500 stores over 10 weekends at launch, costing $1.5 million, and it is expected to bring 500,000 extra buying households in year one, each buying 3 bags, on top of the survey-based forecast; the cost is in addition to the launch costs. The CEO needs an answer. Should Hollis Bay launch the chickpea line, and what should it do to make the launch a success?";
const T25 = "Yes — Hollis Bay should launch, with the sampling program included.\n\nThe economics clear the board's gate. Contribution is $1.50 a bag on a $3.00 price. With the sampling program, first-year fixed costs are $10.5 million, so break-even is 7.0 million bags. The survey-based forecast is 9.0 million bags of base demand plus 1.5 million incremental from sampling, so 10.5 million bags — $31.5 million of revenue and about $5.25 million of year-one profit. Volume can come in a third below forecast and we still break even.\n\nThree things to make it work. One, fund the sampling fully — taste is the 45% objection and it's the only lever that answers it. Two, merchandise it in the better-for-you set, not beside our chips, leading with the protein claim at 52%. Three, hold the $3.00 price; only 22% called price a barrier, and discounting eats a $1.50 contribution fast.\n\nRisks: stated intent overstates, the 3-bags assumption is really a repeat assumption, and chip cannibalization.\n\nNext steps: pin down repeat rate and chip margin to size cannibalization.";
const REVEALED = ["bag_price", "variable_costs", "launch_costs", "recipe_cost", "longer_term_goals", "retailer_support", "purchase_intent", "liked_most", "hesitations", "survey_design", "planning_assumptions", "survey_reliability", "sampling_program"];
const plan = (t24: string) => planCheckerFlags({
  rows: [VERDICT_T23] as never, handled: [], turnRows: [{ turnIndex: 23, role: 'candidate', text: T23 }, { turnIndex: 24, role: 'interviewer', text: t24 }],
  candidateText: T25, candidateTurnIndex: 25, currentFlags: [], attempts: {}, underTimePressure: false, candidateFigures: [], caseData, revealedIds: REVEALED,
});

describe('code\'s data lines are not the interviewer probing a claim', () => {
  it('Marisol t24/t25: the restated sampling line beside the question is no probe — 23:1 is probed at t25 (attempt 1)', () => {
    const p = plan(T24);
    expect(p.selected).toMatchObject({ id: '23:1', action: 'probe', attempt: 1 });
    expect(p.decisions).toContainEqual(expect.objectContaining({ id: '23:1', outcome: 'probe' }));
    expect(p.decisions).not.toContainEqual(expect.objectContaining({ id: '23:1', outcome: 'unresolved' }));
  });
  it('the interviewer\'s own words still count: the model asking about her 3x makes t25 the second attempt', () => {
    const p = plan(`${T24} Walk me through how you got three times the spend returned.`);
    expect(p.selected?.id === '23:1' && p.selected.attempt === 1).toBe(false);
  });
  it('interviewerOwnWords keeps the model\'s sentences and drops the data line and its lead-in', () => {
    expect(interviewerOwnWords(T24, values)).toBe('Understood. The CEO needs an answer. Should Hollis Bay launch the chickpea line, and what should it do to make the launch a success?');
    expect(interviewerOwnWords("I don't have the one-off cost of the sampling, separate from the $1.5 million. What would you do next?", values)).toBe('What would you do next?');
    expect(interviewerOwnWords("That's for a little later — we'll come back to repeat rate for sampled households.", values)).toBe('');
  });
});
