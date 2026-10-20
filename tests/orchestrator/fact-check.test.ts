import { describe, it, expect } from 'vitest';
import { getCaseById } from '@/lib/cases/loader';
import {
  factBaseFor, buildFactBase, findFalseFacts, findCandidateMisquotes, findFalseRefusals, findUndeliveredClaims, findEchoes, echoesOf, coverageOf,
} from '@/lib/orchestrator/fact-check';

const fb = buildFactBase(getCaseById('prof-001') as never);
const COST_LINES = ['cogs_pct', 'labor_pct', 'overhead_pct'];
const rules = (t: string, revealed: string[] = []) => findFalseFacts(t, fb, new Set(revealed)).map(f => f.rule);

describe('fact base (prof-001)', () => {
  it('reads periods, changes, exhibit columns and math steps', () => {
    const cogs = fb.quantities.find(q => q.id === 'cogs_pct')!;
    expect(cogs.levels).toEqual(expect.arrayContaining([42, 58, 50]));
    expect(cogs.pointChanges).toContain(16);
    expect(cogs.stepChanges).toContain(8);
    expect(cogs.direction).toBe('up');
    expect(fb.quantities.find(q => q.id === 'stores_count')!.direction).toBe('flat');
    expect(fb.quantities.find(q => q.id === 'menu_price_change')!.direction).toBe('flat');
    expect(fb.quantities.find(q => q.id === 'revenue_growth')!.changes).toEqual([15]);
    expect(fb.quantities.find(q => q.id === 'net_margin')!.levels).toEqual(expect.arrayContaining([24, 6, 15]));
  });
});

describe('F1 — false facts by the interviewer', () => {
  it('a figure presupposed in a question (batch 20 R21 t12, R30 t6, R42 t8)', () => {
    expect(rules('With the input price changes in hand, which one is large enough to drive a 19-point COGS climb on its own, and what would that imply about mix?')).toContain('F1-number');
    expect(rules('With those figures in hand, how much of the 19-point COGS increase does the bean cost change account for, and what does the rest leave unexplained?')).toContain('F1-number');
    expect(rules('With bean prices in hand, what does that imply for how much of the 19-point COGS jump beans can account for?')).toContain('F1-number');
  });
  it('a figure tied to the wrong quantity (Qwen screen: beans 42% of COGS, ticket up 2.1%, other inputs 3 points)', () => {
    expect(rules('COGS breakdown: coffee beans are 42% of COGS, up from 34% two years ago.')).toContain('F1-number');
    expect(rules('Average ticket is up 2.1% and menu prices were flat, so that\'s not the story.')).toContain('F1-number');
    expect(rules('So with beans at 42% of COGS and other inputs up 3 points of revenue combined, walk me through it.')).toContain('F1-number');
  });
  it('a direction the data contradicts (R21 t18, R25 t26, R35 t10, R40 t10)', () => {
    expect(rules('With average ticket in hand, what would a falling ticket with flat menu prices tell you about mix?')).toContain('F1-direction');
    expect(rules('With those in hand, what does a flat or falling average ticket alongside rising COGS share tell you?')).toContain('F1-direction');
    expect(rules('What would you need to know about the revenue side, given that revenue grew 15% while store count grew, and how does that split?')).toContain('F1-direction');
    expect(rules('With those figures, how much of the 15% revenue growth is price, and does the new-store growth look different from same-store?', ['stores_count'])).toContain('F1-direction');
  });
  it('a driver claim the split contradicts (batch 18 Micah t8, batch 19 Jasmine t18)', () => {
    expect(rules('Beans as the larger driver, and the other inputs behind it.')).toContain('F1-driver');
    expect(rules('Given that the 16-point COGS gap is mostly beans, how much of the margin recovery does the pricing lever alone deliver?')).toContain('F1-driver');
  });
  it('true restatements and the candidate\'s own figures pass', () => {
    for (const t of [
      'COGS rose from 42% to 58% of revenue, labor has remained at 22%, and overhead rose from 12% to 14%.',
      'Right, COGS up 16 points, overhead 2, labor flat.',
      'Walk me through how the 16-point COGS increase and the 18-point margin drop relate to each other.',
      'Walk me through how you got from 42% and 61% to a 19-point COGS increase.',
      'Beans at 45 percent of COGS and dairy at 25 percent are your assumptions.',
      'Rent and wages are 2 categories.',
      'Right, a bean-driven read.',
      'Labor and overhead didn\'t change when you worked through it.',
      'If the ticket fell after a price rise, what would that tell you?',
      'Footprint flat, so the whole 15% is same-store.',
      'Revenue grew 15% and the ticket grew about 10%, so what does that imply for transaction count?',
      'COGS is the main driver, 16 of the 18 points.',
      'Is it mostly beans?',
    ]) expect(rules(t), t).toEqual([]);
    expect(rules('The store count was 200 both years, so new stores can\'t explain a growth in footprint.', ['stores_count'])).toEqual([]);
    expect(rules('I don\'t have same-store versus chain-wide margin, new-store breakeven time or markets exited.', ['stores_count'])).toEqual([]);
  });
});

