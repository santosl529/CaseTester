import { describe, it, expect } from 'vitest';
import { findMisquotes, exhibitColumns, correctionLine, type QuoteAnchor } from '@/lib/orchestrator/misquote';
import { getCaseById } from '@/lib/cases/loader';
import { buildFactBase, factBaseFor, findCandidateMisquotes } from '@/lib/orchestrator/fact-check';
import { readFileSync } from 'node:fs';
import { CaseSchema } from '@/lib/cases/schema';
import { Phase1OverlaySchema, applyPhase1Overlay } from '@/lib/cases/phase1-overlay';

// Rule 6 option 4 (v4.11): lines from batches 12–19, read by hand
// (tests/orchestrator/fixtures/misquote-labelled.json).
const prof = getCaseById('prof-001');
const anchors = prof.quoteAnchors as QuoteAnchor[];
const ALL = ['cogs_pct', 'labor_pct', 'overhead_pct', 'avg_ticket', 'stores_count', 'bean_price_change', 'non_bean_input_change', 'bean_share_of_cogs', 'menu_price_change'];
const ctx = (over: { revealed?: string[]; exhibit?: boolean } = {}) => ({
  anchors, ledger: prof.dataLedger, revealedIds: new Set(over.revealed ?? ALL),
  exhibitColumns: over.exhibit === false ? {} : exhibitColumns(anchors, prof.exhibits as { data: Record<string, unknown>[] }[]),
});
const items = (text: string, c = ctx()) => findMisquotes(text, c).map(m => m.item);

describe('findMisquotes', () => {
  it.each([
    ['The whole story is COGS — it goes from 42% to 61% of revenue over two years.', 'cogs_pct'],
    ['COGS starts at 42% of revenue and ends at 61%, so that\'s a 19-point increase.', 'cogs_pct'],
    ['You said COGS went from 42% to 55% of revenue, so that\'s a 13-point swing.', 'cogs_pct'],
    ['COGS jumped from 42% to 61% of revenue — call it a 19-point swing — while labor held flat at 22%.', 'cogs_pct'],
    ['Ticket is $6.90 against $6.20, call it 11%, and revenue is up 15%.', 'avg_ticket'],
    ['Footprint is flat at 200 stores, ticket is up from $6.20 to $6.90, and transactions are up about 4%.', 'avg_ticket'],
    ['So: two years ago COGS was about 44% of revenue, today it\'s about 55%.', 'cogs_pct'],
    ['Other inputs are up 40%, the same as beans.', 'non_bean_input_change'],
  ])('flags: %s', (text, item) => expect(items(text)).toEqual([item]));

  it('only for an item already revealed to the candidate', () => {
    expect(items('COGS went from 42% to 61% of revenue.', ctx({ revealed: ['labor_pct'] }))).toEqual([]);
  });

  it.each([
    // correct, rounded, the exhibit's middle year, the item's own change
    'COGS went from 42% to 58% of revenue.',
    'It goes 42 → 50 → 58 percent of revenue.',
    'Overhead creeps 12 to 13 to 14, one point a year.',
    'COGS rose 38% relative to revenue, meaning they absorbed all of it.',
    'Of the 18 points lost, COGS is 16 and overhead is 2.',
    'COGS 16, overhead 2, labor 0: that is 18.',
    'Other input costs are up roughly 40%, so call it broad inflation.',
    // points, years, cents, multiples
    'So the entire 16-point COGS jump is input-cost inflation.',
    'So I\'d dig into COGS 2 ways: what\'s inside it, and whether prices moved.',
    'A broad 8–10% increase on a $6.80 ticket is about 55 cents.',
    // projections and hypotheticals
    'If the trend continues, next year COGS is 66 and the company is underwater.',
    'Second, extrapolate one more year: COGS 66, overhead 15, labor 22 — that\'s 103.',
    'A renewal wave taking occupancy from 15 to 28 or so would do it.',
    'COGS 58% → about 55.2%, so 2.8 points.',
    // index and arithmetic
    'Index COGS at 100 two years ago: beans 25, everything else 75.',
    'Sizing it, indexing revenue at 115 today: COGS 66.7, labor 25.3, overhead 16.1, profit 6.9.',
    'COGS is 16.0000 ÷ 18.0000 = 88.8889%, overhead 11.1111%.',
    'Total COGS today is about 67, so beans today ≈ 67 − 43.3 ≈ 23.7.',
    // shares, sums, prepositions, conclusions, breakdowns
    'So COGS explains roughly 16 of the 18 points — about 89% of the problem.',
    'So beans are 55% of the problem, other inputs 35%, overhead 10%.',
    'Labor plus overhead is 36 fixed.',
    'Beans were already the single largest line in COGS at 25%, so I\'ll assume beans are the driver.',
    'And profit falls almost exactly in step with COGS: 24, 15, 6.',
    'Half of that is roughly 19%: revenue 119, COGS still 58, so COGS is 48.7% of revenue.',
    'The logic: 16 of those are COGS — 11.8 from dairy, packaging and food, and 4.2 from beans.',
    // a contrast with the correct figure
    'Market beans are up 40%, but our per-unit bean cost is up ~96%.',
  ])('does not flag: %s', text => expect(items(text)).toEqual([]));

  it('a figure computed earlier in the message is the candidate\'s, not a quote (Marisol, batch 18)', () => {
    const text = 'That\'s up from 31.5, so 52.3 over 31.5 is about 66% growth. Dairy, packaging and food grew 66% while beans grew 37.5%.';
    // Her run: the bean price change was not released yet (with it, "beans grew 37.5%" is a misquote).
    expect(items(text, ctx({ revealed: ['cogs_pct', 'labor_pct', 'overhead_pct', 'bean_share_of_cogs', 'non_bean_input_change', 'menu_price_change'], exhibit: false }))).toEqual([]);
    expect(items(text)).toEqual(['bean_price_change']);
  });

  it('an indexed message restates every figure on its own base (Wei, batch 13)', () => {
    expect(items('Today, per index: revenue 115, COGS 66.7, labor 25.3. Overhead 12 to 16.1, up 34%.')).toEqual([]);
  });

  it('one flag per item per message, with the cited figure and its sentence', () => {
    const m = findMisquotes('COGS went from 42% to 61% of revenue. Again, COGS went from 42% to 61%.', ctx());
    expect(m).toEqual([{ item: 'cogs_pct', cited: 'to 61%', sentence: 'COGS went from 42% to 61% of revenue.' }]);
  });
});

