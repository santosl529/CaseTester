// The math checker, live (math checker step 3, 13 Oct 2026; Lorenzo's rulings).
// The checker (math-checker.ts) fires in the background on each candidate
// message that states a quantitative claim; the turn never waits for it. Its
// vetted verdict is written as a session event when it lands, and the next
// turn's Plan reads it: a flagged claim becomes a RECOMPUTE-style flag under
// Rule 14 (probe, then code's correction or a second probe; unresolved → the
// report), sharing the deterministic checks' attempt counter. Deterministic
// checks stay first: a claim they already flagged in the message is not raised
// twice, a checker "correct" on a figure they flagged is only logged, and a
// checker error on a figure they stamped drops the stamp. A late verdict on a
// claim the candidate has since revised or withdrawn is dropped.
//
// Plan stays free of writes: startMathCheck returns the job, and the runner
// writes its row once the turn is accepted (session-runner.ts).
import { line, phrase, PHRASE_POOLS, type PhraseUses } from './phrasing';
import { mathCheckerConfig, type MathCheckerConfig } from '@/lib/models';
import type { OnUsage } from '@/lib/llm-usage';
import { normalizeNumberWords } from '@/lib/number-words';
import { findStepSpans } from '@/lib/scoring/math-spans';
import {
  checkMathClaims, vetCheckerClaims, codeComputed, boundInput, numbersOf, quantityWords,
  type CheckerCase, type CheckerClaim, type CheckerInput, type CheckerResult, type VetContext, type VettedClaim,
} from './math-checker';
import { recomputeAction, attemptKey, type CandidateMath, type RecomputeAttempts, type RecomputeFlag } from './recompute';
import { checkPricingClaims, pricingAnswers, pricingValues } from './pricing-check';
import { changeFigures } from './numeric-provenance';
import { classifyMathTalk } from './math-talk';
import { frameOfClaim, framedCorrection, claimWindow, readingsOf, rightOnSome, theirFigure } from './own-quantity';

export const MATH_CHECKER_CATEGORY = 'math_checker';
// Lorenzo, 13 Oct (approved): 30 s — the slowest call in the evaluation took
// 19.6 s. Every timeout is logged (an error row, and the runner's warning).
export const MATH_CHECKER_TIMEOUT_MS = 30_000;

// The checker's configuration for live sessions: MATH_CHECKER_CONFIG names one
// of MATH_CHECKER_CONFIGS (default Sonnet 5.5 at medium — Lorenzo, 13 Oct), or
// "off".
export function liveCheckerConfig(env: Record<string, string | undefined> = process.env): MathCheckerConfig | null {
  const name = env.MATH_CHECKER_CONFIG ?? 'sonnet55-medium';
  return name === 'off' ? null : mathCheckerConfig(name);
}

// ── the background job ──────────────────────────────────────────────────────

// A code finding on the message (a deterministic flag, or a misquote code would
// correct) and, since 16 Oct, the finding itself: code's line on it waits for
// this verdict (the gate, gateCodeFindings).
export type CodeFinding =
  | { kind: 'flag'; flag: RecomputeFlag }
  | { kind: 'misquote'; item: string; cited: string; sentence: string };
export type CodeFlagRef = { key: string; value: number; span: string; finding?: CodeFinding };
export type StampRef = { stepId: string; value: number; span: string };
export type VerdictPayload = {
  candidateTurnIndex: number; latencyMs: number; model: string;
  claims: VettedClaim[];
  codeFlags: CodeFlagRef[];   // the deterministic checks' flags on the message
  stamps: StampRef[];         // and their verified figures
};
export type CheckerErrorPayload = { candidateTurnIndex: number; error: string; timedOut: boolean; latencyMs: number };
export type CheckerJobResult = { subtype: 'verdict'; payload: VerdictPayload } | { subtype: 'error'; payload: CheckerErrorPayload };
export type CheckerJob = { candidateTurnIndex: number; result: Promise<CheckerJobResult>; abort: () => void };

// The message's code findings as the verdict carries them (the gate's input).
export function codeFlagRefs(codeMath: Pick<CandidateMath, 'flags'>, misquotes: { item: string; cited: string; sentence: string }[]): CodeFlagRef[] {
  return [
    ...codeMath.flags.map(f => ({ key: attemptKey(f), value: f.candidateValue, span: f.span, finding: { kind: 'flag' as const, flag: f } })),
    ...misquotes.flatMap(m => numbersOf(m.cited).slice(0, 1).map(value => ({ key: `misquote:${m.item}`, value, span: m.sentence, finding: { kind: 'misquote' as const, ...m } }))),
  ];
}

// One check of one message. The result never rejects: an API error or a
// timeout is an error row, with no effect on any turn.
export function startMathCheck(p: {
  caseData: CheckerCase & { factAnchors?: unknown; quoteAnchors?: unknown };
  input: CheckerInput; vet: VetContext; candidateTurnIndex: number; codeMath: CandidateMath;
  // The message's misquotes code corrects (fact-check.ts F2): code flags too.
  misquotes?: { item: string; cited: string; sentence: string }[];
  config: MathCheckerConfig; timeoutMs?: number; onUsage?: OnUsage;
  check?: (a: Parameters<typeof checkMathClaims>[0]) => Promise<CheckerResult>;
}): CheckerJob {
  const controller = new AbortController();
  const t0 = Date.now();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, p.timeoutMs ?? MATH_CHECKER_TIMEOUT_MS);
  const check = p.check ?? checkMathClaims;
  const result = check({ caseData: p.caseData, input: p.input, config: p.config, onUsage: p.onUsage, signal: controller.signal })
    .then((r): CheckerJobResult => ({ subtype: 'verdict', payload: {
      candidateTurnIndex: p.candidateTurnIndex, latencyMs: r.latencyMs, model: r.model,
      claims: vetCheckerClaims(r.claims, p.vet),
      codeFlags: codeFlagRefs(p.codeMath, p.misquotes ?? []),
      stamps: p.codeMath.verified.map(v => ({ stepId: v.stepId, value: v.value, span: v.span })),
    } }))
    .catch((e: unknown): CheckerJobResult => ({ subtype: 'error', payload: {
      candidateTurnIndex: p.candidateTurnIndex, error: e instanceof Error ? e.message : String(e), timedOut, latencyMs: Date.now() - t0,
    } }))
    .finally(() => clearTimeout(timer));
  return { candidateTurnIndex: p.candidateTurnIndex, result, abort: () => controller.abort() };
}

// ── the next turns ──────────────────────────────────────────────────────────

// Rule 14's counter key, shared with the deterministic checks (recompute.ts):
// a math step's id, a pricing claim's kind, else the claim in their words.
// The step or pricing kind plus the claimed value (Lorenzo, 13 Oct: the same
// flag is the bound step and the value — attemptKey).
export function checkerKey(c: CheckerClaim): string {
  const q = c.codeQuantity;
  const at = (k: string) => { const v = claimFigures(c)[0]; return v === undefined ? k : attemptKey({ stepId: k, candidateValue: v }); };
  if (q.kind === 'step' && q.stepId) return at(q.stepId);
  if (q.kind === 'gain' || q.kind === 'new_margin' || q.kind === 'breakeven') return at(`pricing:${q.kind}`);
  if (q.kind === 'needed_for_margin' || q.kind === 'needed_for_gain') return at('pricing:needed');
  return `checker:${normalizeNumberWords(c.candidateValue).toLowerCase().trim()}`;
}

const same = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.05, Math.abs(b) * 0.01);

// Lorenzo, 13 Oct (Larkspur rulings, c; Jordan 9ab76a39's "the four routes
// absorb half", probed three times under three wordings): at most two probes
// per step per interview, whatever the value. A key's step is the key without
// its value ("op_profit_swing@48" → "op_profit_swing"; "pricing:gain@5" →
// "pricing:gain"); a claim bound to no step is its own error. The probes spent
// on each step are counted in the session (flags.stepProbes, plan-turn.ts):
// code's probes, the checker's probe, pointer and hint.
export const STEP_PROBE_CAP = 2;
export const stepOfKey = (key: string) => (key.includes('@') ? key.slice(0, key.lastIndexOf('@')) : key);
// A step a conversion closed, kept with the closed keys (Lorenzo, 17 Oct): "converted:<step>".
export const CONVERTED = 'converted:';
export const convertedMarker = (key: string) => `${CONVERTED}${stepOfKey(key)}`;

// A word quantity is a figure for telling restatements apart: "roughly half",
// "about half of the damage", "half" are one claim (they carry no number, or
// only a case figure).
const WORD_FIGURES: [RegExp, number][] = [[/\bhalf\b/i, 0.5], [/\b(?:a|one)[\s-]third\b/i, 1 / 3], [/\b(?:a|one)[\s-]quarter\b/i, 0.25], [/\b(?:a|one)[\s-]fifth\b/i, 0.2], [/\b(?:twice|double)\b/i, 2], [/\b(?:triple|three times)\b/i, 3]];
export function wordFigures(text: string): number[] {
  return WORD_FIGURES.filter(([re]) => re.test(text)).map(([, v]) => v);
}

// Lorenzo, 13 Oct (Step 4, Jordan 099f33e9: "about 40 points", "~40 points",
// "38–40% growth" — seven probes, each rewording its own counter): a restated
// error is the same flag. The flags raised so far, by key, with the candidate
// figures that identify them and the message that first stated them.
export type CheckerKeyEntry = { figures: number[]; since: number };
export function flagKeyFor(c: CheckerClaim, figs: number[], keys: Record<string, CheckerKeyEntry>): string {
  if (figs.length > 0) {
    const seen = Object.entries(keys).find(([, e]) => e.figures.some(x => figs.some(f => same(f, x))));
    if (seen) return seen[0];
  }
  return checkerKey(c);
}

