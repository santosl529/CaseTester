// Round 6 Task 72 (the step check's roots; audit M1–M2): b37 Quillpath Raj e08c362a and Marcus eb8d7576, verbatim from
// the runs (batch 37 Quillpath, oct 20 runs 1-5; step-roots-b37q.json): the math checker's verdict and decision rows,
// the transcript, the registry's final keys, and per candidate message the turn kind, clock, ledger, exhibits and the
// deterministic step check's report-only flags. Record tN is the candidate's message N; its reply is tN+1.
//   atTurn: planCheckerFlags at message T with the run's own memory up to T (rows before T) — the counterfactual "what
//     this turn decides now", one turn at a time.
//   replay: planCheckerFlags message by message with its own memory chained (handled, keys, closed, attempts, step
//     probes, the roots and their links), the selection booked on model turns as heard, the root's input question booked
//     where plan-turn would ask it. The interviewer's words are the run's (a probe the run said still counts).
import { planCheckerFlags, gateOutcomesOf, lineKey, registerStepRoots, stepRootEnds, caseNumbersOf, stepOfKey, correctsNow, inputQuestionOf, STEP_PROBE_CAP, CHECKER_MAX_WAIT_MESSAGES, type CheckerDecision, type CheckerPlan, type CheckerPlanInput, type CheckerRow, type StepRoot, type CheckerKeyEntry } from '@/lib/orchestrator/math-checker-live';
import { candidateFiguresOf } from '@/lib/orchestrator/math-talk';
import { isUnderTimePressure } from '@/lib/orchestrator/pacing';
import { caseTotalMs } from '@/lib/orchestrator/state-machine';
import { attemptKey, checkCandidateMath } from '@/lib/orchestrator/recompute';
import { getCaseById } from '@/lib/cases/loader';
import RUNS from './step-roots-b37q.json';

export const pricing = getCaseById('pricing-001');
type Rec = { kind: string; elapsedMs: number; revealed: string[]; shown: string[]; reportOnly: { stepId: string; candidateValue: number; expected: number; span: string }[] };
export type Run = { sessionId: string; rows: CheckerRow[]; turns: { turnIndex: number; role: string; text: string }[]; keys: Record<string, CheckerKeyEntry>; records: Record<string, Rec> };
export const RAJ = RUNS.raj as unknown as Run;
export const MARCUS = RUNS.marcus as unknown as Run;
const TOTAL = caseTotalMs(pricing);

// Past the run's last message (a probe of a later turn): a plain reply.
const text = (r: Run, t: number) => r.turns.find(x => x.turnIndex === t)?.text ?? 'Thanks.';
const figuresBefore = (r: Run, t: number) => candidateFiguresOf(r.turns.filter(x => x.role === 'candidate' && x.turnIndex <= t).map(x => x.text), [pricing.prompt]);
const ATTEMPT = /attempt (\d+)/;

// The deterministic endings of a message (plan-turn's stepRootEnds on the run's report-only flags and the message's
// verified figures, recomputed: checkCandidateMath), applied before the message registers its own roots.
function withEnds(roots: Record<string, StepRoot>, rec: Rec, n: number, message: string): Record<string, StepRoot> {
  const verified = checkCandidateMath(message, pricing, rec.revealed).verified.map(v => ({ stepId: v.stepId, value: v.value, span: v.span }));
  const ends = stepRootEnds(pricing, roots, [...rec.reportOnly.map(f => ({ stepId: f.stepId, value: f.candidateValue, span: f.span })), ...verified], n);
  return Object.fromEntries(Object.entries(roots).map(([rk, x]) => [rk, ends[rk] !== undefined ? { ...x, endedAt: ends[rk] } : x]));
}
// The step check's roots up to message T (registered in order, as plan-turn does).
export function rootsUpTo(r: Run, t: number): Record<string, StepRoot> {
  let roots: Record<string, StepRoot> = {};
  for (const n of Object.keys(r.records).map(Number).sort((a, b) => a - b).filter(n => n <= t)) {
    const rec = r.records[n];
    roots = withEnds(roots, rec, n, text(r, n));
    roots = registerStepRoots(pricing, roots, rec.reportOnly, n, caseNumbersOf(pricing, rec.revealed)).roots;
  }
  return roots;
}