describe('correctionLine', () => {
  it('is the ledger value, flat, after one lead-in — an acronym keeps its case', () => {
    expect(correctionLine('COGS is 58% of revenue today, up from 42% two years ago.')).toBe('To correct one figure: COGS is 58% of revenue today, up from 42% two years ago.');
    expect(correctionLine('The average transaction is $6.80, up from $6.20 two years ago.')).toBe('To correct one figure: the average transaction is $6.80, up from $6.20 two years ago.');
  });
});

// Task 9 (Lorenzo, 19 Oct; §15 p, c): the grammar missed a figure before the
// sentence's full stop ("The shelf price is $4.49." flagged nothing, "…$4.49 per
// bag." did), read "$1,200" as "$1", refused "million", and skipped a whole
// sentence for arithmetic in a later clause (batch-32 Aldermoor Tyler t9:
// "Prevalence you gave is 1.5%, so 250 × 0.015 = …"). Through the live path.
describe('the quote grammar: full stops, thousands, scale words, arithmetic clauses', () => {
  const live = (caseId: string, revealed: string[], shown: string[] = []) => {
    const fb = factBaseFor(getCaseById(caseId) as never);
    return (s: string) => findCandidateMisquotes(s, fb, new Set(revealed), shown).map(m => m.items[0]);
  };
  const launch = live('launch-001', ['bag_price', 'recipe_cost', 'launch_costs']);
  const entry = live('entry-001', ['funnel_rates', 'us_adults', 'option_a'], ['exhibit-1', 'exhibit-3']);
  const pricing = live('pricing-001', ['plan_cac'], ['exhibit-1']);
  const larkspur = live('prof-002', ['lakeport_variable_cost'], ['exhibit-2']);
  const prof1 = live('prof-001', ALL, ['exhibit-a']);

  it.each([
    ['The shelf price is $4.49.', 'bag_price', launch],
    ['Recipe development was $1.5 million.', 'recipe_cost', launch],
    ['Prevalence you gave is 1.5%, so 250 × 0.015 = 3.75 million.', 'funnel_rates', entry],
    ['Selling costs are $77 million.', 'option_a', entry],
    ['The ticket is $6.90.', 'avg_ticket', prof1],
    ['Recipe development was $1,500,000.', 'recipe_cost', launch],
  ] as const)('flags: %s', (text, item, check) => expect(check(text)).toEqual([item]));

  it.each([
    ['The shelf price is $3.00.', launch],
    ['Recipe development was $1.2 million.', launch],
    ['Selling costs are $80 million.', entry],
    ['Pro CAC is $1,200', pricing],
    ['Pro CAC is $1,200.', pricing],
    ['The Lakeport cost per flight is $9,000.', larkspur],
    ['COGS is 58/110, about 53%.', prof1],
    ['The ticket is $6.80.', prof1],
    // Written in full, read at the item's scale (Task 9 review).
    ['Recipe development was $1,200,000.', launch],
    ['Recipe development was about $1,000,000.', launch],
  ] as const)('does not flag: %s', (text, check) => expect(check(text)).toEqual([]));

  it('a scale word before "points" is no figure, whatever its spelling (Task 9 review)', () => {
    for (const w of ['thousand', 'bn', 'mn', 'million', 'k']) expect(items(`Labor is 5 ${w} points.`)).toEqual([]);
  });

  it('chains still read through the periods', () => {
    expect(items('COGS went from 42% to 58% of revenue.')).toEqual([]);
    expect(items('COGS goes 42 → 50 → 58.')).toEqual([]);
    expect(items('COGS went from 42% to 61%.')).toEqual(['cogs_pct']);
  });
});

