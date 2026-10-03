import { describe, it, expect } from 'vitest';
import { checkVerifiedForTurn, checkRecomputeForTurn, isWorkShown, formatVerifiedHint } from '@/lib/orchestrator/recompute';
import { withholdProbesOnVerified } from '@/lib/orchestrator/probe-guard';
import { getCaseById } from '@/lib/cases/loader';

const steps = getCaseById('prof-001').mathSteps;
const BEANS_REVEALED = ['bean_share_of_cogs', 'cogs_pct', 'bean_price_change'];

// Batch-2 candidate turns (29–30 Sep) that were then doubt-probed.
const INES = "So two years ago beans were 25% of a 42% COGS line — that's 0.25 × 42 = 10.5% of revenue going to green coffee.";
const SAM = 'So two years ago beans were 25% of 42, about 10.5 points of revenue. If beans alone drove the whole 16 point increase, they\'d have to be at 26.5 points now.';
const MAYA = 'Okay so beans were 25% of COGS, and COGS was 42% of revenue, so beans were about 10.5% of revenue. Up 40% means they go to about 14.7%, so that\'s only about 4 points of revenue.';
const OMAR = 'Let me size that. Beans were 10.5% of revenue. A 40% price increase takes them to 10.5 × 1.4 = 14.7% of revenue.';
const YUKI = 'Okay, so let me put the number. Beans ten and a half points, up forty percent, becomes about fourteen point seven. So plus four point two points of revenue.';
const DEREK = 'So if beans are 25% of COGS, that\'s 25 points of margin exposure right there, which more than covers the sixteen points we\'ve lost.';

describe('verified figures (Rule 2 v4.5/v4.6)', () => {
  it('verifies 10.5 with the work shown for Ines, Sam and Maya', () => {
    for (const text of [INES, SAM, MAYA]) {
      const v = checkVerifiedForTurn(text, steps, BEANS_REVEALED).find(x => x.stepId === 'bean_share_of_revenue');
      expect(v, text).toMatchObject({ value: 10.5, workShown: true });
    }
  });

  it('verifies a bare 10.5 as work not shown (Omar)', () => {
    const v = checkVerifiedForTurn(OMAR, steps, BEANS_REVEALED).find(x => x.stepId === 'bean_share_of_revenue');
    expect(v).toMatchObject({ value: 10.5, workShown: false });
  });

  it('verifies worded figures (Yuki)', () => {
    const v = checkVerifiedForTurn(YUKI, steps, BEANS_REVEALED).find(x => x.stepId === 'bean_share_of_revenue');
    expect(v?.value).toBe(10.5);
  });

  it('verifies nothing when the inputs were never revealed', () => {
    expect(checkVerifiedForTurn(MAYA, steps, []).filter(v => v.stepId.startsWith('bean'))).toEqual([]);
  });

  it('verify-only steps never raise a mismatch flag (Derek\'s wrong 25 points)', () => {
    expect(checkRecomputeForTurn(DEREK, steps, BEANS_REVEALED).filter(f => f.stepId.startsWith('bean'))).toEqual([]);
  });

  it('naming inputs without the operation is not work shown', () => {
    expect(isWorkShown('Beans at 25 and COGS at 42. Beans are about 10.5 points.', 'Beans are about 10.5 points', [25, 42])).toBe(false);
    expect(isWorkShown('Beans are a quarter of 42, so about 10.5 points.', 'Beans are a quarter of 42, so about 10.5 points', [25, 42])).toBe(true);
  });

  it('the hint carries recompute_ok and work_shown, and bans doubt phrasing', () => {
    const v = checkVerifiedForTurn(MAYA, steps, BEANS_REVEALED);
    const hint = formatVerifiedHint(v, new Set());
    expect(hint).toMatch(/recompute_ok: 10\.5 verified .* work_shown: yes\. Do not probe it at all\./);
    expect(hint).toMatch(/never question them with doubt phrasing/);
  });
});

describe('probe withholding before send (Rule 2 v4.5)', () => {
  const verifiedMaya = checkVerifiedForTurn(MAYA, steps, BEANS_REVEALED);
  const verifiedOmar = checkVerifiedForTurn(OMAR, steps, BEANS_REVEALED);

  it('withholds the batch-2 doubt probes on verified figures', () => {
    const probes = [
      'Points of what — you said beans were ten and a half percent of revenue; walk me through where that lands versus the sixteen-point COGS move.',
      'Points of what — walk me through that 10.5 again.',
      'Walk me through that conversion once more — twenty-five percent of COGS, at COGS being forty-two percent of revenue, gives you what in points of revenue?',
    ];
    for (const p of probes) {
      const out = withholdProbesOnVerified(p, { verified: verifiedMaya, alreadyProbed: new Set(), flaggedThisTurn: false });
      expect(out.withheld, p).toHaveLength(1);
      expect(out.text).toBe('Go on.');
    }
  });

  it('withholds a doubt probe on a verified figure even when the work was not shown (Omar)', () => {
    const out = withholdProbesOnVerified('Beans were 25% of COGS — points of what, when you turned that into 10.5%?',
      { verified: verifiedOmar, alreadyProbed: new Set(), flaggedThisTurn: false });
    expect(out.withheld[0].test).toBe('doubt_on_verified');
  });

  it('allows one explain probe when the work was not shown, then withholds the second', () => {
    const first = withholdProbesOnVerified('Okay. How did you get to 10.5?', { verified: verifiedOmar, alreadyProbed: new Set(), flaggedThisTurn: false });
    expect(first.text).toBe('Okay. How did you get to 10.5?');
    expect(first.explainProbed).toEqual(['bean_share_of_revenue']);
    const second = withholdProbesOnVerified('Okay. How did you get to 10.5?', { verified: verifiedOmar, alreadyProbed: new Set(first.explainProbed), flaggedThisTurn: false });
    expect(second.withheld[0].test).toBe('explain_already_probed');
  });

  it('withholds an explain probe when the work was shown', () => {
    const out = withholdProbesOnVerified('Walk me through how you got 10.5.', { verified: verifiedMaya, alreadyProbed: new Set(), flaggedThisTurn: false });
    expect(out.withheld[0].test).toBe('explain_work_shown');
  });

  it('keeps a question that builds on a verified figure', () => {
    const t = 'Okay. Given 10.5 points, what does a 40% bean rise do to COGS?';
    expect(withholdProbesOnVerified(t, { verified: verifiedMaya, alreadyProbed: new Set(), flaggedThisTurn: false }).text).toBe(t);
  });

  it('keeps a doubt probe about an unverified figure (Derek)', () => {
    const t = "Hold on. You said beans are twenty-five percent of COGS, so twenty-five points of margin exposure. Points of what?";
    expect(withholdProbesOnVerified(t, { verified: [], alreadyProbed: new Set(), flaggedThisTurn: false }).text).toBe(t);
  });

  it('keeps a bare doubt when a recompute flag fired this turn (it may be about that)', () => {
    const t = 'Points of what?';
    expect(withholdProbesOnVerified(t, { verified: verifiedMaya, alreadyProbed: new Set(), flaggedThisTurn: true }).text).toBe(t);
  });
});

describe('verify-only non-bean steps (batch 5: Tobias)', () => {
  it("verifies Tobias's 31.5 × 1.375 = 43.3", () => {
    const v = checkVerifiedForTurn('Other inputs up 37.5%: 31.5 × 1.375 = 43.3 points of revenue.', steps, ['bean_share_of_cogs', 'cogs_pct', 'non_bean_input_change']);
    expect(v.find(x => x.stepId === 'non_bean_points_now')?.value).toBe(43.3);
  });
});