// The run's own memory before message T.
export function atTurn(r: Run, t: number, over: Partial<CheckerPlanInput> = {}): CheckerPlan {
  const before = r.rows.filter(x => x.subtype === 'verdict' || (x.turnIndex ?? 0) < t);
  const flagsBefore = before.filter(x => x.subtype === 'flag').map(x => x.payloadJsonb as CheckerDecision);
  const handled = [...new Set(flagsBefore.filter(d => d.outcome !== 'undelivered').map(d => d.id))];
  const attempts: Record<string, number> = {};
  const stepProbes: Record<string, number> = {};
  const closed = new Set<string>();
  for (const d of flagsBefore) {
    const a = ATTEMPT.exec(d.reason);
    if (['probe', 'pointer', 'hint', 'correct'].includes(d.outcome) && a) attempts[d.key] = Math.max(attempts[d.key] ?? 0, Number(a[1]));
    if (['probe', 'pointer', 'hint'].includes(d.outcome)) stepProbes[stepOfKey(d.key)] = (stepProbes[stepOfKey(d.key)] ?? 0) + 1;
    if (d.outcome === 'correct' || (d.outcome === 'unresolved' && /left for the report/.test(d.reason))) closed.add(d.key);
  }
  const rec = r.records[String(t)] ?? r.records[String(Math.max(...Object.keys(r.records).map(Number)))];
  return planCheckerFlags({
    rows: before, handled, turnRows: r.turns.filter(x => x.turnIndex < t), candidateText: text(r, t), candidateTurnIndex: t,
    currentFlags: [], attempts, keys: Object.fromEntries(Object.entries(r.keys).filter(([, e]) => e.since < t)), closed: [...closed], stepProbes,
    underTimePressure: isUnderTimePressure(rec.elapsedMs, TOTAL), candidateFigures: figuresBefore(r, t),
    caseData: pricing as never, revealedIds: rec.revealed, shownExhibitIds: rec.shown, seed: `${r.sessionId}:${t}`, gateOutcomes: gateOutcomesOf(before, []), ...over,
  });
}

