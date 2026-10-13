// Stage timing for wave reports (Lorenzo, 13 Oct: the clock stays 20 minutes
// for the 25-minute AI Casing cases, so every wave report gives the minute of
// each stage per run, and flags any case where 2+ runs closed with a required
// stage still owed). Read from saved or replayed runs (run-corpus.ts), with
// the live stage predicates; minutes are the case clock before the turn.
import type { CorpusRun, CorpusTurn } from './run-corpus';
import { asksForConclusion, asksBrainstorm, asksRiskQuestion, namesCandidateRecommendation } from '@/lib/orchestrator/spoken-close';
import { brainstormAsks, brainstormRequired, asksCaseBrainstorm, type CaseBrainstorm } from '@/lib/orchestrator/brainstorm';
import { probeIntents, EARLY_PHASES } from '@/lib/orchestrator/pressure-test';
import type { Phase } from '@/lib/orchestrator/state-machine';

type CaseLike = { id?: string; exhibits: { id: string; required?: boolean }[]; analysisCore?: { items: string[]; minItems?: number } } & CaseBrainstorm;

export type StageMinutes = {
  runId: string; caseId: string; persona: string; status: string;
  minutes: Record<string, number>;   // stage → minute it first happened: probe, exhibit ids, analysis, brainstorm, recommendation, risk, close
  owedAtClose: string[];             // required stages never reached when the case closed ([] when it didn't close)
};

const CODE_REC = new Set(['rec_ask', 'grace_ask', 'time_warning']);
const BRAINSTORM_MOVE = /\b(?:what|how)\s+else\b|\bwhat\s+other\s+(?:ways|options|levers|ideas|things|moves|actions)\b/i;
const questionOf = (t: CorpusTurn) => t.segments.filter(s => s.kind === 'question' || s.kind === 'scripted').map(s => s.text).join(' ')
  || t.segments.filter(s => s.kind !== 'data').map(s => s.text).join(' ');

export function stageMinutes(run: CorpusRun, c: CaseLike): StageMinutes {
  const minutes: Record<string, number> = {};
  const at = (stage: string, t: CorpusTurn) => { if (!(stage in minutes) && t.elapsedMs !== undefined) minutes[stage] = Math.round(t.elapsedMs / 6000) / 10; };
  const caseAsks = c.brainstorm?.ask !== undefined ? brainstormAsks(c) : [];
  const core = c.analysisCore;
  const required = c.exhibits.some(e => e.required) ? c.exhibits.filter(e => e.required).map(e => e.id) : [];
  let recAsked = false, closed = false;
  for (const t of run.turns.filter(x => !x.seeded)) {
    const q = questionOf(t);
    // The probe: declared as one, or a probe's wording early on.
    if (t.move === 'pressure_test' || (probeIntents(q).length > 0 && EARLY_PHASES.includes(t.phase as Phase))) at('probe', t);
    if (t.exhibitNow) at(t.exhibitNow, t);
    const out = new Set([...t.revealedBefore, ...t.releasedNow]);
    if (core && core.items.filter(id => out.has(id)).length >= (core.minItems ?? core.items.length)) at('analysis', t);
    if (asksBrainstorm(q) || t.kind === 'stage_brainstorm' || (t.move === 'brainstorm' && BRAINSTORM_MOVE.test(q)) || asksCaseBrainstorm(q, caseAsks)) at('brainstorm', t);
    // As the flow detector counts it: asked, code's ask, or a volunteered one named in the risk question.
    if (asksForConclusion(q) || CODE_REC.has(t.kind) || namesCandidateRecommendation(q)) { at('recommendation', t); recAsked = true; }
    if (asksRiskQuestion(q, recAsked)) at('risk', t);
    if (t.kind === 'close') { at('close', t); closed = true; break; }
  }
  // Required exhibits one by one; a case without them owes any one exhibit (prof-001).
  const anyShown = c.exhibits.some(e => e.id in minutes) || run.turns.some(t => t.shownBefore.length > 0);
  const exhibitsOwed = required.length ? required.filter(id => !(id in minutes)) : c.exhibits.length > 0 && !anyShown ? ['exhibit'] : [];
  const owed = closed ? [
    ...exhibitsOwed,
    ...(core && !('analysis' in minutes) ? ['analysis'] : []),
    ...(brainstormRequired(c) && !('brainstorm' in minutes) ? ['brainstorm'] : []),
    ...(!('recommendation' in minutes) ? ['recommendation'] : []),
    ...(!('risk' in minutes) ? ['risk'] : []),
  ] : [];
  return { runId: run.id, caseId: run.caseId, persona: run.persona, status: run.status, minutes, owedAtClose: owed };
}

// Cases where two or more runs closed with a required stage still owed.
export function flagCases(rows: StageMinutes[]): { caseId: string; runs: string[] }[] {
  const byCase = new Map<string, string[]>();
  for (const r of rows) if (r.owedAtClose.length > 0) byCase.set(r.caseId, [...(byCase.get(r.caseId) ?? []), r.runId]);
  return [...byCase].filter(([, runs]) => runs.length >= 2).map(([caseId, runs]) => ({ caseId, runs }));
}
