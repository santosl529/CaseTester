// Pricing math, checked in code (fact guards Phase 4, 12 Oct). The case's
// math steps have fixed answers, but a pricing claim's answer depends on the
// price change the candidate picks, so no step can check "a 10% price rise
// recovers 5 points" (batch 20: R44, R48, R18, R40, R10, R20 — it's ≈ +8.5).
// This check binds the stated price change to the stated result, from the
// case's cost structure (`pricingModel`: the cost lines' current shares of
// revenue, and which may be variable with volume for a break-even):
//   gain       a P% price rise at flat volume adds 100·C·P/(1+P) points of
//              margin (C = the cost base as a share of revenue: costs fixed in
//              dollars shrink as a share of the larger revenue — not just COGS)
//   new margin m + gain ("taking us from 6% to roughly 11%")
//   needed     the price rise that reaches a target margin t: C/(1 − t) − 1
//              ("to get back to 24% they'd need about an 18% price rise": 23.7%)
//   dollars    P% of revenue at flat volume ("a 10% price increase is $48M")
//   breakeven  the volume a P% rise can lose before contribution falls:
//              1 − V'/(V' + P), V' the contribution margin with the variable
//              lines (each accepted set an answer: COGS only → 19% for 10%)
// A claim with a stated volume loss is checked at that volume (COGS, or COGS
// and labor, variable). Three outcomes, like the arithmetic check: a claim is
// flagged only outside a wide band. Never the case's numbers in a hint: the
// candidate has every input (the cost lines must be revealed).
import { normalizeNumberWords } from '@/lib/number-words';

export type PricingModelValues = {
  costBase: number;          // cost lines' current shares of revenue, summed (94)
  margin: number;            // today's margin (6)
  contributions: number[];   // 100 − variable shares, one per accepted set (42, 20)
  revenue?: number;          // annual revenue in $M (480), for dollar claims
};

export type PricingClaim = {
  kind: 'gain' | 'new_margin' | 'needed' | 'dollars' | 'breakeven';
  price: number;             // the price change, % (for 'needed': the candidate's answer)
  stated: number;            // the candidate's result (for 'needed': the target margin)
  statedHi?: number;         // a stated range's top
  expected: number[];        // accepted answers
  verdict: 'correct' | 'incorrect';
  span: string;
};

const NUM = String.raw`(\d+(?:\.\d+)?)`;
const HEDGE = String.raw`(?:about|roughly|around|approximately|maybe|perhaps|call it|nearly|almost|only|just|~)?\s*`;
// The price change in a sentence: "a 10% price increase", "raise prices 10%", "price up 16%", "a 10% increase" (price nearby).
const PRICE_PATTERNS = [
  new RegExp(String.raw`\b${NUM}\s*(?:%|percent)\s*(?:menu\s+)?(?:price|pricing)\s*(?:increase|rise|hike|bump|lift|move|change)?`, 'i'),
  new RegExp(String.raw`\b(?:rais(?:e|es|ed|ing)|lift(?:s|ed|ing)?|push(?:es|ed|ing)?|tak(?:e|es|ing))\s+(?:menu\s+)?(?:price|prices|pricing)\s+(?:up\s+)?(?:by\s+)?${HEDGE}${NUM}\s*(?:%|percent)`, 'i'),
  new RegExp(String.raw`\b(?:price|prices|pricing)\s+(?:up|increase|rise|hike)\s+(?:of\s+|by\s+)?${HEDGE}${NUM}\s*(?:%|percent)`, 'i'),
  new RegExp(String.raw`\b(?:a|an)\s+${HEDGE}${NUM}\s*(?:%|percent)\s+(?:increase|rise|hike)\b`, 'i'),
  // "a price increase lifts revenue per ticket about 10%"
  new RegExp(String.raw`\bprice\s+(?:increase|rise)\s+(?:that\s+)?(?:lifts|raises|takes|grows|adds)\s+(?:revenue|the ticket|ticket)[\w\s]{0,20}?\s(?:by\s+)?${HEDGE}${NUM}\s*(?:%|percent)`, 'i'),
];
const PRICE_CONTEXT = /\b(?:price|prices|pricing|pass[- ]?through|passed through|menu)\b/i;
const RANGE_PRICE = /\b\d+(?:\.\d+)?\s*(?:%|percent)?\s*(?:to|-|–)\s*\d+(?:\.\d+)?\s*(?:%|percent)\s*(?:menu\s+)?(?:price|increase|rise)/i;
const VOLUME_LOSS = new RegExp(String.raw`\b(?:${NUM}\s*(?:%|percent)\s+(?:volume|traffic|transaction|cup|unit)s?\s+(?:drop|decline|loss|fall)|(?:volume|traffic|transactions)\s+(?:drops?|falls?|declines?)\s+(?:by\s+)?${NUM}\s*(?:%|percent))`, 'i');

