// D6 — a real math or unit error the interviewer let pass (fact guards Phase 4,
// 12 Oct), deterministic, for scoring saved and replayed runs. The errors are
// what code can check: the case's math steps (recompute.ts), stated arithmetic
// (arithmetic-check.ts), nested-percentage conversions (unit-check.ts) and
// pricing claims (pricing-check.ts). An error is handled when the turn that
// answers the message probes it ("walk me through", "points of what", "how did
// you get…", "check that") or corrects it ("It's closer to 8.5"); else D6.
import type { CorpusTurn } from './run-corpus';
import { checkRecomputeForTurn } from '@/lib/orchestrator/recompute';
import { checkStatedArithmetic } from '@/lib/orchestrator/arithmetic-check';
import { checkNestedConversions } from '@/lib/orchestrator/unit-check';
import { poolPattern } from '@/lib/orchestrator/phrasing';
import { checkPricingClaims, pricingValues } from '@/lib/orchestrator/pricing-check';

export type MathError = { kind: 'step' | 'arithmetic' | 'unit' | 'pricing'; what: string; stated: number; expected: number[]; span: string };

type CaseLike = Parameters<typeof pricingValues>[0] & {
  mathSteps: Parameters<typeof checkRecomputeForTurn>[1];
  shareBases: Parameters<typeof checkNestedConversions>[1]['bases'];
};

export function mathErrors(text: string, c: CaseLike, revealed: Set<string>): MathError[] {
  const out: MathError[] = [];
  for (const f of checkRecomputeForTurn(text, c.mathSteps, revealed)) out.push({ kind: 'step', what: f.stepId, stated: f.candidateValue, expected: [f.expected], span: f.span });
  for (const a of checkStatedArithmetic(text)) if (a.verdict === 'incorrect' && !a.selfCorrected) out.push({ kind: 'arithmetic', what: a.expression, stated: a.stated, expected: [a.computed], span: a.span });
  // A conversion the candidate states only to deny it is a correction, not an error ("25% of COGS isn't 25 points of revenue").
  for (const u of checkNestedConversions(text, { bases: c.shareBases, items: c.dataLedger, revealedIds: revealed }).flags) {
    if (/\b(?:isn't|is not|aren't|not)\b/i.test(u.span) || /\b(?:say|suppose|assume|assuming|if)\b/i.test(u.span)) continue;
    out.push({ kind: 'unit', what: u.quantity, stated: u.stated, expected: [u.expected], span: u.span });
  }
  const v = pricingValues(c, revealed);
  if (v) for (const p of checkPricingClaims(text, v)) if (p.verdict === 'incorrect') out.push({ kind: 'pricing', what: `${p.kind} at ${p.price}%`, stated: p.stated, expected: p.expected, span: p.span });
  return out;
}

const PROBE = /\b(?:walk me through|how did you get|how do you get|how you got|where does|where did|check (?:that|your|the|this)|recheck|points of what|is that (?:right|correct)|does that (?:hold|follow|add up)|redo|re-?run|what does .{0,40} assume|what are you assuming|how does .{0,60} (?:get|translate|turn|become)|what base|of what|how .{0,40} gets? you)\b/i;
export const CORRECTION = new RegExp(`\\b(?:it's|that's|it is) closer to\\b|\\bnot \\$?\\d|\\bthe (?:correct|right) figure\\b|${poolPattern('correct_one', 'correct_two').source}`, 'i');

export function checkMathTurn(t: CorpusTurn, c: CaseLike): { error: MathError; handled: boolean }[] {
  if (!t.candidateText) return [];
  const errors = mathErrors(t.candidateText, c, new Set(t.revealedBefore));
  if (errors.length === 0) return [];
  // Handled: a probe or correction about this error — it names the stated
  // figure, or (for pricing) talks price; a probe about something else isn't.
  const sentences = t.segments.map(s => s.text).join(' ').split(/(?<=[.?!])\s+/);
  const about = (e: MathError, x: string) => new RegExp(`(?<![\\d.])${String(e.stated).replace('.', '\\.')}(?![\\d])`).test(x)
    || (e.kind === 'pricing' && /\b(?:price|pricing|break-?even|volume|traffic)\b/i.test(x))
    || (e.kind === 'unit' && /\b(?:points? of what|of what|which base|what base|share of what|which year'?s?|what year|two years ago)\b/i.test(x))
    || /\b(?:that|this|your) (?:calculation|math|number|figure|sizing|estimate|step)\b/i.test(x);
  // The subject may sit in the sentence before ("You said a 10% price rise recovers 6 points. Walk me through how you sized that.").
  return errors.map(e => ({ error: e, handled: sentences.some((x, i) => (PROBE.test(x) || CORRECTION.test(x)) && (about(e, x) || about(e, sentences[i - 1] ?? ''))) }));
}