export type ReplayTurn = { t: number; kind: string; plan: CheckerPlan; said: string | null; rootAsked: string | null };
// Message by message with chained memory. `roots: false`: the same replay without the step roots (the run's own logic).
export function replay(r: Run, opts: { roots?: boolean } = {}): ReplayTurn[] {
  const withRoots = opts.roots !== false;
  const verdicts = r.rows.filter(x => x.subtype === 'verdict');
  // The gate's decisions on code's findings (the run's code_gate rows): only a released code flag dedupes a claim.
  const gates = r.rows.filter(x => x.subtype === 'code_gate');
  const flagRows: CheckerRow[] = [];
  let handled: string[] = [];
  let keys: Record<string, CheckerKeyEntry> = {};
  const closed = new Set<string>();
  const attempts: Record<string, number> = {};
  const stepProbes: Record<string, number> = {};
  const corrected: Record<string, { line: string }> = {};
  const said: Record<string, number> = {};
  const derivedOnce: Record<string, string> = {};
  const asked: string[] = [];
  let roots: Record<string, StepRoot> = {};
  const out: ReplayTurn[] = [];
  const candidates = r.turns.filter(x => x.role === 'candidate').map(x => x.turnIndex).sort((a, b) => a - b);
  for (const t of candidates) {
    const rec = r.records[String(t)];
    if (!rec) continue;
    if (withRoots) roots = registerStepRoots(pricing, withEnds(roots, rec, t, text(r, t)), rec.reportOnly, t, caseNumbersOf(pricing, rec.revealed), new Set([...closed, ...Object.keys(corrected)])).roots;
    // plan-turn's input question: once per step, within the probe cap and the wait, not under time pressure.
    const due = () => Object.entries(roots).sort((a, b) => a[1].since - b[1].since).find(([, x]) => inputQuestionOf(pricing, x.step) !== undefined && !asked.includes(x.step)
      && (stepProbes[x.step] ?? 0) < STEP_PROBE_CAP && !closed.has(attemptKey({ stepId: x.step, candidateValue: x.value }))
      && candidates.filter(i => i > x.since && i <= t).length <= CHECKER_MAX_WAIT_MESSAGES && !isUnderTimePressure(rec.elapsedMs, TOTAL));
    const input: CheckerPlanInput = {
      rows: [...verdicts, ...gates, ...flagRows], handled, gateOutcomes: gateOutcomesOf(gates.filter(x => (x.turnIndex ?? 0) <= t), []), turnRows: r.turns.filter(x => x.turnIndex < t), candidateText: text(r, t), candidateTurnIndex: t,
      currentFlags: [], attempts: { ...attempts }, keys, closed: [...closed], corrected, said, derivedOnce: { ...derivedOnce }, stepProbes: { ...stepProbes },
      underTimePressure: isUnderTimePressure(rec.elapsedMs, TOTAL), candidateFigures: figuresBefore(r, t),
      caseData: pricing as never, revealedIds: rec.revealed, shownExhibitIds: rec.shown, seed: `${r.sessionId}:${t}`, ...(withRoots ? { stepRoots: roots } : {}),
    };
    let plan = planCheckerFlags(input);
    const model = rec.kind === 'model';
    // Fix round 2: a due root question goes before a linked claim's own correction (plan-turn's holdLinked re-plan).
    if (withRoots && model && plan.selected?.onceRoot?.startsWith('step:') && due()) plan = planCheckerFlags({ ...input, holdLinked: true });
    const sel = model ? plan.selected : null;
    const decided = plan.decisions.filter(d => !plan.selected || d.id !== plan.selected.id || model);
    for (const d of decided) flagRows.push({ category: 'math_checker', subtype: 'flag', turnIndex: t, payloadJsonb: d });
    handled = [...new Set([...handled, ...plan.handledNow, ...(sel ? [sel.id, ...(sel.riders ?? []).map(x => x.id)] : [])])];
    keys = plan.keys;
    for (const k of plan.closedNow) closed.add(k);
    for (const [k, to] of Object.entries(plan.stepLinked ?? {})) roots[to] = { ...roots[to], linked: [...new Set([...(roots[to].linked ?? []), k])] };
    for (const [rk, at] of Object.entries(plan.stepRootEnded ?? {})) if (roots[rk].endedAt === undefined || at < roots[rk].endedAt!) roots[rk] = { ...roots[rk], endedAt: at };
    let rootAsked: string | null = null;
    if (sel) {
      if (sel.action !== 'restate') attempts[sel.key] = sel.attempt;
      if (!correctsNow(sel)) stepProbes[stepOfKey(sel.key)] = (stepProbes[stepOfKey(sel.key)] ?? 0) + 1;
      else {
        closed.add(sel.key); corrected[sel.key] = { line: sel.line }; said[lineKey(sel.line)] = (said[lineKey(sel.line)] ?? 0) + 1;
        if (sel.onceRoot) derivedOnce[sel.onceRoot] = sel.id;
      }
    } else if (withRoots && model) {
      const next = due();
      if (next) {
        const k = attemptKey({ stepId: next[1].step, candidateValue: next[1].value });
        attempts[k] = (attempts[k] ?? 0) + 1;
        stepProbes[next[1].step] = (stepProbes[next[1].step] ?? 0) + 1;
        asked.push(next[1].step);
        rootAsked = inputQuestionOf(pricing, next[1].step)!;
      }
    }
    out.push({ t, kind: rec.kind, plan, said: sel ? sel.line : null, rootAsked });
  }
  return out;
}
