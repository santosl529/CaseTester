// Challenges to the candidate's math, as delivered, marked for scoring
// (round-3 fixes, 11 Oct 2026). Batch 18: the marker meant to stop the grader
// holding interviewer mistakes against candidates fired in none of the 14
// interviews with wrong math challenges; one candidate lost points in two
// categories for a units mistake he didn't make, another for giving up a
// correct answer when challenged.
//
// Each interviewer sentence that doubts the candidate's math
// (lib/orchestrator/math-talk.ts) — code-written or the model's — is checked
// against what the session's own checks say about the figure at that point,
// recomputed here from the transcript with the same pure functions the live
// turn used (so sessions recorded before 11 Oct are marked the same way):
//   - flagged wrong (a case step, stated arithmetic, a unit conversion) → a
//     supported challenge, no mark;
//   - verified correct → confirmed_interviewer_error: the candidate's next
//     turn (the apology, the concession, the redo) is protected;
//   - neither → unsupported_challenge: logged apart; the judge is told the
//     challenge is not evidence, and nothing is dropped on its account.
import type { Case } from '@/lib/cases/schema';
import type { InterviewerMark } from './interviewer-errors';
import { checkRecomputeForTurn, checkVerifiedForTurn, flagsFromUnitCheck, flagsFromArithmetic, flagsFromPricing, verifiedFromChecks, type RecomputeFlag, type VerifiedFigure } from '@/lib/orchestrator/recompute';
import { checkNestedConversions } from '@/lib/orchestrator/unit-check';
import { checkStatedArithmetic } from '@/lib/orchestrator/arithmetic-check';
import { checkPricingClaims, pricingValues } from '@/lib/orchestrator/pricing-check';
import { classifyMathTalk, candidateFiguresOf } from '@/lib/orchestrator/math-talk';

type Turn = { role: string; text: string; turnIndex: number };

const same = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.05, Math.abs(b) * 0.02);
const sentencesOf = (t: string) => t.trim().split(/(?<=[.!?])\s+/).filter(Boolean);

export type TurnVerification = { flags: RecomputeFlag[]; verified: VerifiedFigure[] };

// The checks a live turn would have run on each candidate message.
export function verifyCandidateTurns(turns: Turn[], caseData: Case, revealedBefore: (turnIndex: number) => string[]): Map<number, TurnVerification> {
  const out = new Map<number, TurnVerification>();
  for (const t of turns.filter(x => x.role === 'candidate')) {
    const ids = revealedBefore(t.turnIndex);
    const arith = checkStatedArithmetic(t.text);
    const unit = checkNestedConversions(t.text, { bases: caseData.shareBases ?? [], items: caseData.dataLedger, revealedIds: ids });
    const stepFlags = checkRecomputeForTurn(t.text, caseData.mathSteps, ids);
    const pricingModel = pricingValues(caseData, new Set(ids));
    const pricing = pricingModel ? checkPricingClaims(t.text, pricingModel) : [];
    out.set(t.turnIndex, {
      flags: [...stepFlags, ...flagsFromUnitCheck(unit.flags), ...flagsFromArithmetic(arith), ...flagsFromPricing(pricing)],
      verified: [...checkVerifiedForTurn(t.text, caseData.mathSteps, ids), ...verifiedFromChecks(arith, unit.verified, pricing)],
    });
  }
  return out;
}

// The clauses each candidate turn got flagged for: their own errors, which a
// mark never excuses (dropClaimsOnMarkedTurns' `genuine`).
export function genuineErrorSpans(v: Map<number, TurnVerification>): Map<number, string[]> {
  return new Map([...v].filter(([, x]) => x.flags.length > 0).map(([i, x]) => [i, x.flags.map(f => f.span)]));
}

