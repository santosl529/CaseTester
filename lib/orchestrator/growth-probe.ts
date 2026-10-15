import { sentencesOf } from './stall';

// The "is that the margin problem, or does it include cost that simply grew
// with revenue?" probe (system prompt, RIGOR) checks a dollar sizing: cost
// dollars grow with revenue, so a dollar gap mixes the margin problem with
// normal growth. A figure stated as a percent of revenue — or a change in one,
// in points or on its own base — already nets revenue growth out, so the probe
// doubts correct work there (Lorenzo, 15 Oct; batch 26 Marisol 2456aa9d t6:
// "Is that what the 16 points on a 42 base actually shows, or does it mix in
// normal growth with revenue?" against her correct 16/42, then a wrong dollars
// analysis at t7). Applies only to claims stated in dollars or as growth rates.

// The probe, in the wordings the corpus shows (45 interviewer sentences, 365 runs).
const GROWTH_PROBE = /\bnormal growth\b|\b(?:grew|grow|grows|growing|grown|scaled|scales?|scaling|rose|rising|track(?:s|ing)? the growth)\b[^.?!]{0,40}?\b(?:with|in|along with)\s+(?:revenue|volume|sales|(?:a|the)\s+(?:larger\s+|bigger\s+)?business)\b|\bcosts? that (?:simply|just) (?:grew|grows|rose)\b|\bcosts? that (?:grew|grows|rose|would have grown)\b[^.?!]{0,30}?\b(?:with|anyway)\b/i;
// The candidate's own words quoted back ("you attributed the two-point overhead drift to normal growth") — another question.
const QUOTES_CANDIDATE = /\byou (?:attributed|put|called|blamed|chalked)\b[^.?!]*\bnormal growth\b/i;
// A dollar quantity ("$77M", "16% of $480M", "103 million").
const DOLLAR_AMOUNT = /\$\s?\d|\b\d[\d,]*(?:\.\d+)?\s?(?:m|mn|million|bn|billion|k|thousand)\b/i;
// …or a sizing in dollars in the candidate's words ("In dollars on my normalized base: COGS was 42",
// "COGS rose 24.7 dollars") — not the bare word ("cost per transaction in dollars rather than percentages").
const DOLLAR_SIZING = /\b(?:in|absolute|normalized) dollars?\b[^.?!]*\d|\b\d+(?:\.\d+)?\s+dollars\b|\bdollars?\s+(?:rose|grew|went|increased|were|was)\b/i;
// Percent-of-revenue figures: points, shares of revenue, a share's change on its own base.
const SHARE = /\bpoints?\b|\bpoint\b|%\s*of (?:revenue|sales)\b|\bpercent of (?:revenue|sales)\b|\bon an? \d+(?:\.\d+)?(?:%| percent)? base\b|\bshare of (?:revenue|sales)\b/i;
// A growth rate of a cost ("costs grew … 42%", "up about 42%", "42% growth").
const COST_GROWTH = /\b(?:costs?|cogs|spend|expenses?)\b[^.?!]{0,40}?\b(?:grew|rose|up|increased|growth|inflation)\b[^.?!]{0,25}?\d+(?:\.\d+)?\s?%|\d+(?:\.\d+)?\s?%\s+growth\b/i;

// A plain quote-back of what they said, not asked about ("You said some of that cost grew with revenue because…").
const QUOTE_BACK = /^\s*you (?:said|noted|mentioned)\b[^?]*$/i;

export function isGrowthProbe(sentence: string): boolean {
  return GROWTH_PROBE.test(sentence) && !QUOTES_CANDIDATE.test(sentence) && !QUOTE_BACK.test(sentence);
}

// Whether a growth probe is aimed at a percent-of-revenue claim: what it (and
// the sentence before it) quotes is a share or points and no dollar figure or
// cost growth rate; quoting neither, the candidate's message states no dollar
// sizing and no cost growth rate.
export function growthProbeOnRatio(sentence: string, previous: string | undefined, candidateMessage: string): boolean {
  if (!isGrowthProbe(sentence)) return false;
  const asked = `${previous ?? ''} ${sentence}`;
  if (DOLLAR_AMOUNT.test(asked) || dollarGrowth(asked)) return false;
  if (SHARE.test(asked)) return true;
  return !DOLLAR_AMOUNT.test(candidateMessage) && !DOLLAR_SIZING.test(candidateMessage) && !dollarGrowth(candidateMessage);
}

// A cost growth rate in a sentence that isn't about shares ("COGS is up about 38%" on "a 42% base" is a share's growth — Sofia d8ee5c25 t5).
// Cost growth named as a rate counts whatever its unit ("a 27-point gap between cost growth and revenue growth" — Jasmine 074b0534 t4).
const dollarGrowth = (text: string) => sentencesOf(text).some(x => (COST_GROWTH.test(x) && !SHARE.test(x) && !/%\s*base\b/i.test(x)) || /\b(?:costs?|cogs|spend|expense)\s+growth\b/i.test(x));