// Lorenzo's pre-wave ruling 9 (26 Oct): b38 Tyler cee7d399 t13's "$125" Lakeport fare was never found, because
// lakeport_fare's anchors all put the route beside the quantity ("lakeport fare", "fare on lakeport") and he wrote
// "On Lakeport, the exhibit shows fare down to $125". The fix is case data: a route-scoped anchor — the bare name
// "fare", counted only when the route is named earlier in the same sentence.
describe('a route-scoped misquote anchor (ruling 9)', () => {
  const raw = CaseSchema.parse(JSON.parse(readFileSync('cases/prof-002.json', 'utf8')));
  const ovl = Phase1OverlaySchema.parse(JSON.parse(readFileSync('cases/phase1/prof-002.json', 'utf8')));
  const on = applyPhase1Overlay(raw, ovl, { ENGINE_SWITCHES: 'prof-002=misquoteAnchors' });
  // buildFactBase, not factBaseFor: that one caches by case id, and the describe above already built prof-002's
  // base fact base, so the merged case would read the cached one.
  const look = (c: typeof raw, revealed: string[], shown: string[] = ['exhibit-1']) => {
    const fb = buildFactBase(c as never);
    return (s: string) => findCandidateMisquotes(s, fb, new Set(revealed), shown).map(m => m.items[0]);
  };
  const REV = ['lakeport_fare', 'port_avery_per_flight', 'lakeport_seats_load', 'lakeport_variable_cost'];
  const TYLER = 'On Lakeport, the exhibit shows fare down to $125 with $20 extras, so $145 per passenger, 60 passengers, $8,700 per flight against $9,000 variable cost.';

  it('finds the $125 with the overlay on, and did not before', () => {
    expect(look(on, REV)(TYLER)).toEqual(['lakeport_fare']);
    expect(look(raw, REV)(TYLER)).toEqual([]);
  });

  it('is scoped to the route: a bare fare with no Lakeport before it is not its quote', () => {
    expect(look(on, REV)('The exhibit shows fare down to $125.')).toEqual([]);
    expect(look(on, REV)("Port Avery's fare is $160 today.")).toEqual([]);
  });

  it('a modifier before the bare name makes another quantity: the candidate\'s own break-even, target or held fare', () => {
    // b22l Raj 07 t24 — his own derived figure; the one false flag the corpus sweep of all 28 prof-002 runs found.
    expect(look(on, REV)("Lakeport's breakeven fare is $130, so every seat sold now loses money.")).toEqual([]);
    for (const w of ['break-even', 'target', 'required', 'implied', 'budgeted', 'planning'])
      expect(look(on, REV)(`On Lakeport the ${w} fare is $130.`), w).toEqual([]);
    expect(look(on, REV)('On Lakeport, hold fare at $137 rather than discounting.')).toEqual([]);
  });

  it('does not flag the right figure, however the route is named', () => {
    for (const s of ['On Lakeport, the exhibit shows fare down to $120.', 'On Lakeport the fare fell from $200 to $120.'])
      expect(look(on, REV)(s), s).toEqual([]);
  });

  it('the scoped name is not a free-standing name for the item (fact-check reads it only as a quote)', () => {
    const fb = buildFactBase(on as never);
    expect(fb.quantities.find(q => q.id === 'lakeport_fare')!.names).not.toContain('fare');
  });
});

