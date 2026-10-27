// Post-wave item 3, Lorenzo's ruling of 26 Oct (evening): `misquoteSameTurn` is approved, but only on an ATTRIBUTED
// quote — "you said X", "you gave me X", "the exhibit says X" and equivalents — with a same-message withdrawal check.
// The unrestricted form added 45 correction sentences across the 31 slices, two of them provably false (b34a
// a1133734 t31 and b38l 701443f7 t17, both correcting a candidate on his own correct arithmetic). Neither is
// attributed, so the restriction is what makes the switch safe to put in the preset.
import { describe, it, expect } from 'vitest';
import { isAttributedQuote, sameTurnCorrections } from '@/lib/orchestrator/misquote';
import { findWithdrawals } from '@/lib/orchestrator/worksheet';

describe('isAttributedQuote — the candidate says whose figure it is', () => {
  // The two batch-39 aldermoor p64 4df38465 findings, verbatim from the run's `misquote` check.
  it.each([
    ["Prevalence you gave me is 1.5%, so 260 million × 1.5% = 3.9 million people with Corlan's disease.", 'you gave me is 1.5%'],
    ["You said Nimbrel's net price is about $9,400 per patient per year.", 'is about $9,400'],
    ['The exhibit says packaging is $0.35 a bag.', 'is $0.35'],
    ['You gave us a 1.5% prevalence.', '1.5%'],
    ['According to the exhibit, Port Avery revenue was $44 million.', '$44 million'],
    ['Per the table, breakeven load factor is 68%.', '68%'],
    ['We were given fixed costs of $21M.', '$21M'],
    ['You mentioned the net price is $9,400.', '$9,400'],
  ])('attributed: %s', (sentence, cited) => {
    expect(isAttributedQuote(sentence, cited)).toBe(true);
  });

  // The two provably false corrections of the unrestricted form, verbatim.
  it.each([
    ['$320M less $80M in annual selling costs is $240M to Aldermoor, versus $120M from Option B’s 30% royalty on $400M.', '$240M'],
    ['Breakeven revenue per passenger is $11,000/60 = $183, so a $163 fare.', '$183'],
    ['Breakeven revenue per passenger is $11,000/60 = $183, so a $163 fare.', '$163'],
    ['Variable costs: ingredients $0.70, packaging $0.35, roasting labor and energy $0.30, freight $0.20.', '$0.35'],
    ['I’ll assume $9,400.', '$9,400'],
    ['So contribution is $1.45 a bag.', '$1.45'],
  ])('not attributed: %s (%s)', (sentence, cited) => {
    expect(isAttributedQuote(sentence, cited)).toBe(false);
  });

  it('the attribution has to come at or before the quote, not after it in another clause', () => {
    // "…is $240M to Aldermoor; you said the hurdle is $300M" attributes the HURDLE, not the $240M.
    expect(isAttributedQuote('That is $240M to Aldermoor; you said the hurdle is $300M.', '$240M')).toBe(false);
    expect(isAttributedQuote('That is $240M to Aldermoor; you said the hurdle is $300M.', 'is $300M')).toBe(true);
  });
});

describe('sameTurnCorrections — what corrects on the misquote\'s own turn', () => {
  const F = (cited: string, sentence: string) => ({ cited, sentence });

  it('an attributed quote is taken', () => {
    const found = [F('is about $9,400', "You said Nimbrel's net price is about $9,400 per patient per year.")];
    const r = sameTurnCorrections(found, []);
    expect(r.take).toHaveLength(1);
    expect(r.skipped).toEqual([]);
  });

  it('an unattributed one is skipped, with the reason', () => {
    const found = [F('$183', 'Breakeven revenue per passenger is $11,000/60 = $183, so a $163 fare.')];
    const r = sameTurnCorrections(found, []);
    expect(r.take).toEqual([]);
    expect(r.skipped).toEqual([{ cited: '$183', why: 'unattributed' }]);
  });

  it('a figure the candidate withdraws in the SAME message says nothing', () => {
    const text = "You said packaging is $0.35 a bag. Actually, re-reading it, the exhibit says $0.30 for packaging, not $0.35 — my mistake.";
    const found = [F('is $0.35', 'You said packaging is $0.35 a bag.')];
    const r = sameTurnCorrections(found, findWithdrawals(text));
    expect(r.take).toEqual([]);
    expect(r.skipped).toEqual([{ cited: 'is $0.35', why: 'withdrawn_same_message' }]);
  });

  it('an unrelated withdrawal in the same message does not excuse the quote', () => {
    const text = "You said Nimbrel's net price is about $9,400 per patient per year. On share I'd said 25% earlier, not 20%.";
    const found = [F('is about $9,400', "You said Nimbrel's net price is about $9,400 per patient per year.")];
    expect(sameTurnCorrections(found, findWithdrawals(text)).take).toHaveLength(1);
  });

  it('the withdrawal check reads the figure, not the words: "scratch that" after the quote also withdraws it', () => {
    const text = 'You said fixed costs were $21M — scratch that.';
    const found = [F('were $21M', 'You said fixed costs were $21M.')];
    expect(sameTurnCorrections(found, findWithdrawals(text)).take).toEqual([]);
  });
});
