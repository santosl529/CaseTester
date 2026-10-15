import { describe, it, expect } from 'vitest';
import { checkCandidateMath, formatVerifiedHint, verifiedForMessage, attemptKey } from '@/lib/orchestrator/recompute';
import { getCaseById } from '@/lib/cases/loader';

// Math checker step 1 (13 Oct): a figure is verified only when it is the
// quantity the sentence claims — never because a correct number appears
// somewhere in the sentence, and never by correct arithmetic alone. Batch 21's
// four stamps on wrong math (Sofia t16, Fiona t16, Marisol t8 and t10).
const prof = getCaseById('prof-001');
const ALL = ['cogs_pct', 'labor_pct', 'overhead_pct', 'bean_share_of_cogs', 'menu_price_change', 'bean_price_change', 'non_bean_input_change'];
const stamps = (text: string, ids = ALL) => verifiedForMessage(text, prof, ids);

describe('a stamp needs the claimed quantity, not an incidental number', () => {
  it("Sofia t16: the prompt's 24% margin, quoted as a target, verifies nothing", () => {
    const text = "16 over 58 is the COGS increase measured against the current COGS base — so about 27.6%. That's the price increase I'd put forward to fully absorb the inflation and restore the 24% margin, since you're scaling revenue up to cover the cost line that grew.";
    expect(stamps(text).filter(v => v.value === 24)).toEqual([]);
  });

  it('a case figure quoted back ("margin fell from 24% to 6%") is not a verified derivation', () => {
    expect(stamps('Margin fell 18 points, from 24% to 6%.').filter(v => v.value === 24 || v.value === 6)).toEqual([]);
  });

  it('Fiona t16: "10–12% on menu prices to restore margin" is not the other inputs\' 11.8 points ("rest" is not "restore")', () => {
    const text = 'Price is the big one — a 38% input increase on a 42-point cost base needs roughly 10–12% on menu prices to restore margin, and specialty coffee demand is relatively inelastic, especially with a loyal base.';
    expect(stamps(text).filter(v => v.stepId === 'non_bean_points_added')).toEqual([]);
  });

  it('a short cue is a word, not a prefix: "restore" is not "rest"', () => {
    expect(stamps("With prices flat, we'd need about 11.8% on menu prices to restore margin.").filter(v => v.stepId === 'non_bean_points_added')).toEqual([]);
  });

  it('Fiona t20: a range endpoint ("Brew & Bean should raise menu prices approximately 10–12%") verifies no step', () => {
    const text = 'My recommendation: Brew & Bean should raise menu prices approximately 10–12%, phased over two to three quarters, and simultaneously lock forward contracts on beans and dairy.';
    expect(stamps(text).filter(v => !v.stepId.startsWith('arith:'))).toEqual([]);
  });

  it("Marisol t8: today's COGS as the base — 0.75 × 58 = 43.5 is not the other inputs' 43.3 points today, and 25% × 58 is no verified conversion", () => {
    const text = "Now let me decompose it with the inputs you gave. Beans are 25% of COGS, so against the current 58, that's 0.25 × 58 = 14.5 points of revenue. Up 40% means those beans added 0.40 × 14.5 = 5.8 points.\n\nThe other inputs are the remaining 75%, so 0.75 × 58 = 43.5 points, up 37.5%, which adds 0.375 × 43.5 = 16.3 points.";
    const v = stamps(text);
    expect(v.filter(x => x.stepId === 'non_bean_points_now')).toEqual([]);
    expect(v.filter(x => x.stepId.startsWith('unit:'))).toEqual([]);
    // The arithmetic itself holds, and is stamped as arithmetic only.
    expect(v.filter(x => x.stepId.startsWith('arith:')).every(x => x.scope === 'arithmetic')).toBe(true);
  });

  it('Anika t22: a scenario margin far from its cue ("… profit is 5.6 on 88, about 6.4%") is not today\'s margin', () => {
    const text = 'But COGS is 58% of revenue, so margin per cup is thin — if we lose 20% of cups instead of 5%, revenue is 88, COGS falls to 46.4, labor and overhead stay at 36, profit is 5.6 on 88, about 6.4%.';
    expect(stamps(text).filter(v => v.stepId === 'profit_margin_now')).toEqual([]);
  });
});