describe('F1 echo — repeating a standing misquote', () => {
  const [m] = findCandidateMisquotes('The whole swing is COGS: it goes from 42% two years ago to 61% now.', fb, new Set(COST_LINES), ['exhibit-a']);
  const echoes = echoesOf({ ...m, items: m.items }, fb);
  it('the implied change of a misquoted level is an echo (R42 t14)', () => {
    expect(echoes.map(e => e.value)).toEqual(expect.arrayContaining([61, 19]));
    expect(findEchoes('You\'ve got about 16 of the 19 points explained by input prices, with a 3-point residual.', echoes, fb)).toHaveLength(1);
  });
  it('a probe or a doubt about the figure is not adopting it', () => {
    expect(findEchoes('Walk me through the 19 points.', echoes, fb)).toEqual([]);
    expect(findEchoes('Your mix residual of about 3 points depends on the 61% COGS share being exact.', echoes, fb)).toEqual([]);
  });
});

describe('F2 — candidate misquotes', () => {
  const mq = (t: string, revealed = COST_LINES) => findCandidateMisquotes(t, fb, new Set(revealed), ['exhibit-a']);
  it('misquotes of revealed data, prompt facts and changes in points (Tyler, batches 12–20)', () => {
    expect(mq('COGS is the driver. It goes from 42% two years ago to 61% currently — that\'s a 19-point increase.')).not.toEqual([]);
    expect(mq('2 years ago COGS was 42% of revenue, and currently it\'s 61%, so the increase is 19 points.')).not.toEqual([]);
    expect(mq('So the question becomes why COGS rose 19 points.')).not.toEqual([]);
    expect(mq('Labor at a flat 22% and overhead up only 1 point suggests new stores aren\'t dragging materially.')).not.toEqual([]);
    expect(mq('Risks: they\'ve grown revenue 19% with flat prices.')).not.toEqual([]);
    expect(mq('At $500M revenue, 5% at flat volume is $25M.', [...COST_LINES, 'revenue_total'])).not.toEqual([]);
    expect(mq('Now, COGS went from 42 to 61, so 19 points. Do we have an index of bean prices?')).not.toEqual([]);
    expect(mq('Ticket is $6.90 against $6.20, call it 11%.', ['avg_ticket'])).not.toEqual([]);
  });
  it('a range of points before a change noun (math checker, batch 21 Jordan t6: probed five times, never given the figure)', () => {
    expect(mq("Eight points in year one and eight again in year two, so against a 42 base that's roughly a 38 to 40 point swing in COGS as a share of revenue.")).not.toEqual([]);
    // A range that holds the true change is no misquote; a chain of levels isn't a change.
    expect(mq("That's a 15 to 17 point swing in COGS.")).toEqual([]);
    expect(mq('COGS rose 42 to 58 points of revenue.')).toEqual([]);
  });
  it('indexed working, other quantities and per-year steps are not misquotes', () => {
    for (const t of [
      'Revenue today is 115, and at 6% margin profit is about 6.9, so costs are roughly 108.',
      'Today total COGS is roughly 67 on the same index.',
      'First thing I\'d do: launch a price test in 20-30 stores at 10-12%, measuring transactions.',
      'A 60-day price test in 15–20 stores at 2 price points.',
      'So absolute profit dropped from 24 to roughly 7, a fall of about 17.',
      'COGS rose 8 points in year one and 8 again in year 2 — perfectly linear.',
      'That 16 points drops straight to the bottom line — a 16-point margin hit, plus 2 from overhead.',
      'COGS went from 42% to 58% of revenue, 16 points.',
      'It\'s roughly 38% weighted input inflation absorbed entirely by the P&L.',
    ]) expect(mq(t, [...COST_LINES, 'revenue_total', 'stores_count']), t).toEqual([]);
  });
});