// The claim's own figures — what a stamp or a doubt is about: the numbers in
// their value, less the input code computes from ("a 10% rise … 5 points" →
// 5) and the case's own figures they quote ("about 11% (6 + 5)" → 11, 5). A
// word quantity has none: its error is the words ("fully explained … 4.2 +
// 11.8" — both right; replay, 0bfe5f38 t19).
export function claimFigures(c: CheckerClaim, caseNumbers: number[] = []): number[] {
  if (c.actualShare !== null) return [];
  const input = boundInput(c);
  return numbersOf(c.candidateValue).filter(n => (input === null || !same(n, input)) && !caseNumbers.some(x => same(n, x)));
}
const figuresOf = (c: CheckerClaim) => claimFigures(c);
// The figures that identify a claim: its own, else — when every one is also a
// case figure or its input ("a 16% lift" to restore 16 points) — the figures of its value as said.
function ownFigures(c: CheckerClaim, caseNumbers: number[]): number[] {
  const figs = claimFigures(c, caseNumbers);
  return figs.length > 0 || c.actualShare !== null ? figs : numbersOf(c.candidateValue);
}

// The case's figures the candidate has: the prompt, released lines and their changes.
export function caseNumbersOf(caseData: Pick<CheckerCase, 'prompt' | 'dataLedger'>, revealedIds: string[]): number[] {
  const texts = caseData.dataLedger.filter(d => revealedIds.includes(d.id)).map(d => d.value);
  return numbersOf([caseData.prompt, ...texts, ...changeFigures(texts)].join(' '));
}

// The wrong input a claim is built on (Lorenzo, 19 Oct, §15 o; batch 32
// Aldermoor Marisol: $400M and $80M, built on her wrong 200,000 patients and
// $2,000 net price, took probes of their own while the $2,000 went unasked). A case's
// math steps name ledger inputs, not upstream steps, so the link is the wrong
// figure itself, carried in the claim's span: the wrong result of another
// step's registered error key (stepOfKey differs) — its head figure, the
// key's value, never an input or range end it was said with ("$400M (200,000
// × $2,000)" is no root at $2,000; review I2) — stated no later than the claim
// (its first message, then the order registered) — not a case figure (a quote
// of the data) and not one of the claim's own figures (its result, or the
// root's figure said again under another binding). Several roots: the
// earliest. Returns the root's key, or null.
// The figure a key stands for: its value ("net_price@2000" → 2000), else the first figure registered.
function headOf(key: string, keys: Record<string, CheckerKeyEntry>): number | undefined {
  const at = key.lastIndexOf('@');
  const v = at < 0 ? NaN : Number(key.slice(at + 1));
  return Number.isNaN(v) ? keys[key]?.figures[0] : v;
}
export function rootOf(span: string, key: string, keys: Record<string, CheckerKeyEntry>, caseFigures: number[]): string | null {
  const own = [...(keys[key]?.figures ?? []), headOf(key, keys)].filter((n): n is number => n !== undefined);
  const carried = numbersOf(normalizeNumberWords(span)).filter(n => !caseFigures.some(x => same(n, x)) && !own.some(x => same(n, x)));
  if (carried.length === 0) return null;
  const order = Object.keys(keys);
  const before = (k: string) => keys[key] === undefined
    || keys[k].since < keys[key].since || (keys[k].since === keys[key].since && order.indexOf(k) < order.indexOf(key));
  const roots = order.filter(k => k !== key && stepOfKey(k) !== stepOfKey(key) && before(k) && carried.some(n => { const h = headOf(k, keys); return h !== undefined && same(n, h); }));
  return roots.sort((a, b) => keys[a].since - keys[b].since || order.indexOf(a) - order.indexOf(b))[0] ?? null;
}

// Lorenzo, 13 Oct (approved): a flag is raised only
// while at most this many candidate messages have followed the claim — held
// longer (a code flag took every turn), it expires to the report (replay:
// Sofia b20 140fb90d, a probe six messages late).
export const CHECKER_MAX_WAIT_MESSAGES = 2;