describe('correct claims keep their stamps', () => {
  it.each([
    ['Tyler', 'Beans were 25% of that, so 0.25 × 42 = 10.5 points.', 'bean_share_of_revenue', 10.5, true],
    ['Raj', 'Beans were 25% of 42, so 10.5 points of revenue.', 'bean_share_of_revenue', 10.5, true],
    ['Noor', 'Beans up 40%: 10.5 times 1.4 is 14.7, so +4.2 points.', 'bean_points_added', 4.2, true],
    ['Anika', "So it's both, in similar proportion: non-bean inputs add ~11.8 points and beans add ~4.2 points.", 'non_bean_points_added', 11.8, false],
    ['Jasmine', 'Decomposing it, beans at 25% of COGS up 40% contribute 4.2 points, other inputs up 37.5% contribute 11.8 points — 16 points total.', 'non_bean_points_added', 11.8, false],
    ['Tobias', 'Other inputs: 31.5 × 1.375 = 43.3 points of revenue today.', 'non_bean_points_now', 43.3, true],
    ['Blake', 'Supporting moves: renegotiate or hedge bean and dairy contracts — beans alone are 40% up and about 4 points of the gap.', 'bean_points_added', 4, false],
    // Another derivation of the same quantity, from the same period.
    ['Tobias b18', 'Decomposing the 16-point rise: beans contribute 42 × 25% × 40% = 4.2 points; other inputs contribute 42 × 75% × 37.5% = 11.8 points.', 'non_bean_points_added', 11.8, false],
    ['Sofia b21', 'Non-beans: 31.5 times 37.5% is 11.8 points.', 'non_bean_points_added', 11.8, false],
    // A change, not a range.
    ['Adrian', 'Other inputs up 37.5% takes 31.5 to 43.3 points.', 'non_bean_points_now', 43.3, false],
    ['Destiny', 'And my earlier math showed beans went from about 10.5 points to 14.7, which is also about 40%.', 'bean_share_of_revenue', 10.5, false],
    // A prompt figure re-derived from its inputs.
    ['Ines b18', '2 years ago: COGS 42 + labor 22 + overhead 12 = 76% of revenue, leaving 24% margin.', 'profit_margin_prior', 24, false],
  ])('%s', (_who, text, stepId, value, workShown) => {
    expect(stamps(text)).toContainEqual(expect.objectContaining({ stepId, value, workShown, scope: 'claim' }));
  });

  it("a flag elsewhere in the message doesn't unstamp an unrelated figure of the same value (Derek: 16 plus 2 is 18; dairy's 18 points flagged)", () => {
    const text = "COGS up 16 points, overhead up 2. 16 plus 2 is 18 points, and margin fell from 24% to 6%, which is exactly 18 points. Same logic on dairy: if dairy is 18% of COGS, that's 18 points of margin exposure.";
    const m = checkCandidateMath(text, prof, ALL);
    expect(m.flags.some(f => f.candidateValue === 18)).toBe(true);
    expect(m.verified).toContainEqual(expect.objectContaining({ stepId: 'arith:16 + 2', value: 18 }));
  });

  it('a conversion at a base of its own period is verified (25% of COGS two years ago, COGS 42%)', () => {
    const v = stamps('Beans were 25% of COGS two years ago, and COGS was 42% of revenue, so beans were 10.5 points of revenue.');
    expect(v.some(x => x.value === 10.5)).toBe(true);
  });
});

