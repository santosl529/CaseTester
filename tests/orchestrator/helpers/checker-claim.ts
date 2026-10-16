// A math-checker claim for tests (the gate on code's own lines, 16 Oct): by
// default an error the checker is sure of — a flag once vetted — on the figure
// as the candidate said it.
import type { CheckerClaim } from '@/lib/orchestrator/math-checker';

export function checkerClaim(candidateValue: string, over: Partial<CheckerClaim> = {}): CheckerClaim {
  return {
    span: candidateValue, quantity: 'the claim', candidateValue, assumptions: '', verdict: 'error',
    correctValue: null, correctLow: null, correctHigh: null, unit: '', derivation: 'from the case data',
    errorType: 'misquote', changesConclusion: true, confidence: 'high', probe: '', pointer: '',
    codeQuantity: { kind: 'none', stepId: null, price: null, target: null }, actualShare: null, ...over,
  };
}

// Let a background checker row land: the runner writes it after the turn, never awaited.
export const landed = () => new Promise(r => setTimeout(r, 0));

// A message's code findings, as live code puts them in its verdict (the gate's
// input): the deterministic flags and the misquotes code would correct.
import { checkCandidateMath } from '@/lib/orchestrator/recompute';
import { factBaseFor, findCandidateMisquotes } from '@/lib/orchestrator/fact-check';
import { codeFlagRefs, type CodeFlagRef } from '@/lib/orchestrator/math-checker-live';
import { getCaseById } from '@/lib/cases/loader';
export function codeFlagsOf(text: string, revealedIds: string[], caseId = 'prof-001', shownExhibitIds: string[] = []): CodeFlagRef[] {
  const caseData = getCaseById(caseId);
  const misquotes = findCandidateMisquotes(text, factBaseFor(caseData as never), new Set(revealedIds), shownExhibitIds).filter(m => !m.reportOnly)
    .map(m => ({ item: m.items[0], cited: m.cited, sentence: m.sentence }));
  return codeFlagRefs(checkCandidateMath(text, caseData, revealedIds), misquotes);
}

// The same claim as a landed verdict stores it: vetted, a flag.
import type { VettedClaim } from '@/lib/orchestrator/math-checker';
export function vettedFlag(candidateValue: string, correctValue: number | null, over: Partial<VettedClaim> = {}): VettedClaim {
  return { ...checkerClaim(candidateValue, { correctValue }), flag: true, probeLine: null, correctionLine: null, correctionFigure: null, pointerLine: null, vetNotes: [], ...over };
}
// A landed verdict row on message n, with that message's code findings.
export function verdictRow(n: number, claims: VettedClaim[], codeFlags: CodeFlagRef[] = []) {
  return { id: `ev${n}`, sessionId: 's1', category: 'math_checker', subtype: 'verdict', turnIndex: n, phase: 'ANALYSIS',
    payloadJsonb: { candidateTurnIndex: n, latencyMs: 5000, model: 'claude-sonnet-5-5', claims, codeFlags, stamps: [] } };
}