// Post-wave item 3 (Lorenzo, 26 Oct). Two genuine detector misses in batch 39's p64 runs.
describe('`misquoteAttribution` — a figure the candidate attributes to the interviewer', () => {
  const entry = CaseSchema.parse(JSON.parse(readFileSync('cases/entry-001.json', 'utf8')));
  const look = (attribution: boolean) => {
    const fb = { ...buildFactBase(entry as never), ...(attribution ? { attribution: true } : {}) };
    return (s: string) => findCandidateMisquotes(s, fb as never, new Set(['funnel_rates', 'us_adults', 'nimbrel']), []).map(m => m.items[0]);
  };
  // aldermoor p64 4df38465 t6: dropped by `operandLater`, which exists for the candidate's OWN derived figures.
  const P64 = "Prevalence you gave me is 1.5%, so 260 million × 1.5% = 3.9 million people with Corlan's disease.";

  it('finds the 1.5% with the switch on, and did not before', () => {
    expect(look(true)(P64)).toEqual(['funnel_rates']);
    expect(look(false)(P64)).toEqual([]);
  });

  it.each([
    "You said prevalence is 1.5%, so 260 × 1.5% = 3.9 million.",
    "Prevalence you gave is 1.5% and 1.5% of 260 million is 3.9 million.",
  ])('other attributed forms with the figure as a later operand: %s', text => {
    expect(look(true)(text)).toEqual(['funnel_rates']);
  });

  it('the figure the case does state is still no misquote, attributed or not', () => {
    for (const on of [true, false]) expect(look(on)("Prevalence you gave me is 1.6%, so 260 million × 1.6% = 4.16 million.")).toEqual([]);
  });

  it('attribution does not defeat the hypothetical, indexed, conclusion or sum guards', () => {
    expect(look(true)("If you gave me 1.5% prevalence, 260 million × 1.5% = 3.9 million.")).toEqual([]);
    expect(look(true)("On an index of 100, prevalence you gave is 1.5% of the base.")).toEqual([]);
  });

  it('an unattributed figure used as a later operand is still excused (Marisol b18 t9)', () => {
    expect(items('COGS today is 66.7, so 66.7 minus 14.4 leaves 52.3.')).toEqual([]);
  });
});

// hollisbay p64 7cdbeb74 t6: "Variable costs: ingredients $0.70, packaging $0.35, …" — variable_costs is one ledger
// line with four components, and its overlay misquote anchor named only the ingredients. The anchor's names now
// cover each component the line states.
describe('`misquoteAnchors` — each component of a multi-component cost line (post-wave item 3)', () => {
  const raw = CaseSchema.parse(JSON.parse(readFileSync('cases/launch-001.json', 'utf8')));
  const ovl = Phase1OverlaySchema.parse(JSON.parse(readFileSync('cases/phase1/launch-001.json', 'utf8')));
  const on = applyPhase1Overlay(raw, ovl, { ENGINE_SWITCHES: 'launch-001=misquoteAnchors' });
  const look = (c: typeof raw) => {
    const fb = buildFactBase(c as never);
    return (s: string) => findCandidateMisquotes(s, fb as never, new Set(['variable_costs', 'bag_price']), []).map(m => ({ item: m.items[0], cited: m.cited }));
  };
  const P64 = 'Variable costs: ingredients $0.70, packaging $0.35, roasting labor and energy $0.30, freight $0.20.';

  it('finds the $0.35 packaging with the overlay on, and did not before', () => {
    expect(look(on)(P64)).toEqual([{ item: 'variable_costs', cited: '$0.35' }]);
    expect(look(raw)(P64)).toEqual([]);
  });

  it('the line as the case states it is no misquote', () => {
    expect(look(on)('Variable costs: ingredients $0.70, packaging $0.30, roasting labor and energy $0.30, freight $0.20.')).toEqual([]);
  });

  it.each([
    'Freight is $0.45 a bag.',
    'Roasting labor and energy is $0.55.',
  ])('each component name reads its own quote: %s', text => {
    expect(look(on)(text).map(x => x.item)).toEqual(['variable_costs']);
  });

  it('a share of something else is no quote of the line', () => {
    expect(look(on)('Packaging is 20% of the bag cost.')).toEqual([]);
    expect(look(on)('Freight is about 13% of variable cost.')).toEqual([]);
  });
});