// A cost's price, not the menu's ("a 40% price increase on beans", "bean price up 40%").
const COST_WORDS = /\b(?:bean|beans|coffee|input|inputs|dairy|milk|packaging|commodity|cogs|supplier|wage|wages)\b/i;

function priceIn(s: string, context: string): number | null {
  if (RANGE_PRICE.test(s)) return null;
  for (const [i, re] of PRICE_PATTERNS.entries()) {
    const m = re.exec(s);
    if (!m) continue;
    const around = s.slice(Math.max(0, m.index - 25), m.index + m[0].length + 25);
    if (COST_WORDS.test(around) && !/\bmenu\b/i.test(around)) continue;
    // "a 10% increase" names a price only with price talk nearby, and none of a cost.
    if (i === 3 && ((!PRICE_CONTEXT.test(s) && !PRICE_CONTEXT.test(context)) || COST_WORDS.test(s))) continue;
    const v = Number(m[1]);
    if (v > 0 && v <= 60) return v;
  }
  return null;
}

// A hedged round figure ("about 10 points") may round the true one (8.5) — up to
// 2.5 for a single multiple of 5 from 10 up; "about 5" for 6.1 is not a rounding.
const hedgedRound = (s: string, claim: number) => claim >= 10 && claim % 5 === 0 && new RegExp(`\\b(?:about|roughly|around|approximately|maybe|call it|~)\\s*${claim}\\b`, 'i').test(s);
const fits = (claim: number, hi: number | undefined, targets: number[], tol: (t: number) => number) =>
  targets.some(t => hi !== undefined ? t >= Math.min(claim, hi) - tol(t) && t <= Math.max(claim, hi) + tol(t) : Math.abs(claim - t) <= tol(t));

