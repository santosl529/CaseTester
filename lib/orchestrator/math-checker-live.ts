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
import { dataLineVersions } from '@/lib/cases/loader';
import { mathCheckerConfig, type MathCheckerConfig } from '@/lib/models';
import type { OnUsage } from '@/lib/llm-usage';
import { normalizeNumberWords } from '@/lib/number-words';
import { findStepSpans, cueNames } from '@/lib/scoring/math-spans';
import { boundFigures, type BoundFigure } from './figure-binding';
import {
  checkMathClaims, vetCheckerClaims, codeComputed, boundInput, numbersOf, quantityWords, RATIO_SAID,
  type CheckerCase, type CheckerClaim, type CheckerInput, type CheckerResult, type VetContext, type VettedClaim,
} from './math-checker';
import { recomputeAction, attemptKey, type CandidateMath, type RecomputeAttempts, type RecomputeFlag } from './recompute';
import { checkPricingClaims, pricingAnswers, pricingValues } from './pricing-check';
import { changeFigures } from './numeric-provenance';
import { classifyMathTalk } from './math-talk';
import { inputProbed } from './probe-guard';
import { frameOfClaim, framedCorrection, claimWindow, readingsOf, rightOnSome, theirFigure, dataFigure, rowFix, onItsOwnRow, figureUnits, figuresIn, unitsAgree } from './own-quantity';

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
export function checkerKey(c: CheckerClaim & { ratio?: boolean }): string {
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
// Lorenzo, 20 Oct (E7, serious; b35q Marisol 087451cb: "the same probe 3+ times: t6, t12, t18"): a misread input — a
// figure of the data the candidate took for another quantity (own-quantity.ts dataFigure: her 21.5%, Pro's share
// cancelled by month 12, as Starter's annual churn; 40%, Starter's, as Pro's) — collects every probe on it or on a claim
// built on it, by code or by the model. At two, the next line on it is its correction through own-quantity framing —
// the row fix (rowFix) — or, with no true line, the report: never a third probe. Its key in closed/corrected is
// "input:<figure>"; code's lines on it are counted by turn in flags.inputProbes (plan-turn), beside flags.stepProbes.
export const INPUT_PROBE_CAP = 2;
export const INPUT_KEY = 'input:';
// Keyed with the unit she said it in (review I2): "input:21.5%", "input:$1200", "input:350".
export const inputKey = (figure: number, unit: string) => `${INPUT_KEY}${unit === '$' ? '$' : ''}${figure}${unit === '%' ? '%' : ''}`;
export function parseInputKey(key: string): { figure: number; unit: string } | null {
  const m = new RegExp(`^${INPUT_KEY}(\\$?)(-?\\d+(?:\\.\\d+)?)(%?)$`).exec(key);
  return m ? { figure: Number(m[2]), unit: m[1] ? '$' : m[3] ? '%' : '' } : null;
}

// ── step roots (round 6 Task 72) ────────────────────────────────────────────
// Lorenzo, 21 Oct, round 6 (the step-check ruling; audit M1–M2, b37 Quillpath Raj e08c362a and Marcus eb8d7576: eight
// checker and code lines on figures built on a misread Starter lifetime, the one correction on a derived figure; the
// 14-month lifetime probed three times under other keys): "The deterministic step check may, without the checker
// agreeing: link derived claims to the flagged root and stop probing them; ask one neutral input question at the root
// (for example, "Which row did you use for cancellations?"). It may NOT voice a correction without the checker's
// agreement." On a case whose steps declare `dependsOn` or `inputQuestion` (pricing-001; prof-001 declares neither):
//   - a deterministic step flag (`recompute_report_only` or `recompute`) on a root step R — one with an input question,
//     or one other steps depend on — with the candidate's value v registers the root `step:R@v` (plan-turn.ts,
//     flags.stepRoots): its figures are v and the span's own wrong figures (13.5 months beside $405) — not a case
//     figure, not any step's right answer (the $30 margin), not a one-digit count ("3x");
//   - a checker or code flag on a step that depends on R (dependsOn, transitively), or whose span carries a root figure
//     (not its own), or that is built (rootOf) on a claim already linked, is linked: never probed; its own vetted
//     correction (the checker's flag) goes once per root step (fix round 1: round 5c's ruling 3, derivedOnce), else it
//     is left for the report — "built on <R>'s <v>, flagged by the step check" (planCheckerFlags; its key closed);
//   - the root gets one neutral question, the step's input question, in the checker probe's slot (plan-turn.ts);
//   - never a correction: a correction of R or of a linked claim still needs the checker's flag (the 16 Oct gate).
// A flag on a step that depends on a root, or carrying a root's figure, is linked to that root, never a root of its
// own (b37q Raj t33: starter_ratio_with_upgrades at 13.5). Several roots: the latest registered by the claim's message.
// endedAt (fix round 2): the message from which the root links no claim by dependency (stepRootEnds); by figure it still does.
export type StepRoot = { step: string; value: number; figures: number[]; since: number; span?: string; linked?: string[]; endedAt?: number };
export const STEP_ROOT = 'step:';
export const stepRootKey = (step: string, value: number) => `${STEP_ROOT}${attemptKey({ stepId: step, candidateValue: value })}`;
type RootStepDef = { id: string; answer: number; tolerance?: number; altAnswers?: number[]; dependsOn?: string[]; inputQuestion?: string };
const rootStepsOf = (c: { mathSteps: unknown[] }) => c.mathSteps as RootStepDef[];
// The case opts in by declaring either field on any step.
export function stepRootsDeclared(c: { mathSteps: unknown[] }): boolean {
  return rootStepsOf(c).some(st => (st.dependsOn?.length ?? 0) > 0 || st.inputQuestion !== undefined);
}
// The steps computed from `id`, transitively.
export function stepDependents(c: { mathSteps: unknown[] }, id: string): Set<string> {
  const out = new Set<string>();
  const add = (x: string) => { for (const st of rootStepsOf(c)) if ((st.dependsOn ?? []).includes(x) && !out.has(st.id)) { out.add(st.id); add(st.id); } };
  add(id);
  return out;
}
// A root step: one with an input question, or one others depend on.
export function isRootStep(c: { mathSteps: unknown[] }, id: string): boolean {
  return rootStepsOf(c).some(st => st.id === id && st.inputQuestion !== undefined) || stepDependents(c, id).size > 0;
}
export function inputQuestionOf(c: { mathSteps: unknown[] }, id: string): string | undefined {
  return rootStepsOf(c).find(st => st.id === id)?.inputQuestion;
}
// A span stating step R's right answer (its answer or an alternative, within 1%).
export function carriesRightOf(c: { mathSteps: unknown[] }, step: string, span: string): boolean {
  const st = rootStepsOf(c).find(x => x.id === step);
  if (!st) return false;
  // At its own scale: "$600k–$700k" (b37q Raj 39:1, value added a month) is no $600 LTV.
  const unscaled = [...normalizeNumberWords(span).matchAll(/(?<![\d.,])\$?(\d[\d,]*(?:\.\d+)?)(?![\d,]*\d)(?!\s*(?:k|m|mn|bn)\b|\s*(?:million|billion|thousand))/gi)]
    .map(m => parseFloat(m[1].replace(/,/g, '')));
  return unscaled.some(x => [st.answer, ...(st.altAnswers ?? [])].some(a => same(x, a)));
}
// Fix round 2 (controller ruling, 21 Oct; the review's probe: starter_net_value@1200 at t41, "$600 plus $800 is $1,400,
// minus $300 CAC gives $1,200 net" — an independent slip on the corrected $600 — was linked to starter_ltv@405 and
// silenced): a root links by dependency only while it stands. It stops, from the message it happens in, once the
// candidate states step R at another wrong value — outside v's tolerance and the right answer's (stepRootEnds, in
// plan-turn, from the deterministic check), a dependent claim's span carries R's right answer (stepRootEnds here, and
// planCheckerFlags on the checker's claims), or the root key is corrected or closed (`closed`). Linking by figure — a
// span carrying v or a linked figure (rootOf) — stays.
export function stepRootEnds(c: { mathSteps: unknown[] }, roots: Record<string, StepRoot>, stated: { stepId: string; value?: number; span: string }[], n: number): Record<string, number> {
  const ends: Record<string, number> = {};
  for (const [rk, r] of Object.entries(roots)) {
    if (r.endedAt !== undefined) continue;
    const st = rootStepsOf(c).find(x => x.id === r.step);
    const tol = st?.tolerance ?? 0;
    const deps = stepDependents(c, r.step);
    // Rule (a) on a new WRONG value only (the controller's ruling on the r6-final replay, 21 Oct: b37q Marcus t19's
    // "pure cancellation is closer to 4-5% … LTV around $600" — the right answer as a hypothetical, while he kept his 14
    // months — ended the $420 root and M2 went uncaught): outside v's tolerance and the right answer's. That value's own
    // flag registers its own root. The right answer restated ends nothing by itself; adoption shows through (c) or (b).
    const right = st ? [st.answer, ...(st.altAnswers ?? [])] : [];
    const wrongAgain = (x: number) => Math.abs(x - r.value) > tol && !right.some(a => Math.abs(x - a) <= tol);
    if (stated.some(x => (x.stepId === r.step && x.value !== undefined && wrongAgain(x.value))
      || (deps.has(x.stepId) && carriesRightOf(c, r.step, x.span)))) ends[rk] = n;
  }
  return ends;
}
// The root a claim is linked to — by the step its key names, or a root figure its span carries (not its own) — or null.
// `closed`: the closed or corrected checker keys (a root's key "R@v" among them ends its dependency links).
export function stepRootOf(p: { c: { mathSteps: unknown[] }; roots: Record<string, StepRoot>; key: string; span: string; own: number[]; n: number; caseFigures: number[]; closed?: ReadonlySet<string> }): string | null {
  const step = stepOfKey(p.key);
  const carried = numbersOf(normalizeNumberWords(p.span)).filter(x => !p.caseFigures.some(y => same(x, y)) && !p.own.some(y => same(x, y)));
  // By dependency only while the root stands (fix round 2, above).
  const stands = (r: StepRoot) => (r.endedAt === undefined || p.n < r.endedAt) && !p.closed?.has(attemptKey({ stepId: r.step, candidateValue: r.value }))
    && !carriesRightOf(p.c, r.step, p.span);
  // A claim of the root itself — its step at its figure (b37q Raj 33:0, "$30 a month, times expected 13.5 months on plan
  // = $405") — is not linked to it: the checker probes or corrects it as always.
  const hits = Object.entries(p.roots).filter(([, r]) => !(step === r.step && p.own.some(x => same(x, r.value)))
    && ((step !== r.step && stepDependents(p.c, r.step).has(step) && stands(r)) || carried.some(x => r.figures.some(y => same(x, y)))));
  if (hits.length === 0) return null;
  const by = hits.filter(([, r]) => r.since <= p.n).sort((a, b) => b[1].since - a[1].since);
  return (by[0] ?? [...hits].sort((a, b) => a[1].since - b[1].since)[0])[0];
}
// A root's figures: v, and the span's wrong figures (above).
export function stepRootFigures(c: { mathSteps: unknown[] }, value: number, span: string, caseFigures: number[]): number[] {
  const right = rootStepsOf(c).flatMap(st => [st.answer, ...(st.altAnswers ?? [])]);
  const extra = numbersOf(normalizeNumberWords(span)).filter(x => !same(x, value) && !caseFigures.some(y => same(x, y))
    && !right.some(y => same(x, y)) && !(Number.isInteger(x) && Math.abs(x) < 10));
  return [value, ...extra.filter((x, i) => extra.findIndex(y => same(x, y)) === i)];
}
// This message's step flags against the roots so far: a new root, or a flag linked to one (logged only).
export function registerStepRoots(c: { mathSteps: unknown[] }, roots: Record<string, StepRoot>, flags: Pick<RecomputeFlag, 'stepId' | 'candidateValue' | 'span' | 'kind'>[], n: number, caseFigures: number[], closed?: ReadonlySet<string>): { roots: Record<string, StepRoot>; registered: string[]; linked: { key: string; root: string }[] } {
  const out = { ...roots };
  const registered: string[] = [];
  const linked: { key: string; root: string }[] = [];
  for (const f of flags) {
    if ((f.kind ?? 'step') !== 'step') continue;
    const key = attemptKey(f);
    const root = stepRootOf({ c, roots: out, key, span: f.span, own: [f.candidateValue], n, caseFigures, closed });
    if (root && root !== stepRootKey(f.stepId, f.candidateValue)) { linked.push({ key, root }); continue; }
    const rk = stepRootKey(f.stepId, f.candidateValue);
    if (!isRootStep(c, f.stepId) || out[rk]) continue;
    out[rk] = { step: f.stepId, value: f.candidateValue, figures: stepRootFigures(c, f.candidateValue, f.span, caseFigures), since: n, span: f.span };
    registered.push(rk);
  }
  return { roots: out, registered, linked };
}
export const stepRootReason = (r: StepRoot) => `built on ${r.step}'s ${r.value}, flagged by the step check`;
// The root's input question as the interviewer model reads it: a probe, said as written — never a correction or a figure.
export function formatRootQuestionHint(line: string): string {
  return `MATH CHECK (the step check, in code, on an earlier figure of theirs):\n- Ask this, once, as written — "${line}" — and nothing else about it. Do not correct it, say any figure, or do arithmetic.`;
}

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
export function claimFigures(c: CheckerClaim & { ratio?: boolean }, caseNumbers: number[] = []): number[] {
  if (c.actualShare !== null) return [];
  const input = boundInput(c);
  // A ratio step's figure is the one said with x or times ("$750; 2.5x" → 2.5, key starter_ratio@2.5; 20 Oct).
  const ratios = c.ratio ? [...normalizeNumberWords(c.candidateValue).matchAll(RATIO_SAID)].map(m => parseFloat(m[1].replace(/,/g, ''))) : [];
  return (ratios.length > 0 ? ratios : numbersOf(c.candidateValue)).filter(n => (input === null || !same(n, input)) && !caseNumbers.some(x => same(n, x)));
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

// A phrase's words, singular ("costs" → cost), and its head noun: the last word
// before "of"/"per"/"from" ("contribution per flight" → contribution), else the last.
const stemsOf = (t: string) => (t.toLowerCase().match(/[a-z]+/g) ?? []).map(w => (w.length > 3 && w.endsWith('s') && !/(?:ss|is|us)$/.test(w) ? w.slice(0, -1) : w));
function headNounOf(phrase: string): string {
  const ws = phrase.split(/\s+/);
  const j = ws.findIndex(w => /^(?:of|per|from)$/i.test(w));
  return stemsOf((j > 0 ? ws.slice(0, j) : ws).at(-1) ?? '').at(-1) ?? '';
}

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
  const codeRight = codeComputed(c, ctx)?.values ?? [];
  const checkerRight = [c.correctValue, c.correctLow, c.correctHigh].filter((x): x is number => x !== null);
  const right = [...codeRight, ...checkerRight];
  const caseFigures = caseNumbersOf(caseData, revealedIds);
  const notCase = (r: number) => !caseFigures.some(x => same(r, x));
  const rightToCheck = right.filter(notCase);
  const pm = pricingValues(caseData, new Set(revealedIds));
  const q = c.codeQuantity;
  const step = q.kind === 'step' ? caseData.mathSteps.find(st => st.id === q.stepId) : undefined;
  const own = [...ownFigures(c, caseFigures), ...wordFigures(c.candidateValue)];
  const atOwn = (v: number) => own.some(x => same(v, x));
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
  // Lorenzo, 19 Oct (round-4 ruling 3; batch 33 Blake cb23e17b t17: his "6 to 7
  // points" closed stale on the "10" of "a 10–12% price increase" — the price,
  // not the gain): a figure closes a flag only when stated for the claim's own
  // quantity — the 15 Oct redo rule applied to the stale check — and never an
  // input the claim was computed from (a pricing claim's price, from its span).
  // Lorenzo, 20 Oct (E6): at the figure level — each figure bound to the phrase
  // it modifies (figure-binding.ts), not to any word of its sentence. Quillpath
  // Marisol t31 "$900 of CAC saved on 600 customers" closed her $900 Starter LTV
  // (right $600) because the sentence says "Starter"; Tyler t29 "0.20 × $4,000"
  // restated his 4× ratio; Hollis Bay Tyler t11 "fixed costs $3.0 + $4.5 + $1.5
  // = $9.0 million" never closed his 8.8. No engine-wide synonyms: a phrase
  // names the quantity by the checker's words for it, code's words for its kind
  // (KIND_CUE), or the case's cues for its step — a vocabulary miss is fixed in
  // the step's cues ("fixed costs", launch-001).
  // The checker's quantity less its conditions — what it is computed with or at
  // ("net margin effect of an 8% price rise with 8% volume loss": the volume loss
  // is an input, b30 Blake 01daac8b; "Starter standalone LTV at $60": a price).
  // A comparison is the quantity, not a condition ("Test vs control difference in
  // monthly margin", b35q Marisol 087451cb 23:3; fix round 1).
  const quantity = c.quantity.split(/\s+(?:with|at|from|by|given|assuming|if|under)\s+/i)[0];
  const subject = quantityWords(quantity);
  // By its head noun ("600 Starter customers" is customers, not Starter LTV), or —
  // when the head is a plain word ("the COGS gap", "labor dollars") — by its other words.
  const byChecker = (p: string) => {
    if (subject.size === 0) return false;
    const head = headNounOf(p);
    return quantityWords(head).size > 0 ? subject.has(head) : [...quantityWords(p)].some(w => subject.has(w));
  };
  // A step's cue names a phrase whose head noun is the cue's or the checker's
  // (round-4's residual, b33 Marisol 31e33506 15:2: "The remaining gap to 24% is
  // about 8 points" is the margin gap, not her other inputs, though the step's
  // cues hold "remaining").
  const cues = (step as { cues?: string[] } | undefined)?.cues ?? [];
  const cueWords = new Set(cues.flatMap(stemsOf));
  const byStep = (p: string) => cues.some(cue => cueNames(p, cue)) && (cueWords.has(headNounOf(p)) || subject.has(headNounOf(p)));
  const byCode = (p: string) => (KIND_CUE[q.kind]?.test(p) ?? false) || byStep(p);
  // Code's words name the checker's value too only when they name the checker's
  // quantity (b30 Blake 23:0: "if volume holds within 4%" is no 4-point gain;
  // code's breakeven words name the break-even volume, not his margin effect).
  const sameQuantity = byCode(quantity);
  // own: bound to the claim's quantity; other: bound to another; none: to no quantity.
  type Binding = { checker: boolean; code: boolean; other: boolean };
  // A figure tied to no quantity falls back to its sentence — the pre-E6 rule
  // (fix round 1 on the r5-46 replay: "…so 16 points", "an increase of 4.2
  // points", "that's 4.2 points added", "10.5 points of revenue", "…CAC, about
  // 4.7x" were real redos): bound when the sentence names the claim's quantity
  // by the checker's words, code's kind words or the step's cues. Never for an
  // operand, or a figure bound to another quantity.
  const bySentence = (x: string): Binding => {
    const ch = subject.size > 0 && [...quantityWords(x)].some(w => subject.has(w));
    const co = (KIND_CUE[q.kind]?.test(x) ?? false) || cues.some(cue => cueNames(x, cue));
    return { checker: ch || (co && sameQuantity), code: ch || co, other: false };
  };
  const bindingOf = (f: BoundFigure): Binding => {
    if (f.pronoun) {
      // "it"/"that" refers back to the claim when the claim's own figure was just said (Aldermoor Tyler t13).
      return numbersOf(f.lead).some(atOwn) ? { checker: true, code: true, other: false } : bySentence(f.sentence);
    }
    const ch = byChecker(f.phrase), co = byCode(f.phrase);
    const other = !ch && !co && quantityWords(f.phrase).size > 0;
    if (!ch && !co && !other && !f.operand) return bySentence(f.sentence);
    return { checker: ch || (co && sameQuantity), code: ch || co, other };
  };
  // The figure is a right figure stated for the claim's own quantity.
  const statedRight = (f: BoundFigure, pool: number[]) => {
    const b = bindingOf(f);
    return (b.code && codeRight.some(r => same(f.value, r) && pool.includes(r))) || (b.checker && checkerRight.some(r => same(f.value, r) && pool.includes(r)));
  };
  const inputs = FROM_PRICE.has(q.kind) ? [...numbersOf(c.span), ...(q.price !== null ? [q.price] : [])].filter(n => !own.some(x => same(n, x))) : [];
  const notInput = (n: number) => !inputs.some(x => same(n, x));
  // A message that still states the claim's figure, bound to it or to nothing.
  const namesClaim = (figs: BoundFigure[], text: string) => figs.some(f => atOwn(f.value) && !bindingOf(f).other) || wordFigures(text).some(atOwn);
  // A redo to the claim's right figure (Lorenzo, 15 Oct; batch 26 Marisol
  // 2456aa9d t7: "Let me redo it in dollars" — about COGS — withdrew her labor
  // claim, whose right figure, 15, its "Revenue grows 15%" also said): a right
  // figure that is also a case figure counts only stated for the claim's
  // quantity; any other right figure wherever it is not bound to another quantity.
  const redoneToRight = (figs: BoundFigure[], text: string) => factorFigures(text).filter(notInput).some(n => rightToCheck.some(r => same(n, r)))
    || figs.some(f => notInput(f.value) && ((rightToCheck.some(r => same(f.value, r)) && !bindingOf(f).other) || (!f.operand && statedRight(f, right))));
  for (const m of later) {
    const { text, questioned } = typeof m === 'string' ? { text: m, questioned: false } : m;
    const figs = boundFigures(text);
    const concession = sentencesOf(text).find(s => WITHDRAWN.test(s) || (REVISING.test(s) && /\d/.test(s)));
    if (concession && (questioned || namesClaim(figs, text) || redoneToRight(figs, text))) {
      return WITHDRAWN.test(concession) ? `withdrawn: "${concession}"` : `revised: "${concession}"`;
    }
    // An operand is an input of arithmetic, not the quantity stated (Larkspur
    // Marisol 6e5a1c90 t19: "8,000 flights × 60 passengers × $10 = $4.8M" is no
    // $10M of route contribution) — unless its own phrase names the claim's
    // quantity ("Pro at $4,000 / $1,200 = 3.3x" states Pro's LTV; b35q Marisol 21:3).
    const stated = figs.find(f => (!f.operand || f.phrase !== '') && notInput(f.value) && statedRight(f, rightToCheck));
    if (stated !== undefined) return `the right figure (${stated.value}) stated since`;
    if (NEEDED_KINDS.has(q.kind)) {
      const prices = [...priceAnswers(text), ...factorFigures(text)].filter(n => !own.some(x => same(n, x)));
      const answer = prices.find(n => right.some(r => near(n, r)));
      if (answer !== undefined) return `the right figure (${answer}) stated since`;
      const redo = prices.find(n => redoTargets.some(r => near(n, r)));
      if (redo !== undefined) return `redone for another target (${redo}% for the ${priorMargin}% margin)`;
    }
    const other = figs.find(f => BASE_CUE.test(f.sentence) && !f.operand && (bindingOf(f).checker || bindingOf(f).code) && rebased.some(r => same(f.value, r)));
    if (other !== undefined) return `the right figure on another base (${other.value}) stated since`;
    // Restated at a different value (Lorenzo, 19 Oct, R2; batch 32 Aldermoor
    // Marisol t9–t23: her $2,000 net price dropped five times as "restated" by
    // "List is $10,000 per patient per year" beside "$2,000 realized"): the
    // quantity said again at its own figure carries the error on — the key
    // dedupes it — and so does a message that still states the claim's figure.
    // A step span at a case figure is a quote of the data, not the quantity
    // restated ("List is $10,000" read as the net-price step; review M2), and
    // a figure in it that is an operand or bound to another quantity is not the
    // step's (E6: "0.20 × $4,000"; "The remaining gap to 24% is about 8 points").
    if (pm && q.kind !== 'none' && q.kind !== 'step') {
      const kind = q.kind === 'needed_for_margin' || q.kind === 'needed_for_gain' ? 'needed' : q.kind;
      const again = checkPricingClaims(text, pm).find(x => x.kind === kind && (kind === 'needed' || x.price === q.price));
      const value = again && (kind === 'needed' ? again.price : again.stated);
      if (again && value !== undefined && !atOwn(value) && !namesClaim(figs, text)) return `restated at ${value}: "${again.span}"`;
    }
    if (step) {
      const itsOwn = (x: { value: number; span: string }) => boundFigures(x.span).some(f => same(f.value, x.value) && !f.operand && !bindingOf(f).other);
      const again = findStepSpans(text, step as never).filter(itsOwn).find(x => !caseFigures.some(f => same(x.value, f)));
      if (again && !atOwn(again.value) && !namesClaim(figs, text)) return `restated at ${again.value}: "${again.span}"`;
    }
  }
  return null;
}

// Did the interviewer probe the claim since — ask for the working on, or
// doubt, one of its figures? Rule 14 counts that as the probe.
export function modelProbed(c: CheckerClaim, interviewerTexts: string[], candidateFigures: number[]): boolean {
  return probesOf(figuresOf(c), interviewerTexts, candidateFigures) > 0;
}
// The interviewer's own words in a turn: code's data lines taken out (controller,
// 20 Oct, round 5 Task 45 fix round 2; replay r5-45b, b35 Hollis Bay Marisol t24:
// the restated sampling line — "$1.5 million … 500,000 … 3 bags" — beside the
// turn's question was read as a probe of her 3x claim and spent its attempt). A
// ledger line said as a release or a restate (its own wording or a pre-written
// version), and each sentence that is a data-line frame (a restate lead-in, the
// exhibit handover, a refusal, a deferral, an offer) is code's, not a probe.
const DATA_LINE_POOLS = ['earlier', 'restate', 'restate_exhibit', 'exhibit', 'refuse', 'defer', 'gate_defer', 'wont_get_to', 'wont_get_to_that', 'offer'] as const;
const DATA_LINE_FRAMES: RegExp[] = DATA_LINE_POOLS.flatMap(k => (PHRASE_POOLS[k] as readonly string[]).map(t => new RegExp(`^${t.trim()
  .split(/\{[xX]\}/).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*')).join('[\\s\\S]*')}$`, 'i')));
export function interviewerOwnWords(text: string, ledgerValues: readonly string[]): string {
  let own = text;
  for (const v of ledgerValues) {
    // A line break where it was: its lead-in ("As the exhibit shows:") ends there, not in the model's next sentence.
    for (const said of [v, ...(dataLineVersions(v)?.versions ?? [])]) if (said.trim()) own = own.split(said).join('\n');
  }
  return sentencesOf(own).map(x => x.trim()).filter(x => x && !DATA_LINE_FRAMES.some(f => f.test(x))).join(' ');
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
// at (E7, an input's row fix): the message the correction was decided on — a claim on the input from that message or
// earlier was said before the candidate heard it, and the correction covered it.
export type CorrectedRoot = { line: string; figure?: string; at?: number };

// Whether the delivered text holds the checker's line (Lorenzo, 15 Oct): case,
// quotes, dashes and spacing aside — a paraphrase is not the vetted line.
const lineForm = (t: string) => t.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-')
  .replace(/[^a-z0-9%$.,'\- ]+/g, ' ').replace(/(?<!\d)[.,]|[.,](?!\d)/g, ' ').replace(/\s+/g, ' ').trim();
// A delivered line's count key (the controller's ruling on Task 19's concern 1, 19 Oct: Lorenzo's "a correction is
// said at most twice in total", per line as well as per key): case, quotes, dashes and spacing aside.
export const lineKey = (line: string) => lineForm(line);
// A probe opener's variants read as "you said" (probe_opener): the model saying the line with another lead-in is the same line.
const OPENER_VARIANTS = /(^| )(?:you mentioned|earlier you said|you put it at|you had)(?= )/g;
const asYouSaid = (t: string) => t.replace(OPENER_VARIANTS, '$1you said');
export function lineHeard(text: string, line: string, quote?: ProbeQuote): boolean {
  if (line.trim() === '') return false;
  if (lineForm(text).includes(lineForm(line))) return true;
  if (asYouSaid(lineForm(text)).includes(asYouSaid(lineForm(line)))) return true;
  // A correction said without its period lead-in ("From today's 6% margin, …") is heard: code saying the whole line again would say it twice.
  const core = line.replace(/^From today's \d+(?:\.\d+)?% margin,\s*/i, '');
  if (core !== line) return lineForm(text).includes(lineForm(core));
  // A late probe's quote (round-4 ruling 4): the probe as written is heard too after a sentence of the model's own (or
  // in it) that puts the claim to them — the claim's own figure (b32 Marisol 6e5a1c90 t24: "earlier you said getting
  // extras to $30 … = $4.8M. What were the steps in that calculation?"), or "you said / you mentioned / earlier you /
  // your …" with its words. A case figure it shares names no claim ("the 18-point drop", Task 30 review).
  if (!quote) return false;
  const said = splitSentences(text);
  const at = said.findIndex(s => lineForm(s).includes(lineForm(quote.bare)));
  if (at < 0) return false;
  const near = said.slice(Math.max(0, at - 1), at + 1).join(' ');
  if (quote.figure !== null && numbersOf(near).some(x => same(x, quote.figure!))) return true;
  return ATTRIBUTED.test(near) && mentions(near, quote.words, '');
}
const ATTRIBUTED = /\b(?:you(?:'ve| have)? (?:said|say|mentioned|put|had|estimated|sized|assumed|figured|called|totall?ed)|earlier,? you|your)\b/i;
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
  // A late probe's quote of its claim (round-4 ruling 4, lateProbe): what the heard check reads a model line by.
  quote?: ProbeQuote;
  // A correction said as a conversion — the figure right on the candidate's own
  // quantity, or no quantity stated (own-quantity.ts): no "not X", and its step closes.
  converted?: boolean;
  framing?: string;   // how the candidate framed the figure, for the log
  // A derived claim's own correction, once (R7 reversed): the root it is built on — booked, when the line is said, as
  // that root's one derived correction (flags.mathChecker.derivedOnce; Lorenzo, 20 Oct, ruling 3: one per root).
  onceRoot?: string;
  // Claims built on this line's root, 'derived' on it: handled only if the line is used and heard (plan-turn, settle-turn).
  riders?: { id: string; candidateTurnIndex: number; claim: VettedClaim }[];
  // E7: the input a probe, pointer or hint is on (booked in flags.inputProbes), and the inputs a row fix corrects (closed with it).
  input?: string;
  inputs?: string[];
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
  derivedOnce?: Record<string, string>; // the roots whose one derived correction was said (ruling 3), with the claim it went to
  stepProbes?: Record<string, number>; // probes spent on each step this interview (STEP_PROBE_CAP)
  inputProbes?: Record<string, number[]>; // the interviewer turns code's lines on each input were said on (INPUT_PROBE_CAP)
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
  // The exhibits shown so far (plan-turn): their cells are out to the candidate (the row fix, own-quantity.ts).
  shownExhibitIds?: string[];
  // The session's recent lines and the turn's seed: a neutral probe is said in one of its versions (phrasing.ts).
  phraseUses?: PhraseUses; seed?: string;
  // The right figures code's line on a finding states (the gate's, plan-turn): a misquote the gate will hold dedupes nothing.
  codeFigures?: (f: CodeFinding) => number[] | null;
  // The gate's decision on each of code's flags, by id (`n:code:i`; plan-turn: earlier turns'
  // code_gate rows, then this turn's). Given, a code flag dedupes the checker's claim only when
  // the gate released it — said by code; one ruled derived, not_rated, stale, expired or
  // disagreeing leaves the checker's claim standing (engine-asks final review, 19 Oct).
  gateOutcomes?: Record<string, GateOutcome>;
  // The step check's roots (round 6 Task 72; plan-turn's flags.stepRoots, this message's included): claims linked to one
  // are left for the report, never probed. Absent or empty (prof-001): as before.
  stepRoots?: Record<string, StepRoot>;
  // Fix round 2 (controller ruling, 21 Oct: a fresh root's input question first): the linked claims' own corrections
  // wait this turn — not decided, still waiting (plan-turn plans again with this when the root's question is due).
  holdLinked?: boolean;
  // Phase 1 task 2 (the `staleProbeDrop` switch; plan-turn, from the worksheet): before a probe or correction on a claim is
  // chosen, why it is stale — the candidate has since stated a newer value for its quantity, or withdrawn its figure or
  // one it is built on — else null. A stale claim is dropped, logged `stale_drop`; the next one in the queue goes.
  staleDrop?: (e: { id: string; n: number; c: VettedClaim }) => string | null;
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
  stepLinked?: Record<string, string>; // keys linked to a step root this turn → the root (round 6 Task 72)
  stepRootEnded?: Record<string, number>; // roots whose dependency links end, from the message given (fix round 2)
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

// Lorenzo, 19 Oct (round-4 ruling 4; b33 Blake cb23e17b t22: "Walk me through how you got there." arrived two turns
// after his t19 claim, behind the follow-up question, so "there" pointed at his first-step answer): a bare probe — one
// naming no figure and no words of its claim — said later than the turn right after the claim (message n is answered
// on turn n + 1) quotes the claim, in the candidate's own words (FR-4). The checker's verdict lands a turn late, so
// each probe, pointer and hint it selects is said on n + 3 at the earliest. The quote is short, for the voice (the
// controller's ruling on the Task 30 review): the claim's own figure as written ("You said “$4.8M” — …"), else at most
// QUOTE_WORDS of their words around the claim ("You said “…closer to one, I lose the entire margin recovery” — …").
export type ProbeQuote = { bare: string; figure: number | null; words: string };
export const QUOTE_WORDS = 15;
export function lateProbe(line: string, c: Pick<CheckerClaim, 'span' | 'candidateValue'>, message: string, at: { claim: number; spoken: number }, caseNumbers: number[] = []): { line: string; quote?: ProbeQuote } {
  if (at.spoken <= at.claim + 1 || namesClaim(line, c)) return { line };
  const q = claimQuote(c, message, caseNumbers);
  if (!q) return { line };
  return { line: `You said “${q.text}” — ${/^[A-Z][a-z]/.test(line) ? line[0].toLowerCase() + line.slice(1) : line}`, quote: { bare: line, figure: q.figure, words: c.span } };
}
// Lorenzo, 19 Oct (round-4 ruling 6; b33 Marisol: two consecutive checker lines both opened "You said …"): the leading
// "You said" of a probe line — code's late quote ("You said “…” — …") or the checker's own line — rotates through
// probe_opener. Wording only: the rest of the line is byte-identical. "You put it at" and "You had" read only before the
// claim's own figure ("You put it at “$4.8M” — …"); before a quoted clause or the checker's own words (unknown) the first
// three (PROBE_OPENER_CLAUSE) are used.
export const PROBE_OPENER_CLAUSE = 3;
export function withProbeOpener<T extends { line: string; quote?: ProbeQuote }>(r: T, uses: PhraseUses | undefined, seed: string): T {
  if (!/^You said\b/.test(r.line)) return r;
  const figureForm = r.quote !== undefined && r.quote.figure !== null && r.line.startsWith('You said “');
  const clause = PHRASE_POOLS.probe_opener.slice(0, PROBE_OPENER_CLAUSE) as readonly string[];
  const opener = line('probe_opener', uses, seed, figureForm ? undefined : v => clause.includes(v));
  return { ...r, line: opener + r.line.slice('You said'.length) };
}
export const quoteLateProbe = (...a: Parameters<typeof lateProbe>): string => lateProbe(...a).line;
const tokensOf = (t: string) => lineForm(t).split(' ').filter(Boolean);
// A figure of the claim, or three of its words in a row.
function mentions(text: string, span: string, value: string): boolean {
  const figs = numbersOf(`${span} ${value}`);
  if (numbersOf(text).some(x => figs.some(y => same(x, y)))) return true;
  const words = tokensOf(span);
  const said = ` ${tokensOf(text).join(' ')} `;
  return words.some((_, i) => i + 3 <= words.length && said.includes(` ${words.slice(i, i + 3).join(' ')} `));
}
// …or the claim put to them in the checker's words: a sentence opening "You said / put / total / estimated / sized /
// assumed …" sharing a word of the claim ("You said about half of the COGS pressure is masked…", b29 Jordan ea27d1f6 t12)
// — not "how you got there", nor "the overhead you mentioned".
const PUT_TO_THEM = /(?:^|[.?!]\s+)(?:earlier,?\s+)?you(?:'ve| have)? (?:said|say|put|total|totalled|totaled|estimated|sized|assumed)\b([^.?!]*)/gi;
const PLAIN = new Set(['that', 'this', 'there', 'with', 'from', 'what', 'which', 'when', 'where', 'have', 'into', 'about', 'roughly', 'your', 'they', 'them', 'than', 'then', 'just', 'only', 'would', 'could', 'should', 'does', 'were', 'been', 'being', 'some', 'more', 'most', 'much']);
const claimWords = (t: string) => new Set(tokensOf(t).filter(w => w.length >= 4 && !PLAIN.has(w)));
function putToThem(line: string, span: string): boolean {
  const own = claimWords(span);
  const figs = numbersOf(span);
  return [...line.matchAll(PUT_TO_THEM)].some(m => [...claimWords(m[1])].some(w => own.has(w)) || numbersOf(m[1]).some(x => figs.some(y => same(x, y))));
}
const namesClaim = (line: string, c: Pick<CheckerClaim, 'span' | 'candidateValue'>) => putToThem(line, c.span) || mentions(line, c.span, c.candidateValue);
const ELLIPSIS = /\s*(?:\.{3}|…)\s*/g;
const splitSentences = (t: string) => t.split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(Boolean);
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// The text as the candidate wrote it, dashes, quotes and spacing aside; null if it isn't theirs.
function verbatim(part: string, message: string): string | null {
  const alt = (ch: string) => /[-–—−]/.test(ch) ? '[-–—−]' : /['‘’]/.test(ch) ? "['‘’]" : /["“”]/.test(ch) ? '["“”]' : esc(ch);
  const words = part.trim().split(/\s+/).map(w => [...w].map(alt).join(''));
  return words.length > 0 ? new RegExp(words.join('\\s+'), 'i').exec(message)?.[0] ?? null : null;
}
// A figure as written (recompute.ts figureAsWritten's form: "$4.8M", "14%", "5 points"), a range's other end and a
// thousands separator included ("6 to 7 points", "8,000"); null if the text doesn't hold it.
function figureWritten(text: string, f: number): string | null {
  const forms = [...new Set([String(f), f.toLocaleString('en-US', { maximumFractionDigits: 6 })])].map(esc).join('|');
  const m = new RegExp(`(?:\\$\\s?)?(?<![\\d.,])(?:${forms})(?![\\d,]*\\d)(?:\\s*(?:[–-]|to)\\s*\\$?\\d[\\d,]*(?:\\.\\d+)?)?(?:\\s?%|\\s+(?:percentage\\s+)?points?|\\s+percent|\\s?(?:million|billion|thousand|m|bn|k)\\b)?`, 'i').exec(text);
  return m ? m[0] : null;
}
// What the probe quotes. The claim's own figure (its value's, not a case figure), as written in its span or message.
// Else their words: the span's sentence holding the claimed figure (else its last), each part around an ellipsis as
// written — or, the span not in their words, their sentence holding the longest run (three or more) of its words, with
// a figure of it when it has one — cut to QUOTE_WORDS words around the claim's words, "…" where cut; else nothing.
function claimQuote(c: Pick<CheckerClaim, 'span' | 'candidateValue'>, message: string, caseNumbers: number[]): { text: string; figure: number | null } | null {
  const own = numbersOf(c.candidateValue);
  const pieces = splitSentences(c.span.replace(ELLIPSIS, ' … '));
  const piece = pieces.find(s => numbersOf(s).some(x => own.some(y => same(x, y)))) ?? pieces.at(-1);
  if (!piece) return null;
  const parts = piece.split(ELLIPSIS).filter(s => s.trim());
  const found = parts.map(s => verbatim(s, message));
  for (const f of own.filter(x => !caseNumbers.some(y => same(x, y)))) {
    const written = [...found.filter((s): s is string => s !== null), message].map(t => figureWritten(t, f)).find(Boolean);
    if (written) return { text: written, figure: f };
  }
  let text: string | null = found.length > 0 && found.every(Boolean) ? found.join(' … ') : null;
  if (!text) {
    const want = tokensOf(piece);
    const figs = numbersOf(piece);
    let best: { s: string; run: number } | null = null;
    for (const s of splitSentences(message)) {
      if (figs.length > 0 && !numbersOf(s).some(x => figs.some(y => same(x, y)))) continue;
      const have = tokensOf(s);
      let run = 0;
      for (let i = 0; i < want.length; i++) for (let j = 0; j < have.length; j++) {
        let k = 0;
        while (i + k < want.length && j + k < have.length && want[i + k] === have[j + k]) k++;
        run = Math.max(run, k);
      }
      if (run >= 3 && (!best || run > best.run)) best = { s, run };
    }
    text = best?.s ?? null;
  }
  return text ? { text: clipQuote(text, c, piece), figure: null } : null;
}
// At most QUOTE_WORDS words: the window holding most of the claim's value words (counted twice) and span words.
function clipQuote(text: string, c: Pick<CheckerClaim, 'candidateValue'>, piece: string): string {
  const trim = (s: string) => s.replace(/[\s.,;:—–-]+$/, '');
  const words = trim(text).split(/\s+/);
  if (words.length <= QUOTE_WORDS) return trim(text);
  const value = new Set(tokensOf(c.candidateValue));
  const span = new Set(tokensOf(piece));
  const score = (w: string) => tokensOf(w).reduce((n, t) => n + (value.has(t) ? 2 : 0) + (span.has(t) ? 1 : 0), 0);
  let best = 0;
  let bestScore = -1;
  for (let i = 0; i + QUOTE_WORDS <= words.length; i++) {
    const s = words.slice(i, i + QUOTE_WORDS).reduce((n, w) => n + score(w), 0);
    if (s > bestScore) { best = i; bestScore = s; }
  }
  const cut = words.slice(best, best + QUOTE_WORDS).join(' ').replace(/^[\s,;:—–-]+/, '');
  return `${best > 0 ? '…' : ''}${best + QUOTE_WORDS < words.length ? `${trim(cut)}…` : cut}`;
}

export function planCheckerFlags(p: CheckerPlanInput): CheckerPlan {
  const handled = new Set(p.handled);
  const decisions: CheckerDecision[] = [];
  const flaggedFigures: number[] = [];
  const droppedStamps: CheckerPlan['droppedStamps'] = [];
  // once: a claim built on a root left for the report, eligible for its own correction once (R7 reversed, onClosedRoot).
  const eligible: { id: string; n: number; c: VettedClaim; key: string; figs: number[]; codeProbed?: boolean; carried?: boolean; restate?: { line: string; figure?: string; own: string }; once?: { root: string; sel: CheckerSelection }; linkedTo?: string }[] = [];
  const caseNumbers = caseNumbersOf(p.caseData, p.revealedIds);
  // …and the prompt's changes ("18 points" from 24% to 6%): a figure the claim cites, never its own (a late probe's quote).
  const caseFigures = [...caseNumbers, ...numbersOf(changeFigures([p.caseData.prompt]).join(' '))];
  const ledgerValues = p.caseData.dataLedger.map(i => i.value);
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
  // The keys an earlier turn left for the report (an expired claim built on one records it as its root, for the report).
  const leftForReportKeys = new Set(p.rows.filter(r => (r.category ?? MATH_CHECKER_CATEGORY) === MATH_CHECKER_CATEGORY && r.subtype === 'flag')
    .map(r => r.payloadJsonb as CheckerDecision).filter(d => d.outcome === 'unresolved' && /left for the report/.test(d.reason)).map(d => d.key));
  const laterMessages = (n: number) => [...p.turnRows.filter(t => t.role === 'candidate' && t.turnIndex > n).map(t => ({ text: t.text, index: t.turnIndex })), { text: p.candidateText, index: p.candidateTurnIndex }];
  // Did the interviewer line just before message m question this claim — code's checker line on it, or the model asking about its own figures?
  const questionedBefore = (id: string, c: CheckerClaim, m: number) => {
    if (delivered.some(x => x.at === m - 2 && (x.d.id === id || x.d.key === checkerKey(c)))) return true;
    const line = [...p.turnRows].reverse().find(t => t.role === 'interviewer' && t.turnIndex < m)?.text;
    return line !== undefined && probesOf(ownFigures(c, caseNumbers), [interviewerOwnWords(line, ledgerValues)], p.candidateFigures) > 0;
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
  const vetCtx: VetContext = { caseData: p.caseData, revealedIds: p.revealedIds, shownExhibitIds: p.shownExhibitIds ?? [], candidateTexts: laterMessages(-1).map(x => x.text) };
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
        // …or one left for the report (Task 55 fix round 1, controller's ruling): recorded only — no line, no other effect.
        const leftForReport = root !== null && (leftForReportKeys.has(root) || (closed.has(root) && p.corrected?.[root] === undefined));
        decisions.push({ ...decision(id, v.candidateTurnIndex, c, 'expired', `${later.length} messages since the claim`), ...(restating || leftForReport ? { root: root! } : {}) });
        handled.add(id);
        return;
      }
      // Matched by their figures — their value's own numbers when all are case figures (a "40 points" when 40 is also the bean rise).
      const input = boundInput(c);
      const ownFigs = figs.length > 0 || c.actualShare !== null ? figs : numbersOf(c.candidateValue).filter(n => input === null || !same(n, input));
      const idFigs = [...ownFigs, ...wordFigures(c.candidateValue).filter(w => !ownFigs.some(x => same(x, w)))];
      const key = flagKeyFor(c, idFigs, keys);
      if (closed.has(key)) {
        // A key a step root linked (round 6 Task 72): restated, it stays linked — the root's reason, for the report.
        // (One corrected — its derived correction said, fix round 1 — is a corrected key like any other.)
        const linkedTo = p.corrected?.[key] ? undefined : Object.entries(p.stepRoots ?? {}).find(([, r]) => (r.linked ?? []).includes(key));
        decisions.push(linkedTo ? { ...decision(id, v.candidateTurnIndex, c, 'unresolved', stepRootReason(linkedTo[1]), undefined, key), root: linkedTo[0] }
          : decision(id, v.candidateTurnIndex, c, 'unresolved', 'restated after the flag closed (corrected, or left for the report)', undefined, key));
        handled.add(id);
        return;
      }
      if (!keys[key]) keys[key] = { figures: idFigs, since: v.candidateTurnIndex };
      else keys[key] = { ...keys[key], figures: [...keys[key].figures, ...idFigs.filter(f => !keys[key].figures.some(x => same(f, x)))] };
      flaggedFigures.push(...figs);
      eligible.push({ id, n: v.candidateTurnIndex, c, key, figs, codeProbed: codeFlag !== undefined && codeSaid(v, codeFlag) });
    });
  }
  // Step roots (round 6 Task 72; Lorenzo, 21 Oct, the step-check ruling, above): a claim on a step built on a root the
  // step check flagged, carrying a root figure, or built (rootOf) on a claim linked already — this turn's or an earlier
  // turn's (the roots' `linked`) — is never probed (never a rider either). Fix round 1 (controller ruling, 21 Oct:
  // "Linking stops PROBES only. A checker-agreed correction on a linked claim still goes out under round 5c's ruling 3,
  // one derived correction per root"): it gets its own vetted correction, once per root step (p.derivedOnce, keyed
  // `step:<R>` — both of Marcus's starter_ltv roots, t15 $900 and t17 $420, share one), through the queue's once path
  // (below, after the closed-root pass); no true line, its line said already, or the root's one said → the report, its
  // key closed. A claim of the root itself (R at its own figure) is not linked: the checker probes or corrects it as
  // always, the root's input question counted as its first probe (plan-turn) — that correction is the root's own, not
  // the derived one.
  const stepLinked: Record<string, string> = {};
  const linkedOut: { e: typeof eligible[number]; root: string }[] = [];
  // Fix round 2: a checker claim on a dependent step whose span carries R's right answer ends R's dependency links from
  // its message (flagged or not) — kept with the roots (plan-turn, `stepRootEnded`).
  const stepRootEnded: Record<string, number> = {};
  const roots: Record<string, StepRoot> = Object.fromEntries(Object.entries(p.stepRoots ?? {}).map(([rk, r]) => {
    const deps = stepDependents(p.caseData, r.step);
    // Only a claim from the root's own message on (Task 72 re-review minor): a right answer stated before R registered can't end it at birth.
    const at = verdicts.filter(v => v.candidateTurnIndex >= r.since).flatMap(v => v.claims.filter(c => c.codeQuantity.kind === 'step' && deps.has(c.codeQuantity.stepId ?? '') && carriesRightOf(p.caseData, r.step, c.span))
      .map(() => v.candidateTurnIndex))[0];
    if (at === undefined || (r.endedAt !== undefined && r.endedAt <= at)) return [rk, r];
    stepRootEnded[rk] = at;
    return [rk, { ...r, endedAt: at }];
  }));
  const closedOrCorrected = new Set([...closed, ...Object.keys(p.corrected ?? {})]);
  if (Object.keys(roots).length > 0) {
    const linkedBefore = new Map(Object.entries(roots).flatMap(([rk, r]) => (r.linked ?? []).map(k => [k, rk] as const)));
    const linkOf = (e: typeof eligible[number]): string | null => {
      const direct = stepRootOf({ c: p.caseData, roots, key: e.key, span: e.c.span, own: idFigsOf(e.c), n: e.n, caseFigures: caseNumbers, closed: closedOrCorrected });
      if (direct) return direct;
      const on = rootOf(e.c.span, e.key, keys, caseNumbers);
      return on ? stepLinked[on] ?? linkedBefore.get(on) ?? null : null;
    };
    for (let changed = true; changed;) {
      changed = false;
      for (const e of eligible) {
        if (stepLinked[e.key]) continue;
        const root = linkOf(e);
        if (root) { stepLinked[e.key] = root; changed = true; }
      }
    }
    for (const e of [...eligible]) {
      const root = stepLinked[e.key];
      if (!root) continue;
      eligible.splice(eligible.indexOf(e), 1);
      linkedOut.push({ e, root });
    }
  }
  // E7: each flagged claim's misread input — its own figure when that is a figure of the data (dataFigure), else a
  // known input's figure carried in its span in its unit, or as a fraction ("1 / 0.215" → 21.5%), stated no later than
  // the claim, else the input of an earlier claim it restates (same head figure, same unit: "$2,400" again) or whose
  // figure it carries in that figure's unit ("Pro at 2.0x" on her "ratio 2.0"; the case's "2.0%" is another figure —
  // review I3). Never a claim that uses the figure for its own row (onItsOwnRow: after the fix, "Starter: 1 / 0.40").
  // An input is keyed by its figure and unit ("input:21.5%", "input:$1200").
  const ordered = [...flaggedSoFar].sort((a, b) => a.n - b.n);
  const inputOf = new Map<string, string>();
  const ownsInput = new Set<string>();
  const inputSince = new Map<string, number>();   // an input → the message it was first stated in
  const dataTexts = [p.caseData.prompt, ...p.caseData.dataLedger.filter(d => p.revealedIds.includes(d.id)).map(d => d.value)];
  const isData = (x: { value: number; unit: string }) => dataTexts.some(t => figuresIn(t).some(y => same(y.value, x.value) && unitsAgree(y.unit, x.unit)));
  // A claim's own figures as written in its value, less the input code computes from and a bare one-digit count ("3 steps").
  const ownAt = (c: VettedClaim) => { const input = boundInput(c); return figuresIn(c.candidateValue).filter(x => (input === null || !same(x.value, input)) && !(x.unit === '' && /^\d$/.test(x.raw))); };
  const headAt = (c: VettedClaim) => { const h = ownAt(c)[0]; return h === undefined || isData(h) ? null : h; };
  // The claims that state the misread itself: the input as their own figure, or carried in its unit or as a fraction.
  const statesInput = new Map<string, string>();
  for (const f of ordered) {
    const own = dataFigure(f.c, vetCtx);
    if (own === null) continue;
    const unit = figureUnits(f.c.candidateValue, own)[0] ?? figureUnits(f.c.span, own)[0] ?? '';
    if (onItsOwnRow(own, f.c, vetCtx, unit)) continue;
    const k = inputKey(own, unit);
    inputOf.set(f.id, k);
    ownsInput.add(f.id);
    statesInput.set(f.id, k);
    if (!inputSince.has(k) || inputSince.get(k)! > f.n) inputSince.set(k, f.n);
  }
  for (const f of ordered) {
    if (ownsInput.has(f.id)) continue;
    const carried = figuresIn(`${f.c.span} ${f.c.candidateValue}`).flatMap(x => (x.value > 0 && x.value < 1 ? [x, { ...x, value: Math.round(x.value * 1e6) / 1e4, unit: '%' }] : [x]));
    const head = headAt(f.c);
    const restated = head && ordered.find(g => g.n <= f.n && g.id !== f.id && inputOf.has(g.id) && !ownsInput.has(g.id)
      && (() => { const h = headAt(g.c); return h !== null && same(h.value, head.value) && unitsAgree(h.unit, head.unit); })());
    // …or a figure of an earlier claim on an input, not one of the data's in its unit: "$30 × 56 months ≈ $1,675 … ≈
    // 5.6x" is built on her "4.65 years (~56 months)", itself on 21.5 (rootOf's link, one input down).
    const via = ordered.find(g => g.n <= f.n && g.id !== f.id && inputOf.has(g.id)
      && ownAt(g.c).some(x => !isData(x) && carried.some(y => same(y.value, x.value) && unitsAgree(y.unit, x.unit))));
    const direct = [...inputSince].find(([key, since]) => { const i = parseInputKey(key)!; return since <= f.n && carried.some(y => same(y.value, i.figure) && y.unit === i.unit); })?.[0];
    const k = direct ?? (restated ? inputOf.get(restated.id) : undefined) ?? (via ? inputOf.get(via.id) : undefined);
    if (k !== undefined && !onItsOwnRow(parseInputKey(k)!.figure, f.c, vetCtx, parseInputKey(k)!.unit)) {
      inputOf.set(f.id, k);
      if (direct !== undefined) statesInput.set(f.id, direct);
      continue;
    }
    // Controller's ruling (fix round 2; re-review I3, her t11 "Starter sits above it" — Starter clearing 3x, said in the
    // message that reads 40% as Pro's): a claim in a message that states the misread is on its chain, whatever its own
    // figures (its "3x" is the board's rule, a case figure in its unit). Before the fix it is covered; after, it hears
    // the fix once more (round-2 ruling 1). Its own row is no test here: it doesn't use the figure.
    const mate = ordered.find(g => g.n === f.n && g.id !== f.id && statesInput.has(g.id));
    if (mate) inputOf.set(f.id, statesInput.get(mate.id)!);
  }
  const inputKeyOf = (e: { id: string }) => inputOf.get(e.id) ?? null;
  // The interviewer turns that probed an input: code's lines on it (flags.inputProbes), and every turn since it was
  // first stated whose own words ask about it — its figure in its unit doubted, its working asked for, or put back to them with a
  // question ("you used 21.5% for Starter and 40% for Pro. Walk me through where each of those came from", Marisol t6)
  // — or about a figure of a claim built on it (probesOf; a case figure there names the data, not the claim).
  const inputTurns = (key: string): Set<number> => {
    const input = parseInputKey(key)!;
    const since = inputSince.get(key) ?? Infinity;
    const onIt = ordered.filter(f => inputOf.get(f.id) === key);
    const chain = [...new Set(onIt.flatMap(f => idFigsOf(f.c)))].filter(x => !same(x, input.figure) && !caseNumbers.some(y => same(x, y)));
    // …and its claims' own figures in their units, data-coincident ones too ("2.0x" is not the case's "2.0%").
    const chainAt = onIt.flatMap(f => ownAt(f.c)).filter(x => !isData(x)).map(x => ({ figure: x.value, unit: x.unit }));
    const turns = new Set(p.inputProbes?.[key] ?? []);
    for (const t of p.turnRows) {
      if (t.role !== 'interviewer' || t.turnIndex <= since || turns.has(t.turnIndex)) continue;
      const own = interviewerOwnWords(t.text, ledgerValues);
      const all = sentencesOf(own);
      const asks = /\?|\b(?:walk|talk|take) me through\b|\bexplain\b|\btell me how\b|\bshow me how\b/i.test(own);
      const onF = all.some((x, i) => inputProbed(x, [input, ...chainAt], p.candidateFigures, all[i - 1], asks) !== undefined);
      if (onF || probesOf(chain, [own], p.candidateFigures) > 0) turns.add(t.turnIndex);
    }
    return turns;
  };
  // The input's correction: the row fix, read on the claim or — the first that has one — on another claim of the input,
  // its own claims first. It corrects every input whose figure it states in its unit (a swap: one line for both).
  const inputCorrection = (e: { id: string; n: number; c: VettedClaim }, attempt: number): CheckerSelection | null => {
    const key = inputOf.get(e.id);
    if (key === undefined) return null;
    const input = parseInputKey(key)!;
    const others = ordered.filter(f => f.id !== e.id && inputOf.get(f.id) === key);
    const claims = [...(ownsInput.has(e.id) ? [e] : []), ...others.filter(f => ownsInput.has(f.id)), ...(ownsInput.has(e.id) ? [] : [e]), ...others.filter(f => !ownsInput.has(f.id))];
    for (const x of claims) {
      const fix = rowFix(input.figure, x.c, vetCtx, input.unit);
      if (!fix) continue;
      const inputs = [...new Set([key, ...[...inputSince.keys()].filter(k => { const i = parseInputKey(k)!; return i.unit === input.unit && fix.pair.some(y => same(i.figure, y)); })])];
      return { id: e.id, candidateTurnIndex: e.n, key, attempt, action: 'correct', line: fix.line, derived: [], claim: e.c, framing: fix.note, inputs };
    }
    return null;
  };
  // A claim whose own figure is a misread of the data is corrected only by the row fix — "not 21.5%" against a figure
  // right on its own row is never said (Lorenzo, 20 Oct, Review Focus 6).
  const correctionOf = (id: string, n: number, c: VettedClaim, key: string, attempt: number) => (ownsInput.has(id) ? inputCorrection({ id, n, c }, attempt) : correction(id, n, c, key, attempt));
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
  // R7 reversed (Lorenzo, 20 Oct, round-5b job 1; b33 Marisol 31e33506 11:0, "about 4.2 points of revenue, not 5.8"): a
  // claim built on a root that went to the report with no code line said gets its own vetted correction, once — through
  // own-quantity framing (correctionOf: framedCorrection, or the row fix of a misread input), the checker's flag as
  // always; no probe, pointer or hint. No true line on their reading → the report, as before; its line said already
  // (on an earlier turn, for it or another claim) → the report: a derived claim's correction is said at most once.
  // Ruling 3 (Lorenzo, 20 Oct, round-5b review: "Ruling 11 changed: one derived correction per root, not per derived
  // claim; the root's other derived claims go to the report"): one per root — keyed by the root (p.derivedOnce, booked
  // by plan-turn when the line is said, undone with it), so a root's other derived claims go to the report, on any turn.
  const ownOnce = (e: typeof all[number]): CheckerSelection | null => correctionOf(e.id, e.n, e.c, e.key, (p.attempts[e.key] ?? 0) + 1);
  const saidOnce = (s: CheckerSelection) => (p.said?.[lineKey(s.line)] ?? 0) >= 1;
  // …else the report: "built on a closed input" (no true line), or its own line already said.
  const builtToReport = (e: typeof all[number], root: string, said?: CheckerSelection) => {
    decisions.push({ ...decision(e.id, e.n, e.c, 'unresolved', !said ? `built on a closed input (${root})`
      : `built on a closed input (${root}) — its own correction was said once already; left for the report`, said?.line, e.key), root });
    handled.add(e.id);
  };
  // …in the queue: the claim with its correction, ready for the selection — unless its root's one was said already.
  const onceEntry = (e: typeof all[number], root: string) => {
    const by = p.derivedOnce?.[root];
    if (by !== undefined) {
      decisions.push({ ...decision(e.id, e.n, e.c, 'unresolved', `built on a closed input (${root}) — one correction per root, said already (${by}); left for the report`, undefined, e.key), root });
      handled.add(e.id);
      return null;
    }
    const sel = ownOnce(e);
    if (!sel || saidOnce(sel)) { builtToReport(e, root, sel ?? undefined); return null; }
    return { ...e, once: { root, sel } };
  };
  const onClosedRoot = (e: typeof all[number], root: string) => {
    // An old or malformed record with no line restates nothing: a closed input (Task 18 review).
    const fix = p.corrected?.[root]?.line?.trim() ? p.corrected[root] : undefined;
    // E7: said before the input's correction was heard — that correction covered it.
    if (fix?.at !== undefined && e.n <= fix.at) {
      decisions.push({ ...decision(e.id, e.n, e.c, 'unresolved', `built on a corrected input (${root}) — said before its correction, which covered it`, undefined, e.key), root });
      handled.add(e.id);
      return;
    }
    if (fix && !restated.has(root) && !saidTwice(fix.line)) {
      if (eligible.some(x => x.key === root && x.restate)) built.push({ e, root });
      else eligible.push({ ...e, key: root, restate: { line: fix.line, ...(fix.figure ? { figure: fix.figure } : {}), own: e.key } });
      return;
    }
    if (!fix) {
      const once = onceEntry(e, root);
      if (once) eligible.push(once);
      return;
    }
    decisions.push({ ...decision(e.id, e.n, e.c, 'unresolved', restated.has(root) ? `built on a corrected input (${root}) — restated once already; left for the report`
      : `built on a corrected input (${root}) — its correction was already said twice; left for the report`, undefined, e.key), root });
    handled.add(e.id);
  };
  for (const e of all) {
    // E7: a claim on a misread input that was corrected or left for the report goes as a claim on a closed root does.
    const im = inputKeyOf(e);
    if (im && closed.has(im)) {
      eligible.splice(eligible.indexOf(e), 1);
      onClosedRoot(e, im);
      continue;
    }
    const first = direct.get(e.id);
    if (!first) continue;
    const root = rootFrom(first);
    eligible.splice(eligible.indexOf(e), 1);
    if (closed.has(first) || closed.has(root)) onClosedRoot(e, root);
    else built.push({ e, root });
  }
  // The linked claims (fix round 1, above): each its own correction once per root step, else the report.
  for (const { e, root } of linkedOut) {
    const r = roots[root];
    const slot = `${STEP_ROOT}${r.step}`;
    const toReport = (why: string, line?: string) => {
      decisions.push({ ...decision(e.id, e.n, e.c, 'unresolved', `${stepRootReason(r)}${why}`, line, e.key), root });
      handled.add(e.id);
      if (!closedNow.includes(e.key)) closedNow.push(e.key);
    };
    const by = p.derivedOnce?.[slot];
    if (by !== undefined) { toReport(` — one correction per root, said already (${by}); left for the report`); continue; }
    const sel = ownOnce(e);
    if (!sel) { toReport(''); continue; }
    if (saidOnce(sel)) { toReport(' — its own correction was said once already; left for the report', sel.line); continue; }
    eligible.push({ ...e, once: { root: slot, sel }, linkedTo: root });
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
  const order = (a: typeof eligible[number], b: typeof eligible[number]) => Number(b.id === p.held) - Number(a.id === p.held) || final(b) - final(a) || rank(b) - rank(a) || Number(changes(b)) - Number(changes(a))
    || Number(Boolean(b.restate)) - Number(Boolean(a.restate)) || a.n - b.n;
  eligible.sort(order);
  let selected: CheckerSelection | null = null;
  // The step root a linked claim's own correction is built on (fix round 1): its decision names it.
  let selectedLinked: string | undefined;
  // Linked claims held back for the root's question (fix round 2, holdLinked): back in the queue after the selection.
  const heldLinked: typeof eligible = [];
  const waiting = [...eligible];
  // A key that goes to the report this turn, with no line said: the claims built on it join the queue, each for its own
  // correction once (R7 reversed, onceEntry), in the queue's order (final review M3: a minor derived correction never takes
  // the turn from a conclusion-changing claim still waiting). None → the report. A key whose correction was said twice
  // already (`lineSaid`) went to the report with a code line: Lorenzo's condition ("without a code line") isn't met, so the
  // claims built on it go to the report as onClosedRoot's "already said twice" (final review M1).
  const toReport = (ks: string[], lineSaid = false) => {
    closedNow.push(...ks);
    const freed = built.filter(b => ks.includes(b.root));
    for (const b of freed) built.splice(built.indexOf(b), 1);
    if (lineSaid) {
      for (const { e, root } of freed) {
        decisions.push({ ...decision(e.id, e.n, e.c, 'unresolved', `built on a corrected input (${root}) — its correction was already said twice; left for the report`, undefined, e.key), root });
        handled.add(e.id);
      }
      return;
    }
    // Ahead of their equals (a stable sort): raised through the root, they keep its place among claims of the same rank.
    waiting.unshift(...freed.flatMap(({ e, root }) => { const once = onceEntry(e, root); return once ? [once] : []; }).sort(order));
    waiting.sort(order);
  };
  while (!selected && p.currentFlags.length === 0 && !p.codeLineThisTurn && waiting.length > 0) {
    const entry = waiting.shift()!;
    const { id, n, c, key, codeProbed } = entry;
    // Phase 1 task 2: a probe or correction the candidate has overtaken since is not said (Lorenzo: "drop it if the
    // worksheet holds a newer value for that quantity").
    const stale = p.staleDrop?.({ id, n, c }) ?? null;
    if (stale !== null) {
      decisions.push({ ...decision(id, n, c, 'stale', `stale_drop: ${stale}`, undefined, entry.restate?.own ?? key), ...(entry.restate ? { root: key } : entry.once ? { root: entry.once.root } : {}) });
      handled.add(id);
      continue;
    }
    // The root's correction once more (ruling 1): no Rule-14 attempt and no probe; a minor one is shed under time pressure, as a flag is.
    if (entry.restate) {
      const own = entry.restate.own;
      if (p.underTimePressure && !isFinal(entry) && !changes(entry)) { decisions.push({ ...decision(id, n, c, 'shed', 'minor, under time pressure (Rule 15)', undefined, own), root: key }); handled.add(id); continue; }
      selected = { id, candidateTurnIndex: n, key, attempt: p.attempts[key] ?? 0, action: 'restate', line: entry.restate.line, derived: entry.restate.figure ? [entry.restate.figure] : [], claim: c };
      decisions.push({ ...decision(id, n, c, 'restate', `built on ${key}, corrected live — its correction said once more`, selected.line, own), root: key });
      continue;
    }
    if (closedNow.includes(key)) { decisions.push(decision(id, n, c, 'unresolved', 'its flag closed this turn', undefined, key)); handled.add(id); continue; }
    if (p.holdLinked && entry.linkedTo) { heldLinked.push(entry); continue; }
    // Its own correction once (R7 reversed): no Rule-14 probe; a minor one is shed under time pressure, as a flag is.
    if (entry.once) {
      const { root, sel } = entry.once;
      if (p.underTimePressure && !isFinal(entry) && !changes(entry)) { decisions.push({ ...decision(id, n, c, 'shed', 'minor, under time pressure (Rule 15)', undefined, key), root }); handled.add(id); continue; }
      selected = { ...sel, onceRoot: root };
      selectedLinked = entry.linkedTo;
      continue;
    }
    // E7: a claim on an input closed this turn with no line said: its own correction once (R7 reversed), through the
    // queue's once path — the same time-pressure shed, the root on its record (final review M2) — else the report.
    const im = inputKeyOf(entry);
    if (im && closedNow.includes(im)) {
      const once = onceEntry(entry, im);
      if (once) waiting.unshift(once);
      continue;
    }
    // Every probe of the error counts — code's, the checker's and the model's
    // own — since it was first stated (the stored counter, or the interviewer
    // turns that asked about its figures, whichever is more).
    const since = keys[key]?.since ?? n;
    // The interviewer's own words only: code's data lines are no probe (interviewerOwnWords).
    const interviewerSince = p.turnRows.filter(t => t.role === 'interviewer' && t.turnIndex > since).map(t => interviewerOwnWords(t.text, ledgerValues));
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
      toReport([key], true);
      return true;
    };
    // E7: two probes on the claim's input already — the next line on it is the input's correction, else the report.
    if (im && inputTurns(im).size >= INPUT_PROBE_CAP) {
      const fixed = inputCorrection(entry, attempt);
      if (fixed && spentLine(fixed)) continue;
      if (fixed) { selected = fixed; continue; }
      decisions.push(decision(id, n, c, 'unresolved', `two probes on its input (${im}) already, and no true correction code can write — left for the report`, undefined, key));
      handled.add(id);
      toReport([key, im]);
      continue;
    }
    if ((p.stepProbes?.[stepOfKey(key)] ?? 0) >= STEP_PROBE_CAP) {
      const corrected = correctionOf(id, n, c, key, attempt);
      if (corrected && spentLine(corrected)) continue;
      if (corrected) { selected = corrected; continue; }
      decisions.push(decision(id, n, c, 'unresolved', `two probes on this step already (${stepOfKey(key)}) — left for the report`, undefined, key));
      handled.add(id);
      toReport([key]);
      continue;
    }
    // Said on the turn after this message: quoted unless right after the claim (ruling 4, quoteLateProbe).
    const asked = (l: string) => withProbeOpener(lateProbe(l, c, messageOf(n), { claim: n, spoken: p.candidateTurnIndex + 1 }, caseFigures), p.phraseUses, `${p.seed ?? ''}:${id}`);
    if (action === 'probe' && c.probeLine) { selected = { id, candidateTurnIndex: n, key, attempt, action: 'probe', ...asked(neutralProbe(c.probeLine, p.phraseUses, p.seed ?? '')), derived: [], claim: c }; continue; }
    const corrected = correctionOf(id, n, c, key, attempt);
    if (corrected && spentLine(corrected)) continue;
    if (corrected) { selected = corrected; continue; }
    // Code can't compute it: the pointer probe is the second attempt.
    if (c.pointerLine && (attempt === 2 || p.underTimePressure)) { selected = { id, candidateTurnIndex: n, key, attempt, action: 'pointer', ...asked(c.pointerLine), derived: [], claim: c }; continue; }
    // Else the hint (Lorenzo, 13 Oct, Step-4 rulings): a component they raised
    // earlier, named only in a second probe — never the first.
    if (c.hintLine && attempt === 2) { selected = { id, candidateTurnIndex: n, key, attempt, action: 'hint', ...asked(c.hintLine), derived: [], claim: c }; continue; }
    // Past Rule 14 with nothing code can say: the report has it, and the case moves on.
    decisions.push(decision(id, n, c, 'unresolved', `attempt ${attempt}: no correction code can write${c.pointerLine || c.hintLine ? ', second probe already used' : ', no pointer'} — left for the report`, undefined, key));
    handled.add(id);
    toReport([key]);
  }
  waiting.push(...heldLinked);
  const restating = selected?.action === 'restate';
  // A derived claim's own correction (R7 reversed): its decision names the root it was built on.
  const onceRoot = selected?.onceRoot;
  if (selected && !restating) decisions.push({ ...decision(selected.id, selected.candidateTurnIndex, selected.claim, selected.converted ? 'converted' : selected.action,
    `${selectedLinked ? `${stepRootReason(roots[selectedLinked])} — its own correction, once (one per root); ` : onceRoot ? `built on a closed input (${onceRoot}) — its own correction, once; ` : ''}attempt ${selected.attempt}${selected.framing ? `; ${selected.converted ? 'a conversion: ' : ''}${selected.framing}` : ''}${eligible.find(e => e.id === selected!.id && e.key === selected!.key)?.carried ? `; carried into ${riding(selected).map(d => d.id).join(', ')}` : ''}`, selected.line, selected.key), ...(selectedLinked ? { root: selectedLinked } : onceRoot ? { root: onceRoot } : {}) });
  // The claims built on a root said now ride on its line (booked only if the line is used — plan-turn); the rest
  // wait. (Those on a root closed this turn left the queue with it: toReport.)
  const riders: NonNullable<CheckerSelection['riders']> = [];
  // E7: a probe on a claim of an input is booked to the input (flags.inputProbes, plan-turn).
  if (selected && !correctsNow(selected)) { const im = inputKeyOf(selected); if (im) selected = { ...selected, input: im }; }
  for (const { e, root } of built) {
    if (selected?.key === root || (selected?.inputs ?? []).includes(root)) {
      decisions.push({ ...decision(e.id, e.n, e.c, 'derived', restating ? `built on ${root}'s figure — rides on its restated correction` : `built on ${root}'s figure — the probe follows the input`, undefined, e.key), root });
      riders.push({ id: e.id, candidateTurnIndex: e.n, claim: e.c });
    } else waiting.push(e);
  }
  // E7: the claims waiting on an input the row fix corrects ride on it. On an input closed this turn with no line said,
  // one with a correction of its own waits for it — a later turn's, once (R7 reversed, onClosedRoot); the rest go to
  // the report with the input, as before.
  for (const w of [...waiting]) {
    const im = inputKeyOf(w);
    if (!im || w.restate || w.carried || w.once || w.id === selected?.id) continue;
    if ((selected?.inputs ?? []).includes(im)) {
      waiting.splice(waiting.indexOf(w), 1);
      decisions.push({ ...decision(w.id, w.n, w.c, 'derived', `on ${im}, corrected now — rides on the row fix`, undefined, w.key), root: im });
      riders.push({ id: w.id, candidateTurnIndex: w.n, claim: w.c });
    } else if (closedNow.includes(im) && !onceEntry(w, im)) waiting.splice(waiting.indexOf(w), 1);
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
  // …and one waiting on an input closed this turn for its own correction once (R7 reversed): that input.
  const closedInput = (w: typeof waiting[number]) => { const im = inputKeyOf(w); return im !== null && closedNow.includes(im) ? im : undefined; };
  const rootOfWaiting = (w: typeof waiting[number]) => (w.restate ? w.key : w.once?.root ?? built.find(b => b.e.id === w.id)?.root ?? closedInput(w));
  return {
    selected, waiting: pending.map(w => { const root = rootOfWaiting(w); return { id: w.id, candidateTurnIndex: w.n, claim: w.c, ...(root ? { root } : {}) }; }), decisions, flaggedFigures: [...new Set(flaggedFigures)], droppedStamps,
    handledNow: [...handled].filter(id => !p.handled.includes(id)), keys, closedNow,
    ...(Object.keys(stepLinked).length > 0 ? { stepLinked } : {}),
    ...(Object.keys(stepRootEnded).length > 0 ? { stepRootEnded } : {}),
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
    // Linked to a step root (round 6 Task 72): never probed — not in the recommendation either.
    if (flagRows.some(d => d.key === key && d.root?.startsWith(STEP_ROOT))) continue;
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