describe('correct arithmetic does not verify the claim it supports', () => {
  const marisol = "To recover the 18 points of lost margin on a revenue base that's 15% bigger, I'd need a price increase of roughly 18 / 1.15 = 15.7%, call it 16% across the menu.";

  it('Marisol t10: a figure a check flags wrong is never also stamped', () => {
    const m = checkCandidateMath(marisol, prof, ALL);
    expect(m.flags.some(f => f.candidateValue === 16)).toBe(true);
    // Nor the arithmetic behind it (18 / 1.15 = 15.7 holds; the method doesn't).
    expect(m.verified).toEqual([]);
  });

  it('an arithmetic stamp says the operation holds — it never tells the model the claim is verified or not to probe it', () => {
    const v = stamps('Margin is 21 over 115, which is 18.3%.');
    expect(v).toContainEqual(expect.objectContaining({ value: 18.3, scope: 'arithmetic' }));
    const hint = formatVerifiedHint(v, new Set());
    expect(hint).toMatch(/21 \/ 115 = 18\.3/);
    expect(hint).toMatch(/operation/i);
    expect(hint).not.toMatch(/Do not probe it at all/);
    expect(hint).not.toMatch(/recompute_ok: 18\.3/);
  });

  it('a claim-level stamp keeps the old line', () => {
    const v = stamps('Beans were 25% of 42, so 10.5 points of revenue.');
    expect(formatVerifiedHint(v, new Set())).toMatch(/recompute_ok: 10\.5 verified .*Do not probe it at all/);
  });

  it('the judge reads stated arithmetic as the operation only, not a verified claim', async () => {
    const { verifyCandidateTurns, formatClaimChecksSection } = await import('@/lib/scoring/challenge-marks');
    const turns = [{ role: 'candidate', turnIndex: 1, text: 'Margin is 21 over 115, which is 18.3%.' }];
    const section = formatClaimChecksSection(verifyCandidateTurns(turns, prof, () => ALL));
    expect(section).toMatch(/ARITHMETIC HOLDS \(21 \/ 115 = 18\.3/);
    expect(section).not.toMatch(/18\.3%\." — VERIFIED CORRECT/);
  });
});

// Lorenzo, 15 Oct (batch-27 grade): Marisol t8's 14.5 is right on her own base — no flag, no correction, nothing for the judge to mark wrong.
describe('a share on another year\'s base (Marisol t8) is no flag: nothing to correct, nothing marked wrong', () => {
  const marisol = "Beans are 25% of COGS, so against the current 58, that's 0.25 × 58 = 14.5 points of revenue.";
  it('no flag in the shared checks; a period question instead', () => {
    const m = checkCandidateMath(marisol, prof, ALL);
    expect(m.flags.filter(x => x.kind === 'unit')).toEqual([]);
    expect(m.units.periodQuestions).toEqual([expect.objectContaining({ stated: 14.5, baseValue: 58 })]);
  });
  it('the judge is not told it is wrong', async () => {
    const { verifyCandidateTurns, formatClaimChecksSection } = await import('@/lib/scoring/challenge-marks');
    const section = formatClaimChecksSection(verifyCandidateTurns([{ role: 'candidate', turnIndex: 1, text: marisol }], prof, () => ALL));
    expect(section).not.toMatch(/— VERIFIED WRONG/);
    expect(section).toMatch(/ARITHMETIC HOLDS \(0\.25 × 58 = 14\.5/);
  });
});

describe('a break-even range (Tyler b21 t12) keeps both ends in what the interviewer says', () => {
  it('the probe quotes "7–8", not 7 (no code correction past it — Lorenzo, 13 Oct)', async () => {
    const { recMathLine, formatRecomputeHint } = await import('@/lib/orchestrator/recompute');
    const text = "The key risk is volume loss — with a 10% price increase we can afford to lose maybe 7–8% of volume before we're worse off.";
    const f = checkCandidateMath(text, prof, ALL).flags.find(x => x.stepId === 'pricing:breakeven')!;
    expect(f).toBeDefined();
    expect(recMathLine(f, 'probe')).toContain('a 10% price rise breaks even at a 7–8% volume loss');
    expect(formatRecomputeHint([f]).hint).toContain('a 10% price rise breaks even at a 7–8% volume loss');
    expect(formatRecomputeHint([f], { attempts: { [attemptKey(f)]: 2 } }).hint).toBe('');
  });
});