export function checkPricingClaims(rawText: string, v: PricingModelValues): PricingClaim[] {
  const out: PricingClaim[] = [];
  const sentences = normalizeNumberWords(rawText).replace(/[‘’]/g, "'").split(/(?<=[.?!])\s+|\n+/).map(s => s.trim()).filter(Boolean);
  const C = v.costBase / 100;
  const gainAt = (p: number, loss = 0) => {
    // At flat volume every cost line is fixed in dollars; with a volume loss the variable lines shrink with it.
    if (loss === 0) return [100 * C * (p / 100) / (1 + p / 100)];
    return v.contributions.map(cm => {
      const variable = 100 - cm, fixed = v.costBase - variable;
      const rev = 100 * (1 + p / 100) * (1 - loss / 100);
      return 100 * (rev - variable * (1 - loss / 100) - fixed) / rev - v.margin;
    });
  };
  for (const [i, s] of sentences.entries()) {
    const prev = sentences[i - 1] ?? '';
    // The price change: this sentence, else one of the two before ("Say we take a
    // 10% price increase. At -0.7 elasticity… That recovers about 5 points").
    const prev2 = sentences[i - 2] ?? '';
    const ownPrice = priceIn(s, prev);
    // A sentence with its own price range ("a 10–12% increase…") borrows no price from before.
    const p = ownPrice ?? (RANGE_PRICE.test(s) ? null : priceIn(prev, prev2) ?? priceIn(prev2, sentences[i - 3] ?? ''));
    const lossM = VOLUME_LOSS.exec(s) ?? VOLUME_LOSS.exec(prev) ?? VOLUME_LOSS.exec(prev2);
    const loss = lossM ? Number(lossM[1] ?? lossM[2]) : 0;
    const push = (c: Omit<PricingClaim, 'verdict' | 'span'>, tol: (t: number) => number) => {
      const t2 = c.statedHi === undefined && hedgedRound(s, c.stated) ? (t: number) => Math.max(tol(t), 2.5) : tol;
      out.push({ ...c, verdict: fits(c.stated, c.statedHi, c.expected, t2) ? 'correct' : 'incorrect', span: s.slice(0, 240) });
    };

    // Break-even volume: "can afford to lose about 10% of transactions before I'm worse off".
    const be = new RegExp(String.raw`\b(?:lose|losing|loses|costs?|lost|drop|shed)\s+(?:more than\s+|over\s+|up to\s+)?${HEDGE}${NUM}\s*(?:%|percent)\s+(?:of\s+)?(?:the\s+)?(?:volume|transactions?|traffic|cups|customers|units|visits)`, 'i').exec(s);
    if (be && p !== null && /\b(?:worse off|break\s?even|breakeven|made it worse|self-defeating|net negative|margin[- ]neutral|neutral|flat|kill|wash|before (?:we|I|they)'re|still (?:be )?(?:ahead|flat))\b/i.test(s)) {
      const x = Number(be[1]);
      const expected = v.contributions.map(cm => Math.round(1000 * (1 - cm / (cm + p))) / 10);
      push({ kind: 'breakeven', price: p, stated: x, expected }, t => Math.max(2.5, 0.15 * t));
      continue;
    }
    if (p === null) continue;
    // Points of margin: "recovers about 5 points", "five points of margin back", "restores about 14 points".
    const pts = new RegExp(String.raw`\b(?:recover(?:s|ing)?|restor(?:es|ing|e)|get(?:s|ting)?\s+back|adds?|add(?:ing)?|worth|buys?|delivers?|yields?|brings?\s+back|gives?(?:\s+(?:you|us))?|that's|call it|=|≈|→)\s+${HEDGE}${NUM}(?:\s*(?:to|-|–)\s*${NUM})?\s*(?:margin\s+)?(?:points|point|pts|pp|percentage points)\b(?!\s+of\s+(?:revenue|cogs))(?!\s+in\s+cost)`, 'i').exec(s)
      ?? new RegExp(String.raw`\b${HEDGE}${NUM}(?:\s*(?:to|-|–)\s*${NUM})?\s+(?:margin\s+)?points?\s+of\s+margin\b`, 'i').exec(s)
      // "recovers five of the 19 points"
      ?? new RegExp(String.raw`\b(?:recover(?:s|ing)?|restor(?:es|ing|e)|gets?\s+back)\s+${HEDGE}${NUM}\s+of\s+the\s+\d+(?:\.\d+)?\s+(?:margin\s+)?points\b`, 'i').exec(s);
    // Points of margin, not of something else ("beans add about 6.4 points").
    if (pts && (/\b(?:margin|profit)\b/i.test(s) || /\bof\s+the\s+\d+(?:\.\d+)?\s+(?:margin\s+)?points\b/i.test(s))) {
      const lo = Number(pts[1]), hi = pts[2] !== undefined ? Number(pts[2]) : undefined;
      if (lo > 0 && lo < 40) push({ kind: 'gain', price: p, stated: lo, statedHi: hi, expected: gainAt(p, loss).map(g => Math.round(g * 10) / 10) }, t => Math.max(1, 0.12 * t));
    }
    // The new margin: "taking us from 6% to roughly 11%", "toward 14%".
    const nm = new RegExp(String.raw`\b(?:margin\s+)?(?:from\s+${NUM}\s*%\s+)?(?:to|toward|towards)\s+${HEDGE}${NUM}\s*%`, 'i').exec(s);
    // In "to get back to 24% they'd need…" the margin is the target, not a result (checked as 'needed' below).
    if (nm && !/\b(?:need(?:s|ed)?|requires?|would take|doesn't|does not|won't|can't|cannot|never)\b/i.test(s) && /\bmargin|\bfrom\s+6\s*%|\btaking us|\bgoing from|\bgets? (?:us|them)|\btakes? (?:us|them|it)\b/i.test(s) && Number(nm[2]) > v.margin && Number(nm[2]) < 40 && !/\bcogs\b[^.]{0,30}\bto\s+\S*\s*$/i.test(s.slice(0, nm.index + nm[0].length))) {
      push({ kind: 'new_margin', price: p, stated: Number(nm[2]), expected: gainAt(p, loss).map(g => Math.round((v.margin + g) * 10) / 10) }, t => Math.max(1, 0.1 * t));
    }
    // Dollars at flat volume: "a 10% price increase is $48M".
    // The chain's total, not a per-store figure ("$240K per store, or $48M across 200 stores").
    // Bound to the price change: "is $48M", "adds ~$48M", "worth $48M" — not "revenue goes from $480M to $571M".
    const priceAt = PRICE_PATTERNS.map(re => re.exec(s)).find(Boolean);
    const usd = priceAt && [...s.matchAll(/\b(?:is|=|≈|adds?|worth|brings? in|generates?|that's|or)\s+(?:about\s+|roughly\s+|~\s*)?\$\s?(\d+(?:\.\d+)?)\s*(m|million)\b/gi)].find(m => m.index! >= priceAt.index && m.index! - (priceAt.index + priceAt[0].length) <= 40
      && !/^\s*(?:a|per)\s+(?:store|location|cup|ticket|transaction)/i.test(s.slice(m.index! + m[0].length)));
    if (usd && v.revenue && loss === 0 && ownPrice !== null) {
      push({ kind: 'dollars', price: p, stated: Number(usd[1]), expected: [Math.round(v.revenue * p) / 100] }, t => Math.max(2, 0.12 * t));
    }
  }
  // The price needed for a target: "to get back to 24% they'd need about an 18% price rise".
  for (const [i, s] of sentences.entries()) {
    const need = new RegExp(String.raw`\b(?:need(?:s|ed)?|requires?|would take|takes?|means?|holds?)\s+(?:a|an)?\s*${HEDGE}(?:an?\s+)?${NUM}\s*(?:%|percent)\s+(?:menu\s+)?(?:price\s+)?(?:increase|rise|hike)`, 'i').exec(s)
      ?? new RegExp(String.raw`\b${HEDGE}${NUM}\s*(?:%|percent)\s+(?:menu\s+)?price\s+(?:increase|rise|hike)\s+(?:holds|restores|gets? back|recovers?)\s+(?:the\s+)?margin`, 'i').exec(s);
    if (!need) continue;
    const window = `${sentences[i - 1] ?? ''} ${s}`;
    const target = /\bback to\s+(\d+(?:\.\d+)?)\s*%/i.exec(window)?.[1]
      ?? (/\b(?:recover|close|restore)\s+(?:the\s+)?(?:full\s+|all\s+|entire\s+)?18(?:[- ]point)?|\bhold(?:s)?\s+(?:the\s+)?margin\s+fully|\brestore(?:s)?\s+(?:the\s+)?margin\s+fully/i.test(window) ? String(v.margin + 18) : null)
      ?? (/\b(?:recover|close|restore)\s+(?:the\s+)?(?:full\s+|all\s+)?16(?:[- ]point)?/i.test(window) ? String(v.margin + 16) : null);
    if (!target) continue;
    // A target stated as a cost share ("COGS back to 42%") is another quantity — not checked here.
    if (/\b(?:cogs|cost of goods)\b[^.]{0,20}\bback to\b/i.test(window)) continue;
    const t = Number(target);
    if (!(t > v.margin && t < 60)) continue;
    const expected = [Math.round(1000 * ((v.costBase / (100 - t)) - 1)) / 10];
    const stated = Number(need[1]);
    out.push({ kind: 'needed', price: stated, stated, expected, verdict: fits(stated, undefined, expected, x => Math.max(2, 0.12 * x)) ? 'correct' : 'incorrect', span: s.slice(0, 240) });
  }
  return out;
}

// The values the check needs, from the case: current shares of the cost
// lines and of the variable ones, today's margin, revenue. Null when a cost
// line has no current figure or the lines aren't all revealed.
export function pricingValues(
  c: { dataLedger: { id: string; timeframes?: Record<string, string> }[]; pricingModel?: { costItems: string[]; variableSets: string[][]; revenueItem?: string } },
  revealed: Set<string>,
): PricingModelValues | null {
  const pm = c.pricingModel;
  if (!pm || !pm.costItems.every(id => revealed.has(id))) return null;
  const current = (id: string) => {
    const tf = c.dataLedger.find(d => d.id === id)?.timeframes ?? {};
    const k = Object.entries(tf).find(([, p]) => p === 'current' || p === 'both')?.[0];
    return k === undefined ? null : Number(k);
  };
  const shares = pm.costItems.map(current);
  if (shares.some(x => x === null)) return null;
  const costBase = (shares as number[]).reduce((a, b) => a + b, 0);
  const contributions = pm.variableSets.map(set => 100 - set.map(current).reduce((a: number, b) => a + (b ?? 0), 0));
  const revenue = pm.revenueItem && revealed.has(pm.revenueItem) ? current(pm.revenueItem) ?? undefined : undefined;
  return { costBase, margin: Math.round((100 - costBase) * 10) / 10, contributions, revenue };
}