const sentencesOf = (text: string) => normalizeNumberWords(text).split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(Boolean);
// The candidate takes a claim back or redoes it.
const WITHDRAWN = /\b(?:scratch that|i take (?:that|it) back|i was wrong|i was (?:loose|sloppy)|my (?:earlier|previous|original|first) (?:range|number|figure|estimate|answer|sizing|math) was (?:wrong|off|understated|overstated|too (?:low|high))|(?:i )?made the same (?:mistake|error) (?:again|twice)|i mis-?(?:spoke|calculated|stated|read|sized)|let me (?:redo|correct|fix|recalculate|re-?do|re-?check|re-?run)|correction:|sorry,? (?:i meant|that should be|that'?s wrong)|(?:that'?s|that was) my (?:error|mistake)|my (?:error|mistake|bad)\b|you'?re right\b)/i;
// "Actually, …", "Wait — …" opening a sentence with a figure in it: a revision
// ("may actually be a smaller part" mid-sentence is not — replay, Sofia b20).
const REVISING = /^(?:actually|wait|on second thought)\b/i;

// Equivalent forms of a figure (Lorenzo, 15 Oct; batch 25, Marcus f8ed869d t9):
// "1+x = 1.237" is a 23.7% rise.
const FACTOR = /\(?\s*1\s*\+\s*[a-z]\s*\)?\s*=\s*(1\.\d+)\b/gi;
const factorFigures = (text: string) => [...text.matchAll(FACTOR)].map(m => Math.round(1000 * (Number(m[1]) - 1)) / 10);
// A price change stated as the answer: "about a 24% price increase", "the menu
// needs to go up about 23.7%", "raise prices 24%". Not a scenario ("a 10% price
// rise recovers…"): the sentence says no more than what it takes.
const PRICE_ANSWER = /(\d+(?:\.\d+)?)\s*%\s*(?:(?:menu|price|across-the-board)\s+)*(?:increase|rise|hike|lift)\b|\b(?:raise|lift|increase|take)\s+(?:menu\s+)?prices?\s+(?:up\s+)?(?:by\s+)?(?:about\s+|roughly\s+|~)?(\d+(?:\.\d+)?)\s*%|\bmenu\s+(?:needs|has)\s+to\s+(?:go\s+)?up\s+(?:by\s+)?(?:about\s+|roughly\s+|~)?(\d+(?:\.\d+)?)\s*%/gi;
const SCENARIO = /\b(?:recovers?|gets?\s+(?:us|you)\s+to|leaves?|lifts?\s+margin|would\s+(?:give|add)|if\s+(?:i|we)\s+raise)\b/i;
function priceAnswers(text: string): number[] {
  return sentencesOf(text).filter(s => !SCENARIO.test(s))
    .flatMap(s => [...s.matchAll(PRICE_ANSWER)].map(m => Number(m[1] ?? m[2] ?? m[3])));
}
// The prior margin the prompt names ("…margin has declined from 24% to 6%").
const priorMarginOf = (prompt: string) => { const m = /margin[^.]*?\bfrom\s+(\d+(?:\.\d+)?)%\s+to\s+(\d+(?:\.\d+)?)%/i.exec(prompt); return m ? Number(m[1]) : null; };
// The revenue growth the prompt names ("revenues have grown 15%"): a figure on
// the other period's revenue is the same quantity on another base.
const revenueGrowthOf = (prompt: string) => { const m = /\brevenues?\s+(?:have\s+|has\s+)?(?:grown|grew|risen|rose|increased|gone up|are up|is up)\s+(?:by\s+)?(\d+(?:\.\d+)?)%/i.exec(prompt); return m ? 1 + Number(m[1]) / 100 : null; };
const NEEDED_KINDS = new Set(['needed_for_margin', 'needed_for_gain']);
// The words code names its own computed quantity by (Lorenzo, 19 Oct; round-4
// ruling 3): quantityWords drops "margin", "gain", "recover", "price" as plain,
// and those are what names a pricing claim's quantity ("So the gain is 8.5 points").
const NEED_CUE = /\b(?:need\w*|takes?|requir\w*|restor\w*|prices?|menu)\b/i;
const KIND_CUE: Partial<Record<CheckerClaim['codeQuantity']['kind'], RegExp>> = {
  gain: /\b(?:gain\w*|recover\w*|margin)\b/i, new_margin: /\bmargin\b/i, breakeven: /\b(?:volume|break-?even|elasticity|traffic)\b/i,
  needed_for_margin: NEED_CUE, needed_for_gain: NEED_CUE,
};
// A pricing claim computed from a price: the price is its input, never its quantity.
const FROM_PRICE = new Set(['gain', 'new_margin', 'breakeven']);
// A sentence that says which base it is on.
const BASE_CUE = /\b(?:scal(?:e|ed|ing)|rebas\w*|re-?based|(?:today'?s|current|this year'?s|the new|the old|two years ago'?s?|prior) (?:revenue|base|dollars)|old[- ]dollar|in old dollars|index|times 1\.\d+|× ?1\.\d+|on (?:a|the) base of)\b/i;

// Has the candidate revised or withdrawn the claim since? Read in every
// candidate message after it: a withdrawal, a revision with a figure, the
// right figure stated for the claim's own quantity (when it isn't also a case
// figure), or the same claim restated at a different value (a pricing claim of
// the same kind at the same price; the same math step). Returns why, or null.
// A concession — a withdrawal or an "Actually, …" revision — withdraws only
// the claim it answers (Lorenzo, 14 Oct; batch 24: Owen e64de272's "You're
// right, I stated that as fact" about competitors dropped his "27–28%",
// Marisol 4bf008fd's "Let me redo it." about the bean share dropped her 27.6%):
// the claim the interviewer just questioned (`questioned`), one whose own
// figure the message names, or one the message redoes to its right figure (a
// case figure counts here: Marisol's redo to "16.0" answers her "22.1") —
// never every open claim.
export type LaterMessage = { text: string; questioned?: boolean };
export function isStale(c: CheckerClaim, later: (string | LaterMessage)[], caseData: CheckerCase, revealedIds: string[]): string | null {
  const ctx: VetContext = { caseData, revealedIds, shownExhibitIds: [], candidateTexts: [] };
  const right = [...(codeComputed(c, ctx)?.values ?? []), c.correctValue, c.correctLow, c.correctHigh].filter((x): x is number => x !== null);
  const caseFigures = caseNumbersOf(caseData, revealedIds);
  const rightToCheck = right.filter(r => !caseFigures.some(x => same(r, x)));
  const pm = pricingValues(caseData, new Set(revealedIds));
  const q = c.codeQuantity;
  const step = q.kind === 'step' ? caseData.mathSteps.find(st => st.id === q.stepId) : undefined;
  const own = [...ownFigures(c, caseFigures), ...wordFigures(c.candidateValue)];
  const namesClaim = (text: string) => own.length > 0 && [...numbersOf(text), ...wordFigures(text)].some(n => own.some(x => same(n, x)));
  // Lorenzo, 15 Oct (batch-25 ruling 2). A price the candidate states as the
  // answer to a "needed" claim: the right figure even when it is also a case
  // figure ("about a 24% price increase" — 24 is the prior margin), to the
  // nearest point; or the price for the case's prior margin, a redo for another
  // target (Owen d3db78c0 t15 redid his "8-12%" to recover 16 points as "roughly
  // a 24% price increase" for a 24% margin) — a new claim, not a re-probe.
  const priorMargin = priorMarginOf(caseData.prompt);
  const redoTargets = pm && NEEDED_KINDS.has(q.kind) && priorMargin !== null && priorMargin > pm.margin ? [pricingAnswers(pm).neededForMargin(priorMargin)] : [];
  const near = (n: number, r: number) => Math.abs(n - r) <= Math.max(0.5, Math.abs(r) * 0.02);
  // The right figure on the other period's revenue (Marisol 0f7551c2 t15: "18.4"
  // is her 16 points on today's revenue): the same quantity on another base.
  const growth = revenueGrowthOf(caseData.prompt);
  const rebased = growth === null ? [] : right.flatMap(r => [r * growth, r / growth]).filter(r => !caseFigures.some(x => same(r, x)) && !own.some(x => same(r, x)));
  // A redo to the claim's right figure (Lorenzo, 15 Oct; batch 26 Marisol
  // 2456aa9d t7: "Let me redo it in dollars" — about COGS — withdrew her labor
  // claim, whose right figure, 15, its "Revenue grows 15%" also said): a right
  // figure that is also a case figure counts only in a sentence naming the
  // claim's quantity; any other right figure, anywhere in the message.
  const subject = quantityWords(c.quantity);
  // Lorenzo, 19 Oct (round-4 ruling 3; batch 33 Blake cb23e17b t17: his "6 to 7
  // points" closed stale on the "10" of "a 10–12% price increase" — the price,
  // not the gain): a figure closes a flag only when stated for the claim's own
  // quantity — the 15 Oct redo rule applied to the stale check. In a sentence
  // naming the quantity (its words, or the words of code's kind), and never an
  // input the claim was computed from (a pricing claim's price, from its span).
  const names = (x: string) => (subject.size > 0 && [...quantityWords(x)].some(w => subject.has(w))) || (KIND_CUE[q.kind]?.test(x) ?? false);
  const inputs = FROM_PRICE.has(q.kind) ? [...numbersOf(c.span), ...(q.price !== null ? [q.price] : [])].filter(n => !own.some(x => same(n, x))) : [];
  const notInput = (n: number) => !inputs.some(x => same(n, x));
  const forQuantity = (text: string) => sentencesOf(text).filter(names).flatMap(x => [...numbersOf(x), ...factorFigures(x)]).filter(notInput);
  const redoneToRight = (text: string) => [...numbersOf(text), ...factorFigures(text)].filter(notInput).some(n => rightToCheck.some(r => same(n, r)))
    || (subject.size > 0 && sentencesOf(text).some(x => [...numbersOf(x), ...factorFigures(x)].filter(notInput).some(n => right.some(r => same(n, r)))
      && [...quantityWords(x)].some(w => subject.has(w))));
  for (const m of later) {
    const { text, questioned } = typeof m === 'string' ? { text: m, questioned: false } : m;
    const concession = sentencesOf(text).find(s => WITHDRAWN.test(s) || (REVISING.test(s) && /\d/.test(s)));
    if (concession && (questioned || namesClaim(text) || redoneToRight(text))) {
      return WITHDRAWN.test(concession) ? `withdrawn: "${concession}"` : `revised: "${concession}"`;
    }
    const stated = forQuantity(text).find(n => rightToCheck.some(r => same(n, r)));
    if (stated !== undefined) return `the right figure (${stated}) stated since`;
    if (NEEDED_KINDS.has(q.kind)) {
      const prices = [...priceAnswers(text), ...factorFigures(text)].filter(n => !own.some(x => same(n, x)));
      const answer = prices.find(n => right.some(r => near(n, r)));
      if (answer !== undefined) return `the right figure (${answer}) stated since`;
      const redo = prices.find(n => redoTargets.some(r => near(n, r)));
      if (redo !== undefined) return `redone for another target (${redo}% for the ${priorMargin}% margin)`;
    }
    const other = sentencesOf(text).filter(x => BASE_CUE.test(x) && names(x)).flatMap(x => numbersOf(x)).find(n => rebased.some(r => same(n, r)));
    if (other !== undefined) return `the right figure on another base (${other}) stated since`;
    // Restated at a different value (Lorenzo, 19 Oct, R2; batch 32 Aldermoor
    // Marisol t9–t23: her $2,000 net price dropped five times as "restated" by
    // "List is $10,000 per patient per year" beside "$2,000 realized"): the
    // quantity said again at its own figure carries the error on — the key
    // dedupes it — and so does a message that still states the claim's figure.
    // A step span at a case figure is a quote of the data, not the quantity
    // restated ("List is $10,000" read as the net-price step; review M2).
    const atOwn = (v: number) => own.some(x => same(v, x));
    if (pm && q.kind !== 'none' && q.kind !== 'step') {
      const kind = q.kind === 'needed_for_margin' || q.kind === 'needed_for_gain' ? 'needed' : q.kind;
      const again = checkPricingClaims(text, pm).find(x => x.kind === kind && (kind === 'needed' || x.price === q.price));
      const value = again && (kind === 'needed' ? again.price : again.stated);
      if (again && value !== undefined && !atOwn(value) && !namesClaim(text)) return `restated at ${value}: "${again.span}"`;
    }
    if (step) {
      const again = findStepSpans(text, step as never).find(x => !caseFigures.some(f => same(x.value, f)));
      if (again && !atOwn(again.value) && !namesClaim(text)) return `restated at ${again.value}: "${again.span}"`;
    }
  }
  return null;
}

// Did the interviewer probe the claim since — ask for the working on, or
// doubt, one of its figures? Rule 14 counts that as the probe.
export function modelProbed(c: CheckerClaim, interviewerTexts: string[], candidateFigures: number[]): boolean {
  return probesOf(figuresOf(c), interviewerTexts, candidateFigures) > 0;
}
// How many interviewer turns probed one of these figures: asked for the
// working on it, doubted it, or asked a question about it ("Why would the
// exposure be 40 points rather than 16?" — Jordan t12, about the figure).
export function probesOf(figs: number[], interviewerTexts: string[], candidateFigures: number[]): number {
  if (figs.length === 0) return 0;
  return interviewerTexts.filter(text => {
    const all = sentencesOf(text);
    const asks = /\?|\b(?:walk|talk) me through\b|\bexplain\b|\btell me how\b/i.test(text);
    return all.some((s, i) => {
      const talk = classifyMathTalk(s, [...candidateFigures, ...figs], all[i - 1]);
      return talk.figures.some(f => figs.some(x => same(f, x))) && (talk.kind !== 'none' || asks);
    });
  }).length;
}

export type CheckerRow = { category?: string; subtype: string; turnIndex: number | null; payloadJsonb: unknown };

export type CheckerOutcome = 'probe' | 'correct' | 'converted' | 'pointer' | 'hint' | 'unresolved' | 'shed' | 'stale' | 'expired' | 'dedupe' | 'disagrees_with_code' | 'unresolved_at_close' | 'undelivered' | 'derived' | 'restate';

// Lorenzo, 19 Oct (round-2 ruling 1; b28 Jordan t19 "The gap is 38 minus 18",
// b29 Jordan t9 "a large chunk of the 38" — both after code had corrected the
// 38 live): a root closed by a delivered correction (plan-turn records it,
// flags.mathChecker.corrected: the line said and its right figure) is said once
// more for a later claim still on its wrong value, then the report. Round-3
// ruling 1 (Lorenzo, 19 Oct; b28/b29 Jordan: "The rise in COGS is 16 points of
// revenue, not 38." put a "not X" on 38, true as growth on its own base): "The
// restatement must repeat the original correction line verbatim, never a new
// "X, not Y" template" — a correction's line, or a conversion's.
export type CorrectedRoot = { line: string; figure?: string };

// Whether the delivered text holds the checker's line (Lorenzo, 15 Oct): case,
// quotes, dashes and spacing aside — a paraphrase is not the vetted line.
const lineForm = (t: string) => t.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-')
  .replace(/[^a-z0-9%$.,'\- ]+/g, ' ').replace(/(?<!\d)[.,]|[.,](?!\d)/g, ' ').replace(/\s+/g, ' ').trim();
// A delivered line's count key (the controller's ruling on Task 19's concern 1, 19 Oct: Lorenzo's "a correction is
// said at most twice in total", per line as well as per key): case, quotes, dashes and spacing aside.
export const lineKey = (line: string) => lineForm(line);
export function lineHeard(text: string, line: string): boolean {
  if (line.trim() === '') return false;
  if (lineForm(text).includes(lineForm(line))) return true;
  // A correction said without its period lead-in ("From today's 6% margin, …") is heard: code saying the whole line again would say it twice.
  const core = line.replace(/^From today's \d+(?:\.\d+)?% margin,\s*/i, '');
  return core !== line && lineForm(text).includes(lineForm(core));
}
export type CheckerDecision = {
  id: string; candidateTurnIndex: number; outcome: CheckerOutcome; reason: string;
  span: string; candidateValue: string; key: string; changesConclusion: boolean; line?: string;
  root?: string;   // a claim built on another error: that error's key (rootOf)
  by?: string;     // a flag corrected by another line said word for word (a restatement's id; ruling 1, controller's option c)
};
export type CheckerSelection = {
  id: string; candidateTurnIndex: number; key: string; attempt: number;
  action: 'probe' | 'correct' | 'pointer' | 'hint' | 'restate'; line: string; derived: string[];
  claim: VettedClaim;
  // A correction said as a conversion — the figure right on the candidate's own
  // quantity, or no quantity stated (own-quantity.ts): no "not X", and its step closes.
  converted?: boolean;
  framing?: string;   // how the candidate framed the figure, for the log
  // Claims built on this line's root, 'derived' on it: handled only if the line is used and heard (plan-turn, settle-turn).
  riders?: { id: string; candidateTurnIndex: number; claim: VettedClaim }[];
  // A restatement's: flags waiting whose own correction is the line it says, word for word — corrected by it (booked only if it is said).
  covers?: { id: string; candidateTurnIndex: number; key: string; claim: VettedClaim; line: string }[];
  // The highest rating among the claims riding on it, its own included — the close hold reads it, not the root's own
  // claim (Lorenzo, 19 Oct, round-2 ruling 4): conclusion-changing if one is; its messages in the final answers, each
  // with its hold rank (the best claim there; plan-turn drops a redo's).
  rating?: { changesConclusion: boolean; final: { n: number; rank: number }[] };
};
// A line that states the right figure — a correction, or its restatement (ruling 1): no probe; it rides on an overdue stage turn and goes first.
export const correctsNow = (s: Pick<CheckerSelection, 'action'>) => s.action === 'correct' || s.action === 'restate';
export type CheckerPlanInput = {
  rows: CheckerRow[];                 // the session's math_checker events
  handled: string[];                  // claim ids already decided
  turnRows: { turnIndex: number; role: string; text: string }[];
  candidateText: string; candidateTurnIndex: number;
  currentFlags: RecomputeFlag[];      // the deterministic flags on this message
  codeLineThisTurn?: boolean;         // code corrects a misquote this turn
  attempts: RecomputeAttempts;        // Rule 14's counter, this message's flags counted
  keys?: Record<string, CheckerKeyEntry>; // the flags raised so far (one per error, across messages)
  closed?: string[];                  // keys past Rule 14: corrected once, or left for the report
  corrected?: Record<string, CorrectedRoot>; // the closed keys a delivered correction or conversion closed, with its line (ruling 1)
  restated?: string[];                // …and those whose correction was restated once since
  said?: Record<string, number>;      // each correction line delivered (correction, conversion, restatement, 13 Oct), by lineKey: times said
  stepProbes?: Record<string, number>; // probes spent on each step this interview (STEP_PROBE_CAP)
  held?: string;                      // a line a due stage question held back (Settle): raised first, and it doesn't expire
  // The final answers the close waits on (close-hold.ts; Lorenzo, 16 Oct): their
  // flags are raised before any other, never shed under time pressure, never expired.
  finalAnswer?: (candidateTurnIndex: number) => boolean;
  // Among the final answers' flags, which first (close-hold.ts holdRank): the recommendation reply's, then the largest error.
  rank?: (candidateTurnIndex: number, c: VettedClaim) => number;
  convertedFigures?: number[];        // the figures conversions closed (plan-turn's checker memory)
  underTimePressure: boolean;
  candidateFigures: number[];
  caseData: CheckerCase; revealedIds: string[];
  // The session's recent lines and the turn's seed: a neutral probe is said in one of its versions (phrasing.ts).
  phraseUses?: PhraseUses; seed?: string;
  // The right figures code's line on a finding states (the gate's, plan-turn): a misquote the gate will hold dedupes nothing.
  codeFigures?: (f: CodeFinding) => number[] | null;
  // The gate's decision on each of code's flags, by id (`n:code:i`; plan-turn: earlier turns'
  // code_gate rows, then this turn's). Given, a code flag dedupes the checker's claim only when
  // the gate released it — said by code; one ruled derived, not_rated, stale, expired or
  // disagreeing leaves the checker's claim standing (engine-asks final review, 19 Oct).
  gateOutcomes?: Record<string, GateOutcome>;
};
export type CheckerPlan = {
  selected: CheckerSelection | null;  // at most one a turn
  // flags left for a later turn; one built on another error carries that root (the close's report row; round-2 final review, Minor 2)
  waiting: { id: string; candidateTurnIndex: number; claim: VettedClaim; root?: string }[];
  decisions: CheckerDecision[];       // what was decided this turn (logged)
  handledNow: string[];               // claim ids settled this turn (the selected one is the caller's)
  flaggedFigures: number[];           // landed flags' figures: a doubt on them is licensed
  droppedStamps: (StampRef & { candidateTurnIndex: number })[];
  keys: Record<string, CheckerKeyEntry>; // the registry, this turn's flags added
  closedNow: string[];                // keys closed this turn (left for the report)
};

const decision = (id: string, n: number, c: VettedClaim, outcome: CheckerOutcome, reason: string, line?: string, key = checkerKey(c)): CheckerDecision => ({
  id, candidateTurnIndex: n, outcome, reason, span: c.span, candidateValue: c.candidateValue, key, changesConclusion: c.changesConclusion, ...(line ? { line } : {}),
});

// The landed verdicts, decided for this turn.
// A neutral probe of the vetting (math-checker.ts: "Walk me through how you got
// to {x}." / "…that calculation." / "…how you got there.") said in one of its
// five versions, chosen here — once, for the selection, which carries the
// exact line to the decision, the model's hint and the heard check. Any other
// line (the checker's own drafted probe) as vetted.
const NEUTRAL_GOT_TO = /^Walk me through how you got to (.+)\.$/;
export function neutralProbe(vetted: string, uses: PhraseUses | undefined, seed: string): string {
  if (vetted === PHRASE_POOLS.probe_calc[0]) return line('probe_calc', uses, seed);
  if (vetted === PHRASE_POOLS.probe_there[0]) return line('probe_there', uses, seed);
  const m = NEUTRAL_GOT_TO.exec(vetted);
  return m ? phrase('probe_got_to', m[1], uses, seed) : vetted;
}

export function planCheckerFlags(p: CheckerPlanInput): CheckerPlan {
  const handled = new Set(p.handled);
  const decisions: CheckerDecision[] = [];
  const flaggedFigures: number[] = [];
  const droppedStamps: CheckerPlan['droppedStamps'] = [];
  const eligible: { id: string; n: number; c: VettedClaim; key: string; figs: number[]; codeProbed?: boolean; carried?: boolean; restate?: { line: string; figure?: string; own: string } }[] = [];
  const caseNumbers = caseNumbersOf(p.caseData, p.revealedIds);
  const keys: Record<string, CheckerKeyEntry> = { ...(p.keys ?? {}) };
  const closed = new Set(p.closed ?? []);
  const closedNow: string[] = [];
  const verdicts = p.rows
    .filter(r => (r.category ?? MATH_CHECKER_CATEGORY) === MATH_CHECKER_CATEGORY && r.subtype === 'verdict')
    .map(r => r.payloadJsonb as VerdictPayload)
    .filter(v => v.candidateTurnIndex < p.candidateTurnIndex)
    .sort((a, b) => a.candidateTurnIndex - b.candidateTurnIndex);
  // The checker lines delivered on each interviewer turn (a flag row is decided
  // on message m and spoken on m + 1): what the next candidate message answers.
  const delivered = p.rows.filter(r => (r.category ?? MATH_CHECKER_CATEGORY) === MATH_CHECKER_CATEGORY && r.subtype === 'flag')
    .map(r => ({ at: r.turnIndex, d: r.payloadJsonb as CheckerDecision }))
    .filter(x => ['probe', 'pointer', 'hint', 'correct', 'converted', 'restate'].includes(x.d.outcome));
  const laterMessages = (n: number) => [...p.turnRows.filter(t => t.role === 'candidate' && t.turnIndex > n).map(t => ({ text: t.text, index: t.turnIndex })), { text: p.candidateText, index: p.candidateTurnIndex }];
  // Did the interviewer line just before message m question this claim — code's checker line on it, or the model asking about its own figures?
  const questionedBefore = (id: string, c: CheckerClaim, m: number) => {
    if (delivered.some(x => x.at === m - 2 && (x.d.id === id || x.d.key === checkerKey(c)))) return true;
    const line = [...p.turnRows].reverse().find(t => t.role === 'interviewer' && t.turnIndex < m)?.text;
    return line !== undefined && probesOf(ownFigures(c, caseNumbers), [line], p.candidateFigures) > 0;
  };
  // Misreads code corrects (Lorenzo, 14 Oct; batch 24, Tyler 4228be02's COGS
  // "about 54%"): one error with its framings — a claim whose sentence states
  // the misread figure, or whose value repeats a figure of a framing already
  // joined ("twelve points", then "12/18"), shares the correction's count.
  const misreads: { key: string; figures: number[] }[] = [];
  const messageOf = (n: number) => (n === p.candidateTurnIndex ? p.candidateText : p.turnRows.find(t => t.role === 'candidate' && t.turnIndex === n)?.text ?? '');
  const sentenceOf = (text: string, span: string) => sentencesOf(text).find(s => s.includes(span.slice(0, 40))) ?? span;
  // The flagged claims so far, for a later "correct" verdict on their figures.
  const flaggedSoFar: { id: string; n: number; c: VettedClaim }[] = [];
  const idFigsOf = (c: CheckerClaim) => { const f = ownFigures(c, caseNumbers); return [...f, ...wordFigures(c.candidateValue).filter(w => !f.some(x => same(x, w)))]; };
  const vetCtx: VetContext = { caseData: p.caseData, revealedIds: p.revealedIds, shownExhibitIds: [], candidateTexts: laterMessages(-1).map(x => x.text) };
  const reopened: { id: string; n: number; c: VettedClaim; key: string; figs: number[] }[] = [];
  // Lorenzo, 17 Oct (session 9ccf0836, batch 30 Noor): "not X" only on code's
  // own quantity — read from the claim's sentence and the next two messages.
  const frameOf = (c: VettedClaim, n: number) => frameOfClaim(c, claimWindow(c.span, messageOf(n), laterMessages(n).map(x => x.text)), vetCtx);
  const correction = (id: string, n: number, c: VettedClaim, key: string, attempt: number): CheckerSelection | null => {
    const framed = framedCorrection(c, frameOf(c, n), vetCtx);
    return framed ? { id, candidateTurnIndex: n, key, attempt, action: 'correct', line: framed.line, derived: framed.derived, claim: c, framing: framed.note, ...(framed.converted ? { converted: true } : {}) } : null;
  };
  // Steps a conversion closed: a later flag on one is left for the report —
  // unless it is a new figure, wrong on every reading code computes (Lorenzo,
  // 17 Oct, ruling d): then it reopens, the probe first. A restated right figure stays closed.
  const convertedSteps = new Set([...closed].filter(k => k.startsWith(CONVERTED)).map(k => k.slice(CONVERTED.length)));
  const reopens = (c: VettedClaim) => {
    const f = theirFigure(c);
    if (f === undefined || (p.convertedFigures ?? []).some(x => same(f, x))) return false;
    const readings = readingsOf(c, vetCtx);
    return readings.length > 0 && rightOnSome(f, readings) === null;
  };
  // Would the gate hold code's misquote line (checker_disagrees: every matching checker flag's right figure is
  // another quantity's)? Then code's line isn't said and the checker's claim stands (Lorenzo, 19 Oct; b28 Tyler
  // 934653af t9: "12.6 points (from 30% of COGS)" was deduped for a "30%" flag the gate held — the 30% waited to t14).
  const gateHolds = (f: CodeFlagRef, claims: VettedClaim[]) => {
    const figures = f.finding && f.key.startsWith('misquote:') ? p.codeFigures?.(f.finding) ?? null : null;
    if (figures === null) return false;
    const flagged = claims.filter(c => c.flag && gateMatches(f, c));
    return flagged.length > 0 && !flagged.some(c => rightAgrees(c, figures));
  };
  // Is code's line on this flag said — the gate released it? Without the gate's decisions, unless it holds the line (above).
  const codeSaid = (v: VerdictPayload, f: CodeFlagRef) => (p.gateOutcomes
    ? p.gateOutcomes[`${v.candidateTurnIndex}:code:${v.codeFlags.indexOf(f)}`] === 'released'
    : !gateHolds(f, v.claims));
  for (const v of verdicts) {
    for (const f of v.codeFlags.filter(x => x.key.startsWith('misquote:') && codeSaid(v, x))) {
      const m = misreads.find(x => x.key === f.key);
      if (m) m.figures.push(f.value); else misreads.push({ key: f.key, figures: [f.value] });
    }
    const laterRows = laterMessages(v.candidateTurnIndex);
    const later = laterRows.map(x => x.text);
    // The figures of this message's claims answered since: a figure the message
    // built on one of them (added or subtracted) went with it (Lorenzo, 15 Oct;
    // batch 25, Marisol 0f7551c2 t13: "6.3 points" was 16.0 − 9.7, and her t15
    // redo answered the 9.7).
    const answered: number[] = [];
    const sentencesHere = sentencesOf(normalizeNumberWords(messageOf(v.candidateTurnIndex)));
    // Both operands in the claim's sentence or the one before it; the other is no
    // flagged figure of the message ("16.3" isn't built on "5.8" because the
    // message's total, 22.1, adds them).
    const flaggedHere = v.claims.filter(x => x.flag).flatMap(x => numbersOf(normalizeNumberWords(x.candidateValue)));
    const builtOn = (c: CheckerClaim, figs: number[]) => {
      const at = sentencesHere.findIndex(x => x.includes(normalizeNumberWords(c.span).slice(0, 40)));
      if (at < 0) return undefined;
      const near = numbersOf(sentencesHere.slice(Math.max(0, at - 1), at + 1).join(' '));
      return answered.find(a => near.some(x => same(x, a)) && figs.some(f => near
        .filter(x => !same(x, a) && !flaggedHere.some(y => same(x, y)))
        .some(x => same(f, Math.abs(x - a)) || same(f, x + a))));
    };
    v.claims.forEach((c, i) => {
      const id = `${v.candidateTurnIndex}:${i}`;
      // A framing of a misread grows it, whether decided now or on an earlier turn.
      const told = c.flag ? [...numbersOf(sentenceOf(normalizeNumberWords(messageOf(v.candidateTurnIndex)), normalizeNumberWords(c.span))), ...numbersOf(normalizeNumberWords(c.candidateValue))] : [];
      const misread = misreads.find(m => told.some(n => m.figures.some(x => same(n, x))));
      if (misread) misread.figures.push(...numbersOf(normalizeNumberWords(c.candidateValue)));
      if (c.flag) flaggedSoFar.push({ id, n: v.candidateTurnIndex, c });
      if (handled.has(id)) return;
      const figs = claimFigures(c, caseNumbers);
      if (c.flag && convertedSteps.has(stepOfKey(checkerKey(c))) && !reopens(c)) {
        decisions.push(decision(id, v.candidateTurnIndex, c, 'unresolved', `its step was closed by a conversion (${stepOfKey(checkerKey(c))}); the figure is a restatement or right on a reading code computes`));
        handled.add(id);
        return;
      }
      const codeFlag = v.codeFlags.find(f => f.key === checkerKey(c) || figs.some(x => same(x, f.value)));
      if (!c.flag) {
        // A code flag the checker rates correct: code's line on it is dropped (the gate, gateCodeFindings).
        if (c.verdict === 'correct' && codeFlag) {
          decisions.push(decision(id, v.candidateTurnIndex, c, 'disagrees_with_code', `code flagged ${codeFlag.value} ("${codeFlag.span}"); the checker rates it correct — code's line is dropped`));
          handled.add(id);
          return;
        }
        // A later "correct" on an open flag's figures closes it only when code's
        // own figure for the flag's quantity agrees with the checker's (Lorenzo,
        // 15 Oct; batch 25, Jasmine f4fcab5b t21: "~6 points out of 18 — a third"
        // judged correct, code computes 10.1 for a 12% rise) — the agreement rule
        // of corrections: 3% or 0.5.
        if (c.verdict === 'correct') {
          const mine = c.correctValue ?? (c.correctLow !== null && c.correctHigh !== null ? (c.correctLow + c.correctHigh) / 2 : null);
          const said = idFigsOf(c);
          // Their flagged result said again — its first figure or its word quantity, not
          // an input it shares ("3.7 points (10.5 to 14.2)" isn't restated by "10.5"),
          // and not a different named quantity.
          const head = (x: CheckerClaim) => [...numbersOf(normalizeNumberWords(x.candidateValue)).slice(0, 1), ...wordFigures(x.candidateValue)];
          const sameQuantity = (a: CheckerClaim, b: CheckerClaim) => a.codeQuantity.kind === 'none' || b.codeQuantity.kind === 'none'
            || (a.codeQuantity.kind === b.codeQuantity.kind && a.codeQuantity.stepId === b.codeQuantity.stepId);
          const open = flaggedSoFar.find(f => f.n < v.candidateTurnIndex && said.length > 0 && sameQuantity(f.c, c) && head(f.c).some(x => said.some(y => same(x, y))));
          const key = open ? flagKeyFor(open.c, idFigsOf(open.c), keys) : null;
          const code = open ? codeComputed(open.c, vetCtx) : null;
          if (open && key && keys[key] && !closed.has(key) && code && mine !== null
            && !code.values.some(x => Math.abs(x - mine) <= Math.max(0.5, 0.03 * Math.abs(x)))) {
            decisions.push(decision(id, v.candidateTurnIndex, c, 'disagrees_with_code', `a restatement of ${key}: the checker said ${mine}, code computes ${code.values.join(' / ')}; the flag stays open`, undefined, key));
            handled.add(id);
            if (!reopened.some(r => r.key === key)) reopened.push({ ...open, key, figs: claimFigures(open.c, caseNumbers) });
          }
        }
        return;
      }
      // A code flag probes but never corrects (Lorenzo, 13 Oct): a claim it
      // flagged still brings the checker's agreed correction — unless code
      // corrected it as a misquote (an exact lookup). The checker's flag here is
      // what releases code's line (the gate): code's line is the one said.
      if (codeFlag && (!c.correctionLine || codeFlag.key.startsWith('misquote:')) && codeSaid(v, codeFlag)) {
        decisions.push(decision(id, v.candidateTurnIndex, c, 'dedupe', `the deterministic check flagged it (${codeFlag.key})`));
        handled.add(id);
        return;
      }
      if (misread) {
        decisions.push(decision(id, v.candidateTurnIndex, c, 'dedupe', `a framing of a misread code corrects (${misread.key})`));
        handled.add(id);
        return;
      }
      for (const s of v.stamps.filter(st => figs.some(x => same(x, st.value)))) droppedStamps.push({ ...s, candidateTurnIndex: v.candidateTurnIndex });
      const stale = isStale(c, laterRows.map(x => ({ text: x.text, questioned: questionedBefore(id, c, x.index) })), p.caseData, p.revealedIds)
        ?? (() => { const a = builtOn(c, figs); return a === undefined ? null : `built on ${a}, answered since`; })();
      // Answered — not restated, which carries the error on.
      if (stale && !stale.startsWith('restated')) answered.push(...ownFigures(c, caseNumbers));
      if (stale) {
        decisions.push(decision(id, v.candidateTurnIndex, c, 'stale', stale));
        handled.add(id);
        return;
      }
      // A line a due stage question held back waits for the next model turn (Lorenzo, 15 Oct).
      if (later.length > CHECKER_MAX_WAIT_MESSAGES && id !== p.held && !p.finalAnswer?.(v.candidateTurnIndex)) {
        // Built on a root a live correction closed (a restatement it never got): its root, for the report (round-2 final review, Minor 2).
        const root = rootOf(c.span, flagKeyFor(c, idFigsOf(c), keys), keys, caseNumbers);
        const restating = root !== null && closed.has(root) && Boolean(p.corrected?.[root]?.line?.trim());
        decisions.push({ ...decision(id, v.candidateTurnIndex, c, 'expired', `${later.length} messages since the claim`), ...(restating ? { root: root! } : {}) });
        handled.add(id);
        return;
      }
      // Matched by their figures — their value's own numbers when all are case figures (a "40 points" when 40 is also the bean rise).
      const input = boundInput(c);
      const ownFigs = figs.length > 0 || c.actualShare !== null ? figs : numbersOf(c.candidateValue).filter(n => input === null || !same(n, input));
      const idFigs = [...ownFigs, ...wordFigures(c.candidateValue).filter(w => !ownFigs.some(x => same(x, w)))];
      const key = flagKeyFor(c, idFigs, keys);
      if (closed.has(key)) {
        decisions.push(decision(id, v.candidateTurnIndex, c, 'unresolved', 'restated after the flag closed (corrected, or left for the report)', undefined, key));
        handled.add(id);
        return;
      }
      if (!keys[key]) keys[key] = { figures: idFigs, since: v.candidateTurnIndex };
      else keys[key] = { ...keys[key], figures: [...keys[key].figures, ...idFigs.filter(f => !keys[key].figures.some(x => same(f, x)))] };
      flaggedFigures.push(...figs);
      eligible.push({ id, n: v.candidateTurnIndex, c, key, figs, codeProbed: codeFlag !== undefined && codeSaid(v, codeFlag) });
    });
  }
  // A claim built on another error's figure yields to it (rootOf): the probe
  // follows the input. The flag is the key, so a claim restating a figure
  // another claim of its key built on the input is built on it too (Marisol
  // t19: "with peak at $80 million" after t17's "40,000 × $2,000 = $80
  // million"); a root whose every claim here is itself built on another
  // follows that one; a held line keeps its turn.
  // Lorenzo, 19 Oct (§15 o, review I1/I3): the claim yields only to a root
  // that is said — its root's line is this turn's selection (then it is
  // 'derived'), or the root closed (then it goes to the report with it).
  // Otherwise it waits, and expires or links again. A root carried into a new
  // message is the root restated: raised before and open, with no claim of its
  // own here, it comes back on the derived claim's turn with its next Rule-14
  // attempt (the correction, or the pointer or hint). The root takes the
  // derived claims' rating and final-answer rank.
  const all = [...eligible];
  const ofKey = (key: string, id: string) => flaggedSoFar.filter(f => f.id !== id && (checkerKey(f.c) === key || flagKeyFor(f.c, idFigsOf(f.c), keys) === key));
  const direct = new Map(all.map(e => [e.id, e.id === p.held ? null
    : rootOf(e.c.span, e.key, keys, caseNumbers) ?? ofKey(e.key, e.id).map(f => rootOf(f.c.span, e.key, keys, caseNumbers)).find(r => r !== null) ?? null]));
  const rootFrom = (key: string, depth = 0): string => {
    const holders = all.filter(e => e.key === key);
    const next = holders.length > 0 && holders.every(h => direct.get(h.id)) ? direct.get(holders[0].id)! : null;
    return next && depth < 8 ? rootFrom(next, depth + 1) : key;
  };
  const built: { e: typeof all[number]; root: string }[] = [];
  // A closed root a delivered correction closed, not restated yet (ruling 1): its correction is said once more, on
  // the first claim built on it — keyed by the root, so the others built on it ride on that line; after it, the report.
  const restated = new Set(p.restated ?? []);
  // A line said twice already is not said again, whichever selection carries it — a correction, a restatement (the
  // controller's ruling on Task 19's concern 1): report-only, its key closed.
  const saidTwice = (line: string) => (p.said?.[lineKey(line)] ?? 0) >= 2;
  for (const e of all) {
    const first = direct.get(e.id);
    if (!first) continue;
    const root = rootFrom(first);
    eligible.splice(eligible.indexOf(e), 1);
    if (closed.has(first) || closed.has(root)) {
      // An old or malformed record with no line restates nothing: a closed input (Task 18 review).
      const fix = p.corrected?.[root]?.line?.trim() ? p.corrected[root] : undefined;
      if (fix && !restated.has(root) && !saidTwice(fix.line)) {
        if (eligible.some(x => x.key === root && x.restate)) built.push({ e, root });
        else eligible.push({ ...e, key: root, restate: { line: fix.line, ...(fix.figure ? { figure: fix.figure } : {}), own: e.key } });
        continue;
      }
      decisions.push({ ...decision(e.id, e.n, e.c, 'unresolved', !fix ? `built on a closed input (${root})`
        : restated.has(root) ? `built on a corrected input (${root}) — restated once already; left for the report`
          : `built on a corrected input (${root}) — its correction was already said twice; left for the report`, undefined, e.key), root });
      handled.add(e.id);
    } else built.push({ e, root });
  }
  for (const r of reopened) if (!eligible.some(e => e.key === r.key)) eligible.push({ id: r.id, n: r.n, c: r.c, key: r.key, figs: r.figs });
  // A raised, open root with no claim here comes back on its latest claim (one with a correction first).
  for (const root of new Set(built.map(b => b.root))) {
    if (eligible.some(e => e.key === root) || !p.keys?.[root]) continue;
    const claims = flaggedSoFar.filter(f => checkerKey(f.c) === root || flagKeyFor(f.c, idFigsOf(f.c), keys) === root);
    const own = [...claims].reverse().find(f => f.c.correctionLine) ?? claims[claims.length - 1];
    if (own) eligible.push({ id: own.id, n: own.n, c: own.c, key: root, figs: claimFigures(own.c, caseNumbers), carried: true });
  }
  // One checker probe a turn, conclusion-changing first; none beside a
  // deterministic flag on this message (that is the turn's probe) or a
  // misquote code corrects this turn (one math line a turn).
  // A line a due stage held back goes out first, on the next turn it can.
  // Then a final answer's (close-hold.ts).
  const riding = (x: { key: string }) => built.filter(b => b.root === x.key).map(b => b.e);
  const isFinal = (x: { n: number; key: string }) => Boolean(p.finalAnswer?.(x.n)) || riding(x).some(d => Boolean(p.finalAnswer?.(d.n)));
  const final = (x: { n: number; key: string }) => Number(isFinal(x));
  const rank = (x: { n: number; c: VettedClaim; key: string }) => (p.rank ? Math.max(0, ...[x, ...riding(x)].filter(y => p.finalAnswer?.(y.n)).map(y => p.rank!(y.n, y.c))) : 0);
  const changes = (x: { c: VettedClaim; key: string }) => x.c.changesConclusion || riding(x).some(d => d.c.changesConclusion);
  const ratingOf = (x: { n: number; c: VettedClaim; key: string }): NonNullable<CheckerSelection['rating']> => {
    const final = new Map<number, number>();
    for (const y of [x, ...riding(x)].filter(y => p.finalAnswer?.(y.n))) final.set(y.n, Math.max(final.get(y.n) ?? 0, p.rank?.(y.n, y.c) ?? 0));
    return { changesConclusion: changes(x), final: [...final].sort((a, b) => a[0] - b[0]).map(([n, rank]) => ({ n, rank })) };
  };
  // A restatement before the other flags of its rating (ruling 1): the error it closes is still in use (b29 Jordan t9:
  // before a second correction of the same 38, "~40 points", whose line was the root's word for word). Below a
  // conclusion-changing flag when it is minor — the controller's middle ordering (review, 19 Oct): held, final, rank,
  // rating, then the restatement, then age.
  eligible.sort((a, b) => Number(b.id === p.held) - Number(a.id === p.held) || final(b) - final(a) || rank(b) - rank(a) || Number(changes(b)) - Number(changes(a))
    || Number(Boolean(b.restate)) - Number(Boolean(a.restate)) || a.n - b.n);
  let selected: CheckerSelection | null = null;
  const waiting = [...eligible];
  while (!selected && p.currentFlags.length === 0 && !p.codeLineThisTurn && waiting.length > 0) {
    const entry = waiting.shift()!;
    const { id, n, c, key, codeProbed } = entry;
    // The root's correction once more (ruling 1): no Rule-14 attempt and no probe; a minor one is shed under time pressure, as a flag is.
    if (entry.restate) {
      const own = entry.restate.own;
      if (p.underTimePressure && !isFinal(entry) && !changes(entry)) { decisions.push({ ...decision(id, n, c, 'shed', 'minor, under time pressure (Rule 15)', undefined, own), root: key }); handled.add(id); continue; }
      selected = { id, candidateTurnIndex: n, key, attempt: p.attempts[key] ?? 0, action: 'restate', line: entry.restate.line, derived: entry.restate.figure ? [entry.restate.figure] : [], claim: c };
      decisions.push({ ...decision(id, n, c, 'restate', `built on ${key}, corrected live — its correction said once more`, selected.line, own), root: key });
      continue;
    }
    if (closedNow.includes(key)) { decisions.push(decision(id, n, c, 'unresolved', 'its flag closed this turn', undefined, key)); handled.add(id); continue; }
    // Every probe of the error counts — code's, the checker's and the model's
    // own — since it was first stated (the stored counter, or the interviewer
    // turns that asked about its figures, whichever is more).
    const since = keys[key]?.since ?? n;
    const interviewerSince = p.turnRows.filter(t => t.role === 'interviewer' && t.turnIndex > since).map(t => t.text);
    // A claim code flagged was probed by code: it comes back only as the correction.
    const probed = Math.max(p.attempts[key] ?? 0, probesOf(keys[key]?.figures ?? claimFigures(c), interviewerSince, p.candidateFigures), codeProbed ? 1 : 0);
    const attempt = probed + 1;
    const action = recomputeAction({ errorClass: changes(entry) ? 'case_breaking' : 'minor' } as RecomputeFlag, attempt, p.underTimePressure && !isFinal(entry));
    if (action === 'shed') { decisions.push(decision(id, n, c, 'shed', 'minor, under time pressure (Rule 15)', undefined, key)); handled.add(id); continue; }
    // Two probes on the step already: a correction code can write is said (it is no probe); else the report.
    // A correction whose line was said twice already: the report, its key closed.
    const spentLine = (s: CheckerSelection) => {
      if (!saidTwice(s.line)) return false;
      decisions.push(decision(id, n, c, 'unresolved', 'its correction was already said twice — left for the report', s.line, key));
      handled.add(id);
      closedNow.push(key);
      return true;
    };
    if ((p.stepProbes?.[stepOfKey(key)] ?? 0) >= STEP_PROBE_CAP) {
      const corrected = correction(id, n, c, key, attempt);
      if (corrected && spentLine(corrected)) continue;
      if (corrected) { selected = corrected; continue; }
      decisions.push(decision(id, n, c, 'unresolved', `two probes on this step already (${stepOfKey(key)}) — left for the report`, undefined, key));
      handled.add(id);
      closedNow.push(key);
      continue;
    }
    if (action === 'probe' && c.probeLine) { selected = { id, candidateTurnIndex: n, key, attempt, action: 'probe', line: neutralProbe(c.probeLine, p.phraseUses, p.seed ?? ''), derived: [], claim: c }; continue; }
    const corrected = correction(id, n, c, key, attempt);
    if (corrected && spentLine(corrected)) continue;
    if (corrected) { selected = corrected; continue; }
    // Code can't compute it: the pointer probe is the second attempt.
    if (c.pointerLine && (attempt === 2 || p.underTimePressure)) { selected = { id, candidateTurnIndex: n, key, attempt, action: 'pointer', line: c.pointerLine, derived: [], claim: c }; continue; }
    // Else the hint (Lorenzo, 13 Oct, Step-4 rulings): a component they raised
    // earlier, named only in a second probe — never the first.
    if (c.hintLine && attempt === 2) { selected = { id, candidateTurnIndex: n, key, attempt, action: 'hint', line: c.hintLine, derived: [], claim: c }; continue; }
    // Past Rule 14 with nothing code can say: the report has it, and the case moves on.
    decisions.push(decision(id, n, c, 'unresolved', `attempt ${attempt}: no correction code can write${c.pointerLine || c.hintLine ? ', second probe already used' : ', no pointer'} — left for the report`, undefined, key));
    handled.add(id);
    closedNow.push(key);
  }
  const restating = selected?.action === 'restate';
  if (selected && !restating) decisions.push(decision(selected.id, selected.candidateTurnIndex, selected.claim, selected.converted ? 'converted' : selected.action,
    `attempt ${selected.attempt}${selected.framing ? `; ${selected.converted ? 'a conversion: ' : ''}${selected.framing}` : ''}${eligible.find(e => e.id === selected!.id && e.key === selected!.key)?.carried ? `; carried into ${riding(selected).map(d => d.id).join(', ')}` : ''}`, selected.line, selected.key));
  // The claims built on a root said now ride on its line (booked only if the line is used — plan-turn);
  // on a root closed this turn they go to the report with it; the rest wait.
  const riders: NonNullable<CheckerSelection['riders']> = [];
  for (const { e, root } of built) {
    if (selected?.key === root) {
      decisions.push({ ...decision(e.id, e.n, e.c, 'derived', restating ? `built on ${root}'s figure — rides on its restated correction` : `built on ${root}'s figure — the probe follows the input`, undefined, e.key), root });
      riders.push({ id: e.id, candidateTurnIndex: e.n, claim: e.c });
    } else if (closedNow.includes(root)) {
      decisions.push({ ...decision(e.id, e.n, e.c, 'unresolved', `built on a closed input (${root})`, undefined, e.key), root });
      handled.add(e.id);
    } else waiting.push(e);
  }
  if (selected && riders.length > 0) selected = { ...selected, riders };
  if (selected) { const s = selected; selected = { ...s, rating: ratingOf({ n: s.candidateTurnIndex, c: s.claim, key: s.key }) }; }
  // A flag waiting whose own correction is the line a restatement says — the root's delivered line — word for word
  // is corrected by it (the controller's ruling on Task 11, option c; b29 Jordan ea27d1f6 t9:
  // 5:6 "~40 points", keyed apart because 40 is a case figure, had the root's correction as its own): it closes and is
  // recorded corrected, as if its own line were said; it isn't said twice. Booked only with the restatement (plan-turn).
  if (selected?.action === 'restate') {
    const r = selected;
    const covers = waiting.filter(w => !w.carried && !w.restate && w.key !== r.key && w.c.correctionLine === r.line);
    for (const w of covers) decisions.push({ ...decision(w.id, w.n, w.c, 'correct', `corrected by the restatement of ${r.key} (${r.id}): its own correction, word for word`, w.c.correctionLine!, w.key), by: r.id });
    if (covers.length > 0) selected = { ...r, covers: covers.map(w => ({ id: w.id, candidateTurnIndex: w.n, key: w.key, claim: w.c, line: w.c.correctionLine! })) };
  }
  const pending = waiting.filter(w => !w.carried);
  const rootOfWaiting = (w: typeof waiting[number]) => (w.restate ? w.key : built.find(b => b.e.id === w.id)?.root);
  return {
    selected, waiting: pending.map(w => { const root = rootOfWaiting(w); return { id: w.id, candidateTurnIndex: w.n, claim: w.c, ...(root ? { root } : {}) }; }), decisions, flaggedFigures: [...new Set(flaggedFigures)], droppedStamps,
    handledNow: [...handled].filter(id => !p.handled.includes(id)), keys, closedNow,
  };
}

// ── the gate on code's own lines (Lorenzo, 16 Oct; batch 29 Marisol t15) ────
// No code-written correction (a misquote, a unit slip) and no code probe (a
// deterministic step, arithmetic, pricing or unit flag) is said unless the
// checker also rates that claim wrong: its flag — an error it is sure of, kept
// by the vetting — on a claim of the same message, matched by key or by the
// figure in the claim's value (as the dedupe matches). The message's verdict
// never lands within its own turn, so code's line goes out a turn later at the
// earliest; until the verdict lands the finding waits. A verdict that rates the
// claim correct, or doesn't rate it, drops the finding (logged); so does an
// answer since (stale) or a wait past CHECKER_MAX_WAIT_MESSAGES (expired) —
// except in the final answers, which the close hold waits on.
// A misquote's data line states the case's figures: the checker's right figure
// must agree with one of them or a change they imply — the agreement rule of
// corrections, 3% or 0.5 — so a flag on another reading of the claim releases
// nothing.
export type GateOutcome = 'released' | 'checker_correct' | 'not_rated' | 'checker_disagrees' | 'stale' | 'expired' | 'derived';
export type GateDecision = {
  id: string; candidateTurnIndex: number; key: string; value: number; span: string;
  finding: CodeFinding; outcome: GateOutcome; reason: string;
};
export type ReleasedFinding = { id: string; candidateTurnIndex: number; finding: CodeFinding };

// The checker's right figure for a claim, and whether it agrees with one of code's (3% or 0.5).
const rightOf = (c: CheckerClaim) => c.correctValue ?? (c.correctLow !== null && c.correctHigh !== null ? (c.correctLow + c.correctHigh) / 2 : null);
function rightAgrees(c: CheckerClaim, figures: number[]): boolean {
  const agree = (x: number, y: number) => Math.abs(x - y) <= Math.max(0.5, 0.03 * Math.abs(x));
  const mine = rightOf(c);
  if (mine !== null && figures.some(x => agree(x, mine))) return true;
  return c.correctLow !== null && c.correctHigh !== null && figures.some(x => x >= c.correctLow! - 0.5 && x <= c.correctHigh! + 0.5);
}

export function gateMatches(ref: Pick<CodeFlagRef, 'key' | 'value'>, c: CheckerClaim): boolean {
  return ref.key === checkerKey(c) || numbersOf(normalizeNumberWords(c.candidateValue)).some(x => same(x, ref.value));
}

export function gateCodeFindings(p: {
  rows: CheckerRow[]; handled: string[];
  turnRows: { turnIndex: number; role: string; text: string }[];
  candidateText: string; candidateTurnIndex: number;
  caseData: CheckerCase; revealedIds: string[];
  finalAnswer?: (candidateTurnIndex: number) => boolean;
  // The right figures code's line on the finding states, or null: no figure to agree on (the flag is enough).
  codeFigures?: (f: CodeFinding) => number[] | null;
  // The checker's raised flags and the closed ones (plan-turn's checker memory): a finding on a claim built on one of them yields (rootOf).
  keys?: Record<string, CheckerKeyEntry>; closed?: string[];
  // Findings released on a deadline-made stage turn and held back there (plan-turn's codeProbesHeld): exempt from the wait,
  // like the checker's own held line (Lorenzo, 19 Oct, ruling 6; the round-1 final re-review).
  held?: string[];
}): { released: ReleasedFinding[]; decisions: GateDecision[] } {
  const handled = new Set(p.handled);
  const released: ReleasedFinding[] = [];
  const decisions: GateDecision[] = [];
  const caseNumbers = caseNumbersOf(p.caseData, p.revealedIds);
  const verdicts = p.rows
    .filter(r => (r.category ?? MATH_CHECKER_CATEGORY) === MATH_CHECKER_CATEGORY && r.subtype === 'verdict')
    .map(r => r.payloadJsonb as VerdictPayload)
    .filter(v => v.candidateTurnIndex < p.candidateTurnIndex)
    .sort((a, b) => a.candidateTurnIndex - b.candidateTurnIndex);
  for (const v of verdicts) {
    const later = [...p.turnRows.filter(t => t.role === 'candidate' && t.turnIndex > v.candidateTurnIndex).map(t => t.text), p.candidateText];
    (v.codeFlags ?? []).forEach((ref, i) => {
      const id = `${v.candidateTurnIndex}:code:${i}`;
      if (!ref.finding || handled.has(id)) return;
      const decide = (outcome: GateOutcome, reason: string) => {
        decisions.push({ id, candidateTurnIndex: v.candidateTurnIndex, key: ref.key, value: ref.value, span: ref.span, finding: ref.finding!, outcome, reason });
        if (outcome === 'released') released.push({ id, candidateTurnIndex: v.candidateTurnIndex, finding: ref.finding! });
      };
      const matched = v.claims.filter(c => gateMatches(ref, c));
      const flaggedAll = matched.filter(c => c.flag);
      const figures = p.codeFigures?.(ref.finding) ?? null;
      const flagged = figures === null ? flaggedAll[0] : flaggedAll.find(c => rightAgrees(c, figures));
      if (!flagged && flaggedAll.length > 0) {
        decide('checker_disagrees', `the checker flags "${flaggedAll[0].candidateValue}" but its right figure (${rightOf(flaggedAll[0]) ?? 'none'}) is none of code's (${figures!.join(', ')})`);
        return;
      }
      if (!flagged) {
        const correct = matched.find(c => c.verdict === 'correct');
        if (correct) decide('checker_correct', `the checker rates "${correct.candidateValue}" correct`);
        else decide('not_rated', matched.length ? `the checker's verdict on it is ${matched.map(c => `${c.verdict}/${c.confidence}`).join(', ')} — no flag` : 'no claim of the checker on this figure');
        return;
      }
      const stale = isStale(flagged, later, p.caseData, p.revealedIds);
      if (stale) { decide('stale', stale); return; }
      if (later.length > CHECKER_MAX_WAIT_MESSAGES && !p.held?.includes(id) && !p.finalAnswer?.(v.candidateTurnIndex)) { decide('expired', `${later.length} messages since the claim`); return; }
      // Built on a raised error's figure (Lorenzo, 19 Oct, §15 o): the probe follows the input, as the checker's own flag does.
      // Keyed as the plan keys it (flagKeyFor), so the own-figure and same-step exclusions run on the same key (review M1).
      const idFigs = [...ownFigures(flagged, caseNumbers), ...wordFigures(flagged.candidateValue)];
      const own = flagKeyFor(flagged, idFigs, p.keys ?? {});
      const keys = { ...(p.keys ?? {}), ...(p.keys?.[own] ? {} : { [own]: { figures: idFigs, since: v.candidateTurnIndex } }) };
      const root = rootOf(flagged.span, own, keys, caseNumbers);
      if (root) { decide('derived', (p.closed ?? []).includes(root) ? `built on a closed input (${root})` : `built on ${root}'s figure — the probe follows the input`); return; }
      decide('released', `the checker flags "${flagged.candidateValue}"`);
    });
  }
  return { released, decisions };
}

// The gate's decision on each finding, by id: the code_gate rows, then this turn's decisions — the last wins.
// The rows come unordered from the event read, and a held finding has two (released, then its re-gate's
// outcome): sorted by turn, a turn's own rows in their order (Lorenzo, 19 Oct, ruling 6).
export function gateOutcomesOf(rows: CheckerRow[], now: Pick<GateDecision, 'id' | 'outcome'>[]): Record<string, GateOutcome> {
  const logged = rows.filter(r => (r.category ?? MATH_CHECKER_CATEGORY) === MATH_CHECKER_CATEGORY && r.subtype === 'code_gate')
    .map((r, i) => ({ at: r.turnIndex ?? -1, i, d: r.payloadJsonb as GateDecision }))
    .sort((a, b) => a.at - b.at || a.i - b.i);
  return Object.fromEntries([...logged.map(x => x.d), ...now].map(d => [d.id, d.outcome]));
}

// The selected flag as the interviewer model reads it: Rule 14's line, said
// as written.
export function formatCheckerHint(s: CheckerSelection): string {
  const said = `"${s.claim.span}"`;
  const line = s.action === 'probe'
    ? `- Earlier the candidate said ${said}; a check found it doesn't follow from the data they have. Probe once — "${s.line}" — Do not correct it or say the right figure.`
    : s.action === 'pointer' || s.action === 'hint'
      ? `- Earlier the candidate said ${said}, still unresolved after a probe. Ask this, once, as written — "${s.line}" — and nothing else about it. Do not correct it or say the right figure.`
      : s.action === 'restate'
        ? `- Earlier the candidate said ${said}, still using a figure code corrected already. Say the correction again in "say", once, as written — "${s.line}" — then continue. No probe, no consolation, no figure of your own.`
      : `- Earlier the candidate said ${said}; a check in code found it wrong. This overrides the no-correction rule: say this in "say", once, as written — "${s.line}" — then continue. No probe, no consolation, no figure of your own.`;
  return `MATH CHECK FLAG (a background check of an earlier message, vetted in code):\n${line}`;
}

// Lorenzo, 13 Oct (Step-4 rulings; Jordan 099f33e9 t25, "about 40 points of
// pressure" again in his recommendation after code corrected it at t7): an
// error past Rule 14 — corrected once, or left for the report after two probes
// — gets one more flag when it comes back in the final recommendation. Found
// in code, not by the checker (its verdict on the recommendation lands after
// the close): a closed flag's figure in the reply, in a unit the candidate
// said it in ("about 40 points"; "inputs ran 40%" is another quantity). The
// line: code's correction when it wrote one, else a neutral probe on the
// figure as said now.
export type ClosedRestatement = { key: string; said: string; correction: string | null };
// A figure's unit as written: money ($, M), a percent, points — or none.
const unitOfSaid = (text: string) => /%|percent/i.test(text) ? '%' : /\bpoints?\b/i.test(text) ? 'points' : /\$|\d\s*(?:m|mn|million|bn|billion)\b/i.test(text) ? 'money' : '';
// …with the checker's agreement (the gate, 16 Oct): found in a recommendation
// reply whose verdict has landed and flags a claim at the restated figure —
// so on a later turn than the reply. Returns the reply's index too.
export function closedErrorAgreed(p: {
  rows: CheckerRow[]; candidateTurnIndex: number; messages: { index: number; text: string }[];
  recReply: (n: number) => boolean; closed: string[]; keys: Record<string, CheckerKeyEntry>;
} & SaidTwice): (ClosedRestatement & { n: number }) | null {
  const verdicts = p.rows
    .filter(r => (r.category ?? MATH_CHECKER_CATEGORY) === MATH_CHECKER_CATEGORY && r.subtype === 'verdict')
    .map(r => r.payloadJsonb as VerdictPayload)
    .filter(v => v.candidateTurnIndex < p.candidateTurnIndex)
    .sort((a, b) => b.candidateTurnIndex - a.candidateTurnIndex);
  for (const v of verdicts) {
    const n = v.candidateTurnIndex;
    if (p.messages.filter(m => m.index > n).length > CHECKER_MAX_WAIT_MESSAGES || !p.recReply(n)) continue;
    const text = p.messages.find(m => m.index === n)?.text;
    const hit = text === undefined ? null : closedErrorRestated(text, p.closed, p.keys, p.rows, p);
    const value = hit ? numbersOf(hit.said)[0] : undefined;
    if (hit && value !== undefined && v.claims.some(c => c.flag && numbersOf(normalizeNumberWords(c.candidateValue)).some(x => same(x, value)))) return { ...hit, n };
  }
  return null;
}
// Lorenzo, 19 Oct (round-3 ruling 2; b29 Jordan ea27d1f6 t8, t10, t20 — the conversion line three times): "the 13 Oct
// recommendation re-correction counts as the restatement, so a correction is said at most twice in total". A key
// restated already, or whose correction is a restated key's line word for word, has had it said twice: no
// re-correction (the next closed key may still have one). The re-correction heard restates its key and every key whose
// line it said (restatedBy; Settle books it).
export type SaidTwice = { restated?: string[]; corrected?: Record<string, CorrectedRoot>; said?: Record<string, number> };
export const restatedBy = (key: string, line: string, corrected: Record<string, CorrectedRoot> = {}) =>
  [...new Set([key, ...Object.keys(corrected).filter(k => corrected[k].line === line)])];
export function closedErrorRestated(text: string, closed: string[], keys: Record<string, CheckerKeyEntry>, rows: CheckerRow[], spent: SaidTwice = {}): ClosedRestatement | null {
  const flagRows = rows.filter(r => (r.category ?? MATH_CHECKER_CATEGORY) === MATH_CHECKER_CATEGORY && r.subtype === 'flag').map(r => r.payloadJsonb as CheckerDecision);
  const said = [...normalizeNumberWords(text).matchAll(/(\$\s?)?(\d+(?:\.\d+)?)(?:\s*(%|percent\b)|[\s-]*(?:percentage\s+)?(points?)\b|\s?(m|mn|million|bn|billion)\b)?/gi)]
    // Said back whole: "38-point" (from "a 38-point cost shock") is "38 points" (Jordan 78c89dba t16).
    .map(m => ({ value: parseFloat(m[2]), unit: m[3] ? '%' : m[4] ? 'points' : m[1] || m[5] ? 'money' : '', text: m[4] ? `${m[2]} ${Number(m[2]) === 1 ? 'point' : 'points'}` : m[0].trim() }));
  for (const key of closed) {
    // A conversion closed it: the candidate was right on their own quantity, or stated none — no error to raise again.
    if (key.startsWith(CONVERTED) || flagRows.some(d => d.key === key && d.outcome === 'converted')) continue;
    const figures = keys[key]?.figures ?? [];
    // In a unit the claim was said in — never a bare number (Larkspur: "two separate effects" matched "$2M").
    const flags = flagRows.filter(d => d.key === key);
    const units = new Set<string>(flags.map(d => unitOfSaid(d.candidateValue)).filter(Boolean));
    const hit = said.find(s => units.has(s.unit) && figures.some(f => same(s.value, f)));
    const correction = flags.find(d => d.outcome === 'correct')?.line ?? null;
    if (hit && (spent.restated ?? []).some(r => r === key || (correction !== null && spent.corrected?.[r]?.line === correction))) continue;
    // …and per line (the controller's ruling on Task 19's concern 1): that line said twice already, by any key.
    if (hit && correction !== null && (spent.said?.[lineKey(correction)] ?? 0) >= 2) continue;
    if (hit) return { key, said: hit.text, correction };
  }
  return null;
}