describe('F3 — false refusals', () => {
  const fr = (t: string, revealed: string[] = []) => findFalseRefusals(t, fb, new Set(revealed)).map(f => f.items).flat();
  it('refusals of items the case holds (batch 20 R10, R23, R28; batch 18 Maya t7; batch 5 Destiny t24; prefix runs; screens)', () => {
    expect(fr('I don\'t have what\'s inside COGS, bean cost per pound and dairy.', COST_LINES)).toEqual(expect.arrayContaining(['bean_share_of_cogs', 'bean_price_change']));
    expect(fr('I don\'t have COGS breakdown by input — beans, dairy, cups and food — and unit cost per pound.', COST_LINES)).toContain('bean_share_of_cogs');
    expect(fr('I don\'t have coffee bean, dairy, packaging, and waste shares of COGS, today and 2 years ago.', COST_LINES)).toContain('bean_share_of_cogs');
    expect(fr('I don\'t have the number of stores over the 2 years.')).toContain('stores_count');
    expect(fr('I have the cost breakdown for today, but not for two years ago.', COST_LINES)).toEqual(expect.arrayContaining(COST_LINES));
    expect(fr('I don\'t have rent as a percentage of revenue or cost increase in dollars.')).toContain('overhead_pct');
    expect(fr('I don\'t have menu price history or average transaction value.')).toEqual(expect.arrayContaining(['menu_price_change', 'avg_ticket']));
    expect(fr('Got it. I don\'t have a cost breakdown by line item for both years.')).toEqual(expect.arrayContaining(COST_LINES));
    expect(fr('I don\'t have full cost breakdown, revenue by location versus total, number of locations two years ago versus today, average ticket size.')).toEqual(expect.arrayContaining(['stores_count', 'avg_ticket']));
  });
  it('refusals of finer cuts, other periods or other quantities pass', () => {
    for (const t of [
      'I don\'t have bean share of COGS today.',
      'I don\'t have current-year bean share of COGS.',
      'I don\'t have the COGS breakdown by dairy, food and packaging or waste data.',
      'I don\'t have the current split of COGS by input and waste as a percent of product cost.',
      'I don\'t have the full current-year COGS breakdown.',
      'I don\'t have revenue mix by category and gross margin on each.',
      'I don\'t have same-store sales.',
      'I don\'t have milk, cups, and waste or spoilage split out of COGS.',
      'I don\'t have revenue and COGS split by category, drinks versus food.',
      'I don\'t have the variable share of COGS and store-level labor.',
      'I don\'t have supplier contract terms for coffee beans or marketing spend by year.',
      'I don\'t have transaction volume per store across the three years.',
      'I don\'t have COGS, labor, rent and SG&A dollars by year.',
      'I don\'t have whether the 37.5% on other inputs is total spend or per unit.',
      'I don\'t have that detail — treat it as overall net margin.',
      'I don\'t have revenue 2 years ago, annual transaction count, items per transaction.',
      'I don\'t have pounds of beans purchased per year, packaging and cup costs or capex.',
      'I don\'t have the board\'s margin target and the fiscal year end date.',
      'I don\'t have the last date of a menu price increase.',
    ]) expect(fr(t, COST_LINES), t).toEqual([]);
  });
});

