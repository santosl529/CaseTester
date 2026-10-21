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
    'Do we know how quickly we can exit the Lakeport and Port Avery slots?',   // round 5 Task 48: B1 Larkspur Marisol t25
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

  // An "I'd want …" sentence that qualifies only by the want cue (no addressed-ask
  // cue) never takes the 1:1 shortcut: it needs content-word overlap too.
  it("an \"I'd want\" sentence and one detection need a content word in common", () => {
    const text = "I'd want a waste audit before committing, does that make sense?";
    const sentences = asks(text, 'CLOSE');
    expect(sentences.length).toBe(1);
    const unrelated = { what: 'Competitor pricing actions', explicit: true, ledgerItemIds: [] as string[] };
    const related = { what: 'Waste audit results', explicit: true, ledgerItemIds: [] as string[] };
    expect(matchAskDetections(sentences, [unrelated]).kept).toEqual([]);
    expect(matchAskDetections(sentences, [related]).kept).toEqual([related]);
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

// Round 5 Task 49 (A2; B1 Aldermoor Tyler fc5eb050 t21): a held item a question
// names — by the item's own names, not the case's proper names — is kept although
// no sentence counts as an addressed ask (fix round 1: names, not the product).
describe('matchAskDetections with held items', () => {
  const TYLER = "A middle path worth sizing: co-promote with a partner for the first two or three years to buy speed and access, with a pre-agreed option to take the product in-house once our own team is stood up for the pipeline launches. Do we know whether Kelvexa's US exclusivity runs long enough to make a build pay back?";
  const patents = { what: "How long Kelvexa's US exclusivity/patent protection lasts", ledgerItemIds: ['patents'] };
  // entry-001's names for the items (label, spoken, factAnchors.names) and its proper names.
  const NAMES: Record<string, string[]> = {
    patents: ['Patent protection', 'patent protection', 'patents', 'patent', 'exclusivity', 'patent expiry', 'patent protection', 'patent life', 'generic entry'],
    kelvexa_pricing: ['Kelvexa US pricing: list price, discounts and rebates, time on treatment', "Kelvexa's US pricing", 'list price', 'kelvexa pricing', 'discounts and rebates', 'rebates', 'kelvexa price', 'price of kelvexa', 'kelvexa us price', 'gross-to-net discount', 'time on treatment', 'treatment duration'],
  };
  const held = (ids: string[], text: string) => ({ text, isHeld: (id: string) => ids.includes(id), itemNames: (id: string) => NAMES[id] ?? [], caseNames: ['Aldermoor', 'Aldermoor Pharma', 'Kelvexa', "Corlan's disease", 'Nimbrel'] });

  it('a held item named by a question is kept; one already out is dropped; without `held`, as before', () => {
    expect(asks(TYLER, 'EXHIBIT')).toEqual([]);
    expect(matchAskDetections([], [patents], held(['patents'], TYLER))).toEqual({ kept: [patents], dropped: [] });
    expect(matchAskDetections([], [patents], held([], TYLER))).toEqual({ kept: [], dropped: [patents] });
    expect(matchAskDetections([], [patents])).toEqual({ kept: [], dropped: [patents] });
  });

  it('the product name alone names no item: "Kelvexa" is in the question and in the pricing item\'s names — dropped', () => {
    const pricing = { what: "How long Kelvexa's US exclusivity/patent protection lasts", ledgerItemIds: ['kelvexa_pricing'] };
    expect(matchAskDetections([], [pricing], held(['kelvexa_pricing'], TYLER)).kept).toEqual([]);
  });

  it("the classifier's words are not the item's: a detection mapped to an item the question doesn't name is dropped", () => {
    const misnamed = { what: 'patent protection and exclusivity', ledgerItemIds: ['kelvexa_pricing'] };
    expect(matchAskDetections([], [misnamed], held(['kelvexa_pricing'], TYLER)).kept).toEqual([]);
  });
});

// Round 6 Task 71 (the audit's code-only fixes; Lorenzo, 21 Oct, round 6).
describe('Task 71: asking sentences the request reader missed', () => {
  // Row 11, b37 Hollis Bay Marcus ddbb070b t9 → t10, verbatim: "want is" failed the WANT cue (it needed
  // ":" or "the / a / to know…" after "want"), so no asking sentence, no classifier, and only an offer.
  const MARCUS_B37H_T9 = "Noted, I'll assume we don't have it. What I'd want is distribution math: how many stores Hollis Bay can get the line into, and velocity — bags per store per week. If you get, say, 10,000 stores at 12 bags a week, that's 10,000 × 12 × 52 ≈ 6.2 million bags, so you'd just clear it. So the question is really whether the $1.5M in shelf fees buys enough doors.\n\nBut I'd frame that as an execution variable, not a go/no-go. Six million bags is about 6% of their existing revenue base through channels they already own, with an existing salesforce and retailer relationships — that's reachable.\n\nSo I'd hold where I started: launch. Price the chickpeas at the premium end, since every quarter of price lowers breakeven volume by roughly 15%, and take pricing on the core chip line to fund the $9M. That's the plan I'd bring the CEO.";
  const tagged = (t: string, phase: string) => addressedAskSentences(t, phase as never, { wantIs: true });
  it('row 11: on a tagged case "What I\'d want is …" is an asking sentence before the brainstorm', () => {
    expect(tagged(MARCUS_B37H_T9, 'EXHIBIT')).toEqual(["What I'd want is distribution math: how many stores Hollis Bay can get the line into, and velocity — bags per store per week."]);
    expect(tagged("The one number I'd want is the store count.", 'ANALYSIS')).toEqual(["The one number I'd want is the store count."]);
    // Late in the case a want is a next step, as before; guard B's cue list is unchanged.
    expect(tagged("What I'd want is a pilot in two regions.", 'RECOMMENDATION')).toEqual([]);
    expect(explicitRequestCues("What I'd want is distribution math: how many stores Hollis Bay can get the line into.")).toEqual([]);
    // Not a want: "what I'd want to stress is …".
    expect(tagged("What I'd want to stress is the timing.", 'EXHIBIT')).toEqual([]);
  });
  it('row 11 is tagged-only: prof-001\'s b29 Blake t3 sentence asks nothing on an untagged case, as before', () => {
    const BLAKE = "One thing I would want is the menu-price history — whether they've taken any price in two years.";
    expect(asks(MARCUS_B37H_T9, 'EXHIBIT')).toEqual([]);
    expect(asks(BLAKE, 'STRUCTURE')).toEqual([]);
    expect(tagged(BLAKE, 'STRUCTURE')).toEqual([BLAKE]);
  });

  // Row 17, b37 Quillpath Marisol 084e7508 t15 → t16 (a stage_exhibit turn), verbatim: "I'd want to
  // pressure-test that: are those upgraders …?" — no cue, no data noun; code's turn dropped the detection.
  const MARISOL_B37Q_T15 = "I'd already corrected that one — the $900 was divided by the $40 price, which was wrong, because LTV is built on gross margin, not revenue. The right figure is $900 ÷ $30 margin = 30 months. Same error on Pro: $3,600 ÷ $80 = 45 months, not the 36 I originally said.\n\nAnd now that I have the real lifetimes, I can check those against the hurdles directly. Starter lasts about 20 months on its plan, versus 30 months needed — short on a standalone basis, consistent with the CFO. Pro lasts about 50 months against 45 needed, so Pro clears on its own.\n\nThe whole decision sits on the upgrade question. The 20% who move to Pro are worth $800 per Starter signup, which more than covers the $300 gap. So I'd want to pressure-test that: are those upgraders people who'd have bought Pro directly anyway?";
  const QUILLPATH_NAMES = ['Quillpath', 'Starter', 'Pro', 'LTV', 'CAC', 'churn'];
  // The labels of the items not yet out at t15 (the record's unrevealedItems).
  const UNRELEASED = ['The product', 'Difference between the plans', 'How customers sign up', 'What "worth three times the acquisition cost" means', 'Company size', 'Market growth', 'What the CEO cares about',
    'Starter price test results: sign-ups per month at each test price', 'Price test notes: costs unchanged, churn and upgrades not yet measurable', 'When customers upgrade', 'Why Pro sign-ups fell',
    "Competitors' entry-plan prices", 'How the price test worked', 'Existing Starter customers'];
  it('row 17: on a code-written turn a question naming an unreleased item\'s label word is an asking sentence', () => {
    const ledger = { labels: UNRELEASED, caseNames: QUILLPATH_NAMES };
    expect(addressedAskSentences(MARISOL_B37Q_T15, 'EXHIBIT')).toEqual([]);
    expect(addressedAskSentences(MARISOL_B37Q_T15, 'EXHIBIT', { ledger })).toEqual(["So I'd want to pressure-test that: are those upgraders people who'd have bought Pro directly anyway?"]);
    // A statement naming the word is no question; a question naming no label word asks nothing; a
    // plan name alone ("Pro") names no item; a question about how to proceed is not an ask.
    expect(addressedAskSentences('The upgraders matter most here.', 'EXHIBIT', { ledger })).toEqual([]);
    expect(addressedAskSentences('Are those people who would have bought anyway?', 'EXHIBIT', { ledger })).toEqual([]);
    expect(addressedAskSentences('Is Pro better?', 'EXHIBIT', { ledger })).toEqual([]);
    expect(addressedAskSentences('Should I use the upgrade rate from the cohort?', 'EXHIBIT', { ledger })).toEqual([]);
  });
});
