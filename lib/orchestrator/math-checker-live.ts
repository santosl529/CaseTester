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
import { mathCheckerConfig, type MathCheckerConfig } from '@/lib/models';
import type { OnUsage } from '@/lib/llm-usage';
import { normalizeNumberWords } from '@/lib/number-words';
import { findStepSpans } from '@/lib/scoring/math-spans';
import {
  checkMathClaims, vetCheckerClaims, codeComputed, boundInput, numbersOf,
  type CheckerCase, type CheckerClaim, type CheckerInput, type CheckerResult, type VetContext, type VettedClaim,
} from './math-checker';
import { recomputeAction, type CandidateMath, type RecomputeAttempts, type RecomputeFlag } from './recompute';
import { checkPricingClaims, pricingValues } from './pricing-check';
import { changeFigures } from './numeric-provenance';
import { classifyMathTalk } from './math-talk';

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

export type CodeFlagRef = { key: string; value: number; span: string };
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
      codeFlags: [
        ...p.codeMath.flags.map(f => ({ key: f.stepId, value: f.candidateValue, span: f.span })),
        ...(p.misquotes ?? []).flatMap(m => numbersOf(m.cited).slice(0, 1).map(value => ({ key: `misquote:${m.item}`, value, span: m.sentence }))),
      ],
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
export function checkerKey(c: CheckerClaim): string {
  const q = c.codeQuantity;
  if (q.kind === 'step' && q.stepId) return q.stepId;
  if (q.kind === 'gain' || q.kind === 'new_margin' || q.kind === 'breakeven') return `pricing:${q.kind}`;
  if (q.kind === 'needed_for_margin' || q.kind === 'needed_for_gain') return 'pricing:needed';
  return `checker:${normalizeNumberWords(c.candidateValue).toLowerCase().trim()}`;
}

const same = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.05, Math.abs(b) * 0.01);

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

// The case's figures the candidate has: the prompt, released lines and their changes.
export function caseNumbersOf(caseData: Pick<CheckerCase, 'prompt' | 'dataLedger'>, revealedIds: string[]): number[] {
  const texts = caseData.dataLedger.filter(d => revealedIds.includes(d.id)).map(d => d.value);
  return numbersOf([caseData.prompt, ...texts, ...changeFigures(texts)].join(' '));
}

// Lorenzo, 13 Oct (approved): a flag is raised only
// while at most this many candidate messages have followed the claim — held
// longer (a code flag took every turn), it expires to the report (replay:
// Sofia b20 140fb90d, a probe six messages late).
export const CHECKER_MAX_WAIT_MESSAGES = 2;

