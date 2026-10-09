// Code-written turns answer only asks addressed to the interviewer
// (request-signal.ts addressedAskSentences / matchAskDetections). Smoke fix B,
// round 1: guard B's cue list was the wrong discriminator at the close — its
// "I'd want/need…" cue let goodbye data-dumps through (Jordan 15ad9d8e t25,
// Ines debc9b60 t25, default-candidate 72925a9c t15) and it missed plain asks
// ("What was the store count two years ago?").
import { describe, it, expect } from 'vitest';
import { addressedAskSentences, matchAskDetections, explicitRequestCues } from '@/lib/orchestrator/request-signal';

const asks = (t: string, phase = 'RECOMMENDATION') => addressedAskSentences(t, phase as never);

describe('addressedAskSentences', () => {
  it.each([
    'What was the store count two years ago?',
    'Could you share the store count?',
    'Can you give me the revenue figures?',
    'Can you tell me the store count?',
    'Do we know how many of the 200 stores opened in the last two years?',
    'Any numbers on store count?',
    'What does the data show on traffic?',
    'Before we wrap, could I get the store count for both years?',
    'Do we have a cost breakdown as a percentage of revenue for both years?',
    'Is there any data on transactions per store per day?',
    'Yes, please share the bean price change.',
    "I'd want the store count — do you have it?",
    "Would you share the COGS split?",
  ])('an addressed ask, late in the case: %s', t => expect(asks(t)).toEqual([t]));

  it.each([
    "What I'd want before committing to the exact number is competitor menu-price movement.",
    "I'd want to see the pilot results before a full rollout.",
    "Next steps: I'd want a waste audit before committing.",
    "I'd need the breakeven volume loss",
    "I'm done — can we do another case?",
    'Did a competitor promote into those markets?',
    'Maybe buy in bulk, or lock in a price?',
    "I can't commit without a fuller breakdown of COGS.",
  ])('not an addressed ask, late in the case: %s', t => expect(asks(t)).toEqual([]));

  it.each([
    'Do you know what worries me?',
    'Do you know why that is?',
    'Do you know how that plays out?',
    'Do we know if that holds?',
  ])('a rhetorical "do you know …" is not an ask: %s', t => expect(asks(t)).toEqual([]));

  it.each([
    'Do we know how many of the 200 stores opened in the last two years?',
    'Do we know how much the bean cost rose?',
    'Do we know what the store count was two years ago?',
    'Do we know the store count by year.',
    'Do you know our revenue by region.',
  ])('"do we know" + a quantity or a data noun is an ask: %s', t => expect(asks(t)).toEqual([t]));

  it("the \"I'd want/need\" cue counts up to EXHIBIT, or late when the sentence is a question", () => {
    const t = "I'd want the COGS split by year.";
    expect(asks(t, 'ANALYSIS')).toEqual([t]);
    expect(asks(t, 'EXHIBIT')).toEqual([t]);
    expect(asks(t, 'BRAINSTORM')).toEqual([]);
    expect(asks(t, 'RECOMMENDATION')).toEqual([]);
    expect(asks("I'd want the COGS split by year?", 'RECOMMENDATION')).toEqual(["I'd want the COGS split by year?"]);
  });

  it('keeps only the asking sentences of a longer message', () => {
    expect(asks('Volume loss is the bigger risk. Could you share the store count? I would pilot first.')).toEqual(['Could you share the store count?']);
  });

  it('an enumerated list after an ask belongs to it', () => {
    const t = 'Watch repeat visits.\n\nCould I get: one, historical response to any prior price move. Two, competitor price points. Three, transaction counts by store. Four, regional demographics.';
    expect(asks(t)).toEqual([
      'Could I get: one, historical response to any prior price move.', 'Two, competitor price points.', 'Three, transaction counts by store.', 'Four, regional demographics.',
    ]);
    expect(asks('Could you share these:\n- store count\n- revenue by year\nThanks.')).toEqual(['Could you share these:', '- store count', '- revenue by year']);
  });

  it('a list opened by "One," or numbered lines after an ask belongs to it', () => {
    expect(asks('Before I frame it, could I get a few data points?\n\nOne, the full cost breakdown. Two, store count by year.\n\nOnce I have those I can see where the margin went.')).toEqual([
      'Before I frame it, could I get a few data points?', 'One, the full cost breakdown.', 'Two, store count by year.',
    ]);
    expect(asks('Could you share these?\n1. Store count by year.\n2. Revenue by year.\nThat would help.')).toEqual(['Could you share these?', '1) Store count by year.', '2) Revenue by year.']);
  });

  it('a list of conditions with no ask is not one', () => {
    // A run-on enumeration after an ask is not joined to it either: it is where
    // a list of conditions sits (the mixed-message runner test).
    expect(asks('Could you share the store count? What would make me change course: one, pilot elasticity; two, competitors holding prices.')).toEqual(['Could you share the store count?']);
    expect(asks('What would make me change course: one, pilot elasticity above that threshold; two, competitors holding prices. Three, new-store openings.')).toEqual([]);
  });

  it('leaves guard B (explicitRequestCues) unchanged', () => {
    expect(explicitRequestCues("I'd want to see the pilot results before a full rollout.")).toEqual(["I'd want the"]);
    expect(explicitRequestCues('What was the store count two years ago?')).toEqual([]);
  });
});

describe('matchAskDetections', () => {
  const d = (what: string) => ({ what });

  it('nothing qualifies: every detection is dropped', () => {
    expect(matchAskDetections([], [d('Store count')])).toEqual({ kept: [], dropped: [d('Store count')] });
  });

  it('one asking sentence with an addressed-ask cue and one detection match whatever the words', () => {
    expect(matchAskDetections(['Could you share that?'], [d('Number of stores')]).kept).toEqual([d('Number of stores')]);
  });

  // Fix round 2: a lone data question (B) is often rhetorical; it covers only
  // what it names.
  it('a lone data question and one detection need a content word in common', () => {
    expect(matchAskDetections(["So what's driving the margin decline?"], [d('breakdown of COGS components')]).kept).toEqual([]);
    expect(matchAskDetections(['Does that make sense given the numbers?'], [d('Waste audit')]).kept).toEqual([]);
    expect(matchAskDetections(['What was the store count two years ago?'], [d('Number of stores')]).kept).toEqual([d('Number of stores')]);
  });

  it('otherwise a detection is kept when it shares a content word with an asking sentence', () => {
    const r = matchAskDetections(['Could you share the store count?'], [d('Number of stores'), d('Pilot elasticity results'), d('Competitor pricing actions')]);
    expect(r.kept).toEqual([d('Number of stores')]);
    expect(r.dropped).toEqual([d('Pilot elasticity results'), d('Competitor pricing actions')]);
  });

  it('generic words (data, years, numbers) do not make a match on their own', () => {
    const r = matchAskDetections(['Could I get the store count for both years?', 'Do we have the data?'], [d('Revenue growth over two years'), d('Historical data on traffic'), d('Store count')]);
    expect(r.kept).toEqual([d('Store count')]);
  });

  it('matches plural and -ing forms', () => {
    const r = matchAskDetections(['Could I see competitor prices?', 'Do you have menu prices?'], [d('Competitor pricing'), d('Regional demographics')]);
    expect(r.kept).toEqual([d('Competitor pricing')]);
  });
});