export function buildChallengeMarks(
  turns: Turn[], caseData: Case, revealedBefore: (turnIndex: number) => string[],
  verification: Map<number, TurnVerification> = verifyCandidateTurns(turns, caseData, revealedBefore),
): InterviewerMark[] {
  const marks: InterviewerMark[] = [];
  const candidates = turns.filter(t => t.role === 'candidate');
  for (const t of turns.filter(x => x.role === 'interviewer')) {
    const before = candidates.filter(c => c.turnIndex < t.turnIndex);
    const last = before.at(-1);
    if (!last) continue;
    const flaggedNow = verification.get(last.turnIndex)?.flags ?? [];
    const flagged = before.flatMap(c => verification.get(c.turnIndex)?.flags ?? []).map(f => f.candidateValue);
    const verifiedEver = before.flatMap(c => verification.get(c.turnIndex)?.verified ?? []);
    const verifiedNow = verification.get(last.turnIndex)?.verified ?? [];
    const ids = revealedBefore(last.turnIndex);
    const caseTexts = [caseData.prompt, ...caseData.dataLedger.filter(d => ids.includes(d.id)).map(d => d.value)];
    const figures = [...candidateFiguresOf(before.map(c => c.text), caseTexts), ...verifiedEver.map(v => v.value)];
    const next = candidates.find(c => c.turnIndex > t.turnIndex);
    const all = sentencesOf(t.text);
    let confirmed: string | null = null;
    let unsupported: string | null = null;
    all.forEach((sentence, i) => {
      const talk = classifyMathTalk(sentence, figures, all[i - 1]);
      if (talk.kind !== 'doubt') return;
      if (talk.figures.some(f => flagged.some(x => same(f, x)))) return;
      const onVerified = talk.figures.find(f => verifiedEver.some(v => same(f, v.value)));
      if (onVerified !== undefined) { confirmed ??= sentence; return; }
      if (talk.figures.length > 0) { unsupported ??= sentence; return; }
      if (flaggedNow.length > 0) return;
      if (verifiedNow.length > 0) confirmed ??= sentence;
      else unsupported ??= sentence;
    });
    if (confirmed) {
      marks.push({ kind: 'confirmed_interviewer_error', interviewerTurn: t.turnIndex, candidateTurns: next ? [next.turnIndex] : [],
        note: `The interviewer doubted math a deterministic check had verified as correct ("${confirmed}"). The candidate was right; their reply — apologising, conceding, or redoing the work — is not a weakness.` });
    }
    if (unsupported) {
      marks.push({ kind: 'unsupported_challenge', interviewerTurn: t.turnIndex, candidateTurns: [],
        note: `The interviewer doubted a figure no check verified or flagged ("${unsupported}").` });
    }
  }
  return marks;
}

// For the judge: the candidate's own claims a check settled, beyond the case's
// math steps — what was verified wrong (their errors) and a sample of what was
// verified right. Everything else was not checked: neither right nor wrong.
export function formatClaimChecksSection(v: Map<number, TurnVerification>): string {
  const wrong = [...v].flatMap(([turn, x]) => x.flags.filter(f => f.kind === 'unit' || f.kind === 'arithmetic' || f.kind === 'pricing').map(f => ({ turn, f })));
  const right = [...v].flatMap(([turn, x]) => x.verified.filter(r => /^(?:arith|unit|pricing):/.test(r.stepId)).map(r => ({ turn, r })));
  if (wrong.length === 0 && right.length === 0) return '';
  const seen = new Set<string>();
  const rightLines = right.filter(({ r }) => !seen.has(r.span) && seen.add(r.span)).slice(0, 8)
    .map(({ turn, r }) => `- turn ${turn}: "${r.span}" — VERIFIED CORRECT`);
  const wrongLines = wrong.map(({ turn, f }) => `- turn ${turn}: "${f.span}" — VERIFIED WRONG: ${f.kind === 'unit' ? `${f.candidateValue} ${f.claim?.units}; ${f.claim?.quantity} at ${f.claim?.base} is about ${f.expected}` : f.kind === 'pricing' ? `${f.claim?.quantity} — about ${f.expected}` : `${f.claim?.expression} is not ${f.candidateValue} (≈ ${f.expected})`}`);
  return `CANDIDATE CLAIMS CHECKED IN CODE (stated arithmetic, unit conversions and pricing math):
${[...wrongLines, ...rightLines].join('\n')}
A claim marked VERIFIED CORRECT is correct: never cite it as an error, whatever the interviewer implied. VERIFIED WRONG is the candidate's error unless they corrected it. Claims not listed were not checked — not being flagged is not evidence of correctness.`;
}
