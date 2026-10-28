// Lorenzo, 20 Oct (E6): each figure is bound to the quantity phrase it modifies —
// the noun phrase right after it or right before it. Sentences verbatim from the runs.
import { describe, it, expect } from 'vitest';
import { boundFigures } from '@/lib/orchestrator/figure-binding';

const bound = (text: string) => boundFigures(text).map(f => [f.value, f.phrase, f.operand ? 'operand' : f.pronoun ? 'pronoun' : ''] as const);
const at = (text: string, value: number) => boundFigures(text).filter(f => f.value === value);

describe('the phrase after the figure', () => {
  it('Quillpath Marisol t31: "$900 of CAC saved on 600 customers" — 600 is customers, $900 is CAC', () => {
    const t = "Two, the CFO's test understates Starter because it ignores upgrades: 20% of the cohort is on Pro by month 12, acquired for $300 instead of $1,200, which is $900 of CAC saved on 600 customers from one quarter's cohort, about $540,000.";
    expect(at(t, 600)[0].phrase).toBe("customers from one quarter's cohort");   // the head noun: customers
    expect(at(t, 900)[0].phrase).toBe('CAC saved');
  });
  it('Hollis Bay Tyler t13: "about $4.5 million of first-year profit"; "$9.0 million of first-year launch costs"', () => {
    const t = "Against $9.0 million of first-year launch costs, that's about $4.5 million of first-year profit — so it clears the board's breakeven test, and breakeven volume of 6.0 million bags is a third below the 9.0 million estimate.";
    expect(bound(t).slice(0, 3)).toEqual([[9, 'first-year launch costs', ''], [4.5, 'first-year profit', ''], [6, 'bags', '']]);
  });
  it('Quillpath Marisol t31: "$900 LTV against $300 CAC"', () => {
    const t = "One, on corrected economics Starter clears the board's bar — $30 margin × 30 months = $900 LTV against $300 CAC, exactly 3.0x, and Pro is at $4,000 / $1,200 = 3.3x.";
    expect(at(t, 900)[0].phrase).toBe('LTV');
    expect(at(t, 300)[0].phrase).toBe('CAC');
  });
});

describe('the phrase before the figure, read back over arithmetic and linking words', () => {
  it('Hollis Bay Tyler t11: "fixed costs $3.0 + $4.5 + $1.5 = $9.0 million" — the sum is fixed costs, its parts operands', () => {
    const t = 'That makes fixed costs $3.0 + $4.5 + $1.5 = $9.0 million, and breakeven volume $9.0 million / $1.50 = 6.0 million bags.';
    expect(bound(t)).toEqual([[3, '', 'operand'], [4.5, '', 'operand'], [1.5, '', 'operand'], [9, 'fixed costs', ''], [9, '', 'operand'], [1.5, '', 'operand'], [6, 'bags', '']]);
  });
  it('Quillpath Tyler t29: "LTV $50 / 0.074 ≈ $676"; "the upgrade stream 0.20 × $4,000 = $800"', () => {
    const t = 'Test arm, $60: Starter margin $50, so LTV $50 / 0.074 ≈ $676, plus the upgrade stream 0.20 × $4,000 = $800, giving $1,476; less $300 CAC = $1,176 net per signup.';
    expect(at(t, 676)[0].phrase).toBe('LTV');
    expect(at(t, 0.2)[0]).toMatchObject({ operand: true, phrase: '' });
    expect(at(t, 800)[0].phrase).toBe('upgrade stream');
    expect(at(t, 1476)[0].phrase).toBe('');
  });
  it('b33 Marisol t17: "The remaining gap to 24% is about 8 points"', () => {
    expect(at('The remaining gap to 24% is about 8 points, which would have to come from the other inputs — up 37.5% — plus the 2 points overhead drifted, 12 to 14.', 8)[0].phrase).toBe('remaining gap');
  });
  it('b32 Larkspur Marisol t19: "8,000 flights × 60 passengers × $10 = $4.8M" — $10 is an operand', () => {
    const t = 'Getting that to $30 on the four stable routes is 8,000 flights × 60 passengers × $10 = $4.8M.';
    expect(at(t, 10)[0]).toMatchObject({ operand: true });
    expect(at(t, 8000)[0].phrase).toBe('flights');
  });
  it('Jordan 6bd9edf3 t21: "COGS 16 points plus overhead 2 points equals 18" — an operand\'s label is part of the chain', () => {
    expect(at('And the relation is actually clean: COGS 16 points plus overhead 2 points equals 18, labor flat at zero.', 18)[0].phrase).toBe('COGS');
  });
  it('round-4 fixtures: "the margin gain is really 8.5"; "labor dollars grew 15%"; "Total input-driven increase: 4.2 plus 11.8 is 16.0 points"', () => {
    expect(at('On a flat cost base the margin gain is really 8.5 to 10 points.', 8.5)[0].phrase).toBe('margin gain');
    expect(at('Let me redo it: labor dollars grew 15% too, in line with revenue.', 15)[0].phrase).toBe('labor dollars');
    expect(at('Let me redo it. Total input-driven increase: 4.2 plus 11.8 is 16.0 points.', 16)[0].phrase).toBe('Total input-driven increase');
  });
  it('a figure with no phrase: "It comes to 8.5."; "roughly 4x, clearing the 3x bar"', () => {
    expect(at('Let me redo it. It comes to 8.5.', 8.5)[0]).toMatchObject({ phrase: '', pronoun: true });
    expect(at('about $1,205 of value per signup against a $300 CAC, roughly 4x, clearing the 3x bar.', 4)[0]).toMatchObject({ phrase: '', pronoun: false, operand: false });
  });
});

describe('a pronoun refers back', () => {
  it('Aldermoor Tyler t13: "The $225 million was built on … it should be 40,000 × $6,000 = $240 million" — "it" leads back to the $225 million', () => {
    const t = 'The $225 million was built on my old patient count — 37,500 × $6,000. With the corrected funnel it should be 40,000 × $6,000 = $240 million.';
    const f = at(t, 240)[0];
    expect(f.pronoun).toBe(true);
    expect(f.lead).toContain('$225 million');
  });
});