const sentencesOf = (text: string) => normalizeNumberWords(text).split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(Boolean);
// The candidate takes a claim back or redoes it.
const WITHDRAWN = /\b(?:scratch that|i take (?:that|it) back|i was wrong|i mis-?(?:spoke|calculated|stated|read|sized)|let me (?:redo|correct|fix|recalculate|re-?do|re-?check|re-?run)|correction:|sorry,? (?:i meant|that should be|that'?s wrong)|(?:that'?s|that was) my (?:error|mistake)|my (?:error|mistake|bad)\b|you'?re right\b)/i;
// "Actually, …", "Wait — …" opening a sentence with a figure in it: a revision
// ("may actually be a smaller part" mid-sentence is not — replay, Sofia b20).
const REVISING = /^(?:actually|wait|on second thought)\b/i;

// Has the candidate revised or withdrawn the claim since? Read in every
// candidate message after it: a withdrawal, a revision with a figure, the
// right figure stated (when it isn't also a case figure), or the same claim
// restated (a pricing claim of the same kind at the same price; the same math
// step). Returns why, or null.
export function isStale(c: CheckerClaim, laterTexts: string[], caseData: CheckerCase, revealedIds: string[]): string | null {
  const ctx: VetContext = { caseData, revealedIds, shownExhibitIds: [], candidateTexts: [] };
  const right = [...(codeComputed(c, ctx)?.values ?? []), c.correctValue, c.correctLow, c.correctHigh].filter((x): x is number => x !== null);
  const caseFigures = caseNumbersOf(caseData, revealedIds);
  const rightToCheck = right.filter(r => !caseFigures.some(x => same(r, x)));
  const pm = pricingValues(caseData, new Set(revealedIds));
  const q = c.codeQuantity;
  const step = q.kind === 'step' ? caseData.mathSteps.find(st => st.id === q.stepId) : undefined;
  for (const text of laterTexts) {
    for (const s of sentencesOf(text)) {
      if (WITHDRAWN.test(s)) return `withdrawn: "${s}"`;
      if (REVISING.test(s) && /\d/.test(s)) return `revised: "${s}"`;
    }
    const stated = numbersOf(text).find(n => rightToCheck.some(r => same(n, r)));
    if (stated !== undefined) return `the right figure (${stated}) stated since`;
    if (pm && q.kind !== 'none' && q.kind !== 'step') {
      const kind = q.kind === 'needed_for_margin' || q.kind === 'needed_for_gain' ? 'needed' : q.kind;
      const again = checkPricingClaims(text, pm).find(x => x.kind === kind && (kind === 'needed' || x.price === q.price));
      if (again) return `restated: "${again.span}"`;
    }
    if (step) {
      const again = findStepSpans(text, step as never)[0];
      if (again) return `restated: "${again.span}"`;
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

export type CheckerOutcome = 'probe' | 'correct' | 'pointer' | 'hint' | 'unresolved' | 'shed' | 'stale' | 'expired' | 'dedupe' | 'disagrees_with_code' | 'unresolved_at_close';
export type CheckerDecision = {
  id: string; candidateTurnIndex: number; outcome: CheckerOutcome; reason: string;
  span: string; candidateValue: string; key: string; changesConclusion: boolean; line?: string;
};
export type CheckerSelection = {
  id: string; candidateTurnIndex: number; key: string; attempt: number;
  action: 'probe' | 'correct' | 'pointer' | 'hint'; line: string; derived: string[];
  claim: VettedClaim;
};
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
  underTimePressure: boolean;
  candidateFigures: number[];
  caseData: CheckerCase; revealedIds: string[];
};
export type CheckerPlan = {
  selected: CheckerSelection | null;  // at most one a turn
  waiting: { id: string; candidateTurnIndex: number; claim: VettedClaim }[]; // flags left for a later turn
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
export function planCheckerFlags(p: CheckerPlanInput): CheckerPlan {
  const handled = new Set(p.handled);
  const decisions: CheckerDecision[] = [];
  const flaggedFigures: number[] = [];
  const droppedStamps: CheckerPlan['droppedStamps'] = [];
  const eligible: { id: string; n: number; c: VettedClaim; key: string; figs: number[] }[] = [];
  const caseNumbers = caseNumbersOf(p.caseData, p.revealedIds);
  const keys: Record<string, CheckerKeyEntry> = { ...(p.keys ?? {}) };
  const closed = new Set(p.closed ?? []);
  const closedNow: string[] = [];
  const verdicts = p.rows
    .filter(r => (r.category ?? MATH_CHECKER_CATEGORY) === MATH_CHECKER_CATEGORY && r.subtype === 'verdict')
    .map(r => r.payloadJsonb as VerdictPayload)
    .filter(v => v.candidateTurnIndex < p.candidateTurnIndex)
    .sort((a, b) => a.candidateTurnIndex - b.candidateTurnIndex);
  for (const v of verdicts) {
    const later = [...p.turnRows.filter(t => t.role === 'candidate' && t.turnIndex > v.candidateTurnIndex).map(t => t.text), p.candidateText];
    v.claims.forEach((c, i) => {
      const id = `${v.candidateTurnIndex}:${i}`;
      if (handled.has(id)) return;
      const figs = claimFigures(c, caseNumbers);
      const codeFlag = v.codeFlags.find(f => f.key === checkerKey(c) || figs.some(x => same(x, f.value)));
      if (!c.flag) {
        // Deterministic first: a code flag stands whatever the checker says.
        if (c.verdict === 'correct' && codeFlag) {
          decisions.push(decision(id, v.candidateTurnIndex, c, 'disagrees_with_code', `code flagged ${codeFlag.value} ("${codeFlag.span}"); the flag is kept`));
          handled.add(id);
        }
        return;
      }
      if (codeFlag) {
        decisions.push(decision(id, v.candidateTurnIndex, c, 'dedupe', `the deterministic check flagged it (${codeFlag.key})`));
        handled.add(id);
        return;
      }
      for (const s of v.stamps.filter(st => figs.some(x => same(x, st.value)))) droppedStamps.push({ ...s, candidateTurnIndex: v.candidateTurnIndex });
      const stale = isStale(c, later, p.caseData, p.revealedIds);
      if (stale) {
        decisions.push(decision(id, v.candidateTurnIndex, c, 'stale', stale));
        handled.add(id);
        return;
      }
      if (later.length > CHECKER_MAX_WAIT_MESSAGES) {
        decisions.push(decision(id, v.candidateTurnIndex, c, 'expired', `${later.length} messages since the claim`));
        handled.add(id);
        return;
      }
      // Matched by their figures — their value's own numbers when all are case figures (a "40 points" when 40 is also the bean rise).
      const input = boundInput(c);
      const idFigs = figs.length > 0 || c.actualShare !== null ? figs : numbersOf(c.candidateValue).filter(n => input === null || !same(n, input));
      const key = flagKeyFor(c, idFigs, keys);
      if (closed.has(key)) {
        decisions.push(decision(id, v.candidateTurnIndex, c, 'unresolved', 'restated after the flag closed (corrected, or left for the report)', undefined, key));
        handled.add(id);
        return;
      }
      if (!keys[key]) keys[key] = { figures: idFigs, since: v.candidateTurnIndex };
      else keys[key] = { ...keys[key], figures: [...keys[key].figures, ...idFigs.filter(f => !keys[key].figures.some(x => same(f, x)))] };
      flaggedFigures.push(...figs);
      eligible.push({ id, n: v.candidateTurnIndex, c, key, figs });
    });
  }
  // One checker probe a turn, conclusion-changing first; none beside a
  // deterministic flag on this message (that is the turn's probe) or a
  // misquote code corrects this turn (one math line a turn).
  eligible.sort((a, b) => Number(b.c.changesConclusion) - Number(a.c.changesConclusion) || a.n - b.n);
  let selected: CheckerSelection | null = null;
  const waiting = [...eligible];
  while (!selected && p.currentFlags.length === 0 && !p.codeLineThisTurn && waiting.length > 0) {
    const { id, n, c, key } = waiting.shift()!;
    if (closedNow.includes(key)) { decisions.push(decision(id, n, c, 'unresolved', 'its flag closed this turn', undefined, key)); handled.add(id); continue; }
    // Every probe of the error counts — code's, the checker's and the model's
    // own — since it was first stated (the stored counter, or the interviewer
    // turns that asked about its figures, whichever is more).
    const since = keys[key]?.since ?? n;
    const interviewerSince = p.turnRows.filter(t => t.role === 'interviewer' && t.turnIndex > since).map(t => t.text);
    const probed = Math.max(p.attempts[key] ?? 0, probesOf(keys[key]?.figures ?? claimFigures(c), interviewerSince, p.candidateFigures));
    const attempt = probed + 1;
    const action = recomputeAction({ errorClass: c.changesConclusion ? 'case_breaking' : 'minor' } as RecomputeFlag, attempt, p.underTimePressure);
    if (action === 'shed') { decisions.push(decision(id, n, c, 'shed', 'minor, under time pressure (Rule 15)', undefined, key)); handled.add(id); continue; }
    if (action === 'probe' && c.probeLine) { selected = { id, candidateTurnIndex: n, key, attempt, action: 'probe', line: c.probeLine, derived: [], claim: c }; continue; }
    if (c.correctionLine) { selected = { id, candidateTurnIndex: n, key, attempt, action: 'correct', line: c.correctionLine, derived: c.correctionFigure ? [c.correctionFigure] : [], claim: c }; continue; }
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
  if (selected) decisions.push(decision(selected.id, selected.candidateTurnIndex, selected.claim, selected.action, `attempt ${selected.attempt}`, selected.line, selected.key));
  return {
    selected, waiting: waiting.map(w => ({ id: w.id, candidateTurnIndex: w.n, claim: w.c })), decisions, flaggedFigures: [...new Set(flaggedFigures)], droppedStamps,
    handledNow: [...handled].filter(id => !p.handled.includes(id)), keys, closedNow,
  };
}

// The selected flag as the interviewer model reads it: Rule 14's line, said
// as written.
export function formatCheckerHint(s: CheckerSelection): string {
  const said = `"${s.claim.span}"`;
  const line = s.action === 'probe'
    ? `- Earlier the candidate said ${said}; a check found it doesn't follow from the data they have. Probe once — "${s.line}" — Do not correct it or say the right figure.`
    : s.action === 'pointer' || s.action === 'hint'
      ? `- Earlier the candidate said ${said}, still unresolved after a probe. Ask this, once, as written — "${s.line}" — and nothing else about it. Do not correct it or say the right figure.`
      : `- Earlier the candidate said ${said}; a check in code found it wrong. This overrides the no-correction rule: say this in "say", once, as written — "${s.line}" — then continue. No probe, no consolation, no figure of your own.`;
  return `MATH CHECK FLAG (a background check of an earlier message, vetted in code):\n${line}`;
}