describe('F4 — delivery claims without delivery', () => {
  const ctx = (o: Partial<Parameters<typeof findUndeliveredClaims>[2]> = {}) => ({
    revealed: new Set<string>(COST_LINES), exhibitShown: true, deliveredNow: false, deliveredPrev: false, refusedNow: false, ...o,
  });
  const why = (t: string, c = ctx()) => findUndeliveredClaims(t, fb, c).map(f => f.why);
  it('named data in hand that was never delivered (R21 t12, R16 t12, R19 t10, R37 t14)', () => {
    expect(why('With the input price changes in hand, which one is large enough to drive the climb?')).toEqual(['not_released']);
    expect(why('With the other-input price change in hand, what does it say about the rest of the COGS increase?')).toEqual(['not_released']);
    expect(why('With the bean and other-input price changes in hand, does your story hold?', ctx({ revealed: new Set([...COST_LINES, 'bean_price_change']) }))).toEqual(['not_released']);
    expect(why('With the average ticket in hand, does revenue per cup hold flat?')).toEqual(['not_released']);
    expect(why('With those figures in hand, what does the non-bean input inflation tell you about the remaining gap?', ctx({ deliveredNow: true }))).toEqual(['not_released']);
  });
  it('generic figures with nothing delivered this turn (R14 t22, R22 t14, R26 t8)', () => {
    expect(why('With those figures, does bean sourcing still look like the right lead lever, and what does it change about your plan?')).toEqual(['nothing_delivered']);
    expect(why('With those price changes in hand, what do they tell you, and what\'s your next cut?')).toEqual(['nothing_delivered']);
  });
  it('an exhibit asked about before any was shown; a handover with nothing handed over', () => {
    expect(why('What does the exhibit tell you, and does it change your view?', ctx({ exhibitShown: false }))).toEqual(['no_exhibit']);
    expect(why('What does the cost structure exhibit tell you about the drivers?', ctx({ exhibitShown: false, revealed: new Set() }))).toEqual(expect.arrayContaining(['no_exhibit']));
    expect(why('Here\'s the menu price history.')).toEqual(['not_released']);
  });
  // Batch 21 Marcus t6: "I'll share menu price changes … once we've settled
  // your structure. With that in hand, what does it tell you…?" Bare "that"
  // can be anything said — but on a turn that held data and delivered none,
  // it is the held data.
  it('a bare "with that in hand" after a deferral, nothing delivered (Marcus t6)', () => {
    expect(why('With that in hand, what does it tell you about your pricing hypothesis?', ctx({ deferredNow: true }))).toEqual(['nothing_delivered']);
    expect(why('Now that you have that, what would you look at next?', ctx({ deferredNow: true }))).toEqual(['nothing_delivered']);
    // Not when nothing was held, or when something went out this turn.
    expect(why('With that in hand, what does it tell you about your pricing hypothesis?')).toEqual([]);
    expect(why('With that in hand, what does it tell you about your pricing hypothesis?', ctx({ deferredNow: true, deliveredNow: true }))).toEqual([]);
  });
  it('true claims pass', () => {
    expect(why('With the cost breakdown in front of you, which line moved?', ctx({ deliveredNow: true }))).toEqual([]);
    expect(why('With the COGS composition in front of you, which input would you check first?', ctx({ revealed: new Set([...COST_LINES, 'bean_share_of_cogs']) }))).toEqual([]);
    expect(why('With those figures, what explains the gap?', ctx({ deliveredNow: true }))).toEqual([]);
    expect(why('With those numbers, your input-price arithmetic closes the full 16 points.')).toEqual([]);
    expect(why('The question on the table: given those 3 figures, what do you conclude?')).toEqual([]);
    expect(why('With labor as a share of revenue in front of you, what does that tell you?')).toEqual([]);
    expect(why('What does the exhibit tell you?', ctx({ exhibitShown: true }))).toEqual([]);
  });
});

describe('F3 reads covers (Lorenzo, 19 Oct; engine-asks task 3)', () => {
  const fb2 = factBaseFor(getCaseById('prof-002') as never);
  const ask = 'As for competition on Ashford and Brookhaven, that\'s not something I have.';
  it('a refusal of what a cover phrase answers is flagged with covers on', () => {
    const flags = findFalseRefusals(ask, fb2, new Set(), { covers: true });
    expect(flags.flatMap(f => f.items)).toContain('new_routes_context');
  });
  it('a finer cut beside the phrase is not covered', () => {
    expect(findFalseRefusals('As for competition on Ashford broken down by month, that\'s not something I have.', fb2, new Set(), { covers: true })).toEqual([]);
  });
  it('without covers the same refusal flags nothing', () => {
    expect(findFalseRefusals(ask, fb2, new Set())).toEqual([]);
  });
});

describe('"fixed cost breakdown" is no cover (Lorenzo, 19 Oct; engine-asks round-2 task 15; b22 Larkspur Omar t14)', () => {
  const fb3 = factBaseFor(getCaseById('prof-002') as never);
  it('"I don\'t have the fixed cost breakdown" is not an F3 flag: the case holds no split of the $20M', () => {
    expect(findFalseRefusals('A broad list of levers. I don\'t have the fixed cost breakdown. With that in hand, which lever would you recommend?', fb3, new Set(), { covers: true })).toEqual([]);
  });
  it('a period-wide cost breakdown still reaches the items it was written for', () => {
    const got = coverageOf('the FY2023 versus FY2025 cost breakdown', fb3).items;
    expect(got).toEqual(expect.arrayContaining(['fuel_prices', 'unit_costs', 'network_totals', 'fixed_costs']));
  });
});
