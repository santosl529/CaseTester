import { describe, it, expect } from 'vitest';
import { settlePendingData } from '@/lib/orchestrator/pending-data';

// The question is spoken after code's data line: on a turn that delivered
// data, wording that treats it as still to come is rewritten or dropped.
// Lines from batch 19 (Haiku 5.5), read by hand (12 Oct).
const delivered = { deliveredThisTurn: true, heldWhats: [], releasedTexts: ['Raw coffee bean costs are up 40% over the past two years.'] };

describe('settlePendingData', () => {
  it.each([
    ['Once you have those two figures, how much of the COGS increase do they explain, and what is left over?',
      'With those two figures, how much of the COGS increase do they explain, and what is left over?'],
    ['Before those figures come in, how did you get to the $77M, and is that the margin problem?',
      'How did you get to the $77M, and is that the margin problem?'],
    ['Before we get into the data: what result would break this structure?',
      'What result would break this structure?'],
    ['Once you have the breakdown in front of you, which cost line accounts for most of the 18-point margin drop, and how did you get there?',
      'With the breakdown in front of you, which cost line accounts for most of the 18-point margin drop, and how did you get there?'],
    ['Before those numbers land, you\'re treating the $103M COGS increase as the margin problem. What else could explain it?',
      'You\'re treating the $103M COGS increase as the margin problem. What else could explain it?'],
    ['Walk me through how you would split that 15% into new-store and same-store contributions once you have the store count in hand.',
      'Walk me through how you would split that 15% into new-store and same-store contributions with the store count in hand.'],
    ['What does the bean price change you\'re about to hear imply for that, and what would you need to know about the rest of COGS?',
      'What does the bean price change you just heard imply for that, and what would you need to know about the rest of COGS?'],
    ['Menu prices are on their way. Before we see them, if beans explain only about a quarter of the gap, what does the rest reflect?',
      'If beans explain only about a quarter of the gap, what does the rest reflect?'],
    ['Average transaction value and the cost structure are coming up now. Before you read them, which cost line do you expect to explain most of the rise, and why?',
      'Which cost line do you expect to explain most of the rise, and why?'],
    ['Once you have both, which input is pushing COGS up?', 'With both, which input is pushing COGS up?'],
    ['Once you have the non-bean input change, what does it say about how much of the gap is beans?',
      'With the non-bean input change, what does it say about how much of the gap is beans?'],
    ['Once you\'ve read those figures, which cost line would you dig into first?', 'With those figures, which cost line would you dig into first?'],
    ['Before we look at those numbers, what would you expect to see for COGS and labor?', 'What would you expect to see for COGS and labor?'],
  ])('rewrites: %s', (from, to) => {
    const r = settlePendingData(from, delivered);
    expect(r.question).toBe(to);
    expect(r.changes.length).toBeGreaterThan(0);
  });

  it('drops a sentence it cannot rewrite; with no question left the caller supplies one (null)', () => {
    const r = settlePendingData('You said COGS and labor are typically around 30% of revenue — the cost breakdown is coming up now, so check your priors against it.', delivered);
    expect(r.question).toBeNull();
    expect(r.changes).toEqual([{ from: expect.stringContaining('coming up now'), to: null }]);
  });

  it('"Before those figures, …" and "Before we get to store counts, …" drop the clause (batch 20 R12 t10, R44 t4)', () => {
    expect(settlePendingData('Before those figures, walk me through how you got to nearly 90 percent of the margin loss from COGS.', delivered).question)
      .toBe('Walk me through how you got to nearly 90 percent of the margin loss from COGS.');
    const stores = { deliveredThisTurn: true, heldWhats: [], releasedTexts: ['200 stores today — and it was 200 stores two years ago, so the footprint hasn\u2019t changed.'] };
    expect(settlePendingData('Before we get to store counts, how would you rank these below-the-line items?', stores).question)
      .toBe('How would you rank these below-the-line items?');
  });
  it('leaves the question alone on a turn that delivered nothing', () => {
    const q = 'Once you have those figures, which line do you look at first?';
    expect(settlePendingData(q, { ...delivered, deliveredThisTurn: false })).toEqual({ question: q, changes: [] });
  });

  it('keeps wording about data that is really still to come (a held item it names)', () => {
    const q = 'Once you have the menu price history, what would you check first?';
    const r = settlePendingData(q, { deliveredThisTurn: true, heldWhats: ['menu price changes over two years'], releasedTexts: ['Coffee beans were 25% of COGS two years ago.'] });
    expect(r).toEqual({ question: q, changes: [] });
  });

  it.each([
    'With those figures in hand, what is driving the revenue growth?',
    'Before we go further, you said COGS moved 19 points and that accounts for the entire 18-point decline. Walk me through that.',
    'Before you rely on that as the driver, what would you need to know about the other COGS inputs, and why?',
    'Before we use that weighted figure: your 10% and 28.1% are shares of what, exactly?',
    'Once you have a number, how would you size the fix?',
  ])('leaves wording that is not about pending data: %s', q => {
    expect(settlePendingData(q, delivered)).toEqual({ question: q, changes: [] });
  });
});
